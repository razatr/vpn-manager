#!/usr/bin/env bash
set -euo pipefail

failures=0
warnings=0

SERVER_CONF="${OPENVPN_SERVER_CONF:-/etc/openvpn/server/server.conf}"
VPN_SUBNET="${OPENVPN_VPN_SUBNET:-10.8.0.0/24}"

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf '[ok] %s\n' "${name}"
  else
    printf '[fail] %s\n' "${name}"
    failures=$((failures + 1))
  fi
}

warn() {
  local name="$1"
  printf '[warn] %s\n' "${name}"
  warnings=$((warnings + 1))
}

ok() {
  local name="$1"
  printf '[ok] %s\n' "${name}"
}

fail() {
  local name="$1"
  printf '[fail] %s\n' "${name}"
  failures=$((failures + 1))
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

first_default_route() {
  ip -4 route show default 2>/dev/null | head -n 1 || true
}

default_iface() {
  first_default_route | awk '{ for (i = 1; i <= NF; i++) if ($i == "dev") { print $(i + 1); exit } }'
}

route_source_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true
}

server_conf_value() {
  local key="$1"
  awk -v key="${key}" '$1 == key { print $2; exit }' "${SERVER_CONF}" 2>/dev/null || true
}

iptables_dump() {
  if command_exists iptables-save; then
    iptables-save 2>/dev/null || true
  elif command_exists iptables; then
    iptables -S 2>/dev/null || true
    iptables -t nat -S 2>/dev/null || true
  fi
}

print_section() {
  printf '\n== %s ==\n' "$1"
}

print_section "Base environment"
check "root privileges" test "${EUID}" -eq 0
check "systemd" command -v systemctl
check "sudo" command -v sudo
check "git" command -v git
check "node" command -v node
check "openssl" command -v openssl
check "iproute2" command -v ip
check "TUN device" test -e /dev/net/tun

if command -v node >/dev/null 2>&1; then
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "${node_major}" -ge 20 ]]; then
    printf '[ok] node >= 20\n'
  else
    printf '[fail] node >= 20, current %s\n' "$(node --version)"
    failures=$((failures + 1))
  fi
fi

print_section "Network"
route="$(first_default_route)"
iface="$(default_iface)"
source_ip="$(route_source_ip)"
if [[ -n "${route}" ]]; then
  ok "default IPv4 route: ${route}"
else
  fail "default IPv4 route is missing"
fi

if [[ -n "${iface}" ]]; then
  ok "default interface: ${iface}"
else
  fail "default interface was not detected"
fi

if [[ -n "${source_ip}" ]]; then
  ok "outbound source IPv4: ${source_ip}"
else
  warn "outbound source IPv4 was not detected"
fi

if command_exists curl; then
  if public_ip="$(curl -4fsS --connect-timeout 5 --max-time 8 https://api.ipify.org 2>/dev/null)"; then
    ok "server IPv4 internet egress: ${public_ip}"
    if [[ -n "${source_ip}" && "${public_ip}" != "${source_ip}" ]]; then
      warn "public IPv4 differs from route source (${source_ip}); NAT/SNAT may need provider-specific checks"
    fi
  else
    warn "server IPv4 internet egress check failed"
  fi
else
  warn "curl is not installed; cannot check server internet egress"
fi

print_section "OpenVPN"
if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null; then
  ok "openvpn-server@server.service active"
else
  warn "openvpn-server@server.service is not active yet"
fi

if [[ -f "${SERVER_CONF}" ]]; then
  ok "OpenVPN config exists: ${SERVER_CONF}"
  port="$(server_conf_value port)"
  protocol="$(server_conf_value proto)"
  local_ip="$(server_conf_value local)"
  [[ -n "${port}" ]] && ok "OpenVPN port: ${port}" || warn "OpenVPN port not found in server.conf"
  [[ -n "${protocol}" ]] && ok "OpenVPN protocol: ${protocol}" || warn "OpenVPN protocol not found in server.conf"
  [[ -n "${local_ip}" ]] && ok "OpenVPN local IP: ${local_ip}" || warn "OpenVPN local IP not found in server.conf"
  if grep -q 'push "redirect-gateway' "${SERVER_CONF}"; then
    ok "redirect-gateway is pushed to clients"
  else
    fail "redirect-gateway is not pushed; clients may connect without internet routing"
  fi
else
  warn "OpenVPN config is not installed yet: ${SERVER_CONF}"
fi

if [[ "$(sysctl -n net.ipv4.ip_forward 2>/dev/null || echo 0)" == "1" ]]; then
  ok "net.ipv4.ip_forward=1"
else
  fail "net.ipv4.ip_forward is disabled; connected clients will not reach the internet"
fi

if [[ -f /etc/sysctl.d/99-openvpn-forward.conf ]]; then
  ok "persistent OpenVPN forwarding sysctl exists"
else
  warn "persistent OpenVPN forwarding sysctl is missing"
fi

if systemctl list-unit-files openvpn-iptables.service >/dev/null 2>&1; then
  if systemctl is-active --quiet openvpn-iptables.service 2>/dev/null; then
    ok "openvpn-iptables.service active"
  else
    fail "openvpn-iptables.service is not active; NAT/FORWARD rules may be missing"
  fi
elif systemctl is-active --quiet firewalld.service 2>/dev/null; then
  ok "firewalld active; OpenVPN rules should be managed there"
else
  warn "openvpn-iptables.service not found and firewalld is inactive"
fi

iptables_rules="$(iptables_dump)"
if [[ -n "${iptables_rules}" ]]; then
  if grep -Eq "POSTROUTING.*${VPN_SUBNET//./\\.}.*(SNAT|MASQUERADE)" <<< "${iptables_rules}"; then
    ok "NAT rule exists for ${VPN_SUBNET}"
  else
    fail "NAT rule for ${VPN_SUBNET} was not found; clients can connect but will have no internet"
  fi

  if grep -Eq "FORWARD.*${VPN_SUBNET//./\\.}" <<< "${iptables_rules}"; then
    ok "FORWARD rule exists for ${VPN_SUBNET}"
  else
    fail "FORWARD rule for ${VPN_SUBNET} was not found"
  fi
else
  warn "iptables rules could not be inspected"
fi

if [[ -f /proc/sys/net/ipv4/conf/all/rp_filter ]]; then
  all_rp_filter="$(cat /proc/sys/net/ipv4/conf/all/rp_filter)"
  default_rp_filter="$(cat /proc/sys/net/ipv4/conf/default/rp_filter 2>/dev/null || echo unknown)"
  if [[ "${all_rp_filter}" == "1" || "${default_rp_filter}" == "1" ]]; then
    warn "strict rp_filter detected (all=${all_rp_filter}, default=${default_rp_filter}); this can break routed VPN traffic on some VPS networks"
  else
    ok "rp_filter is not strict (all=${all_rp_filter}, default=${default_rp_filter})"
  fi
fi

if command_exists ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
  warn "ufw is active; verify it allows OpenVPN port and forwarded traffic"
fi

if [[ "${failures}" -gt 0 ]]; then
  printf '\nResult: %s failure(s), %s warning(s). This VPS is not ready for reliable OpenVPN egress.\n' "${failures}" "${warnings}"
  exit 1
fi

printf '\nResult: no failures, %s warning(s).\n' "${warnings}"
