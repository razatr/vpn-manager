#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

COMMAND="${1:-}"
CLIENT="${2:-}"
XRAY_CONFIG="${VPN_MANAGER_VLESS_CONFIG:-/etc/xray/config.json}"
PROFILE_DIR="${VPN_MANAGER_VLESS_PROFILE_DIR:-/var/lib/vpn-manager/profiles/vless}"
SERVICE_FILE="${VLESS_SERVICE_FILE:-/etc/systemd/system/xray.service}"
SERVICE_NAME="${VLESS_SERVICE_NAME:-xray.service}"
PUBLIC_HOST="${VPN_MANAGER_VLESS_PUBLIC_HOST:-}"
PORT="${VPN_MANAGER_VLESS_PORT:-443}"
SNI="${VPN_MANAGER_VLESS_SNI:-www.microsoft.com}"
DEST="${VPN_MANAGER_VLESS_DEST:-www.microsoft.com:443}"
PROFILE_GROUP="${VPN_MANAGER_PROFILE_GROUP:-vpn-manager}"
XRAY_BIN="${XRAY_BIN:-/usr/local/bin/xray}"
XRAY_DIR="$(dirname "${XRAY_CONFIG}")"

json_bool() {
  if [[ "$1" == "true" ]]; then
    printf "true"
  else
    printf "false"
  fi
}

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "${value}"
}

validate_client() {
  if [[ ! "${CLIENT}" =~ ^[a-zA-Z0-9_-]{1,64}$ ]]; then
    echo "Invalid client name. Use ^[a-zA-Z0-9_-]{1,64}$" >&2
    exit 1
  fi
}

detect_service_active() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    printf "true"
  else
    printf "false"
  fi
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required for VLESS config management." >&2
    exit 3
  fi
}

ensure_download_tools() {
  missing=()
  for cmd in curl unzip; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done
  if [[ "${#missing[@]}" -eq 0 ]]; then
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl unzip ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y curl unzip ca-certificates
  else
    echo "Missing tools: ${missing[*]}" >&2
    exit 3
  fi
}

install_xray_binary() {
  if [[ -x "${XRAY_BIN}" ]]; then
    return
  fi

  ensure_download_tools
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64) asset="Xray-linux-64.zip" ;;
    aarch64|arm64) asset="Xray-linux-arm64-v8a.zip" ;;
    *) echo "Unsupported architecture for Xray: ${arch}" >&2; exit 3 ;;
  esac

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "${tmp_dir:-}"' EXIT
  curl -fsSL "https://github.com/XTLS/Xray-core/releases/latest/download/${asset}" -o "${tmp_dir}/xray.zip"
  unzip -q "${tmp_dir}/xray.zip" -d "${tmp_dir}/xray"
  install -m 0755 "${tmp_dir}/xray/xray" "${XRAY_BIN}"
  mkdir -p /usr/local/share/xray
  [[ -f "${tmp_dir}/xray/geoip.dat" ]] && install -m 0644 "${tmp_dir}/xray/geoip.dat" /usr/local/share/xray/geoip.dat
  [[ -f "${tmp_dir}/xray/geosite.dat" ]] && install -m 0644 "${tmp_dir}/xray/geosite.dat" /usr/local/share/xray/geosite.dat
}

ensure_service() {
  cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=Xray Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${XRAY_BIN} run -config ${XRAY_CONFIG}
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
SERVICE
  chmod 0644 "${SERVICE_FILE}"
  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}" >/dev/null
}

xray_uuid() {
  "${XRAY_BIN}" uuid
}

xray_x25519_private() {
  "${XRAY_BIN}" x25519 | awk -F': ' '/PrivateKey|Private key/ { print $2 }'
}

xray_x25519_public() {
  local private_key="$1"
  "${XRAY_BIN}" x25519 -i "${private_key}" | awk -F': ' '/PublicKey|Public key|Password \(PublicKey\)/ { print $2 }'
}

random_short_id() {
  openssl rand -hex 8
}

