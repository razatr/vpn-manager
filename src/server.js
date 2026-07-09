import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(__dirname, "..", "web", "dist");
const webSourceDir = path.resolve(__dirname, "..", "web");

export function createServer({ config, store, providers }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (url.pathname.startsWith("/api/")) {
        await handleApi({ req, res, url, config, store, providers });
        return;
      }

      await serveStatic(url, res);
    } catch (error) {
      console.error(error);
      sendJson(res, error.statusCode || 500, {
        error: error.statusCode ? "request_error" : "internal_error",
        message: error.message
      });
    }
  });
}

async function handleApi({ req, res, url, config, store, providers }) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "vpn-manager" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/server/status") {
    const openvpn = await providers.openvpn.status();
    sendJson(res, 200, {
      ok: true,
      publicUrl: config.publicUrl,
      providers: { openvpn }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    sendJson(res, 200, {
      providers: Object.keys(providers).map((name) => ({ name }))
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openvpn/clients") {
    sendJson(res, 200, { clients: await store.listClients("openvpn") });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/openvpn/clients") {
    const body = await readJson(req);
    const name = validateClientName(body.name);
    const profile = await providers.openvpn.createClient(name);
    const client = await store.createClient({
      provider: "openvpn",
      name,
      status: profile.skipped ? "registered" : "active",
      profilePath: profile.profilePath || null
    });
    await store.addEvent({
      type: "client.created",
      provider: "openvpn",
      message: profile.skipped ? `Client ${name} registered` : `Client ${name} created`
    });
    sendJson(res, 201, { client });
    return;
  }

  if (req.method === "POST" && /^\/api\/openvpn\/clients\/[^/]+\/revoke$/.test(url.pathname)) {
    const name = validateClientName(decodeURIComponent(url.pathname.split("/")[4]));
    await providers.openvpn.revokeClient(name);
    const client = await store.revokeClient({ provider: "openvpn", name });
    await store.addEvent({
      type: "client.revoked",
      provider: "openvpn",
      message: `Client ${name} revoked`
    });
    sendJson(res, 200, { client });
    return;
  }

  if (req.method === "GET" && /^\/api\/openvpn\/clients\/[^/]+\/profile$/.test(url.pathname)) {
    const name = validateClientName(decodeURIComponent(url.pathname.split("/")[4]));
    const client = await store.findClient({ provider: "openvpn", name });
    if (!client || !client.profilePath || !fs.existsSync(client.profilePath)) {
      sendJson(res, 404, { error: "profile_not_found" });
      return;
    }

    res.writeHead(200, {
      "content-type": "application/x-openvpn-profile",
      "content-disposition": `attachment; filename="${client.name}.ovpn"`
    });
    fs.createReadStream(client.profilePath).pipe(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openvpn/connections") {
    sendJson(res, 200, { connections: await providers.openvpn.listConnections() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    sendJson(res, 200, { events: await store.listEvents() });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function serveStatic(url, res) {
  const publicDir = fs.existsSync(webDistDir) ? webDistDir : webSourceDir;
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(publicDir, `.${requested}`);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const ext = path.extname(filePath);
  const contentType = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".ts": "text/typescript; charset=utf-8"
  }[ext] || "application/octet-stream";

  res.writeHead(200, { "content-type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validateClientName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
    const error = new Error("Client name must match ^[a-zA-Z0-9_-]{1,64}$");
    error.statusCode = 400;
    throw error;
  }
  return name;
}
