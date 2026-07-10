# Правила Разработки Для LLM-Агентов

Этот файл предназначен для Codex, Cursor, Claude Code и других LLM-агентов, которые будут продолжать разработку проекта.

## Главный Контекст

`vpn-manager` - self-hosted web UI для установки и управления VPN-профилями на VPS.

Текущие provider-ы:

- OpenVPN: установка, создание, скачивание и отзыв `.ovpn` профилей.
- VLESS/REALITY: установка Xray, создание клиентов, ссылки, подписки, QR и deep links для Happ/INCY.
- WireGuard: установка, создание и скачивание `.conf` профилей.
- Белые списки РФ: загрузка и выдача списков из `igareck/vpn-configs-for-russia`.

Основная установка должна оставаться простой:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo bash
```

## Базовые Правила

- Не удаляй и не переписывай пользовательские изменения без явного запроса.
- Не коммить `.agents/`, `.tmp/`, `data/`, `test-results/`, `node_modules/`.
- Внутренние планы, черновики и агентные заметки клади в `.agents/`.
- Пользовательская документация живет в `README.md` и `docs/`.
- Любое изменение frontend-кода в `web/src/` должно сопровождаться `npm run build`, потому что серверная установка использует закоммиченный `web/dist`.
- Не добавляй backend-зависимости, которые требуют `npm install` на сервере во время установки. Инсталлер должен работать из готового репозитория.
- Привилегированные операции выполняются только через helper-скрипты в `scripts/` и sudoers allowlist.
- Не храни секреты, пароли, приватные ключи и реальные токены в репозитории.
- Не меняй vendored `third_party/openvpn-install/openvpn-install.sh` без явной причины. Это база для OpenVPN-фабрики.

## Архитектурные Принципы

- Backend написан на Node.js ESM в `src/`.
- Frontend написан на TypeScript/Vite в `web/src/`.
- UI должен быть отзывчивым: у долгих действий нужны disabled-состояния, loader/spinner, понятный статус и сообщение об ошибке.
- API должен возвращать структурированные JSON-ошибки, чтобы frontend мог показать нормальный текст пользователю.
- Для VPN-клиентов источник истины должен быть системным, а JSON-store - кэш/история UI:
  - OpenVPN: PKI/index, status log и наличие `.ovpn` файла.
  - VLESS: `/etc/xray/config.json` и systemd-состояние `xray`.
  - WireGuard: `/etc/wireguard/wg0.conf`, `wg show` и наличие `.conf` файла.
- Если профиль удалили вручную с сервера, UI не должен "выдумывать" скачивание. Нужно показать состояние вроде `Нет файла профиля`.
- Новые provider-ы добавляй рядом с существующими, через отдельный `src/providers/<name>.js` и `scripts/<name>-manager.sh`.

## Проверки Перед Коммитом

Минимум для любого изменения:

```bash
npm run check
```

Если менялся frontend:

```bash
npm run build
npm run check
```

Если менялся API/auth/store/provider:

```bash
npm run test:api
npm run check
```

Если менялся UX или маршруты frontend:

```bash
npm run build
npm run test:e2e
```

Если менялись shell-инсталлеры/helper-ы:

```bash
bash -n install.sh
bash -n scripts/install.sh
bash -n scripts/openvpn-manager.sh
bash -n scripts/vless-manager.sh
bash -n scripts/wireguard-manager.sh
bash -n scripts/doctor.sh
```

## Деплой И Установка

`install.sh` в корне - bootstrap-скрипт для `curl | sudo bash`.

Он:

- ставит минимальные зависимости для клонирования;
- клонирует репозиторий;
- запускает `scripts/install.sh`.

`scripts/install.sh` - основной server installer.

Он:

- проверяет runtime dependencies;
- спрашивает admin username/password или берет их из env;
- копирует приложение в `/opt/vpn-manager`;
- создает `/etc/vpn-manager/config.json`;
- настраивает systemd service;
- настраивает sudoers для helper-скриптов;
- запускает `vpn-manager.service`.

Неинтерактивная установка:

```bash
curl -fsSL https://raw.githubusercontent.com/razatr/vpn-manager/main/install.sh | sudo env VPN_MANAGER_ADMIN_USERNAME=admin VPN_MANAGER_ADMIN_PASSWORD='strong-password' bash
```

## Иерархия Файлов

```text
.
├── AGENTS.md                         правила для LLM-агентов
├── README.md                         пользовательская документация
├── config.example.json               пример server config
├── install.sh                        bootstrap installer для curl | sudo bash
├── package.json                      npm scripts, зависимости, Node >=20
├── package-lock.json                 lockfile
├── playwright.config.ts              конфиг e2e-тестов
├── tsconfig.json                     TypeScript config для frontend
├── vite.config.ts                    Vite build config
├── docs/
│   ├── ROADMAP.md                    план развития VLESS/whitelists/WireGuard
│   └── SERVER_TEST.md                чеклист проверки на VPS
├── packaging/
│   ├── sudoers/vpn-manager           шаблон sudoers allowlist
│   └── systemd/vpn-manager.service   шаблон systemd service
├── scripts/
│   ├── doctor.sh                     диагностика окружения сервера
│   ├── install.sh                    основной server installer
│   ├── openvpn-manager.sh            privileged OpenVPN helper
│   ├── uninstall.sh                  удаление приложения
│   ├── vless-manager.sh              privileged VLESS/Xray helper
│   └── wireguard-manager.sh          privileged WireGuard helper
├── src/
│   ├── config.js                     загрузка и нормализация config
│   ├── main.js                       entrypoint backend-сервера
│   ├── server.js                     HTTP API, auth, static frontend
│   ├── store.js                      JSON-store, кэш UI и история клиентов
│   └── providers/
│       ├── openvpn.js                OpenVPN provider adapter
│       ├── vless.js                  VLESS/Xray provider adapter
│       ├── whitelists.js             provider белых списков РФ
│       └── wireguard.js              WireGuard provider adapter
├── tests/
│   ├── api/auth.test.js              API/auth тесты
│   └── e2e/app.spec.ts               Playwright smoke tests
├── third_party/
│   └── openvpn-install/
│       ├── LICENSE.txt               license vendored проекта
│       └── openvpn-install.sh        vendored nyr/openvpn-install
└── web/
    ├── index.html                    Vite HTML entry
    ├── public/                       статичные frontend assets, если нужны
    ├── src/
    │   ├── main.ts                   TypeScript frontend app
    │   ├── styles.css                UI styles
    │   └── vite-env.d.ts             Vite typings
    └── dist/                         собранный frontend, должен быть в git
