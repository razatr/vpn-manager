import "./styles.css";

type ServerStatus = {
  ok: boolean;
  publicUrl: string;
  providers: {
    openvpn: {
      installed: boolean;
      active: boolean;
      configPath: string;
      statusLogPath: string;
      statusLogExists: boolean;
      profileDir: string;
    };
  };
};

type Client = {
  id: string;
  provider: "openvpn";
  name: string;
  status: string;
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

type State = {
  server: ServerStatus | null;
  clients: Client[];
  events: EventItem[];
  connections: Connection[];
};

const state: State = {
  server: null,
  clients: [],
  events: [],
  connections: []
};

const refreshButton = mustElement<HTMLButtonElement>("refresh");
const logoutButton = mustElement<HTMLButtonElement>("logout");
const clientForm = mustElement<HTMLFormElement>("client-form");
const clientNameInput = mustElement<HTMLInputElement>("client-name");
const loginPanel = mustElement<HTMLElement>("login-panel");
const loginForm = mustElement<HTMLFormElement>("login-form");
const loginTokenInput = mustElement<HTMLInputElement>("admin-token");
const loginError = mustElement<HTMLElement>("login-error");
const appShell = document.querySelector<HTMLElement>(".shell");
const setupPanel = mustElement<HTMLElement>("setup-panel");
const setupForm = mustElement<HTMLFormElement>("setup-form");

refreshButton.addEventListener("click", () => {
  void load();
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  showLogin();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: loginTokenInput.value })
  });

  if (!response.ok) {
    loginError.hidden = false;
    return;
  }

  loginTokenInput.value = "";
  showApp();
  await load();
});

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = clientNameInput.value.trim();
  if (!name) {
    return;
  }

  const response = await fetch("/api/openvpn/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name })
  });

  if (!response.ok) {
    const data = await response.json() as { message?: string; error?: string };
    window.alert(data.message || data.error || "Ошибка создания клиента");
    return;
  }

  clientNameInput.value = "";
  await load();
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(setupForm);
  const response = await fetch("/api/setup/openvpn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      publicHost: String(form.get("publicHost") || "").trim(),
      port: Number(form.get("port") || 1194),
      protocol: String(form.get("protocol") || "udp"),
      dns: Number(form.get("dns") || 3),
      firstClient: String(form.get("firstClient") || "admin").trim()
    })
  });

  if (!response.ok) {
    const data = await response.json() as { message?: string; error?: string };
    window.alert(data.message || data.error || "Ошибка установки OpenVPN");
    return;
  }

  await load();
});

mustElement("clients").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const client = target.dataset.client;
  if (!client || target.dataset.action !== "revoke") {
    return;
  }

  const response = await fetch(`/api/openvpn/clients/${encodeURIComponent(client)}/revoke`, {
    method: "POST"
  });

  if (!response.ok) {
    const data = await response.json() as { message?: string; error?: string };
    window.alert(data.message || data.error || "Ошибка отзыва клиента");
    return;
  }

  await load();
});

async function load(): Promise<void> {
  const [server, clients, events, connections] = await Promise.all([
    fetchJson<ServerStatus>("/api/server/status"),
    fetchJson<{ clients: Client[] }>("/api/openvpn/clients"),
    fetchJson<{ events: EventItem[] }>("/api/events"),
    fetchJson<{ connections: Connection[] }>("/api/openvpn/connections")
  ]);

  state.server = server;
  state.clients = clients.clients;
  state.events = events.events;
  state.connections = connections.connections;
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
  mustElement("server-state").textContent = state.server.ok ? "API работает" : "API недоступен";
  mustElement("openvpn-installed").textContent = openvpn.installed ? "да" : "нет";
  mustElement("openvpn-active").textContent = openvpn.active ? "запущен" : "не запущен";
  mustElement("openvpn-status-log").textContent = openvpn.statusLogExists ? openvpn.statusLogPath : "не найден";
  mustElement("openvpn-profile-dir").textContent = openvpn.profileDir;
  setupPanel.hidden = openvpn.installed;

  mustElement("clients").innerHTML = state.clients.length
    ? state.clients.map(renderClient).join("")
    : `<p class="muted">Клиентов пока нет</p>`;

  mustElement("events").innerHTML = state.events.length
    ? state.events.map(renderEvent).join("")
    : `<p class="muted">Событий пока нет</p>`;

  mustElement("connections").innerHTML = state.connections.length
    ? state.connections.map(renderConnection).join("")
    : `<p class="muted">Активных подключений пока нет</p>`;
}

function renderClient(client: Client): string {
  const profileLink = client.profilePath
    ? `<a href="/api/openvpn/clients/${encodeURIComponent(client.name)}/profile">Скачать</a>`
    : `<span class="muted">Профиль будет доступен после генерации на сервере</span>`;
  const revokeButton = client.status === "revoked"
    ? `<span class="danger">отозван</span>`
    : `<button type="button" data-action="revoke" data-client="${escapeHtml(client.name)}">Отозвать</button>`;

  return `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(client.name)}</strong>
        <span class="muted">${escapeHtml(client.status)}</span>
      </div>
      <div class="row-actions">
        ${profileLink}
        ${revokeButton}
      </div>
    </article>
  `;
}

function renderEvent(event: EventItem): string {
  return `
    <article class="list-item">
      <span>${escapeHtml(event.message)}</span>
      <time class="muted">${escapeHtml(event.createdAt)}</time>
    </article>
  `;
}

function renderConnection(connection: Connection): string {
  return `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(connection.commonName)}</strong>
        <span class="muted">${escapeHtml(connection.virtualAddress)}</span>
      </div>
      <span class="muted">${escapeHtml(connection.realAddress)}</span>
    </article>
  `;
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
  loginTokenInput.focus();
}

function showApp(): void {
  loginPanel.hidden = true;
  if (appShell) {
    appShell.hidden = false;
  }
}

load().catch((error: unknown) => {
  mustElement("server-state").textContent = error instanceof Error ? error.message : "Ошибка загрузки";
});
