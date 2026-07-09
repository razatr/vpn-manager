# VPN Manager

План приложения для управления VPN-сервером через web UI. Первый этап - OpenVPN, с возможностью позже добавить VLESS и другие типы профилей.

## Текущее состояние

Репозиторий инициализирован, добавлен первый запускаемый каркас:

- Node.js backend без внешних зависимостей;
- TypeScript/Vite web UI;
- API health/status;
- файловое хранилище клиентов и событий;
- install/uninstall скрипты;
- systemd packaging;
- vendored `Nyr/openvpn-install`;
- OpenVPN helper для status, создания, отзыва профилей и чтения подключений;
- token-based auth для серверной установки;
- endpoint и UI-форма первичной установки OpenVPN;
- Playwright e2e smoke test.

Локальный запуск:

```bash
npm start
```

Проверка синтаксиса:

```bash
npm run check
```

Сборка фронта:

```bash
npm run build
```

E2E smoke test в Chromium:

```bash
npm run test:e2e
```

API:

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

## Цель

Сделать self-hosted приложение, которое ставится на чистый VPS одной командой, поднимается на HTTP/HTTPS-порту и позволяет:

- выполнить первичную настройку OpenVPN-сервера;
- создавать клиентские профили;
- скачивать `.ovpn` профили из UI;
- отзывать/удалять профили;
- видеть статус сервера и подключений;
- позже подключить другие VPN-провайдеры, например VLESS.

За основу OpenVPN-части можно взять `Nyr/openvpn-install`: скрипт поддерживает Ubuntu, Debian, AlmaLinux, Rocky Linux, CentOS и Fedora, устанавливает OpenVPN, настраивает PKI, firewall/NAT и умеет при повторном запуске добавлять/удалять клиентов.

## Рекомендуемый формат поставки

Основной вариант: GitHub-репозиторий + install script.

Пользовательская установка:

```bash
curl -fsSL https://raw.githubusercontent.com/<owner>/vpn-manager/main/install.sh | sudo bash
```

Что делает `install.sh`:

1. Проверяет root-права, systemd, ОС, TUN, доступные порты.
2. Ставит зависимости: Docker/Compose или нативный runtime, nginx/caddy, openvpn-зависимости.
3. Создает системного пользователя `vpn-manager`.
4. Кладет приложение в `/opt/vpn-manager`.
5. Создает конфиг `/etc/vpn-manager/config.yaml`.
6. Создает systemd unit `vpn-manager.service`.
7. Открывает выбранный порт в firewall.
8. Печатает URL, временный admin token и путь к логам.

Альтернативы на будущее:

- `.deb`/`.rpm` пакеты для стабильных релизов;
- Docker image для самого UI/API;
- cloud-init скрипт для автоматического bootstrap на VPS;
- Ansible role для повторяемых установок.

## Архитектура MVP

```text
Browser
  |
  | HTTP/HTTPS
  v
Reverse proxy: Caddy или nginx
  |
  v
vpn-manager-api
  |
  +-- SQLite database
  +-- OpenVPN adapter
  +-- systemd/journal adapter
  +-- privileged command runner
  |
  v
Host OS: openvpn, easy-rsa, firewall, /etc/openvpn/server
```

### Backend

Текущий стартовый стек: Node.js 20 без внешних зависимостей.

Причины для первого этапа:

- доступен в текущем окружении разработки;
- позволяет быстро получить запускаемый API и UI;
- простая установка через systemd;
- позднее можно заменить backend на Go, сохранив API, структуру провайдеров и install contract.

Целевой стек для более зрелого релиза можно пересмотреть в пользу Go, если понадобится один статический бинарник и меньше runtime-зависимостей на сервере.

### Frontend

Рекомендуемый стек: React + Vite + TypeScript.

Сборка фронтенда кладется внутрь backend-бинарника или в `/opt/vpn-manager/web`.

Главные экраны MVP:

- `Setup` - первичная настройка OpenVPN.
- `Clients` - список профилей, создание, скачивание, отзыв.
- `Connections` - текущие подключения и последние события.
- `Server` - состояние сервиса, IP, порт, протокол, DNS, firewall.
- `Settings` - admin password/token, порт UI, TLS, backup.

