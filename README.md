# VPN Manager

Self-hosted web UI для установки OpenVPN на VPS и управления клиентскими `.ovpn` профилями.

Сейчас проект умеет:

- запускать web UI и API;
- логиниться по admin token на серверной установке;
- выполнять первичную настройку OpenVPN через UI;
- создавать клиентов OpenVPN;
- скачивать профиль клиента;
- отзывать клиента;
- показывать статус OpenVPN и активные подключения из status log;
- ставиться на Linux-сервер через `install.sh`.

## Установка На Сервер

Поддерживаемая база такая же, как у `Nyr/openvpn-install`: Ubuntu 22.04+, Debian 11+, AlmaLinux/Rocky/CentOS 9+ или Fedora.

На чистом сервере должны быть `git`, `curl`, `sudo`, `nodejs`, `npm`, `openssl`, `systemd` и TUN device.

Установка из основного репозитория:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo bash
```

Установка из форка или приватного репозитория:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo VPN_MANAGER_REPO=https://github.com/<owner>/vpn-manager.git bash
```

Инсталлятор:

- клонирует репозиторий;
- собирает frontend;
- кладет приложение в `/opt/vpn-manager`;
- создает конфиг `/etc/vpn-manager/config.json`;
- создает пользователя `vpn-manager`;
- ставит root-owned OpenVPN helper в `/usr/local/lib/vpn-manager/openvpn-helper`;
- добавляет allowlist в `/etc/sudoers.d/vpn-manager`;
- создает и запускает `vpn-manager.service`;
- печатает URL, admin token и команду для просмотра логов.

После установки открой:

```text
http://<server-ip>/
```

Войди с admin token, который напечатал installer.

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
- посмотреть активные подключения.

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

Подробный чеклист первого VPS-прогона лежит в [docs/SERVER_TEST.md](docs/SERVER_TEST.md).

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
POST /api/setup/openvpn
GET  /api/server/status
GET  /api/providers
GET  /api/openvpn/clients
POST /api/openvpn/clients
POST /api/openvpn/clients/:name/revoke
GET  /api/openvpn/clients/:name/profile
GET  /api/openvpn/connections
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
