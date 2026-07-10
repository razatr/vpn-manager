import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../../src/server.js";
import { JsonStore } from "../../src/store.js";

async function withTestServer(providers, run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vpn-manager-setup-"));
  const config = {
    host: "127.0.0.1",
    port: 0,
    dataDir,
    publicUrl: "http://127.0.0.1",
    auth: {
      enabled: false,
      adminToken: "",
      username: "admin",
      passwordHash: "",
      passwordSalt: ""
    }
  };

  const store = new JsonStore(dataDir);
  await store.init();
  const server = createServer({ config, store, providers });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

test("OpenVPN setup accepts and normalizes IPv4 public host", async () => {
  let receivedOptions = null;
  const providers = {
    openvpn: {
      async install(options) {
        receivedOptions = options;
        return {
          installed: true,
          firstClient: options.firstClient,
          profilePath: path.join(os.tmpdir(), `${options.firstClient}.ovpn`)
        };
      }
    }
  };

  await withTestServer(providers, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/setup/openvpn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicHost: " 147.45.226.160\n",
        port: 1194,
        protocol: "udp",
        dns: 3,
        firstClient: "admin"
      })
    });

    assert.equal(response.status, 201, await response.text());
  });

  assert.equal(receivedOptions.publicHost, "147.45.226.160");
});