```

Локальные неотслеживаемые директории:

```text
.agents/                             планы и рабочие заметки LLM
.tmp/                                временные данные тестов
data/                                локальный dev-store
test-results/                        артефакты Playwright
node_modules/                        npm зависимости
```

## Где Что Менять

- Login/auth/API: `src/server.js`, `src/config.js`, `tests/api/auth.test.js`.
- JSON-store и синхронизация клиентов: `src/store.js` и соответствующий provider.
- OpenVPN: `src/providers/openvpn.js`, `scripts/openvpn-manager.sh`.
- VLESS/REALITY: `src/providers/vless.js`, `scripts/vless-manager.sh`.
- WireGuard: `src/providers/wireguard.js`, `scripts/wireguard-manager.sh`.
- Белые списки РФ: `src/providers/whitelists.js`.
- Frontend UX: `web/src/main.ts`, `web/src/styles.css`, затем обязательно `npm run build`.
- Installer UX/деплой: `install.sh`, `scripts/install.sh`, `README.md`, `docs/SERVER_TEST.md`.

## Git-Правила

- Перед началом смотри `git status --short`.
- Коммиты делай маленькими и тематическими.
- В коммит включай только файлы, относящиеся к задаче.
- Не делай force push без явного запроса.
- После пуша полезно проверить `git ls-remote origin refs/heads/main`.

## UX-Требования

- Каждая кнопка, запускающая сетевое или системное действие, должна показывать занятое состояние.
- Скачивание профиля, создание клиента, установка provider-а и обновление списков не должны выглядеть мгновенными, если на самом деле идет процесс.
- Для VLESS предпочтительны действия `Копировать`, `QR`, `Happ`, `INCY`, `Subscription`, а не сценарий "скачать txt и искать строку внутри".
- Для OpenVPN и WireGuard основной сценарий - скачать официальный профиль для официального клиента.