### Хранилище

SQLite в `/var/lib/vpn-manager/vpn-manager.db`.

Минимальные таблицы:

- `users`: локальные админы UI.
- `vpn_servers`: тип, статус, порт, протокол, public host, installed_at.
- `vpn_clients`: имя, тип VPN, статус, created_at, revoked_at, profile_path.
- `events`: audit log действий.
- `settings`: key-value настройки.

Файлы профилей хранить вне базы:

```text
/var/lib/vpn-manager/profiles/openvpn/<client>.ovpn
```

Секреты и ключи OpenVPN остаются в стандартных системных путях:

```text
/etc/openvpn/server
```

## OpenVPN-интеграция

На первом этапе не надо переписывать всю фабрику профилей. Лучше сделать adapter вокруг проверенной логики `nyr/openvpn-install`, но вынести интерактивность в управляемый слой.

### Этап 1: Обертка над скриптом

В репозитории хранить vendored-версию:

```text
third_party/openvpn-install/openvpn-install.sh
```

Рядом добавить wrapper:

```text
scripts/openvpn-manager.sh
```

Команды wrapper:

```bash
openvpn-manager.sh install --public-host example.com --port 1194 --protocol udp --dns cloudflare --first-client admin
openvpn-manager.sh create-client client1
openvpn-manager.sh revoke-client client1
openvpn-manager.sh status
openvpn-manager.sh list-active
```

Для MVP можно автоматизировать ввод в `openvpn-install.sh`, но лучше сразу сделать небольшой fork/patch скрипта и добавить non-interactive режим через переменные окружения:

```bash
AUTO_INSTALL=y
APPROVE_INSTALL=y
PUBLIC_IP=example.com
OPENVPN_PORT=1194
OPENVPN_PROTOCOL=udp
DNS=cloudflare
CLIENT=client1
```

Важно: все изменения в upstream-скрипте держать минимальными, чтобы можно было обновлять основу.

### Этап 2: Нативный OpenVPN provider

После MVP постепенно перенести генерацию клиентов из bash в backend:

- easy-rsa команды;
- генерация `.ovpn`;
- revoke через CRL;
- чтение `ipp.txt`;
- парсинг status log;
- управление `systemctl openvpn-server@server`.

## Статус подключений

В OpenVPN нужно включить status log:

```conf
status /run/openvpn-server/status.log 10
management 127.0.0.1 7505
```

Для MVP достаточно читать status log:

- common name клиента;
- real address;
- virtual address;
- connected since;
- bytes in/out.

Для более точного realtime-статуса позже использовать OpenVPN management interface.

## Безопасность

Приложение управляет root-операциями, поэтому нельзя просто запускать весь web API под root без ограничений.

Рекомендуемая модель:

- `vpn-manager-api` работает от пользователя `vpn-manager`;
- отдельный root-owned helper выполняет только разрешенные команды;
- helper вызывается через `sudo` с жестким allowlist в `/etc/sudoers.d/vpn-manager`;
- все входные параметры валидируются: имена клиентов только `[a-zA-Z0-9_-]`;
- `.ovpn` скачивается только после авторизации;
- audit log пишет все действия;
- первый вход через одноразовый setup token;
- после настройки обязательно задать пароль администратора;
- HTTPS через Caddy или nginx + Let's Encrypt, если есть домен.

Пример allowlist:

```text
vpn-manager ALL=(root) NOPASSWD: /usr/local/lib/vpn-manager/openvpn-helper
```

## API MVP

```text
POST   /api/setup/openvpn
GET    /api/server/status
GET    /api/openvpn/clients
POST   /api/openvpn/clients
GET    /api/openvpn/clients/:id/profile
POST   /api/openvpn/clients/:id/revoke
GET    /api/openvpn/connections
GET    /api/events
POST   /api/auth/login
POST   /api/auth/logout
```

Для будущего расширения API лучше строить вокруг общего понятия provider:

```text
GET    /api/providers
POST   /api/providers/openvpn/setup
POST   /api/providers/openvpn/clients
POST   /api/providers/vless/clients
```

## Provider-интерфейс

В коде backend заложить интерфейс:

