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
VLESS_HELPER_PATH="${HELPER_DIR}/vless-helper"
SUDOERS_FILE="/etc/sudoers.d/vpn-manager"
SERVICE_FILE="/etc/systemd/system/vpn-manager.service"
PORT="${VPN_MANAGER_PORT:-80}"
ADMIN_TOKEN="${VPN_MANAGER_ADMIN_TOKEN:-$(openssl rand -hex 24)}"
ADMIN_USERNAME="${VPN_MANAGER_ADMIN_USERNAME:-}"
ADMIN_PASSWORD="${VPN_MANAGER_ADMIN_PASSWORD:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must be run as root."
  exit 1
fi

install_runtime_deps() {
  missing=()
  for cmd in node git curl sudo openssl; do
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
    apt-get install -y nodejs git curl sudo openssl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs git curl sudo openssl ca-certificates
  else
    echo "Missing dependencies: ${missing[*]}"
    echo "Install them manually and rerun this installer."
    exit 1
  fi
}

install_runtime_deps

prompt_admin_credentials() {
  if [[ -n "${ADMIN_USERNAME}" && -n "${ADMIN_PASSWORD}" ]]; then
    return
  fi

  if exec 3<>/dev/tty 2>/dev/null; then
    if [[ -z "${ADMIN_USERNAME}" ]]; then
      read -r -p "Admin username [admin]: " ADMIN_USERNAME <&3 || true
      ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    fi
    if [[ -z "${ADMIN_PASSWORD}" ]]; then
      read -r -s -p "Admin password [vpnpass]: " ADMIN_PASSWORD <&3 || true
      printf '\n' >&3
      ADMIN_PASSWORD="${ADMIN_PASSWORD:-vpnpass}"
    fi
    exec 3<&-
    exec 3>&-
  else
    ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-vpnpass}"
  fi
}

prompt_admin_credentials

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

mkdir -p "${APP_DIR}" "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}" "${HELPER_DIR}" /etc/openvpn /run/openvpn-server /etc/systemd/system /etc/sysctl.d

if [[ ! -d ./web/dist ]]; then
  echo "web/dist not found. Building frontend..."
  if ! command -v npm >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update
      apt-get install -y npm
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y npm
    else
      echo "npm is required to build frontend when web/dist is missing."
      exit 1
    fi
  fi
  npm ci
  npm run build
fi

cp -R ./package.json ./package-lock.json ./src ./web ./scripts "${APP_DIR}/"
cp ./scripts/openvpn-manager.sh "${HELPER_PATH}"
cp ./scripts/vless-manager.sh "${VLESS_HELPER_PATH}"
cp -R ./third_party "${HELPER_DIR}/"
chmod 0755 "${HELPER_PATH}"
chmod 0755 "${VLESS_HELPER_PATH}"
cp ./config.example.json "${CONFIG_DIR}/config.json"

VPN_MANAGER_ADMIN_USERNAME="${ADMIN_USERNAME}" VPN_MANAGER_ADMIN_PASSWORD="${ADMIN_PASSWORD}" node -e "
const fs = require('fs');
const crypto = require('crypto');
const path = '${CONFIG_DIR}/config.json';
const config = JSON.parse(fs.readFileSync(path, 'utf8'));
const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.scryptSync(process.env.VPN_MANAGER_ADMIN_PASSWORD, salt, 32).toString('hex');
config.port = Number('${PORT}');
config.dataDir = '${DATA_DIR}';
config.publicUrl = 'http://' + require('os').hostname() + ':' + config.port;
config.auth = {
  enabled: true,
  adminToken: '${ADMIN_TOKEN}',
  username: process.env.VPN_MANAGER_ADMIN_USERNAME,
  passwordHash,
  passwordSalt: salt
};
config.openvpn.helperPath = '${HELPER_PATH}';
config.openvpn.helperUseSudo = true;
config.openvpn.installScriptPath = '${HELPER_DIR}/third_party/openvpn-install/openvpn-install.sh';
config.openvpn.profileDir = '${DATA_DIR}/profiles/openvpn';
config.openvpn.profileGroup = '${APP_USER}';
config.vless.helperPath = '${VLESS_HELPER_PATH}';
config.vless.helperUseSudo = true;
config.vless.configPath = '/etc/xray/config.json';
config.vless.profileDir = '${DATA_DIR}/profiles/vless';
config.vless.profileGroup = '${APP_USER}';
config.whitelists.dataDir = '${DATA_DIR}/whitelists';
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
" 

cat > "${SUDOERS_FILE}" <<SUDOERS
${APP_USER} ALL=(root) NOPASSWD:SETENV: ${HELPER_PATH}
${APP_USER} ALL=(root) NOPASSWD:SETENV: ${VLESS_HELPER_PATH}
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
AmbientCapabilities=CAP_NET_BIND_SERVICE
PrivateTmp=true
ProtectHome=true
RuntimeDirectory=openvpn-server

[Install]
WantedBy=multi-user.target
SERVICE

chown -R root:root "${APP_DIR}" "${CONFIG_DIR}"
chown -R root:root "${HELPER_DIR}"
chown root:"${APP_USER}" "${CONFIG_DIR}/config.json"
chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}" "${LOG_DIR}"
find "${DATA_DIR}/profiles/openvpn" -type f -name '*.ovpn' -exec chown root:"${APP_USER}" {} \; -exec chmod 0640 {} \; 2>/dev/null || true
find "${DATA_DIR}/profiles/vless" -type f -name '*.txt' -exec chown root:"${APP_USER}" {} \; -exec chmod 0640 {} \; 2>/dev/null || true
chmod 0660 "${CONFIG_DIR}/config.json"
chmod 0644 "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable "${APP_NAME}.service"
systemctl restart "${APP_NAME}.service"

echo
echo "VPN Manager installed."
echo "URL: http://$(hostname):${PORT}"
echo "Username: ${ADMIN_USERNAME}"
echo "Password: ${ADMIN_PASSWORD}"
echo "API token: ${ADMIN_TOKEN}"
echo "Config: ${CONFIG_DIR}/config.json"
echo "Logs: journalctl -u ${APP_NAME} -f"
