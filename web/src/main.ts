import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";

type ServerStatus = {
  ok: boolean;
  publicUrl: string;
  auth: {
    username: string;
  };
  providers: {
    openvpn: {
      installed: boolean;
      active: boolean;
      configPath: string;
      statusLogPath: string;
      statusLogExists: boolean;
      profileDir: string;
    };
    vless?: {
      installed: boolean;
      active: boolean;
      configPath: string;
      profileDir: string;
    };
    wireguard?: {
      installed: boolean;
      active: boolean;
      configPath: string;
      profileDir: string;
      interface: string;
      port: number;
    };
  };
};

type ClientStatus = "active" | "registered" | "missing_profile" | "missing" | "revoked" | "expired" | string;

type Client = {
  id: string;
  provider: "openvpn" | "vless" | "wireguard";
  name: string;
  status: ClientStatus;
  createdAt: string;
  revokedAt: string | null;
  profilePath: string | null;
};

type EventItem = {
  id: string;
  type: string;
  provider: string;
  message: string;
  createdAt: string;
};

type Connection = {
  commonName: string;
  realAddress: string;
  virtualAddress: string;
  connectedAt: string;
  bytesReceived: number;
  bytesSent: number;
};

type WhitelistItem = {
  id: string;
  name: string;
  fileName: string;
  sourceUrl: string;
  updatedAt: string | null;
  size: number;
  exists: boolean;
};

type State = {
  server: ServerStatus | null;
  openvpnClients: Client[];
  vlessClients: Client[];
  wireguardClients: Client[];
  events: EventItem[];
  connections: Connection[];
  whitelists: WhitelistItem[];
  busy: boolean;
  busyAction: string | null;
};

const state: State = {
  server: null,
  openvpnClients: [],
  vlessClients: [],
  wireguardClients: [],
  events: [],
  connections: [],
  whitelists: [],
  busy: false,
  busyAction: null
};

const refreshButton = mustElement<HTMLButtonElement>("refresh");
const logoutButton = mustElement<HTMLButtonElement>("logout");
const clientForm = mustElement<HTMLFormElement>("client-form");
const clientNameInput = mustElement<HTMLInputElement>("client-name");
const loginPanel = mustElement<HTMLElement>("login-panel");
const loginForm = mustElement<HTMLFormElement>("login-form");
const loginUsernameInput = mustElement<HTMLInputElement>("login-username");
const loginPasswordInput = mustElement<HTMLInputElement>("login-password");
const loginError = mustElement<HTMLElement>("login-error");
const appShell = document.querySelector<HTMLElement>(".shell");
const setupPanel = mustElement<HTMLElement>("setup-panel");
const setupForm = mustElement<HTMLFormElement>("setup-form");
const vlessSetupPanel = mustElement<HTMLElement>("vless-setup-panel");
const vlessSetupForm = mustElement<HTMLFormElement>("vless-setup-form");
const vlessClientForm = mustElement<HTMLFormElement>("vless-client-form");
const vlessClientNameInput = mustElement<HTMLInputElement>("vless-client-name");
const wireguardSetupPanel = mustElement<HTMLElement>("wireguard-setup-panel");
const wireguardSetupForm = mustElement<HTMLFormElement>("wireguard-setup-form");
const wireguardClientForm = mustElement<HTMLFormElement>("wireguard-client-form");
const wireguardClientNameInput = mustElement<HTMLInputElement>("wireguard-client-name");
const credentialsForm = mustElement<HTMLFormElement>("credentials-form");
const globalBusy = mustElement<HTMLElement>("global-busy");
const notice = mustElement<HTMLElement>("notice");
const whitelistUpdateButton = mustElement<HTMLButtonElement>("whitelist-update");

refreshButton.addEventListener("click", () => {
  void withBusy("Обновляю состояние...", "app:refresh", load);
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  showLogin();
});

