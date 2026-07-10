(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={server:null,openvpnClients:[],vlessClients:[],wireguardClients:[],events:[],connections:[],whitelists:[],busy:!1,busyAction:null},t=K(`refresh`),n=K(`logout`),r=K(`client-form`),i=K(`client-name`),a=K(`login-panel`),o=K(`login-form`),s=K(`login-username`),c=K(`login-password`),l=K(`login-error`),u=document.querySelector(`.shell`),d=K(`setup-panel`),f=K(`setup-form`),p=K(`vless-setup-panel`),m=K(`vless-setup-form`),h=K(`vless-client-form`),g=K(`vless-client-name`),_=K(`wireguard-setup-panel`),v=K(`wireguard-setup-form`),y=K(`wireguard-client-form`),b=K(`wireguard-client-name`),x=K(`credentials-form`),S=K(`global-busy`),C=K(`notice`),w=K(`whitelist-update`);t.addEventListener(`click`,()=>{R(`Обновляю состояние...`,`app:refresh`,T)}),n.addEventListener(`click`,async()=>{await fetch(`/api/auth/logout`,{method:`POST`}),q()}),w.addEventListener(`click`,async()=>{await R(`Обновляю белые списки из подписок...`,`whitelists:update`,async()=>{let e=await fetch(`/api/whitelists/update`,{method:`POST`});if(!e.ok){await H(e,`Не удалось обновить белые списки`);return}V(`Белые списки обновлены`),await T()})}),o.addEventListener(`submit`,async e=>{e.preventDefault(),l.hidden=!0,await R(`Вхожу...`,`auth:login`,async()=>{if(!(await fetch(`/api/auth/login`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:s.value.trim(),password:c.value})})).ok){l.hidden=!1;return}c.value=``,J(),await T()})}),r.addEventListener(`submit`,async e=>{e.preventDefault();let t=i.value.trim();t&&await R(`Создаю OpenVPN профиль ${t}...`,`openvpn:create:${t}`,async()=>{let e=await fetch(`/api/openvpn/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await H(e,`Ошибка создания клиента`);return}i.value=``,V(`Профиль ${t} создан`),await T()})}),h.addEventListener(`submit`,async e=>{e.preventDefault();let t=g.value.trim();t&&await R(`Создаю VLESS профиль ${t}...`,`vless:create:${t}`,async()=>{let e=await fetch(`/api/vless/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await H(e,`Ошибка создания VLESS клиента`);return}g.value=``,V(`VLESS профиль ${t} создан`),await T()})}),y.addEventListener(`submit`,async e=>{e.preventDefault();let t=b.value.trim();t&&await R(`Создаю WireGuard профиль ${t}...`,`wireguard:create:${t}`,async()=>{let e=await fetch(`/api/wireguard/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await H(e,`Ошибка создания WireGuard клиента`);return}b.value=``,V(`WireGuard профиль ${t} создан`),await T()})}),f.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(f),n=String(t.get(`firstClient`)||`admin`).trim();await R(`Устанавливаю OpenVPN. Это может занять несколько минут...`,`openvpn:setup`,async()=>{let e=await fetch(`/api/setup/openvpn`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||1194),protocol:String(t.get(`protocol`)||`udp`),dns:Number(t.get(`dns`)||3),firstClient:n})});if(!e.ok){await H(e,`Ошибка установки OpenVPN`);return}V(`OpenVPN установлен, первый профиль: ${n}`),await T()})}),m.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(m),n=String(t.get(`firstClient`)||`admin`).trim();await R(`Устанавливаю VLESS/REALITY и готовлю первый профиль...`,`vless:setup`,async()=>{let e=await fetch(`/api/setup/vless`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||443),sni:String(t.get(`sni`)||`www.microsoft.com`).trim(),dest:String(t.get(`dest`)||`www.microsoft.com:443`).trim(),firstClient:n})});if(!e.ok){await H(e,`Ошибка установки VLESS`);return}V(`VLESS установлен, первый профиль: ${n}`),await T()})}),v.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(v),n=String(t.get(`firstClient`)||`admin`).trim();await R(`Устанавливаю WireGuard и готовлю первый профиль...`,`wireguard:setup`,async()=>{let e=await fetch(`/api/setup/wireguard`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||51820),dns:String(t.get(`dns`)||`1.1.1.1`).trim(),firstClient:n})});if(!e.ok){await H(e,`Ошибка установки WireGuard`);return}V(`WireGuard установлен, первый профиль: ${n}`),await T()})}),x.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(x),n=String(t.get(`username`)||``).trim(),r=String(t.get(`password`)||``);await R(`Сохраняю учётные данные...`,`auth:save`,async()=>{let e=await fetch(`/api/auth/credentials`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:n,password:r})});if(!e.ok){await H(e,`Не удалось сохранить логин и пароль`);return}x.reset(),K(`settings-username`).value=n,V(`Логин и пароль сохранены`)})}),K(`openvpn-clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;if(n){if(t.dataset.action===`download`){await I(`openvpn`,n);return}t.dataset.action===`revoke`&&await R(`Отзываю OpenVPN профиль ${n}...`,`openvpn:revoke:${n}`,async()=>{let e=await fetch(`/api/openvpn/clients/${encodeURIComponent(n)}/revoke`,{method:`POST`});if(!e.ok){await H(e,`Ошибка отзыва клиента`);return}V(`Профиль ${n} отозван`),await T()})}}),K(`vless-clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;!n||t.dataset.action!==`download`||await I(`vless`,n)}),K(`wireguard-clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;!n||t.dataset.action!==`download`||await I(`wireguard`,n)}),K(`whitelists`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.whitelist;!n||t.dataset.action!==`download-whitelist`||await L(n)});async function T(){let[t,n,r,i,a,o,s]=await Promise.all([E(`/api/server/status`),E(`/api/openvpn/clients`),E(`/api/vless/clients`),E(`/api/wireguard/clients`),E(`/api/whitelists/status`),E(`/api/events`),E(`/api/openvpn/connections`)]);e.server=t,e.openvpnClients=n.clients,e.vlessClients=r.clients,e.wireguardClients=i.clients,e.events=o.events,e.connections=s.connections,e.whitelists=a.lists,D()}async function E(e){let t=await fetch(e);if(t.status===401)throw q(),Error(`Требуется вход`);if(!t.ok)throw Error(`${e}: ${t.status}`);return t.json()}function D(){if(!e.server)return;let t=e.server.providers.openvpn,n=e.server.providers.vless,r=e.server.providers.wireguard;K(`server-state`).textContent=e.server.ok?`API работает`:`API недоступен`,K(`settings-username`).value=e.server.auth.username,F(`openvpn-installed`,t.installed?`Установлен`:`Не установлен`,t.installed?`success`:`secondary`),F(`openvpn-active`,t.active?`Запущен`:`Остановлен`,t.active?`success`:`danger`),K(`openvpn-status-log`).textContent=t.statusLogExists?t.statusLogPath:`не найден`,K(`openvpn-profile-dir`).textContent=t.profileDir,n&&(F(`vless-installed`,n.installed?`Установлен`:`Не установлен`,n.installed?`success`:`secondary`),F(`vless-active`,n.active?`Запущен`:`Остановлен`,n.active?`success`:`danger`),K(`vless-config`).textContent=n.configPath,K(`vless-profile-dir`).textContent=n.profileDir),d.hidden=t.installed,p.hidden=!!n?.installed,h.hidden=!n?.installed,r&&(F(`wireguard-installed`,r.installed?`Установлен`:`Не установлен`,r.installed?`success`:`secondary`),F(`wireguard-active`,r.active?`Запущен`:`Остановлен`,r.active?`success`:`danger`),K(`wireguard-config`).textContent=r.configPath,K(`wireguard-profile-dir`).textContent=r.profileDir),_.hidden=!!r?.installed,y.hidden=!r?.installed,K(`openvpn-clients`).innerHTML=e.openvpnClients.length?O(e.openvpnClients):`<div class="empty-state">Клиентов пока нет</div>`,K(`vless-clients`).innerHTML=e.vlessClients.length?O(e.vlessClients):`<div class="empty-state">VLESS клиентов пока нет</div>`,K(`wireguard-clients`).innerHTML=e.wireguardClients.length?O(e.wireguardClients):`<div class="empty-state">WireGuard клиентов пока нет</div>`,K(`events`).innerHTML=e.events.length?e.events.map(N).join(``):`<div class="empty-state">Событий пока нет</div>`,K(`connections`).innerHTML=e.connections.length?A(e.connections):`<div class="empty-state">Активных подключений пока нет</div>`,K(`whitelists`).innerHTML=e.whitelists.length?j(e.whitelists):`<div class="empty-state">Белые списки пока не загружены</div>`}function O(e){return`
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
          ${e.map(k).join(``)}
        </tbody>
      </table>
    </div>
  `}function k(e){let t=!!e.profilePath&&e.status!==`revoked`,n=`${e.provider}:download:${e.name}`,r=`${e.provider}:revoke:${e.name}`,i=t?`<button class="btn btn-sm btn-outline-primary" type="button" data-action="download" data-client="${G(e.name)}">${B(n,`Скачать`)}</button>`:`<span class="text-secondary">нет файла</span>`,a=e.status===`revoked`?`<span class="text-secondary">отозван</span>`:e.provider===`openvpn`?`<button class="btn btn-sm btn-outline-danger" type="button" data-action="revoke" data-client="${G(e.name)}">${B(r,`Отозвать`)}</button>`:`<span class="text-secondary">-</span>`;return`
    <tr>
      <td><strong>${G(e.name)}</strong></td>
      <td>${P(e.status)}</td>
      <td>${i}</td>
      <td class="text-end">${a}</td>
    </tr>
  `}function A(e){return`
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
              <td><strong>${G(e.commonName)}</strong></td>
              <td>${G(e.virtualAddress||`-`)}</td>
              <td>${G(e.realAddress||`-`)}</td>
              <td>${W(e.bytesReceived)}</td>
              <td>${W(e.bytesSent)}</td>
            </tr>
          `).join(``)}
        </tbody>
      </table>
    </div>
  `}function j(e){return`
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
          ${e.map(M).join(``)}
        </tbody>
      </table>
    </div>
  `}function M(e){let t=`whitelist:download:${e.id}`,n=e.exists?`<button class="btn btn-sm btn-outline-primary" type="button" data-action="download-whitelist" data-whitelist="${G(e.id)}">${B(t,`Скачать`)}</button>`:`<span class="text-secondary">нет файла</span>`;return`
    <tr>
      <td><strong>${G(e.name)}</strong></td>
      <td>${e.updatedAt?U(e.updatedAt):`-`}</td>
      <td>${W(e.size)}</td>
      <td><span class="source-url">${G(e.sourceUrl)}</span></td>
      <td class="text-end">${n}</td>
    </tr>
  `}function N(e){return`
    <article class="event-item">
      <span>${G(e.message)}</span>
      <time>${U(e.createdAt)}</time>
    </article>
  `}function P(e){let t={active:{label:`Активен`,tone:`success`},registered:{label:`Зарегистрирован`,tone:`info`},missing_profile:{label:`Нет файла профиля`,tone:`warning`},missing:{label:`Нет в OpenVPN`,tone:`warning`},revoked:{label:`Отозван`,tone:`secondary`},expired:{label:`Истёк`,tone:`danger`}}[e]||{label:e,tone:`secondary`};return`<span class="badge text-bg-${t.tone}">${G(t.label)}</span>`}function F(e,t,n){let r=K(e);r.className=`badge text-bg-${n}`,r.textContent=t}async function I(e,t){await R(`Готовлю файл профиля ${t}...`,`${e}:download:${t}`,async()=>{let n=await fetch(`/api/${e}/clients/${encodeURIComponent(t)}/profile`);if(!n.ok){await H(n,`Не удалось скачать профиль`),await T();return}let r=await n.blob(),i=e===`openvpn`?`ovpn`:e===`wireguard`?`conf`:`txt`,a=URL.createObjectURL(r),o=document.createElement(`a`);o.href=a,o.download=e===`openvpn`?`${t}.ovpn`:e===`wireguard`?`${t}-wireguard.conf`:`${t}-vless.txt`,document.body.append(o),o.click(),o.remove(),URL.revokeObjectURL(a),V(`Файл ${t}.${i} готов`)})}async function L(t){let n=e.whitelists.find(e=>e.id===t);await R(`Готовлю файл ${n?.fileName||t}...`,`whitelist:download:${t}`,async()=>{let e=await fetch(`/api/whitelists/${encodeURIComponent(t)}/download`);if(!e.ok){await H(e,`Не удалось скачать белый список`),await T();return}let r=await e.blob(),i=URL.createObjectURL(r),a=document.createElement(`a`);a.href=i,a.download=n?.fileName||`${t}.txt`,document.body.append(a),a.click(),a.remove(),URL.revokeObjectURL(i),V(`Файл ${n?.fileName||t} готов`)})}async function R(t,n,r){e.busy=!0,e.busyAction=n,z(!0,t),D();try{await r()}finally{e.busy=!1,e.busyAction=null,z(!1,``),D()}}function z(e,t){S.hidden=!e,K(`busy-message`).textContent=t;for(let t of document.querySelectorAll(`button`))t.disabled=e}function B(t,n){return e.busyAction===t?`<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${G(n)}</span>`:G(n)}function V(e){C.hidden=!1,C.textContent=e,window.setTimeout(()=>{C.hidden=!0},5e3)}async function H(e,t){let n=await e.json().catch(()=>({}));V(n.message||n.error||t)}function U(e){return new Intl.DateTimeFormat(`ru-RU`,{dateStyle:`short`,timeStyle:`medium`}).format(new Date(e))}function W(e){if(!Number.isFinite(e))return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function G(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#039;`})[e]||e)}function K(e){let t=document.getElementById(e);if(!t)throw Error(`Missing element: #${e}`);return t}function q(){a.hidden=!1,u&&(u.hidden=!0),c.focus()}function J(){a.hidden=!0,u&&(u.hidden=!1)}R(`Загружаю состояние...`,`app:load`,T).catch(e=>{K(`server-state`).textContent=e instanceof Error?e.message:`Ошибка загрузки`});