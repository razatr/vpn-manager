import fs from "node:fs";
import path from "node:path";

const defaultConfig = {
  host: "0.0.0.0",
  port: 8080,
  dataDir: "./data",
  publicUrl: "http://localhost:8080",
  openvpn: {
    helperPath: "./scripts/openvpn-manager.sh",
    configPath: "/etc/openvpn/server/server.conf",
    statusLogPath: "/run/openvpn-server/status.log",
    profileDir: "/var/lib/vpn-manager/profiles/openvpn"
  }
};

export function loadConfig(configPath) {
  const fileConfig = readJsonConfig(configPath);
  const config = merge(defaultConfig, fileConfig);

  config.port = Number(process.env.PORT || config.port);
  config.host = process.env.HOST || config.host;
  config.dataDir = path.resolve(process.env.DATA_DIR || config.dataDir);
  config.openvpn.helperPath = path.resolve(config.openvpn.helperPath);

  return config;
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
