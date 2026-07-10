#!/usr/bin/env bash
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH}"

COMMAND="${1:-}"
CLIENT="${2:-}"
WG_INTERFACE="${VPN_MANAGER_WG_INTERFACE:-wg0}"
WG_CONFIG="${VPN_MANAGER_WG_CONFIG:-/etc/wireguard/${WG_INTERFACE}.conf}"
PROFILE_DIR="${VPN_MANAGER_WG_PROFILE_DIR:-/var/lib/vpn-manager/profiles/wireguard}"
PROFILE_GROUP="${VPN_MANAGER_PROFILE_GROUP:-vpn-manager}"
PUBLIC_HOST="${VPN_MANAGER_WG_PUBLIC_HOST:-}"
PORT="${VPN_MANAGER_WG_PORT:-51820}"
SERVER_ADDRESS="${VPN_MANAGER_WG_SERVER_ADDRESS:-10.8.0.1/24}"
CLIENT_DNS="${VPN_MANAGER_WG_DNS:-1.1.1.1}"
SERVICE_NAME="wg-quick@${WG_INTERFACE}.service"

json_bool() { [[ "$1" == "true" ]] && printf "true" || printf "false"; }

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

install_tools() {
  if command -v wg >/dev/null 2>&1 && command -v wg-quick >/dev/null 2>&1; then
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y wireguard-tools iptables
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y wireguard-tools iptables
  else
    echo "wireguard-tools are required." >&2
    exit 3
  fi
}

detect_service_active() {
  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
    printf "true"
  else
    printf "false"
  fi
}

secure_profile() {
  local profile_path="$1"
  chmod 0640 "${profile_path}"
  if getent group "${PROFILE_GROUP}" >/dev/null 2>&1; then
    chgrp "${PROFILE_GROUP}" "${profile_path}" 2>/dev/null || true
  fi
}

server_public_key() {
  awk -F' = ' '/^PrivateKey = / { print $2; exit }' "${WG_CONFIG}" | wg pubkey
}

client_exists() {
  grep -q "^# vpn-manager:${CLIENT}$" "${WG_CONFIG}" 2>/dev/null
}

next_client_ip() {
  used="$(grep -E '^AllowedIPs = 10\.8\.0\.[0-9]+/32$' "${WG_CONFIG}" 2>/dev/null | awk -F'[./]' '{ print $4 }' | sort -n)"
  for i in $(seq 2 254); do
    if ! grep -qx "${i}" <<< "${used}"; then
      printf "10.8.0.%s" "${i}"
      return
    fi
  done
  echo "No WireGuard client addresses available." >&2
  exit 5
}

write_client_profile() {
  local name="$1"
  local private_key="$2"
  local address="$3"
  local endpoint_host="${PUBLIC_HOST}"
  local endpoint_port="${PORT}"
  local dns="${CLIENT_DNS}"
  if [[ -z "${endpoint_host}" && -f "${WG_CONFIG}" ]]; then
    endpoint_host="$(awk -F'=' '/^# vpn-manager-public-host=/ { print $2; exit }' "${WG_CONFIG}")"
  fi
  if [[ -f "${WG_CONFIG}" ]]; then
    endpoint_port="$(awk -F'=' '/^# vpn-manager-port=/ { print $2; exit }' "${WG_CONFIG}")"
    dns="$(awk -F'=' '/^# vpn-manager-dns=/ { print $2; exit }' "${WG_CONFIG}")"
  fi
  endpoint_port="${endpoint_port:-51820}"
  dns="${dns:-1.1.1.1}"
  mkdir -p "${PROFILE_DIR}"
  profile_path="${PROFILE_DIR}/${name}.conf"
  cat > "${profile_path}" <<PROFILE
[Interface]
PrivateKey = ${private_key}
Address = ${address}/32
DNS = ${dns}

[Peer]
PublicKey = $(server_public_key)
Endpoint = ${endpoint_host}:${endpoint_port}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
PROFILE
  secure_profile "${profile_path}"
}