```go
type VPNProvider interface {
    Name() string
    IsInstalled(ctx context.Context) (bool, error)
    Install(ctx context.Context, opts InstallOptions) error
    CreateClient(ctx context.Context, opts ClientOptions) (*Profile, error)
    RevokeClient(ctx context.Context, id string) error
    ListClients(ctx context.Context) ([]Client, error)
    ListConnections(ctx context.Context) ([]Connection, error)
    Status(ctx context.Context) (*ServerStatus, error)
}
```

Первый provider: `OpenVPNProvider`.

Будущий provider: `VLESSProvider`, например поверх Xray.

## Структура репозитория

```text
vpn-manager/
  cmd/
    vpn-manager/
      main.go
  internal/
    api/
    auth/
    config/
    db/
    providers/
      openvpn/
      vless/
    runner/
    systemd/
  web/
    src/
    package.json
  scripts/
    install.sh
    uninstall.sh
    openvpn-manager.sh
  third_party/
    openvpn-install/
      openvpn-install.sh
      LICENSE.txt
  packaging/
    systemd/
      vpn-manager.service
    sudoers/
      vpn-manager
  docs/
    SECURITY.md
    OPERATIONS.md
```

## MVP по этапам

### Этап 0: Репозиторий и bootstrap

- Инициализировать Git.
- Добавить базовую структуру.
- Добавить `install.sh`.
- Добавить systemd unit.
- Настроить GitHub Actions: build, test, release artifacts.

Результат: приложение можно поставить одной командой, пока без полной OpenVPN-логики.

### Этап 1: Backend skeleton

- HTTP API.
- SQLite.
- Конфиг.
- Локальная авторизация.
- Audit events.
- Healthcheck.

Результат: UI может логиниться и видеть состояние сервера.

### Этап 2: OpenVPN setup

- Подключить vendored `openvpn-install`.
- Сделать wrapper/helper.
- Реализовать `POST /api/setup/openvpn`.
- Сохранять настройки сервера в SQLite.
- Показывать прогресс установки в UI.

Результат: OpenVPN ставится из UI.

### Этап 3: Профили

- Создание клиента.
- Скачивание `.ovpn`.
- Отзыв клиента.
- Список клиентов.
- Валидация имен.

Результат: основная админская работа с профилями закрыта.

### Этап 4: Статус

- Статус systemd service.
- Парсинг OpenVPN status log.
- Последние события из journal.
- Отображение активных подключений.

Результат: видно, кто подключен и жив ли сервер.

### Этап 5: Установка и безопасность

- Одноразовый setup token.
- Caddy/nginx reverse proxy.
- HTTPS при наличии домена.
- Firewall rules.
- Backup/restore `/etc/openvpn/server` и SQLite.
- Uninstall script.

Результат: приложение готово для реального VPS.

### Этап 6: Provider abstraction

- Вынести OpenVPN в provider-интерфейс.
- Добавить заглушку VLESS provider.
- Подготовить UI к нескольким типам профилей.

Результат: можно добавлять VLESS без переделки всей архитектуры.

## Первый релиз

Версия `v0.1.0` должна уметь:

- ставиться одной командой;
- запускаться как systemd service;
- открываться на выбранном порту, по умолчанию `80`;
- создавать admin пользователя;
- устанавливать OpenVPN;
- создавать и скачивать `.ovpn`;
- отзывать клиента;
- показывать статус сервера и активных подключений.

## Ключевые риски

- Интерактивный `openvpn-install.sh` неудобен для UI, нужен non-interactive wrapper или аккуратный fork.
- Web API с root-доступом опасен, нужен отдельный helper и allowlist.
- У разных ОС отличаются firewall, systemd unit names и пути.
- Статус подключений в OpenVPN надо включать явно.
- При обновлениях нельзя ломать существующие ключи и профили.
- Нужно заранее продумать backup, иначе потеря `/etc/openvpn/server` сломает всех клиентов.

## Практичный порядок разработки

1. Сделать CLI/helper для OpenVPN без UI.
2. Добиться установки и создания профиля на тестовом VPS.
3. Завернуть helper в backend API.
4. Добавить минимальный UI.
5. Упаковать установку одной командой.
6. Добавить статус подключений.
7. Усилить безопасность и backup.
