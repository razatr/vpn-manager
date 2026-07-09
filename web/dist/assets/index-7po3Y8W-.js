(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={server:null,clients:[],events:[],connections:[],busy:!1},t=M(`refresh`),n=M(`logout`),r=M(`client-form`),i=M(`client-name`),a=M(`login-panel`),o=M(`login-form`),s=M(`login-username`),c=M(`login-password`),l=M(`login-error`),u=document.querySelector(`.shell`),d=M(`setup-panel`),f=M(`setup-form`),p=M(`credentials-form`),m=M(`global-busy`),h=M(`notice`);t.addEventListener(`click`,()=>{T(`Обновляю состояние...`,g)}),n.addEventListener(`click`,async()=>{await fetch(`/api/auth/logout`,{method:`POST`}),N()}),o.addEventListener(`submit`,async e=>{e.preventDefault(),l.hidden=!0,await T(`Вхожу...`,async()=>{if(!(await fetch(`/api/auth/login`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:s.value.trim(),password:c.value})})).ok){l.hidden=!1;return}c.value=``,P(),await g()})}),r.addEventListener(`submit`,async e=>{e.preventDefault();let t=i.value.trim();t&&await T(`Создаю профиль ${t}...`,async()=>{let e=await fetch(`/api/openvpn/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await O(e,`Ошибка создания клиента`);return}i.value=``,D(`Профиль ${t} создан`),await g()})}),f.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(f),n=String(t.get(`firstClient`)||`admin`).trim();await T(`Устанавливаю OpenVPN. Это может занять несколько минут...`,async()=>{let e=await fetch(`/api/setup/openvpn`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||1194),protocol:String(t.get(`protocol`)||`udp`),dns:Number(t.get(`dns`)||3),firstClient:n})});if(!e.ok){await O(e,`Ошибка установки OpenVPN`);return}D(`OpenVPN установлен, первый профиль: ${n}`),await g()})}),p.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(p),n=String(t.get(`username`)||``).trim(),r=String(t.get(`password`)||``);await T(`Сохраняю учётные данные...`,async()=>{let e=await fetch(`/api/auth/credentials`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:n,password:r})});if(!e.ok){await O(e,`Не удалось сохранить логин и пароль`);return}p.reset(),M(`settings-username`).value=n,D(`Логин и пароль сохранены`)})}),M(`clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;!n||t.dataset.action!==`revoke`||await T(`Отзываю профиль ${n}...`,async()=>{let e=await fetch(`/api/openvpn/clients/${encodeURIComponent(n)}/revoke`,{method:`POST`});if(!e.ok){await O(e,`Ошибка отзыва клиента`);return}D(`Профиль ${n} отозван`),await g()})});async function g(){let[t,n,r,i]=await Promise.all([_(`/api/server/status`),_(`/api/openvpn/clients`),_(`/api/events`),_(`/api/openvpn/connections`)]);e.server=t,e.clients=n.clients,e.events=r.events,e.connections=i.connections,v()}async function _(e){let t=await fetch(e);if(t.status===401)throw N(),Error(`Требуется вход`);if(!t.ok)throw Error(`${e}: ${t.status}`);return t.json()}function v(){if(!e.server)return;let t=e.server.providers.openvpn,n=e.server.providers.vless;M(`server-state`).textContent=e.server.ok?`API работает`:`API недоступен`,M(`settings-username`).value=e.server.auth.username,w(`openvpn-installed`,t.installed?`Установлен`:`Не установлен`,t.installed?`success`:`secondary`),w(`openvpn-active`,t.active?`Запущен`:`Остановлен`,t.active?`success`:`danger`),M(`openvpn-status-log`).textContent=t.statusLogExists?t.statusLogPath:`не найден`,M(`openvpn-profile-dir`).textContent=t.profileDir,n&&(w(`vless-installed`,n.installed?`Установлен`:`Не установлен`,n.installed?`success`:`secondary`),w(`vless-active`,n.active?`Запущен`:`Остановлен`,n.active?`success`:`danger`),M(`vless-config`).textContent=n.configPath,M(`vless-profile-dir`).textContent=n.profileDir),d.hidden=t.installed,M(`clients`).innerHTML=e.clients.length?y(e.clients):`<div class="empty-state">Клиентов пока нет</div>`,M(`events`).innerHTML=e.events.length?e.events.map(S).join(``):`<div class="empty-state">Событий пока нет</div>`,M(`connections`).innerHTML=e.connections.length?x(e.connections):`<div class="empty-state">Активных подключений пока нет</div>`}function y(e){return`
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
          ${e.map(b).join(``)}
        </tbody>
      </table>
    </div>
  `}function b(e){let t=e.profilePath&&e.status!==`revoked`?`<a class="btn btn-sm btn-outline-primary" href="/api/openvpn/clients/${encodeURIComponent(e.name)}/profile">Скачать</a>`:`<span class="text-secondary">нет файла</span>`,n=e.status===`revoked`?`<span class="text-secondary">отозван</span>`:`<button class="btn btn-sm btn-outline-danger" type="button" data-action="revoke" data-client="${j(e.name)}">Отозвать</button>`;return`
    <tr>
      <td><strong>${j(e.name)}</strong></td>
      <td>${C(e.status)}</td>
      <td>${t}</td>
      <td class="text-end">${n}</td>
    </tr>
  `}function x(e){return`
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
          ${e.map(e=>`
            <tr>
              <td><strong>${j(e.commonName)}</strong></td>
              <td>${j(e.virtualAddress||`-`)}</td>
              <td>${j(e.realAddress||`-`)}</td>
              <td>${A(e.bytesReceived)}</td>
              <td>${A(e.bytesSent)}</td>
            </tr>
          `).join(``)}
        </tbody>
      </table>
    </div>
  `}function S(e){return`
    <article class="event-item">
      <span>${j(e.message)}</span>
      <time>${k(e.createdAt)}</time>
    </article>
  `}function C(e){let t={active:{label:`Активен`,tone:`success`},registered:{label:`Зарегистрирован`,tone:`info`},missing_profile:{label:`Нет файла профиля`,tone:`warning`},missing:{label:`Нет в OpenVPN`,tone:`warning`},revoked:{label:`Отозван`,tone:`secondary`},expired:{label:`Истёк`,tone:`danger`}}[e]||{label:e,tone:`secondary`};return`<span class="badge text-bg-${t.tone}">${j(t.label)}</span>`}function w(e,t,n){let r=M(e);r.className=`badge text-bg-${n}`,r.textContent=t}async function T(t,n){e.busy=!0,E(!0,t);try{await n()}finally{e.busy=!1,E(!1,``)}}function E(e,t){m.hidden=!e,M(`busy-message`).textContent=t;for(let t of document.querySelectorAll(`button`))t.disabled=e}function D(e){h.hidden=!1,h.textContent=e,window.setTimeout(()=>{h.hidden=!0},5e3)}async function O(e,t){let n=await e.json().catch(()=>({}));D(n.message||n.error||t)}function k(e){return new Intl.DateTimeFormat(`ru-RU`,{dateStyle:`short`,timeStyle:`medium`}).format(new Date(e))}function A(e){if(!Number.isFinite(e))return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function j(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#039;`})[e]||e)}function M(e){let t=document.getElementById(e);if(!t)throw Error(`Missing element: #${e}`);return t}function N(){a.hidden=!1,u&&(u.hidden=!0),c.focus()}function P(){a.hidden=!0,u&&(u.hidden=!1)}T(`Загружаю состояние...`,g).catch(e=>{M(`server-state`).textContent=e instanceof Error?e.message:`Ошибка загрузки`});