secure_profile() {
  local profile_path="$1"
  chmod 0640 "${profile_path}"
  if getent group "${PROFILE_GROUP}" >/dev/null 2>&1; then
    chgrp "${PROFILE_GROUP}" "${profile_path}" 2>/dev/null || true
  fi
}

write_client_profile() {
  local name="$1"
  local uuid="$2"
  mkdir -p "${PROFILE_DIR}"
  node - "${XRAY_CONFIG}" "${PROFILE_DIR}/${name}.txt" "${PUBLIC_HOST}" "${PORT}" "${name}" "${uuid}" <<'NODE'
const fs = require("fs");
let [configPath, profilePath, publicHost, port, name, uuid] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const inbound = config.inbounds.find((item) => item.protocol === "vless");
const reality = inbound.streamSettings.realitySettings;
const sni = reality.serverNames[0];
const shortId = reality.shortIds[0];
const publicKey = config.vpnManager.realityPublicKey;
publicHost = publicHost || config.vpnManager.publicHost;
port = port || String(inbound.port || config.vpnManager.port || 443);
if (!publicHost || !publicKey) {
  throw new Error("VLESS profile metadata is incomplete");
}
const params = new URLSearchParams({
  type: "tcp",
  encryption: "none",
  security: "reality",
  pbk: publicKey,
  fp: "chrome",
  sni,
  sid: shortId,
  spx: "/",
  flow: "xtls-rprx-vision"
});
const uri = `vless://${uuid}@${publicHost}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
fs.writeFileSync(profilePath, `${uri}\n`);
NODE
  secure_profile "${PROFILE_DIR}/${name}.txt"
}

sync_profiles() {
  if [[ ! -f "${XRAY_CONFIG}" ]]; then
    return
  fi
  ensure_node
  while IFS=$'\t' read -r name uuid; do
    [[ -z "${name}" || -z "${uuid}" ]] && continue
    profile_path="${PROFILE_DIR}/${name}.txt"
    if [[ ! -f "${profile_path}" ]] || ! grep -q 'encryption=none' "${profile_path}"; then
      write_client_profile "${name}" "${uuid}"
    fi
  done < <(node - "${XRAY_CONFIG}" <<'NODE'
const fs = require("fs");
const [configPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const inbound = config.inbounds.find((item) => item.protocol === "vless");
const clients = inbound?.settings?.clients || [];
for (const client of clients) {
  const name = client.email || client.id;
  console.log(`${name}\t${client.id}`);
}
NODE
)
}

install_vless() {
  local first_client="admin"
  shift
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --public-host)
        PUBLIC_HOST="${2:-}"
        shift 2
        ;;
      --port)
        PORT="${2:-}"
        shift 2
        ;;
      --sni)
        SNI="${2:-}"
        shift 2
        ;;
      --dest)
        DEST="${2:-}"
        shift 2
        ;;
      --first-client)
        first_client="${2:-}"
        shift 2
        ;;
      *)
        echo "Unknown install option: $1" >&2
        exit 1
        ;;
    esac
  done

  CLIENT="${first_client}"
  validate_client
  if [[ -z "${PUBLIC_HOST}" || ! "${PUBLIC_HOST}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Public host is required for VLESS." >&2
    exit 1
  fi
  if [[ ! "${PORT}" =~ ^[0-9]+$ || "${PORT}" -lt 1 || "${PORT}" -gt 65535 ]]; then
    echo "Invalid VLESS port." >&2
    exit 1
  fi

  ensure_node
  install_xray_binary
  mkdir -p "${XRAY_DIR}" "${PROFILE_DIR}"

  private_key="$(xray_x25519_private)"
  public_key="$(xray_x25519_public "${private_key}")"
  short_id="$(random_short_id)"
  uuid="$(xray_uuid)"
  if [[ -z "${private_key}" || -z "${public_key}" ]]; then
    echo "Failed to generate Xray REALITY keys." >&2
    exit 5
  fi

  node - "${XRAY_CONFIG}" "${PORT}" "${SNI}" "${DEST}" "${private_key}" "${public_key}" "${short_id}" "${first_client}" "${uuid}" "${PUBLIC_HOST}" <<'NODE'
const fs = require("fs");
const [configPath, port, sni, dest, privateKey, publicKey, shortId, firstClient, uuid, publicHost] = process.argv.slice(2);
const config = {
  log: {
    loglevel: "warning"
  },
  inbounds: [
    {
      tag: "vless-reality",
      listen: "0.0.0.0",
      port: Number(port),
      protocol: "vless",
      settings: {
        clients: [
          {
            id: uuid,
            email: firstClient,
            flow: "xtls-rprx-vision"
          }
        ],
        decryption: "none"
      },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: {
          show: false,
          dest,
          xver: 0,
          serverNames: [sni],
          privateKey,
          shortIds: [shortId]
        }
      }
    }
  ],
  outbounds: [
    {
      protocol: "freedom",
      tag: "direct"
    },
    {
      protocol: "blackhole",
      tag: "block"
    }
  ],
  vpnManager: {
    provider: "vless",
    mode: "reality",
    publicHost,
    port: Number(port),
    realityPublicKey: publicKey
  }
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
NODE

  write_client_profile "${first_client}" "${uuid}"
  ensure_service
  systemctl restart "${SERVICE_NAME}"

  printf '{"installed":true,"firstClient":%s,"profilePath":%s}\n' \
    "$(json_string "${first_client}")" \
    "$(json_string "${PROFILE_DIR}/${first_client}.txt")"
}

create_client() {
  validate_client
  ensure_node
  if [[ ! -f "${XRAY_CONFIG}" ]]; then
    echo "VLESS is not installed at ${XRAY_CONFIG}" >&2
    exit 3
  fi
  uuid="$(xray_uuid)"
  uuid="$(node - "${XRAY_CONFIG}" "${CLIENT}" "${uuid}" <<'NODE'
const fs = require("fs");
const [configPath, name, uuid] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const inbound = config.inbounds.find((item) => item.protocol === "vless");
if (!inbound) {
  throw new Error("VLESS inbound not found");
}
const existing = inbound.settings.clients.find((client) => client.email === name);
if (existing) {
  console.log(existing.id);
  process.exit(0);
}
inbound.settings.clients.push({
  id: uuid,
  email: name,
  flow: "xtls-rprx-vision"
});
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(uuid);
NODE
)"
  write_client_profile "${CLIENT}" "${uuid}"
  systemctl restart "${SERVICE_NAME}" 2>/dev/null || true
  printf '{"name":%s,"profilePath":%s}\n' "$(json_string "${CLIENT}")" "$(json_string "${PROFILE_DIR}/${CLIENT}.txt")"
}

case "${COMMAND}" in
  status)
    installed="false"
    [[ -f "${XRAY_CONFIG}" ]] && installed="true"
    active="$(detect_service_active)"
    printf '{"installed":%s,"active":%s,"configPath":%s,"profileDir":%s,"port":%s}\n' \
      "$(json_bool "${installed}")" \
      "$(json_bool "${active}")" \
      "$(json_string "${XRAY_CONFIG}")" \
      "$(json_string "${PROFILE_DIR}")" \
      "${PORT}"
    ;;
  install)
    install_vless "$@"
    ;;
  list-clients)
    if [[ ! -f "${XRAY_CONFIG}" ]]; then
      printf '[]\n'
      exit 0
    fi
    sync_profiles
    node - "${XRAY_CONFIG}" "${PROFILE_DIR}" <<'NODE'
const fs = require("fs");
const [configPath, profileDir] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const inbound = config.inbounds.find((item) => item.protocol === "vless");
const clients = inbound?.settings?.clients || [];
console.log(JSON.stringify(clients.map((client) => {
  const name = client.email || client.id;
  const profilePath = `${profileDir}/${name}.txt`;
  return {
    name,
    status: "valid",
    profilePath,
    profileExists: fs.existsSync(profilePath)
  };
})));
NODE
    ;;
  create-client)
    create_client
    ;;
  *)
    echo "Usage: $0 {status|install|list-clients|create-client NAME}" >&2
    exit 1
    ;;
esac