whitelistUpdateButton.addEventListener("click", async () => {
  await withBusy("Обновляю белые списки из подписок...", "whitelists:update", async () => {
    const response = await fetch("/api/whitelists/update", { method: "POST" });
    if (!response.ok) {
      await showResponseError(response, "Не удалось обновить белые списки");
      return;
    }
    showNotice("Белые списки обновлены");
    await load();
  });
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  await withBusy("Вхожу...", "auth:login", async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: loginUsernameInput.value.trim(),
        password: loginPasswordInput.value
      })
    });

    if (!response.ok) {
      loginError.hidden = false;
      return;
    }

    loginPasswordInput.value = "";
    showApp();
    await load();
  });
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = clientNameInput.value.trim();
  if (!name) {
    return;
  }

  await withBusy(`Создаю OpenVPN профиль ${name}...`, `openvpn:create:${name}`, async () => {
    const response = await fetch("/api/openvpn/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка создания клиента");
      return;
    }

    clientNameInput.value = "";
    showNotice(`Профиль ${name} создан`);
    await load();
  });
});

vlessClientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = vlessClientNameInput.value.trim();
  if (!name) {
    return;
  }

  await withBusy(`Создаю VLESS профиль ${name}...`, `vless:create:${name}`, async () => {
    const response = await fetch("/api/vless/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка создания VLESS клиента");
      return;
    }

    vlessClientNameInput.value = "";
    showNotice(`VLESS профиль ${name} создан`);
    await load();
  });
});

wireguardClientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = wireguardClientNameInput.value.trim();
  if (!name) {
    return;
  }

  await withBusy(`Создаю WireGuard профиль ${name}...`, `wireguard:create:${name}`, async () => {
    const response = await fetch("/api/wireguard/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка создания WireGuard клиента");
      return;
    }

    wireguardClientNameInput.value = "";
    showNotice(`WireGuard профиль ${name} создан`);
    await load();
  });
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(setupForm);
  const firstClient = String(form.get("firstClient") || "admin").trim();

  await withBusy("Устанавливаю OpenVPN. Это может занять несколько минут...", "openvpn:setup", async () => {
    const response = await fetch("/api/setup/openvpn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicHost: String(form.get("publicHost") || "").trim(),
        port: Number(form.get("port") || 1194),
        protocol: String(form.get("protocol") || "udp"),
        dns: Number(form.get("dns") || 3),
        firstClient
      })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка установки OpenVPN");
      return;
    }

    showNotice(`OpenVPN установлен, первый профиль: ${firstClient}`);
    await load();
  });
});

vlessSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(vlessSetupForm);
  const firstClient = String(form.get("firstClient") || "admin").trim();

  await withBusy("Устанавливаю VLESS/REALITY и готовлю первый профиль...", "vless:setup", async () => {
    const response = await fetch("/api/setup/vless", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicHost: String(form.get("publicHost") || "").trim(),
        port: Number(form.get("port") || 443),
        sni: String(form.get("sni") || "www.microsoft.com").trim(),
        dest: String(form.get("dest") || "www.microsoft.com:443").trim(),
        firstClient
      })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка установки VLESS");
      return;
    }

    showNotice(`VLESS установлен, первый профиль: ${firstClient}`);
    await load();
  });
});

wireguardSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(wireguardSetupForm);
  const firstClient = String(form.get("firstClient") || "admin").trim();

  await withBusy("Устанавливаю WireGuard и готовлю первый профиль...", "wireguard:setup", async () => {
    const response = await fetch("/api/setup/wireguard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        publicHost: String(form.get("publicHost") || "").trim(),
        port: Number(form.get("port") || 51820),
        dns: String(form.get("dns") || "1.1.1.1").trim(),
        firstClient
      })
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка установки WireGuard");
      return;
    }

    showNotice(`WireGuard установлен, первый профиль: ${firstClient}`);
    await load();
  });
});

credentialsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(credentialsForm);
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");

  await withBusy("Сохраняю учётные данные...", "auth:save", async () => {
    const response = await fetch("/api/auth/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      await showResponseError(response, "Не удалось сохранить логин и пароль");
      return;
    }

    credentialsForm.reset();
    mustElement<HTMLInputElement>("settings-username").value = username;
    showNotice("Логин и пароль сохранены");
  });
});

