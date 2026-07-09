#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-}"
CLIENT="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="${VPN_MANAGER_OPENVPN_INSTALL_SCRIPT:-${SCRIPT_DIR}/../third_party/openvpn-install/openvpn-install.sh}"
SERVER_DIR="${OPENVPN_SERVER_DIR:-/etc/openvpn/server}"
EASY_RSA_DIR="${OPENVPN_EASY_RSA_DIR:-${SERVER_DIR}/easy-rsa}"
PROFILE_DIR="${VPN_MANAGER_PROFILE_DIR:-/var/lib/vpn-manager/profiles/openvpn}"
STATUS_LOG="${OPENVPN_STATUS_LOG:-/run/openvpn-server/status.log}"
SERVER_CONF="${SERVER_DIR}/server.conf"
CLIENT_COMMON="${SERVER_DIR}/client-common.txt"
INDEX_FILE="${EASY_RSA_DIR}/pki/index.txt"
SERVICE_NAME="${OPENVPN_SERVICE_NAME:-openvpn-server@server.service}"
INSTALL_LOG="${VPN_MANAGER_OPENVPN_INSTALL_LOG:-/var/log/vpn-manager/openvpn-install.log}"

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

require_installed() {
  if [[ ! -f "${SERVER_CONF}" ]]; then
    echo "OpenVPN server is not installed at ${SERVER_CONF}" >&2
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

client_exists() {
  [[ -f "${EASY_RSA_DIR}/pki/issued/${CLIENT}.crt" ]]
}

client_status_from_index_line() {
  case "$1" in
    V*) printf "valid" ;;
    R*) printf "revoked" ;;
    E*) printf "expired" ;;
    *) printf "unknown" ;;
  esac
}

client_name_from_index_line() {
  sed -E 's#^.*/CN=([^/]+).*$#\1#; t; s#^.*=##' <<< "$1"
}

group_name() {
  if getent group nogroup >/dev/null 2>&1; then
    printf "nogroup"
  else
    printf "nobody"
  fi
}

