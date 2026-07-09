# Roadmap: VLESS, Whitelists, WireGuard

## Источники

- VLESS/REALITY: Xray-core и официальная документация Project X.
- WireGuard: официальный quick start WireGuard.
- Белые списки РФ: `igareck/vpn-configs-for-russia`, включая подписки `WHITE-CIDR-RU-*`, `WHITE-SNI-RU-*` и VLESS Reality whitelist-подборки.

## 1. VLESS/REALITY

Цель: добавить второй provider рядом с OpenVPN, не ломая текущую модель клиентов.

Нужная инфраструктура:

- установленный `xray`/`xray-core`;
- systemd service для Xray;
- JSON-конфиг Xray в `/etc/xray/config.json`;
- каталог профилей/ссылок `/var/lib/vpn-manager/profiles/vless`;
- helper `/usr/local/lib/vpn-manager/vless-helper`;
- публичный домен или стабильный IP;
- для REALITY: server private key, public key, shortId, destination SNI.

Порядок реализации:

1. Добавить `VlessProvider` и helper с командами `status`, `install`, `list-clients`, `create-client`, `revoke-client`.
2. Хранить источник истины в Xray JSON-конфиге, а JSON-store использовать как кэш UI и историю событий.
3. Генерировать VLESS URI и QR payload для клиента.
4. Поддержать режимы:
   - VLESS + REALITY на 443;
   - VLESS + WS + TLS за reverse proxy как отдельный профиль позже.
5. Добавить UI-вкладку `VLESS` с установкой, созданием клиента и скачиванием ссылки.

## 2. Белые Списки РФ

Цель: сделать модуль маршрутизации и подписок, отдельный от фабрики профилей.

Нужная инфраструктура:

- локальный кеш списков CIDR/SNI;
- периодическое обновление списков;
- проверка доступности upstream-зеркал;
- генератор правил для sing-box/Xray-клиентов;
- режим fallback, если GitHub RAW недоступен.

Порядок реализации:

1. Добавить downloader списков и ручное обновление через UI.
2. Поддержать зеркала GitLab/Codeberg/Gitea/Bitbucket/GitHack/Yandex+Bitbucket.
3. Генерировать client routing templates:
   - `geoip:ru -> direct`;
   - whitelist CIDR/SNI -> direct или proxy в зависимости от выбранной стратегии;
   - остальное -> proxy.
4. Показывать дату обновления и источник каждого списка.

## 3. WireGuard

Цель: добавить быстрый классический VPN-provider.

Нужная инфраструктура:

- `wireguard-tools`;
- интерфейс `wg0`;
- `/etc/wireguard/wg0.conf`;
- systemd `wg-quick@wg0`;
- NAT/forwarding rules;
- каталог профилей `/var/lib/vpn-manager/profiles/wireguard`.

Порядок реализации:

1. Добавить `WireGuardProvider` и helper.
2. Генерировать server/client key pairs через `wg genkey` и `wg pubkey`.
3. Управлять peers через `wg set` и конфиг `wg0.conf`.
4. Генерировать `.conf` профили и QR payload.
5. Синхронизировать UI с `wg show` и файлом `wg0.conf`.