mustElement("openvpn-clients").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const client = target.dataset.client;
  if (!client) {
    return;
  }

  if (target.dataset.action === "download") {
    await downloadProfile("openvpn", client);
    return;
  }

  if (target.dataset.action !== "revoke") {
    return;
  }

  await withBusy(`Отзываю OpenVPN профиль ${client}...`, `openvpn:revoke:${client}`, async () => {
    const response = await fetch(`/api/openvpn/clients/${encodeURIComponent(client)}/revoke`, {
      method: "POST"
    });

    if (!response.ok) {
      await showResponseError(response, "Ошибка отзыва клиента");
      return;
    }

    showNotice(`Профиль ${client} отозван`);
    await load();
  });
});

mustElement("vless-clients").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const client = target.dataset.client;
  if (!client || target.dataset.action !== "download") {
    return;
  }

  await downloadProfile("vless", client);
});

mustElement("wireguard-clients").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const client = target.dataset.client;
  if (!client || target.dataset.action !== "download") {
    return;
  }

  await downloadProfile("wireguard", client);
});

mustElement("whitelists").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }
  const id = target.dataset.whitelist;
  if (!id || target.dataset.action !== "download-whitelist") {
    return;
  }
  await downloadWhitelist(id);
});

async function load(): Promise<void> {
  const [server, openvpnClients, vlessClients, wireguardClients, whitelists, events, connections] = await Promise.all([
    fetchJson<ServerStatus>("/api/server/status"),
    fetchJson<{ clients: Client[] }>("/api/openvpn/clients"),
    fetchJson<{ clients: Client[] }>("/api/vless/clients"),
    fetchJson<{ clients: Client[] }>("/api/wireguard/clients"),
    fetchJson<{ lists: WhitelistItem[] }>("/api/whitelists/status"),
    fetchJson<{ events: EventItem[] }>("/api/events"),
    fetchJson<{ connections: Connection[] }>("/api/openvpn/connections")
  ]);

  state.server = server;
  state.openvpnClients = openvpnClients.clients;
  state.vlessClients = vlessClients.clients;
  state.wireguardClients = wireguardClients.clients;
  state.events = events.events;
  state.connections = connections.connections;
  state.whitelists = whitelists.lists;
  render();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 401) {
    showLogin();
    throw new Error("Требуется вход");
  }
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function render(): void {
  if (!state.server) {
    return;
  }

  const openvpn = state.server.providers.openvpn;
  const vless = state.server.providers.vless;
  const wireguard = state.server.providers.wireguard;
  mustElement("server-state").textContent = state.server.ok ? "API работает" : "API недоступен";
  mustElement<HTMLInputElement>("settings-username").value = state.server.auth.username;
  setBadge("openvpn-installed", openvpn.installed ? "Установлен" : "Не установлен", openvpn.installed ? "success" : "secondary");
  setBadge("openvpn-active", openvpn.active ? "Запущен" : "Остановлен", openvpn.active ? "success" : "danger");
  mustElement("openvpn-status-log").textContent = openvpn.statusLogExists ? openvpn.statusLogPath : "не найден";
  mustElement("openvpn-profile-dir").textContent = openvpn.profileDir;
  if (vless) {
    setBadge("vless-installed", vless.installed ? "Установлен" : "Не установлен", vless.installed ? "success" : "secondary");
    setBadge("vless-active", vless.active ? "Запущен" : "Остановлен", vless.active ? "success" : "danger");
    mustElement("vless-config").textContent = vless.configPath;
    mustElement("vless-profile-dir").textContent = vless.profileDir;
  }
  setupPanel.hidden = openvpn.installed;
  vlessSetupPanel.hidden = Boolean(vless?.installed);
  vlessClientForm.hidden = !Boolean(vless?.installed);
  if (wireguard) {
    setBadge("wireguard-installed", wireguard.installed ? "Установлен" : "Не установлен", wireguard.installed ? "success" : "secondary");
    setBadge("wireguard-active", wireguard.active ? "Запущен" : "Остановлен", wireguard.active ? "success" : "danger");
    mustElement("wireguard-config").textContent = wireguard.configPath;
    mustElement("wireguard-profile-dir").textContent = wireguard.profileDir;
  }
  wireguardSetupPanel.hidden = Boolean(wireguard?.installed);
  wireguardClientForm.hidden = !Boolean(wireguard?.installed);

  mustElement("openvpn-clients").innerHTML = state.openvpnClients.length
    ? renderClientsTable(state.openvpnClients)
    : `<div class="empty-state">Клиентов пока нет</div>`;

  mustElement("vless-clients").innerHTML = state.vlessClients.length
    ? renderClientsTable(state.vlessClients)
    : `<div class="empty-state">VLESS клиентов пока нет</div>`;

  mustElement("wireguard-clients").innerHTML = state.wireguardClients.length
    ? renderClientsTable(state.wireguardClients)
    : `<div class="empty-state">WireGuard клиентов пока нет</div>`;

  mustElement("events").innerHTML = state.events.length
    ? state.events.map(renderEvent).join("")
    : `<div class="empty-state">Событий пока нет</div>`;

  mustElement("connections").innerHTML = state.connections.length
    ? renderConnectionsTable(state.connections)
    : `<div class="empty-state">Активных подключений пока нет</div>`;

  mustElement("whitelists").innerHTML = state.whitelists.length
    ? renderWhitelistTable(state.whitelists)
    : `<div class="empty-state">Белые списки пока не загружены</div>`;
}

