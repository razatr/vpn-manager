#!/usr/bin/env bash
set -euo pipefail

failures=0

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

check "root privileges" test "${EUID}" -eq 0
check "systemd" command -v systemctl
check "sudo" command -v sudo
check "git" command -v git
check "node" command -v node
check "openssl" command -v openssl
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

if systemctl is-active --quiet openvpn-server@server.service 2>/dev/null; then
  printf '[ok] openvpn-server@server.service active\n'
else
  printf '[warn] openvpn-server@server.service is not active yet\n'
fi

if [[ "${failures}" -gt 0 ]]; then
  exit 1
fi
