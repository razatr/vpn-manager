import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../src/server.js";
import { JsonStore } from "../../src/store.js";
import { OpenVPNProvider } from "../../src/providers/openvpn.js";

test("token auth protects API routes", async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vpn-manager-auth-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    publicUrl: "http://127.0.0.1",
    auth: {
      enabled: true,
      adminToken: "secret-token"
    },
    openvpn: {
      helperPath: path.join(dataDir, "missing-helper"),
      configPath: path.join(dataDir, "server.conf"),
      statusLogPath: path.join(dataDir, "status.log"),
      profileDir: path.join(dataDir, "profiles")
    }
  };

  const store = new JsonStore(dataDir);
  await store.init();
  const server = createServer({
    config,
    store,
    providers: {
      openvpn: new OpenVPNProvider(config.openvpn)
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const unauthorized = await fetch(`${baseUrl}/api/server/status`);
    assert.equal(unauthorized.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "secret-token" })
    });
    assert.equal(login.status, 204);

    const cookie = login.headers.get("set-cookie");
    assert.match(cookie || "", /vm_session=secret-token/);

    const authorized = await fetch(`${baseUrl}/api/server/status`, {
      headers: { cookie }
    });
    assert.equal(authorized.status, 200);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

