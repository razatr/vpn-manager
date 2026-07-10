# VPN Manager

Self-hosted web UI для установки OpenVPN на VPS и управления клиентскими `.ovpn` профилями.

Сейчас проект умеет:

- запускать web UI и API;
- логиниться по логину и паролю на серверной установке;
- выполнять первичную настройку OpenVPN через UI;
- создавать клиентов OpenVPN;
- скачивать профиль клиента;
- отзывать клиента;
- синхронизировать список клиентов с реальным OpenVPN PKI и наличием `.ovpn` файлов;
- показывать статус OpenVPN и активные подключения из status log;
- показывать базовый статус VLESS/Xray как основу следующего provider;
- устанавливать VLESS/REALITY через Xray, создавать и скачивать VLESS профили;
- обновлять и скачивать белые списки РФ из подписок `igareck/vpn-configs-for-russia`;
- устанавливать WireGuard, создавать и скачивать `.conf` профили;
- ставиться на Linux-сервер через `install.sh`.

## Установка На Сервер

Поддерживаемая база такая же, как у `Nyr/openvpn-install`: Ubuntu 22.04+, Debian 11+, AlmaLinux/Rocky/CentOS 9+ или Fedora.

На чистом сервере должны быть `git`, `curl`, `sudo`, `nodejs`, `openssl`, `systemd` и TUN device.

Установка из основного репозитория:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo bash
```

Установка из форка или приватного репозитория:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo env VPN_MANAGER_REPO=https://github.com/<owner>/vpn-manager.git bash
```

Инсталлятор:

- клонирует репозиторий;
- использует уже собранный frontend из `web/dist`;
- спрашивает admin username и password, если они не переданы через env;
- кладет приложение в `/opt/vpn-manager`;
- создает конфиг `/etc/vpn-manager/config.json`;
- создает пользователя `vpn-manager`;
- ставит root-owned OpenVPN helper в `/usr/local/lib/vpn-manager/openvpn-helper`;
- добавляет allowlist в `/etc/sudoers.d/vpn-manager`;
- создает и запускает `vpn-manager.service`;
- печатает URL, логин, пароль, API token и команду для просмотра логов.

По умолчанию, если просто нажимать Enter в анкете:

```text
username: admin
password: vpnpass
```

Для полностью неинтерактивной установки:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo env VPN_MANAGER_ADMIN_USERNAME=admin VPN_MANAGER_ADMIN_PASSWORD='strong-password' bash
```

После установки открой:

```text
http://<server-ip>/
```

Войди с логином и паролем, которые напечатал installer.

## Первичная Настройка OpenVPN

В UI открой блок первичной настройки и заполни:

- public host: публичный IP или домен сервера;
- port: обычно `1194`;
- protocol: обычно `udp`;
- DNS: например `1.1.1.1`;
- first client: например `admin`.

После установки OpenVPN первый профиль появится в списке клиентов. Его можно скачать и импортировать в OpenVPN-клиент.

## Управление Клиентами

В UI можно:

- создать клиента;
- скачать `.ovpn` профиль;
- отозвать клиента;
- посмотреть активные подключения;
- сменить логин и пароль администратора.

Источник истины по OpenVPN-клиентам - OpenVPN PKI/index и наличие профиля на диске. Локальный JSON-store нужен для истории UI и кэша. Если `.ovpn` файл удалили вручную, клиент останется виден, но получит статус `Нет файла профиля`, а скачивание будет недоступно.

Если клиент создан напрямую через `nyr/openvpn-install`, UI автоматически импортирует `/root/<client>.ovpn` в каталог профилей менеджера. Если этого файла уже нет, профиль восстанавливается из `client-common.txt` и Easy-RSA inline certificate.

Имя клиента должно соответствовать:

```text
^[a-zA-Z0-9_-]{1,64}$
```

## Локальная Разработка

Установить зависимости:

```bash
npm install
```

Запустить backend:

```bash
npm start
```

Собрать frontend:

```bash
npm run build
```

Запустить Vite dev server:

```bash
npm run dev
```

Проверить TypeScript и Node syntax:

```bash
npm run check
```

Запустить API-тесты:

```bash
npm run test:api
```

Запустить browser smoke test:

```bash
npm run test:e2e
```

Запустить все тесты:

```bash
npm test
```

## Проверка Сервера

Перед первым деплоем можно проверить окружение:

```bash
sudo bash scripts/doctor.sh
```

После установки OpenVPN этот же doctor проверяет самые частые причины ситуации `OpenVPN подключился, но интернета нет`: `ip_forward`, NAT/FORWARD rules, `openvpn-iptables.service`, default route, TUN и server egress. Для быстрого отбора VPS с почасовой оплатой:

```bash
sudo /opt/vpn-manager/scripts/doctor.sh
```

Если есть `[fail] NAT rule`, `[fail] net.ipv4.ip_forward` или `[fail] FORWARD rule`, этот сервер не стоит дальше тестировать как OpenVPN-хост, пока причина не исправлена.

## HTTPS Для Подписок И UI

Если VLESS/REALITY использует порт `443`, web UI нельзя одновременно повесить на обычный `https://domain/` без переноса VLESS на другой порт. Практичный вариант:

- VLESS/REALITY остается на `443`;
- `vpn-manager` слушает локально `127.0.0.1:8080`;
- Nginx слушает `80` для ACME challenge и reverse proxy;
- Nginx слушает `8443` с Let's Encrypt сертификатом для UI и subscription URL.

При такой схеме `publicUrl` должен быть:

```text
https://<domain>:8443
```

Повторная установка не перетирает существующие `host`, `port` и `publicUrl` в `/etc/vpn-manager/config.json`, если они уже были настроены. Для явного задания при установке можно использовать:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo env VPN_MANAGER_HOST=127.0.0.1 VPN_MANAGER_PORT=8080 VPN_MANAGER_PUBLIC_URL='https://vpn.example.com:8443' bash
```

Подробный чеклист первого VPS-прогона лежит в [docs/SERVER_TEST.md](docs/SERVER_TEST.md).

План расширения на VLESS/REALITY, белые списки РФ и WireGuard лежит в [docs/ROADMAP.md](docs/ROADMAP.md).

Логи сервиса:

```bash
journalctl -u vpn-manager -f
```

Статус сервиса:

```bash
systemctl status vpn-manager.service
```

Статус OpenVPN helper:

```bash
sudo /usr/local/lib/vpn-manager/openvpn-helper status
```

## API

```text
GET  /api/health
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/credentials
POST /api/setup/openvpn
GET  /api/server/status
GET  /api/providers
GET  /api/openvpn/clients
POST /api/openvpn/clients
POST /api/openvpn/clients/:name/revoke
GET  /api/openvpn/clients/:name/profile
GET  /api/openvpn/connections
GET  /api/vless/clients
POST /api/vless/clients
GET  /api/vless/clients/:name/profile
POST /api/setup/wireguard
GET  /api/wireguard/clients
POST /api/wireguard/clients
GET  /api/wireguard/clients/:name/profile
GET  /api/whitelists/status
POST /api/whitelists/update
GET  /api/whitelists/:id/download
GET  /api/events
```

## Структура

```text
install.sh                         bootstrap installer for curl | sudo bash
scripts/install.sh                 main server installer
scripts/openvpn-manager.sh         privileged OpenVPN helper
scripts/doctor.sh                  server environment checks
src/                               Node.js API
web/                               TypeScript/Vite frontend
tests/                             API and Playwright tests
third_party/openvpn-install/       vendored Nyr/openvpn-install
packaging/                         systemd and sudoers templates
docs/SERVER_TEST.md                first server deployment checklist
```

## Локальные Планы

Внутренние планы и рабочие заметки хранятся в локальной папке `.agents/`.

Эта папка добавлена в `.gitignore` и не попадает в репозиторий.
