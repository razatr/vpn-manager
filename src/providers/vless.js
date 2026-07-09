import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class VlessProvider {
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
      return {
        skipped: true,
        reason: "vless_not_installed"
      };
    }

    return this.runJson(["create-client", name]);
  }

  async runJson(args) {
    const command = this.config.helperUseSudo ? "sudo" : this.config.helperPath;
    const helperEnv = {
      VPN_MANAGER_VLESS_CONFIG: this.config.configPath,
      VPN_MANAGER_VLESS_PROFILE_DIR: this.config.profileDir
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
      timeout: 120_000,
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
      ...extra
    };
  }
}

function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }
  return JSON.parse(trimmed);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