install_openvpn() {
  local public_host=""
  local port="1194"
  local protocol="udp"
  local dns="3"
  local first_client="admin"
  local custom_dns=""

  shift
  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --public-host)
        public_host="${2:-}"
        shift 2
        ;;
      --port)
        port="${2:-}"
        shift 2
        ;;
      --protocol)
        protocol="${2:-}"
        shift 2
        ;;
      --dns)
        dns="${2:-}"
        shift 2
        ;;
      --custom-dns)
        custom_dns="${2:-}"
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
  if [[ -n "${public_host}" && ! "${public_host}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Invalid public host. Use a hostname or IPv4 address." >&2
    exit 1
  fi
  if [[ ! "${port}" =~ ^[0-9]+$ || "${port}" -lt 1 || "${port}" -gt 65535 ]]; then
    echo "Invalid OpenVPN port." >&2
    exit 1
  fi
  if [[ ! "${protocol}" =~ ^(udp|tcp)$ ]]; then
    echo "Invalid OpenVPN protocol. Use udp or tcp." >&2
    exit 1
  fi
  if [[ ! "${dns}" =~ ^[1-8]$ ]]; then
    echo "Invalid DNS selection. Use 1-8." >&2
    exit 1
  fi
  if [[ ! -f "${INSTALL_SCRIPT}" ]]; then
    echo "OpenVPN installer not found at ${INSTALL_SCRIPT}" >&2
    exit 3
  fi

  mkdir -p "$(dirname "${INSTALL_LOG}")"
  if ! VPN_MANAGER_AUTO_INSTALL=y \
    VPN_MANAGER_APPROVE_INSTALL=y \
    VPN_MANAGER_PUBLIC_HOST="${public_host}" \
    VPN_MANAGER_OPENVPN_PORT="${port}" \
    VPN_MANAGER_OPENVPN_PROTOCOL="${protocol}" \
    VPN_MANAGER_OPENVPN_DNS="${dns}" \
    VPN_MANAGER_OPENVPN_CUSTOM_DNS="${custom_dns}" \
    VPN_MANAGER_OPENVPN_FIRST_CLIENT="${first_client}" \
    bash "${INSTALL_SCRIPT}" > "${INSTALL_LOG}" 2>&1; then
    echo "OpenVPN installer failed. Log: ${INSTALL_LOG}" >&2
    tail -80 "${INSTALL_LOG}" >&2 || true
    exit 5
  fi

  mkdir -p "${PROFILE_DIR}"
  generated_profile="$(dirname "${INSTALL_SCRIPT}")/${first_client}.ovpn"
  profile_path="${PROFILE_DIR}/${first_client}.ovpn"
  if [[ -f "${generated_profile}" ]]; then
    mv "${generated_profile}" "${profile_path}"
    chmod 0600 "${profile_path}"
  fi

  printf '{"installed":true,"firstClient":%s,"profilePath":%s}\n' \
    "$(json_string "${first_client}")" \
    "$(json_string "${profile_path}")"
}

case "${COMMAND}" in
  status)
    installed="false"
    [[ -f "${SERVER_CONF}" ]] && installed="true"
    active="$(detect_service_active)"
    printf '{"installed":%s,"active":%s,"serverDir":%s,"configPath":%s,"statusLogPath":%s,"statusLogExists":%s,"profileDir":%s}\n' \
      "$(json_bool "${installed}")" \
      "$(json_bool "${active}")" \
      "$(json_string "${SERVER_DIR}")" \
      "$(json_string "${SERVER_CONF}")" \
      "$(json_string "${STATUS_LOG}")" \
      "$(json_bool "$([[ -f "${STATUS_LOG}" ]] && echo true || echo false)")" \
      "$(json_string "${PROFILE_DIR}")"
    ;;
  list-clients)
    printf '['
    first="true"
    if [[ -f "${INDEX_FILE}" ]]; then
      while IFS= read -r line; do
        [[ -z "${line}" ]] && continue
        case "${line}" in
          V*|R*|E*) ;;
          *) continue ;;
        esac
        name="$(client_name_from_index_line "${line}")"
        status="$(client_status_from_index_line "${line}")"
        if [[ "${first}" == "true" ]]; then
          first="false"
        else
          printf ','
        fi
        printf '{"name":%s,"status":%s}' "$(json_string "${name}")" "$(json_string "${status}")"
      done < "${INDEX_FILE}"
    fi
    printf ']\n'
    ;;
  create-client)
    validate_client
    require_installed
    if client_exists; then
      echo "Client already exists: ${CLIENT}" >&2
      exit 4
    fi
    if [[ ! -x "${EASY_RSA_DIR}/easyrsa" ]]; then
      echo "easy-rsa executable not found at ${EASY_RSA_DIR}/easyrsa" >&2
      exit 3
    fi
    if [[ ! -f "${CLIENT_COMMON}" ]]; then
      echo "Client template not found at ${CLIENT_COMMON}" >&2
      exit 3
    fi
    mkdir -p "${PROFILE_DIR}"
    cd "${EASY_RSA_DIR}"
    ./easyrsa --batch --days=3650 build-client-full "${CLIENT}" nopass
    profile_path="${PROFILE_DIR}/${CLIENT}.ovpn"
    grep -vh '^#' "${CLIENT_COMMON}" "${EASY_RSA_DIR}/pki/inline/private/${CLIENT}.inline" > "${profile_path}"
    chmod 0600 "${profile_path}"
    printf '{"name":%s,"profilePath":%s}\n' "$(json_string "${CLIENT}")" "$(json_string "${profile_path}")"
    ;;
  revoke-client)
    validate_client
    require_installed
    if ! client_exists; then
      echo "Client does not exist: ${CLIENT}" >&2
      exit 4
    fi
    cd "${EASY_RSA_DIR}"
    ./easyrsa --batch revoke "${CLIENT}"
    ./easyrsa --batch --days=3650 gen-crl
    rm -f "${SERVER_DIR}/crl.pem"
    rm -f "${EASY_RSA_DIR}/pki/reqs/${CLIENT}.req"
    rm -f "${EASY_RSA_DIR}/pki/private/${CLIENT}.key"
    cp "${EASY_RSA_DIR}/pki/crl.pem" "${SERVER_DIR}/crl.pem"
    chown "nobody:$(group_name)" "${SERVER_DIR}/crl.pem" 2>/dev/null || true
    rm -f "${PROFILE_DIR}/${CLIENT}.ovpn"
    printf '{"name":%s,"status":"revoked"}\n' "$(json_string "${CLIENT}")"
    ;;
  list-connections)
    if [[ ! -f "${STATUS_LOG}" ]]; then
      printf '[]\n'
      exit 0
    fi

    printf '['
    first="true"
    in_clients="false"
    while IFS=, read -r common_name real_address bytes_received bytes_sent connected_since; do
      if [[ "${common_name}" == "Common Name" ]]; then
        in_clients="true"
        continue
      fi
      if [[ "${common_name}" == "ROUTING TABLE" ]]; then
        in_clients="false"
        continue
      fi
      [[ "${in_clients}" != "true" ]] && continue
      [[ -z "${common_name:-}" || -z "${real_address:-}" ]] && continue
      if [[ "${first}" == "true" ]]; then
        first="false"
      else
        printf ','
      fi
      virtual_address="$(awk -F, -v cn="${common_name}" '
        $1 == "ROUTING TABLE" { in_routing=1; next }
        $1 == "GLOBAL STATS" { in_routing=0; next }
        in_routing && $1 != "Virtual Address" && $2 == cn { print $1; exit }
      ' "${STATUS_LOG}")"
      printf '{"commonName":%s,"realAddress":%s,"virtualAddress":%s,"bytesReceived":%s,"bytesSent":%s,"connectedAt":%s}' \
        "$(json_string "${common_name}")" \
        "$(json_string "${real_address}")" \
        "$(json_string "${virtual_address}")" \
        "${bytes_received:-0}" \
        "${bytes_sent:-0}" \
        "$(json_string "${connected_since:-}")"
    done < "${STATUS_LOG}"
    printf ']\n'
    ;;
  install)
    install_openvpn "$@"
    ;;
  *)
    echo "Usage: $0 {status|list-clients|create-client NAME|revoke-client NAME|list-connections|install [options]}" >&2
    exit 1
    ;;
esac