function renderClientsTable(clients: Client[]): string {
  return `
    <div class="table-responsive">
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Статус</th>
            <th>Профиль</th>
            <th class="text-end">Действия</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(renderClientRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderClientRow(client: Client): string {
  const canDownload = Boolean(client.profilePath) && client.status !== "revoked";
  const downloadAction = `${client.provider}:download:${client.name}`;
  const revokeAction = `${client.provider}:revoke:${client.name}`;
  const profileLink = canDownload
    ? `<button class="btn btn-sm btn-outline-primary" type="button" data-action="download" data-client="${escapeHtml(client.name)}">${buttonLabel(downloadAction, "Скачать")}</button>`
    : `<span class="text-secondary">нет файла</span>`;
  const revokeButton = client.status === "revoked"
    ? `<span class="text-secondary">отозван</span>`
    : client.provider === "openvpn"
      ? `<button class="btn btn-sm btn-outline-danger" type="button" data-action="revoke" data-client="${escapeHtml(client.name)}">${buttonLabel(revokeAction, "Отозвать")}</button>`
      : `<span class="text-secondary">-</span>`;

  return `
    <tr>
      <td><strong>${escapeHtml(client.name)}</strong></td>
      <td>${statusBadge(client.status)}</td>
      <td>${profileLink}</td>
      <td class="text-end">${revokeButton}</td>
    </tr>
  `;
}

function renderConnectionsTable(connections: Connection[]): string {
  return `
    <div class="table-responsive">
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>VPN IP</th>
            <th>Реальный адрес</th>
            <th>Получено</th>
            <th>Отправлено</th>
          </tr>
        </thead>
        <tbody>
          ${connections.map((connection) => `
            <tr>
              <td><strong>${escapeHtml(connection.commonName)}</strong></td>
              <td>${escapeHtml(connection.virtualAddress || "-")}</td>
              <td>${escapeHtml(connection.realAddress || "-")}</td>
              <td>${formatBytes(connection.bytesReceived)}</td>
              <td>${formatBytes(connection.bytesSent)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWhitelistTable(lists: WhitelistItem[]): string {
  return `
    <div class="table-responsive">
      <table class="table align-middle">
        <thead>
          <tr>
            <th>Список</th>
            <th>Обновлён</th>
            <th>Размер</th>
            <th>Источник</th>
            <th class="text-end">Файл</th>
          </tr>
        </thead>
        <tbody>
          ${lists.map(renderWhitelistRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderWhitelistRow(item: WhitelistItem): string {
  const action = `whitelist:download:${item.id}`;
  const download = item.exists
    ? `<button class="btn btn-sm btn-outline-primary" type="button" data-action="download-whitelist" data-whitelist="${escapeHtml(item.id)}">${buttonLabel(action, "Скачать")}</button>`
    : `<span class="text-secondary">нет файла</span>`;
  return `
    <tr>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>${item.updatedAt ? formatDate(item.updatedAt) : "-"}</td>
      <td>${formatBytes(item.size)}</td>
      <td><span class="source-url">${escapeHtml(item.sourceUrl)}</span></td>
      <td class="text-end">${download}</td>
    </tr>
  `;
}

function renderEvent(event: EventItem): string {
  return `
    <article class="event-item">
      <span>${escapeHtml(event.message)}</span>
      <time>${formatDate(event.createdAt)}</time>
    </article>
  `;
}

function statusBadge(status: ClientStatus): string {
  const map: Record<string, { label: string; tone: string }> = {
    active: { label: "Активен", tone: "success" },
    registered: { label: "Зарегистрирован", tone: "info" },
    missing_profile: { label: "Нет файла профиля", tone: "warning" },
    missing: { label: "Нет в OpenVPN", tone: "warning" },
    revoked: { label: "Отозван", tone: "secondary" },
    expired: { label: "Истёк", tone: "danger" }
  };
  const item = map[status] || { label: status, tone: "secondary" };
  return `<span class="badge text-bg-${item.tone}">${escapeHtml(item.label)}</span>`;
}

function setBadge(id: string, text: string, tone: string): void {
  const element = mustElement(id);
  element.className = `badge text-bg-${tone}`;
  element.textContent = text;
}

async function downloadProfile(provider: "openvpn" | "vless" | "wireguard", name: string): Promise<void> {
  await withBusy(`Готовлю файл профиля ${name}...`, `${provider}:download:${name}`, async () => {
    const response = await fetch(`/api/${provider}/clients/${encodeURIComponent(name)}/profile`);
    if (!response.ok) {
      await showResponseError(response, "Не удалось скачать профиль");
      await load();
      return;
    }

    const blob = await response.blob();
    const extension = provider === "openvpn" ? "ovpn" : provider === "wireguard" ? "conf" : "txt";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = provider === "openvpn" ? `${name}.ovpn` : provider === "wireguard" ? `${name}-wireguard.conf` : `${name}-vless.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice(`Файл ${name}.${extension} готов`);
  });
}

async function downloadWhitelist(id: string): Promise<void> {
  const item = state.whitelists.find((entry) => entry.id === id);
  await withBusy(`Готовлю файл ${item?.fileName || id}...`, `whitelist:download:${id}`, async () => {
    const response = await fetch(`/api/whitelists/${encodeURIComponent(id)}/download`);
    if (!response.ok) {
      await showResponseError(response, "Не удалось скачать белый список");
      await load();
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = item?.fileName || `${id}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotice(`Файл ${item?.fileName || id} готов`);
  });
}

async function withBusy(message: string, actionKey: string, action: () => Promise<void>): Promise<void> {
  state.busy = true;
  state.busyAction = actionKey;
  setBusy(true, message);
  render();
  try {
    await action();
  } finally {
    state.busy = false;
    state.busyAction = null;
    setBusy(false, "");
    render();
  }
}

function setBusy(isBusy: boolean, message: string): void {
  globalBusy.hidden = !isBusy;
  mustElement("busy-message").textContent = message;
  for (const element of document.querySelectorAll<HTMLButtonElement>("button")) {
    element.disabled = isBusy;
  }
}

function buttonLabel(actionKey: string, idleLabel: string): string {
  if (state.busyAction !== actionKey) {
    return escapeHtml(idleLabel);
  }
  return `<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${escapeHtml(idleLabel)}</span>`;
}

function showNotice(message: string): void {
  notice.hidden = false;
  notice.textContent = message;
  window.setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

async function showResponseError(response: Response, fallback: string): Promise<void> {
  const data = await response.json().catch(() => ({})) as { message?: string; error?: string };
  showNotice(data.message || data.error || fallback);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium"
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char] || char);
}

function mustElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: #${id}`);
  }
  return element as T;
}

function showLogin(): void {
  loginPanel.hidden = false;
  if (appShell) {
    appShell.hidden = true;
  }
  loginPasswordInput.focus();
}

function showApp(): void {
  loginPanel.hidden = true;
  if (appShell) {
    appShell.hidden = false;
  }
}

void withBusy("Загружаю состояние...", "app:load", load).catch((error: unknown) => {
  mustElement("server-state").textContent = error instanceof Error ? error.message : "Ошибка загрузки";
});
