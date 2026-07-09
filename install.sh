#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${VPN_MANAGER_REPO:-https://github.com/razatr/vpn-manager.git}"
REPO_REF="${VPN_MANAGER_REF:-main}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

if [[ "${EUID}" -ne 0 ]]; then
  echo "This installer must be run as root."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required to install VPN Manager."
  exit 1
fi

echo "Cloning VPN Manager from ${REPO_URL} (${REPO_REF})..."
git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" "${WORK_DIR}/vpn-manager"

cd "${WORK_DIR}/vpn-manager"
exec bash scripts/install.sh

