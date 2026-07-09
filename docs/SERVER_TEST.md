# Server Test Checklist

Use this checklist for the first VPS deployment.

## 1. Prepare Server

Supported base OS should match `Nyr/openvpn-install`: Ubuntu 22.04+, Debian 11+, AlmaLinux/Rocky/CentOS 9+, or Fedora.

Required before install:

```bash
sudo apt-get update
sudo apt-get install -y git curl sudo nodejs npm openssl
```

On non-Debian systems use the equivalent package manager.

## 2. Run Doctor

From a checkout:

```bash
sudo bash scripts/doctor.sh
```

The important checks are root, systemd, sudo, node >= 20, and `/dev/net/tun`.

## 3. Install App

From GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo bash
```

From a fork:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo VPN_MANAGER_REPO=https://github.com/<owner>/vpn-manager.git bash
```

Save the printed admin token.

## 4. Open UI

Open:

```text
http://<server-host>/
```

Log in with the admin token printed by the installer.

## 5. Setup OpenVPN

Use the setup form:

- public host: server public IP or DNS name;
- port: `1194`;
- protocol: `udp`;
- DNS: `1.1.1.1`;
- first client: `admin`.

After setup, download the first profile and import it into an OpenVPN client.

## 6. Troubleshooting

Logs:

```bash
journalctl -u vpn-manager -f
```

Config:

```bash
sudo cat /etc/vpn-manager/config.json
```

OpenVPN status:

```bash
sudo systemctl status openvpn-server@server.service
sudo /usr/local/lib/vpn-manager/openvpn-helper status
```

