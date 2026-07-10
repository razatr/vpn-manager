import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class WireGuardProvider {
  constructor(config) {
    this.config = config;
  }

  async status() {
    if (await exists(this.config.helperPath)) {
      try {
        return await this.runJson(["status"]);
      } catch (error) {
        return this.fallbackStatus({ helperError: error.message });
      }
    }

    return this.fallbackStatus();
  }

  async install(options) {
    const args = [
      "install",
      "--public-host",
      options.publicHost,
      "--port",
      String(options.port || 51820),
      "--dns",
      options.dns || "1.1.1.1",
      "--first-client",
      options.firstClient || "admin"
    ];
    return this.runJson(args, options);
  }

  async listClients() {
    if (!(await exists(this.config.helperPath))) {
      return null;
    }
    try {
      return await this.runJson(["list-clients"]);
    } catch {
      return null;
    }
  }

  async createClient(name) {
    const status = await this.status();
    if (!status.installed) {
      const error = new Error("WireGuard is not installed");
      error.statusCode = 409;
      throw error;
    }
    return this.runJson(["create-client", name]);
  }

  async runJson(args, options = {}) {
    const command = this.config.helperUseSudo ? "sudo" : this.config.helperPath;
    const helperEnv = {
      VPN_MANAGER_WG_CONFIG: this.config.configPath,
      VPN_MANAGER_WG_PROFILE_DIR: this.config.profileDir,
      VPN_MANAGER_PROFILE_GROUP: this.config.profileGroup || "vpn-manager",
      VPN_MANAGER_WG_PUBLIC_HOST: options.publicHost || this.config.publicHost || "",
      VPN_MANAGER_WG_PORT: String(options.port || this.config.port || 51820)
    };
    const commandArgs = this.config.helperUseSudo
      ? [
          ...Object.entries(helperEnv).map(([key, value]) => `${key}=${value}`),
          this.config.helperPath,
          ...args
        ]
      : args;
    const { stdout } = await execFileAsync(command, commandArgs, {
      env: {
        ...process.env,
        ...helperEnv
      },
      timeout: args[0] === "install" ? 300_000 : 120_000,
      maxBuffer: 1024 * 1024
    });

    return parseJsonOutput(stdout);
  }

  async fallbackStatus(extra = {}) {
    return {
      installed: await exists(this.config.configPath),
      active: false,
      configPath: this.config.configPath,
      profileDir: this.config.profileDir,
      interface: this.config.interface || "wg0",
      port: this.config.port || 51820,
      ...extra
    };
  }
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonLine = trimmed
      .split(/\r?\n/)
      .reverse()
      .find((line) => line.trim().startsWith("{") || line.trim().startsWith("["));
    if (jsonLine) {
      return JSON.parse(jsonLine);
    }
    throw new Error(`Helper did not return JSON: ${trimmed.slice(0, 200)}`);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
