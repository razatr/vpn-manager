#!/usr/bin/env bash
set -euo pipefail

APP_NAME="vpn-manager"
APP_USER="vpn-manager"
APP_DIR="/opt/vpn-manager"
CONFIG_DIR="/etc/vpn-manager"
DATA_DIR="/var/lib/vpn-manager"
LOG_DIR="/var/log/vpn-manager"
HELPER_DIR="/usr/local/lib/vpn-manager"
HELPER_PATH="${HELPER_DIR}/openvpn-helper"
SUDOERS_FILE="/etc/sudoers.d/vpn-manager"
SERVICE_FILE="/etc/systemd/system/vpn-manager.service"
PORT="${VPN_MANAGER_PORT:-80}"
ADMIN_TOKEN="${VPN_MANAGER_ADMIN_TOKEN:-$(openssl rand -hex 24)}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must be run as root."
  exit 1
fi

install_runtime_deps() {
  missing=()
  for cmd in node npm git curl sudo openssl; do
    if ! command -v "${cmd}" >/dev/null 2>&1; then
      missing+=("${cmd}")
    fi
  done

  if [[ "${#missing[@]}" -eq 0 ]]; then
    return
  fi

  echo "Installing runtime dependencies: ${missing[*]}"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y nodejs npm git curl sudo openssl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs npm git curl sudo openssl ca-certificates
  else
    echo "Missing dependencies: ${missing[*]}"
    echo "Install them manually and rerun this installer."
    exit 1
  fi
}

install_runtime_deps

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install Node.js first, then rerun this script."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js 20 or newer is required. Current version: $(node --version)"
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemd is required."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required."
  exit 1
fi

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}" "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}" "${HELPER_DIR}" /etc/openvpn /run/openvpn-server

if [[ ! -d ./web/dist ]]; then
  echo "web/dist not found. Building frontend..."
  npm ci
  npm run build
fi

cp -R ./package.json ./package-lock.json ./src ./web ./scripts "${APP_DIR}/"
cp ./scripts/openvpn-manager.sh "${HELPER_PATH}"
cp -R ./third_party "${HELPER_DIR}/"
chmod 0755 "${HELPER_PATH}"
cp ./config.example.json "${CONFIG_DIR}/config.json"

node -e "
const fs = require('fs');
const path = '${CONFIG_DIR}/config.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
config.port = Number('${PORT}');
config.dataDir = '${DATA_DIR}';
config.publicUrl = 'http://' + require('os').hostname() + ':' + config.port;
config.auth = { enabled: true, adminToken: '${ADMIN_TOKEN}' };
config.openvpn.helperPath = '${HELPER_PATH}';
config.openvpn.helperUseSudo = true;
config.openvpn.installScriptPath = '${HELPER_DIR}/third_party/openvpn-install/openvpn-install.sh';
config.openvpn.profileDir = '${DATA_DIR}/profiles/openvpn';
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
"

cat > "${SUDOERS_FILE}" <<SUDOERS
${APP_USER} ALL=(root) NOPASSWD: ${HELPER_PATH}
SUDOERS
chmod 0440 "${SUDOERS_FILE}"
if command -v visudo >/dev/null 2>&1; then
  visudo -cf "${SUDOERS_FILE}"
fi

cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=VPN Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=VPN_MANAGER_CONFIG=${CONFIG_DIR}/config.json
ExecStart=/usr/bin/env node ${APP_DIR}/src/main.js
Restart=on-failure
RestartSec=3
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
RuntimeDirectory=openvpn-server
ReadWritePaths=${DATA_DIR} ${LOG_DIR} /etc/openvpn /run/openvpn-server

[Install]
WantedBy=multi-user.target
SERVICE

chown -R root:root "${APP_DIR}" "${CONFIG_DIR}"
chown -R root:root "${HELPER_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"
chmod 0644 "${CONFIG_DIR}/config.json"
chmod 0644 "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable --now "${APP_NAME}.service"

echo
echo "VPN Manager installed."
echo "URL: http://$(hostname):${PORT}"
echo "Admin token: ${ADMIN_TOKEN}"
echo "Config: ${CONFIG_DIR}/config.json"
echo "Logs: journalctl -u ${APP_NAME} -f"
