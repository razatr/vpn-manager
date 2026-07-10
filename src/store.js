import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.dbPath = path.join(dataDir, "vpn-manager.json");
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      await fs.access(this.dbPath);
    } catch {
      await this.write({
        clients: [],
        events: []
      });
    }
  }

  async listClients(provider) {
    const db = await this.read();
    return db.clients.filter((client) => client.provider === provider);
  }

  async syncClients(provider, externalClients) {
    const db = await this.read();
    const seen = new Set();
    db.clients = db.clients.filter((client) => !isInternalClient(provider, client.name));

    for (const external of externalClients.filter((client) => !isInternalClient(provider, client.name))) {
      const name = external.name;
      seen.add(name);
      const status = normalizeExternalStatus(external);
      const profilePath = external.profileExists ? external.profilePath : null;
      const client = db.clients.find((item) => item.provider === provider && item.name === name);

      if (client) {
        client.status = status;
        client.profilePath = profilePath;
        client.revokedAt = status === "revoked" ? client.revokedAt || new Date().toISOString() : null;
      } else if (status === "revoked") {
        continue;
      } else {
        db.clients.push({
          id: crypto.randomUUID(),
          provider,
          name,
          status,
          createdAt: new Date().toISOString(),
          revokedAt: status === "revoked" ? new Date().toISOString() : null,
          profilePath
        });
      }
    }

    for (const client of db.clients.filter((item) => item.provider === provider && item.status !== "revoked")) {
      if (!seen.has(client.name)) {
        client.status = "missing";
        client.profilePath = null;
      }
    }

    await this.write(db);
    return db.clients.filter((client) => client.provider === provider);
  }

  async createClient({ provider, name, status = "registered", profilePath = null }) {
    const db = await this.read();
    const exists = db.clients.some(
      (client) => client.provider === provider && client.name === name && client.status !== "revoked"
    );

    if (exists) {
      const error = new Error(`Client already exists: ${name}`);
      error.statusCode = 409;
      throw error;
    }

    const client = {
      id: crypto.randomUUID(),
      provider,
      name,
      status,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      profilePath
    };

    db.clients.push(client);
    await this.write(db);
    return client;
  }

  async upsertClient({ provider, name, status = "registered", profilePath = null }) {
    const db = await this.read();
    const client = db.clients.find((item) => item.provider === provider && item.name === name);

    if (client) {
      client.status = status;
      client.profilePath = profilePath;
      client.revokedAt = status === "revoked" ? client.revokedAt || new Date().toISOString() : null;
      await this.write(db);
      return client;
    }

    const newClient = {
      id: crypto.randomUUID(),
      provider,
      name,
      status,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      profilePath
    };

    db.clients.push(newClient);
    await this.write(db);
    return newClient;
  }

  async findClient({ provider, name }) {
    const db = await this.read();
    return db.clients.find((client) => client.provider === provider && client.name === name) || null;
  }

  async revokeClient({ provider, name }) {
    const db = await this.read();
    const client = db.clients.find(
      (item) => item.provider === provider && item.name === name && item.status !== "revoked"
    );

    if (!client) {
      const error = new Error(`Client not found: ${name}`);
      error.statusCode = 404;
      throw error;
    }

    client.status = "revoked";
    client.revokedAt = new Date().toISOString();
    await this.write(db);
    return client;
  }

  async listEvents() {
    const db = await this.read();
    return db.events.slice().reverse();
  }

  async addEvent({ type, provider, message }) {
    const db = await this.read();
    db.events.push({
      id: crypto.randomUUID(),
      type,
      provider,
      message,
      createdAt: new Date().toISOString()
    });
    await this.write(db);
  }

  async read() {
    return JSON.parse(await fs.readFile(this.dbPath, "utf8"));
  }

  async write(data) {
    const tmpPath = `${this.dbPath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    await fs.rename(tmpPath, this.dbPath);
  }
}

function normalizeExternalStatus(client) {
  if (client.status === "revoked") {
    return "revoked";
  }
  if (client.status === "expired") {
    return "expired";
  }
  if (!client.profileExists) {
    return "missing_profile";
  }
  if (client.status === "valid") {
    return "active";
  }
  return client.status || "registered";
}

function isInternalClient(provider, name) {
  return provider === "openvpn" && name === "server";
}
