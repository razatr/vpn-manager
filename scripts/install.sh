#!/usr/bin/env bash
set -euo pipefail

APP_NAME="vpn-manager"
APP_USER="vpn-manager"
APP_DIR="/opt/vpn-manager"
CONFIG_DIR="/etc/vpn-manager"
DATA_DIR="/var/lib/vpn-manager"
LOG_DIR="/var/log/vpn-manager"
SERVICE_FILE="/etc/systemd/system/vpn-manager.service"
PORT="${VPN_MANAGER_PORT:-80}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must be run as root."
  exit 1
fi

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

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}" "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}"

if [[ ! -d ./web/dist ]]; then
  echo "web/dist not found. Building frontend..."
  npm ci
  npm run build
fi

cp -R ./package.json ./package-lock.json ./src ./web ./scripts "${APP_DIR}/"
cp ./config.example.json "${CONFIG_DIR}/config.json"

node -e "
const fs = require('fs');
const path = '${CONFIG_DIR}/config.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
config.port = Number('${PORT}');
config.dataDir = '${DATA_DIR}';
config.publicUrl = 'http://' + require('os').hostname() + ':' + config.port;
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
"

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
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=${DATA_DIR} ${LOG_DIR}

[Install]
WantedBy=multi-user.target
SERVICE

chown -R root:root "${APP_DIR}" "${CONFIG_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"
chmod 0644 "${CONFIG_DIR}/config.json"
chmod 0644 "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable --now "${APP_NAME}.service"

echo
echo "VPN Manager installed."
echo "URL: http://$(hostname):${PORT}"
echo "Config: ${CONFIG_DIR}/config.json"
echo "Logs: journalctl -u ${APP_NAME} -f"
