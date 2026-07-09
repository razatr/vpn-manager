#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

COMMAND="${1:-}"
CLIENT="${2:-}"
XRAY_CONFIG="${VPN_MANAGER_VLESS_CONFIG:-/etc/xray/config.json}"
PROFILE_DIR="${VPN_MANAGER_VLESS_PROFILE_DIR:-/var/lib/vpn-manager/profiles/vless}"
SERVICE_NAME="${VLESS_SERVICE_NAME:-xray.service}"

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

case "${COMMAND}" in
  status)
    installed="false"
    [[ -f "${XRAY_CONFIG}" ]] && installed="true"
    active="$(detect_service_active)"
    printf '{"installed":%s,"active":%s,"configPath":%s,"profileDir":%s}\n' \
      "$(json_bool "${installed}")" \
      "$(json_bool "${active}")" \
      "$(json_string "${XRAY_CONFIG}")" \
      "$(json_string "${PROFILE_DIR}")"
    ;;
  list-clients)
    printf '[]\n'
    ;;
  create-client)
    validate_client
    echo "VLESS client creation is not implemented yet. Next step: Xray config writer." >&2
    exit 3
    ;;
  *)
    echo "Usage: $0 {status|list-clients|create-client NAME}" >&2
    exit 1
    ;;
esac
