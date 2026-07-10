import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { saveConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(__dirname, "..", "web", "dist");
const webSourceDir = path.resolve(__dirname, "..", "web");

export function createServer({ config, store, providers }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

      if (url.pathname.startsWith("/sub/")) {
        await handlePublicSubscription({ req, res, url, store });
        return;
      }

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

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    if (!config.auth.enabled || isValidLogin(body, config)) {
      res.writeHead(204, {
        "set-cookie": cookieHeader("vm_session", config.auth.enabled ? config.auth.adminToken : "dev", {
          httpOnly: true,
          sameSite: "Strict",
          path: "/"
        })
      });
      res.end();
      return;
    }

    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    res.writeHead(204, {
      "set-cookie": cookieHeader("vm_session", "", {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 0
      })
    });
    res.end();
    return;
  }

  if (!isAuthorized(req, config)) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/credentials") {
    const body = await readJson(req);
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);
    const credentials = hashPassword(password);
    config.auth.username = username;
    config.auth.passwordHash = credentials.hash;
    config.auth.passwordSalt = credentials.salt;
    saveConfig(config);
    await store.addEvent({
      type: "auth.credentials_changed",
      provider: "system",
      message: `Admin credentials changed for ${username}`
    });
    sendJson(res, 200, { ok: true, username });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/server/status") {
    const openvpn = await providers.openvpn.status();
    const vless = providers.vless ? await providers.vless.status() : null;
    const wireguard = providers.wireguard ? await providers.wireguard.status() : null;
    sendJson(res, 200, {
      ok: true,
      publicUrl: config.publicUrl,
      auth: {
        username: config.auth.username
      },
      providers: { openvpn, ...(vless ? { vless } : {}), ...(wireguard ? { wireguard } : {}) }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/providers") {
    sendJson(res, 200, {
      providers: Object.keys(providers).map((name) => ({ name }))
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/setup/openvpn") {
    const body = withDefaultPublicHost(await readJson(req), req, config);
    const setup = await providers.openvpn.install(validateOpenVPNSetup(body));
    const firstClientName = setup.firstClient || body.firstClient || "admin";
    const client = await store.upsertClient({
      provider: "openvpn",
      name: firstClientName,
      status: "active",
      profilePath: setup.profilePath || null
    });
    await store.addEvent({
      type: "openvpn.installed",
      provider: "openvpn",
      message: `OpenVPN installed with first client ${firstClientName}`
    });
    sendJson(res, 201, { setup, client });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/setup/vless") {
    const body = withDefaultPublicHost(await readJson(req), req, config);
    const setup = await providers.vless.install(validateVlessSetup(body));
    const firstClientName = setup.firstClient || body.firstClient || "admin";
    const client = await store.upsertClient({
      provider: "vless",
      name: firstClientName,
      status: "active",
      profilePath: setup.profilePath || null
    });
    await store.addEvent({
      type: "vless.installed",
      provider: "vless",
      message: `VLESS installed with first client ${firstClientName}`
    });
    sendJson(res, 201, { setup, client });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openvpn/clients") {
    const externalClients = await providers.openvpn.listClients();
    const clients = externalClients
      ? await store.syncClients("openvpn", externalClients)
      : await store.listClients("openvpn");
    sendJson(res, 200, { clients });
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
    if (!client || !client.profilePath || !canRead(client.profilePath)) {
      sendJson(res, 404, { error: "profile_not_found" });
      return;
    }

    res.writeHead(200, {
      "content-type": "application/x-openvpn-profile",
      "content-disposition": `attachment; filename="${client.name}.ovpn"`
    });
    fs.createReadStream(client.profilePath)
      .on("error", (error) => {
        console.error(error);
        res.destroy(error);
      })
      .pipe(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/openvpn/connections") {
    sendJson(res, 200, { connections: await providers.openvpn.listConnections() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/openvpn/reset") {
    const result = await providers.openvpn.reset();
    await store.deleteClients("openvpn");
    await store.addEvent({
      type: "openvpn.reset",
      provider: "openvpn",
      message: "OpenVPN server config and profiles reset"
    });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/vless/clients") {
    const externalClients = await providers.vless.listClients();
    const clients = externalClients
      ? await store.syncClients("vless", externalClients)
      : await store.listClients("vless");
    sendJson(res, 200, { clients });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/whitelists/status") {
    sendJson(res, 200, await providers.whitelists.status());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/setup/wireguard") {
    const body = withDefaultPublicHost(await readJson(req), req, config);
    const setup = await providers.wireguard.install(validateWireGuardSetup(body));
    const firstClientName = setup.firstClient || body.firstClient || "admin";
    const client = await store.upsertClient({
      provider: "wireguard",
      name: firstClientName,
      status: "active",
      profilePath: setup.profilePath || null
    });
    await store.addEvent({
      type: "wireguard.installed",
      provider: "wireguard",
      message: `WireGuard installed with first client ${firstClientName}`
    });
    sendJson(res, 201, { setup, client });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/wireguard/clients") {
    const externalClients = await providers.wireguard.listClients();
    const clients = externalClients
      ? await store.syncClients("wireguard", externalClients)
      : await store.listClients("wireguard");
    sendJson(res, 200, { clients });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/wireguard/clients") {
    const body = await readJson(req);
    const name = validateClientName(body.name);
    const profile = await providers.wireguard.createClient(name);
    const client = await store.upsertClient({
      provider: "wireguard",
      name,
      status: "active",
      profilePath: profile.profilePath || null
    });
    await store.addEvent({
      type: "client.created",
      provider: "wireguard",
      message: `WireGuard client ${name} created`
    });
    sendJson(res, 201, { client });
    return;
  }

  if (req.method === "GET" && /^\/api\/wireguard\/clients\/[^/]+\/profile$/.test(url.pathname)) {
    const name = validateClientName(decodeURIComponent(url.pathname.split("/")[4]));
    const client = await store.findClient({ provider: "wireguard", name });
    if (!client || !client.profilePath || !canRead(client.profilePath)) {
      sendJson(res, 404, { error: "profile_not_found" });
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${client.name}-wireguard.conf"`
    });
    fs.createReadStream(client.profilePath)
      .on("error", (error) => {
        console.error(error);
        res.destroy(error);
      })
      .pipe(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/whitelists/update") {
    const result = await providers.whitelists.updateAll();
    await store.addEvent({
      type: "whitelists.updated",
      provider: "whitelists",
      message: "Whitelist subscriptions updated"
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && /^\/api\/whitelists\/[^/]+\/download$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const file = await providers.whitelists.fileFor(id);
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${file.fileName}"`
    });
    fs.createReadStream(file.filePath)
      .on("error", (error) => {
        console.error(error);
        res.destroy(error);
      })
      .pipe(res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/vless/clients") {
    const body = await readJson(req);
    const name = validateClientName(body.name);
    const profile = await providers.vless.createClient(name);
    const client = await store.upsertClient({
      provider: "vless",
      name,
      status: profile.skipped ? "registered" : "active",
      profilePath: profile.profilePath || null
    });
    await store.addEvent({
      type: "client.created",
      provider: "vless",
      message: profile.skipped ? `VLESS client ${name} registered` : `VLESS client ${name} created`
    });
    sendJson(res, 201, { client });
    return;
  }

  if (req.method === "GET" && /^\/api\/vless\/clients\/[^/]+\/profile$/.test(url.pathname)) {
    const name = validateClientName(decodeURIComponent(url.pathname.split("/")[4]));
    const client = await store.findClient({ provider: "vless", name });
    if (!client || !client.profilePath || !canRead(client.profilePath)) {
      sendJson(res, 404, { error: "profile_not_found" });
      return;
    }

    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${client.name}-vless.txt"`
    });
    fs.createReadStream(client.profilePath)
      .on("error", (error) => {
        console.error(error);
        res.destroy(error);
      })
      .pipe(res);
    return;
  }

  if (req.method === "GET" && /^\/api\/vless\/clients\/[^/]+\/link$/.test(url.pathname)) {
    const name = validateClientName(decodeURIComponent(url.pathname.split("/")[4]));
    const client = await store.findClient({ provider: "vless", name });
    const uri = readClientProfileUri(client);
    const subscriptionUrl = `${publicBaseUrl(req, config)}/sub/vless/${encodeURIComponent(client.id)}`;
    sendJson(res, 200, {
      uri,
      subscriptionUrl,
      happUrl: uri,
      incyUrl: uri
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/events") {
    sendJson(res, 200, { events: await store.listEvents() });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
}

async function handlePublicSubscription({ req, res, url, store }) {
  if (req.method === "GET" && /^\/sub\/vless\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const client = await store.findClientById(id);
    if (!client || client.provider !== "vless") {
      sendJson(res, 404, { error: "subscription_not_found" });
      return;
    }

    const uri = readClientProfileUri(client);
    const body = [
      `#profile-title: ${client.name}`,
      "#profile-update-interval: 24",
      "#subscriptions-expand-now: 1",
      "#tun-enable: 1",
      uri,
      ""
    ].join("\n");
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${client.name}-vless-sub.txt"`,
      "profile-title": client.name,
      "profile-update-interval": "24",
      "subscriptions-expand-now": "1",
      "tun-enable": "1"
    });
    res.end(body);
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

function canRead(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function readClientProfileUri(client) {
  if (!client || !client.profilePath || !canRead(client.profilePath)) {
    const error = new Error("Profile not found");
    error.statusCode = 404;
    throw error;
  }
  return fs.readFileSync(client.profilePath, "utf8").trim();
}

function publicBaseUrl(req, config) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (host) {
    const proto = req.headers["x-forwarded-proto"] || "http";
    return `${proto}://${host}`;
  }
  return config.publicUrl.replace(/\/$/, "");
}

function requestPublicHost(req, config) {
  const forwardedHost = Array.isArray(req.headers["x-forwarded-host"])
    ? req.headers["x-forwarded-host"][0]
    : req.headers["x-forwarded-host"];
  const rawHost = String(forwardedHost || req.headers.host || "").split(",")[0].trim();
  if (rawHost) {
    try {
      return new URL(`http://${rawHost}`).hostname;
    } catch {
      return rawHost.split(":")[0];
    }
  }

  try {
    return new URL(config.publicUrl).hostname;
  } catch {
    return "";
  }
}

function withDefaultPublicHost(body, req, config) {
  const publicHost = typeof body.publicHost === "string" ? body.publicHost.trim() : "";
  if (publicHost) {
    return { ...body, publicHost };
  }
  return { ...body, publicHost: requestPublicHost(req, config) };
}

function isAuthorized(req, config) {
  if (!config.auth.enabled) {
    return true;
  }

  const authorization = req.headers.authorization || "";
  if (authorization === `Bearer ${config.auth.adminToken}`) {
    return true;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return cookies.vm_session === config.auth.adminToken;
}

function isValidLogin(body, config) {
  if (body.token && body.token === config.auth.adminToken) {
    return true;
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password || username !== config.auth.username) {
    return false;
  }

  if (!config.auth.passwordHash || !config.auth.passwordSalt) {
    return false;
  }

  const expected = Buffer.from(config.auth.passwordHash, "hex");
  const actual = crypto.scryptSync(password, config.auth.passwordSalt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) {
          return [part, ""];
        }
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      })
  );
}

function cookieHeader(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  return parts.join("; ");
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

function validateUsername(username) {
  if (typeof username !== "string" || !/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
    const error = new Error("Username must match ^[a-zA-Z0-9_.-]{3,64}$");
    error.statusCode = 400;
    throw error;
  }
  return username;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 128) {
    const error = new Error("Password must be 6-128 characters");
    error.statusCode = 400;
    throw error;
  }
  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: crypto.scryptSync(password, salt, 32).toString("hex")
  };
}

function normalizePublicHost(value, { required = false } = {}) {
  const publicHost = typeof value === "string" ? value.trim() : "";
  if ((required && !publicHost) || (publicHost && !/^[a-zA-Z0-9._-]+$/.test(publicHost))) {
    const error = new Error("Public host must be a hostname or IPv4 address");
    error.statusCode = 400;
    throw error;
  }
  return publicHost;
}

function validateOpenVPNSetup(body) {
  const firstClient = validateClientName(body.firstClient || "admin");
  const protocol = body.protocol || "udp";
  if (!["udp", "tcp"].includes(protocol)) {
    const error = new Error("Protocol must be udp or tcp");
    error.statusCode = 400;
    throw error;
  }

  const port = Number(body.port || 1194);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Port must be between 1 and 65535");
    error.statusCode = 400;
    throw error;
  }

  const dns = Number(body.dns || 3);
  if (!Number.isInteger(dns) || dns < 1 || dns > 8) {
    const error = new Error("DNS selection must be between 1 and 8");
    error.statusCode = 400;
    throw error;
  }

  const publicHost = normalizePublicHost(body.publicHost);

  return {
    publicHost,
    port,
    protocol,
    dns,
    customDns: body.customDns || "",
    firstClient
  };
}

function validateVlessSetup(body) {
  const firstClient = validateClientName(body.firstClient || "admin");
  const port = Number(body.port || 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Port must be between 1 and 65535");
    error.statusCode = 400;
    throw error;
  }

  const publicHost = normalizePublicHost(body.publicHost, { required: true });

  const sni = body.sni || "www.microsoft.com";
  if (!/^[a-zA-Z0-9._-]+$/.test(sni)) {
    const error = new Error("SNI must be a hostname");
    error.statusCode = 400;
    throw error;
  }

  const dest = body.dest || `${sni}:443`;
  if (!/^[a-zA-Z0-9._-]+:[0-9]{1,5}$/.test(dest)) {
    const error = new Error("Destination must be host:port");
    error.statusCode = 400;
    throw error;
  }

  return {
    publicHost,
    port,
    sni,
    dest,
    firstClient
  };
}

function validateWireGuardSetup(body) {
  const firstClient = validateClientName(body.firstClient || "admin");
  const port = Number(body.port || 51820);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Port must be between 1 and 65535");
    error.statusCode = 400;
    throw error;
  }

  const publicHost = normalizePublicHost(body.publicHost, { required: true });

  const dns = body.dns || "1.1.1.1";
  if (!/^[a-zA-Z0-9:., _-]+$/.test(dns)) {
    const error = new Error("DNS contains unsupported characters");
    error.statusCode = 400;
    throw error;
  }

  return {
    publicHost,
    port,
    dns,
    firstClient
  };
}