install_wireguard() {
  local first_client="admin"
  shift
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --public-host) PUBLIC_HOST="${2:-}"; shift 2 ;;
      --port) PORT="${2:-}"; shift 2 ;;
      --first-client) first_client="${2:-}"; shift 2 ;;
      --dns) CLIENT_DNS="${2:-}"; shift 2 ;;
      *) echo "Unknown install option: $1" >&2; exit 1 ;;
    esac
  done

  CLIENT="${first_client}"
  validate_client
  if [[ -z "${PUBLIC_HOST}" || ! "${PUBLIC_HOST}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Public host is required for WireGuard." >&2
    exit 1
  fi
  if [[ ! "${PORT}" =~ ^[0-9]+$ || "${PORT}" -lt 1 || "${PORT}" -gt 65535 ]]; then
    echo "Invalid WireGuard port." >&2
    exit 1
  fi

  install_tools
  mkdir -p "$(dirname "${WG_CONFIG}")" "${PROFILE_DIR}"
  server_private="$(wg genkey)"
  default_iface="$(ip route show default | awk '{ print $5; exit }')"
  sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true
  printf 'net.ipv4.ip_forward = 1\n' > /etc/sysctl.d/99-vpn-manager-wireguard.conf
  cat > "${WG_CONFIG}" <<CONF
# vpn-manager-public-host=${PUBLIC_HOST}
# vpn-manager-port=${PORT}
# vpn-manager-dns=${CLIENT_DNS}
[Interface]
Address = ${SERVER_ADDRESS}
ListenPort = ${PORT}
PrivateKey = ${server_private}
SaveConfig = false
PostUp = iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o ${default_iface} -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -s 10.8.0.0/24 -o ${default_iface} -j MASQUERADE
CONF
  chmod 0600 "${WG_CONFIG}"
  create_client
  systemctl enable "${SERVICE_NAME}" >/dev/null
  systemctl restart "${SERVICE_NAME}" 2>/dev/null || true
  printf '{"installed":true,"firstClient":%s,"profilePath":%s}\n' \
    "$(json_string "${first_client}")" \
    "$(json_string "${PROFILE_DIR}/${first_client}.conf")"
}

create_client() {
  validate_client
  install_tools
  if [[ ! -f "${WG_CONFIG}" ]]; then
    echo "WireGuard is not installed at ${WG_CONFIG}" >&2
    exit 3
  fi

  if client_exists; then
    profile_path="${PROFILE_DIR}/${CLIENT}.conf"
    [[ -f "${profile_path}" ]] || echo "Client exists but profile is missing: ${CLIENT}" >&2
    printf '{"name":%s,"profilePath":%s}\n' "$(json_string "${CLIENT}")" "$(json_string "${profile_path}")"
    return
  fi

  client_private="$(wg genkey)"
  client_public="$(printf '%s' "${client_private}" | wg pubkey)"
  client_ip="$(next_client_ip)"
  cat >> "${WG_CONFIG}" <<CONF

# vpn-manager:${CLIENT}
[Peer]
PublicKey = ${client_public}
AllowedIPs = ${client_ip}/32
CONF
  write_client_profile "${CLIENT}" "${client_private}" "${client_ip}"
  systemctl restart "${SERVICE_NAME}" 2>/dev/null || true
  printf '{"name":%s,"profilePath":%s}\n' "$(json_string "${CLIENT}")" "$(json_string "${PROFILE_DIR}/${CLIENT}.conf")"
}

case "${COMMAND}" in
  status)
    installed="false"
    [[ -f "${WG_CONFIG}" ]] && installed="true"
    active="$(detect_service_active)"
    printf '{"installed":%s,"active":%s,"configPath":%s,"profileDir":%s,"interface":%s,"port":%s}\n' \
      "$(json_bool "${installed}")" \
      "$(json_bool "${active}")" \
      "$(json_string "${WG_CONFIG}")" \
      "$(json_string "${PROFILE_DIR}")" \
      "$(json_string "${WG_INTERFACE}")" \
      "${PORT}"
    ;;
  install)
    install_wireguard "$@"
    ;;
  create-client)
    create_client
    ;;
  list-clients)
    if [[ ! -f "${WG_CONFIG}" ]]; then
      printf '[]\n'
      exit 0
    fi
    awk -v profile_dir="${PROFILE_DIR}" '
      /^# vpn-manager:/ {
        name = substr($0, 15)
        profile = profile_dir "/" name ".conf"
        cmd = "test -f " profile
        exists = (system(cmd) == 0 ? "true" : "false")
        close(cmd)
        if (seen++) printf ","
        printf "{\"name\":\"%s\",\"status\":\"valid\",\"profilePath\":\"%s\",\"profileExists\":%s}", name, profile, exists
      }
      END { printf "\n" }
    ' "${WG_CONFIG}" | sed '1s/^/[/;$s/$/]/'
    ;;
  *)
    echo "Usage: $0 {status|install|create-client NAME|list-clients}" >&2
    exit 1
    ;;
esac
