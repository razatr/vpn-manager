import fs from "node:fs";
import path from "node:path";

const defaultConfig = {
  host: "0.0.0.0",
  port: 8080,
  dataDir: "./data",
  publicUrl: "http://localhost:8080",
  auth: {
    enabled: false,
    adminToken: "",
    username: "admin",
    passwordHash: "",
    passwordSalt: ""
  },
  openvpn: {
    helperPath: "./scripts/openvpn-manager.sh",
    helperUseSudo: false,
    installScriptPath: "./third_party/openvpn-install/openvpn-install.sh",
    configPath: "/etc/openvpn/server/server.conf",
    statusLogPath: "/run/openvpn-server/status.log",
    profileDir: "/var/lib/vpn-manager/profiles/openvpn",
    profileGroup: "vpn-manager"
  },
  vless: {
    helperPath: "./scripts/vless-manager.sh",
    helperUseSudo: false,
    configPath: "/etc/xray/config.json",
    profileDir: "/var/lib/vpn-manager/profiles/vless",
    profileGroup: "vpn-manager"
  },
  wireguard: {
    helperPath: "./scripts/wireguard-manager.sh",
    helperUseSudo: false,
    configPath: "/etc/wireguard/wg0.conf",
    profileDir: "/var/lib/vpn-manager/profiles/wireguard",
    profileGroup: "vpn-manager",
    interface: "wg0",
    port: 51820
  },
  whitelists: {
    dataDir: "./data/whitelists"
  }
};

export function loadConfig(configPath) {
  const fileConfig = readJsonConfig(configPath);
  const config = merge(defaultConfig, fileConfig);
  config.configPath = configPath ? path.resolve(configPath) : "";

  config.port = Number(process.env.PORT || config.port);
  config.host = process.env.HOST || config.host;
  config.dataDir = path.resolve(process.env.DATA_DIR || config.dataDir);
  if (!path.isAbsolute(config.openvpn.helperPath)) {
    config.openvpn.helperPath = path.resolve(config.openvpn.helperPath);
  }
  if (!path.isAbsolute(config.openvpn.installScriptPath)) {
    config.openvpn.installScriptPath = path.resolve(config.openvpn.installScriptPath);
  }
  if (!path.isAbsolute(config.vless.helperPath)) {
    config.vless.helperPath = path.resolve(config.vless.helperPath);
  }
  if (!path.isAbsolute(config.wireguard.helperPath)) {
    config.wireguard.helperPath = path.resolve(config.wireguard.helperPath);
  }
  if (!path.isAbsolute(config.whitelists.dataDir)) {
    config.whitelists.dataDir = path.resolve(config.whitelists.dataDir);
  }

  return config;
}

export function saveConfig(config) {
  if (!config.configPath) {
    const error = new Error("Config file path is not available");
    error.statusCode = 500;
    throw error;
  }

  const output = { ...config };
  delete output.configPath;
  fs.writeFileSync(config.configPath, `${JSON.stringify(output, null, 2)}\n`);
}

function readJsonConfig(configPath) {
  if (!configPath) {
    return {};
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = merge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
