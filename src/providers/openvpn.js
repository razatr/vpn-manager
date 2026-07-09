import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class OpenVPNProvider {
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

  async createClient(name) {
    const status = await this.status();
    if (!status.installed) {
      return {
        skipped: true,
        reason: "openvpn_not_installed"
      };
    }

    return this.runJson(["create-client", name]);
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

  async install(options) {
    if (!(await exists(this.config.helperPath))) {
      const error = new Error(`OpenVPN helper not found: ${this.config.helperPath}`);
      error.statusCode = 500;
      throw error;
    }

    const args = [
      "install",
      "--port",
      String(options.port || 1194),
      "--protocol",
      options.protocol || "udp",
      "--dns",
      String(options.dns || 3),
      "--first-client",
      options.firstClient || "admin"
    ];

    if (options.publicHost) {
      args.push("--public-host", options.publicHost);
    }
    if (options.customDns) {
      args.push("--custom-dns", options.customDns);
    }

    return this.runJson(args);
  }

  async revokeClient(name) {
    const status = await this.status();
    if (!status.installed) {
      return {
        skipped: true,
        reason: "openvpn_not_installed"
      };
    }

    return this.runJson(["revoke-client", name]);
  }

  async listConnections() {
    if (!(await exists(this.config.helperPath))) {
      return [];
    }

    try {
      return await this.runJson(["list-connections"]);
    } catch {
      return [];
    }
  }

  async runJson(args) {
    const command = this.config.helperUseSudo ? "sudo" : this.config.helperPath;
    const helperEnv = {
      OPENVPN_STATUS_LOG: this.config.statusLogPath,
      VPN_MANAGER_PROFILE_DIR: this.config.profileDir,
      VPN_MANAGER_OPENVPN_INSTALL_SCRIPT: this.config.installScriptPath,
      VPN_MANAGER_PROFILE_GROUP: this.config.profileGroup || "vpn-manager"
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
      timeout: args[0] === "install" ? 900_000 : 120_000,
      maxBuffer: 1024 * 1024
    });

    return parseJsonOutput(stdout);
  }

  async fallbackStatus(extra = {}) {
    const installed = await exists(this.config.configPath);
    const statusLogExists = await exists(this.config.statusLogPath);

    return {
      installed,
      active: false,
      configPath: this.config.configPath,
      statusLogPath: this.config.statusLogPath,
      statusLogExists,
      profileDir: this.config.profileDir,
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
