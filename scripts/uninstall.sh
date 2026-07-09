#!/usr/bin/env bash
set -euo pipefail

APP_NAME="vpn-manager"
APP_DIR="/opt/vpn-manager"
CONFIG_DIR="/etc/vpn-manager"
DATA_DIR="/var/lib/vpn-manager"
LOG_DIR="/var/log/vpn-manager"
HELPER_DIR="/usr/local/lib/vpn-manager"
SUDOERS_FILE="/etc/sudoers.d/vpn-manager"
SERVICE_FILE="/etc/systemd/system/vpn-manager.service"

if [[ "${EUID}" -ne 0 ]]; then
  echo "This uninstaller must be run as root."
  exit 1
fi

systemctl disable --now "${APP_NAME}.service" 2>/dev/null || true
rm -f "${SERVICE_FILE}"
rm -f "${SUDOERS_FILE}"
systemctl daemon-reload

rm -rf "${APP_DIR}" "${CONFIG_DIR}" "${LOG_DIR}" "${HELPER_DIR}"

echo "VPN Manager application files removed."
echo "Data directory preserved: ${DATA_DIR}"
