(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e={server:null,openvpnClients:[],vlessClients:[],events:[],connections:[],whitelists:[],busy:!1,busyAction:null},t=H(`refresh`),n=H(`logout`),r=H(`client-form`),i=H(`client-name`),a=H(`login-panel`),o=H(`login-form`),s=H(`login-username`),c=H(`login-password`),l=H(`login-error`),u=document.querySelector(`.shell`),d=H(`setup-panel`),f=H(`setup-form`),p=H(`vless-setup-panel`),m=H(`vless-setup-form`),h=H(`vless-client-form`),g=H(`vless-client-name`),_=H(`credentials-form`),v=H(`global-busy`),y=H(`notice`),b=H(`whitelist-update`);t.addEventListener(`click`,()=>{P(`Обновляю состояние...`,`app:refresh`,x)}),n.addEventListener(`click`,async()=>{await fetch(`/api/auth/logout`,{method:`POST`}),U()}),b.addEventListener(`click`,async()=>{await P(`Обновляю белые списки из подписок...`,`whitelists:update`,async()=>{let e=await fetch(`/api/whitelists/update`,{method:`POST`});if(!e.ok){await R(e,`Не удалось обновить белые списки`);return}L(`Белые списки обновлены`),await x()})}),o.addEventListener(`submit`,async e=>{e.preventDefault(),l.hidden=!0,await P(`Вхожу...`,`auth:login`,async()=>{if(!(await fetch(`/api/auth/login`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:s.value.trim(),password:c.value})})).ok){l.hidden=!1;return}c.value=``,W(),await x()})}),r.addEventListener(`submit`,async e=>{e.preventDefault();let t=i.value.trim();t&&await P(`Создаю OpenVPN профиль ${t}...`,`openvpn:create:${t}`,async()=>{let e=await fetch(`/api/openvpn/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await R(e,`Ошибка создания клиента`);return}i.value=``,L(`Профиль ${t} создан`),await x()})}),h.addEventListener(`submit`,async e=>{e.preventDefault();let t=g.value.trim();t&&await P(`Создаю VLESS профиль ${t}...`,`vless:create:${t}`,async()=>{let e=await fetch(`/api/vless/clients`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({name:t})});if(!e.ok){await R(e,`Ошибка создания VLESS клиента`);return}g.value=``,L(`VLESS профиль ${t} создан`),await x()})}),f.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(f),n=String(t.get(`firstClient`)||`admin`).trim();await P(`Устанавливаю OpenVPN. Это может занять несколько минут...`,`openvpn:setup`,async()=>{let e=await fetch(`/api/setup/openvpn`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||1194),protocol:String(t.get(`protocol`)||`udp`),dns:Number(t.get(`dns`)||3),firstClient:n})});if(!e.ok){await R(e,`Ошибка установки OpenVPN`);return}L(`OpenVPN установлен, первый профиль: ${n}`),await x()})}),m.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(m),n=String(t.get(`firstClient`)||`admin`).trim();await P(`Устанавливаю VLESS/REALITY и готовлю первый профиль...`,`vless:setup`,async()=>{let e=await fetch(`/api/setup/vless`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({publicHost:String(t.get(`publicHost`)||``).trim(),port:Number(t.get(`port`)||443),sni:String(t.get(`sni`)||`www.microsoft.com`).trim(),dest:String(t.get(`dest`)||`www.microsoft.com:443`).trim(),firstClient:n})});if(!e.ok){await R(e,`Ошибка установки VLESS`);return}L(`VLESS установлен, первый профиль: ${n}`),await x()})}),_.addEventListener(`submit`,async e=>{e.preventDefault();let t=new FormData(_),n=String(t.get(`username`)||``).trim(),r=String(t.get(`password`)||``);await P(`Сохраняю учётные данные...`,`auth:save`,async()=>{let e=await fetch(`/api/auth/credentials`,{method:`POST`,headers:{"content-type":`application/json`},body:JSON.stringify({username:n,password:r})});if(!e.ok){await R(e,`Не удалось сохранить логин и пароль`);return}_.reset(),H(`settings-username`).value=n,L(`Логин и пароль сохранены`)})}),H(`openvpn-clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;if(n){if(t.dataset.action===`download`){await M(`openvpn`,n);return}t.dataset.action===`revoke`&&await P(`Отзываю OpenVPN профиль ${n}...`,`openvpn:revoke:${n}`,async()=>{let e=await fetch(`/api/openvpn/clients/${encodeURIComponent(n)}/revoke`,{method:`POST`});if(!e.ok){await R(e,`Ошибка отзыва клиента`);return}L(`Профиль ${n} отозван`),await x()})}}),H(`vless-clients`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.client;!n||t.dataset.action!==`download`||await M(`vless`,n)}),H(`whitelists`).addEventListener(`click`,async e=>{let t=e.target;if(!(t instanceof HTMLButtonElement))return;let n=t.dataset.whitelist;!n||t.dataset.action!==`download-whitelist`||await N(n)});async function x(){let[t,n,r,i,a,o]=await Promise.all([S(`/api/server/status`),S(`/api/openvpn/clients`),S(`/api/vless/clients`),S(`/api/whitelists/status`),S(`/api/events`),S(`/api/openvpn/connections`)]);e.server=t,e.openvpnClients=n.clients,e.vlessClients=r.clients,e.events=a.events,e.connections=o.connections,e.whitelists=i.lists,C()}async function S(e){let t=await fetch(e);if(t.status===401)throw U(),Error(`Требуется вход`);if(!t.ok)throw Error(`${e}: ${t.status}`);return t.json()}function C(){if(!e.server)return;let t=e.server.providers.openvpn,n=e.server.providers.vless;H(`server-state`).textContent=e.server.ok?`API работает`:`API недоступен`,H(`settings-username`).value=e.server.auth.username,j(`openvpn-installed`,t.installed?`Установлен`:`Не установлен`,t.installed?`success`:`secondary`),j(`openvpn-active`,t.active?`Запущен`:`Остановлен`,t.active?`success`:`danger`),H(`openvpn-status-log`).textContent=t.statusLogExists?t.statusLogPath:`не найден`,H(`openvpn-profile-dir`).textContent=t.profileDir,n&&(j(`vless-installed`,n.installed?`Установлен`:`Не установлен`,n.installed?`success`:`secondary`),j(`vless-active`,n.active?`Запущен`:`Остановлен`,n.active?`success`:`danger`),H(`vless-config`).textContent=n.configPath,H(`vless-profile-dir`).textContent=n.profileDir),d.hidden=t.installed,p.hidden=!!n?.installed,h.hidden=!n?.installed,H(`openvpn-clients`).innerHTML=e.openvpnClients.length?w(e.openvpnClients):`<div class="empty-state">Клиентов пока нет</div>`,H(`vless-clients`).innerHTML=e.vlessClients.length?w(e.vlessClients):`<div class="empty-state">VLESS клиентов пока нет</div>`,H(`events`).innerHTML=e.events.length?e.events.map(k).join(``):`<div class="empty-state">Событий пока нет</div>`,H(`connections`).innerHTML=e.connections.length?E(e.connections):`<div class="empty-state">Активных подключений пока нет</div>`,H(`whitelists`).innerHTML=e.whitelists.length?D(e.whitelists):`<div class="empty-state">Белые списки пока не загружены</div>`}function w(e){return`
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
          ${e.map(T).join(``)}
        </tbody>
      </table>
    </div>
  `}function T(e){let t=!!e.profilePath&&e.status!==`revoked`,n=`${e.provider}:download:${e.name}`,r=`${e.provider}:revoke:${e.name}`,i=t?`<button class="btn btn-sm btn-outline-primary" type="button" data-action="download" data-client="${V(e.name)}">${I(n,`Скачать`)}</button>`:`<span class="text-secondary">нет файла</span>`,a=e.status===`revoked`?`<span class="text-secondary">отозван</span>`:e.provider===`openvpn`?`<button class="btn btn-sm btn-outline-danger" type="button" data-action="revoke" data-client="${V(e.name)}">${I(r,`Отозвать`)}</button>`:`<span class="text-secondary">-</span>`;return`
    <tr>
      <td><strong>${V(e.name)}</strong></td>
      <td>${A(e.status)}</td>
      <td>${i}</td>
      <td class="text-end">${a}</td>
    </tr>
  `}function E(e){return`
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
              <td><strong>${V(e.commonName)}</strong></td>
              <td>${V(e.virtualAddress||`-`)}</td>
              <td>${V(e.realAddress||`-`)}</td>
              <td>${B(e.bytesReceived)}</td>
              <td>${B(e.bytesSent)}</td>
            </tr>
          `).join(``)}
        </tbody>
      </table>
    </div>
  `}function D(e){return`
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
          ${e.map(O).join(``)}
        </tbody>
      </table>
    </div>
  `}function O(e){let t=`whitelist:download:${e.id}`,n=e.exists?`<button class="btn btn-sm btn-outline-primary" type="button" data-action="download-whitelist" data-whitelist="${V(e.id)}">${I(t,`Скачать`)}</button>`:`<span class="text-secondary">нет файла</span>`;return`
    <tr>
      <td><strong>${V(e.name)}</strong></td>
      <td>${e.updatedAt?z(e.updatedAt):`-`}</td>
      <td>${B(e.size)}</td>
      <td><span class="source-url">${V(e.sourceUrl)}</span></td>
      <td class="text-end">${n}</td>
    </tr>
  `}function k(e){return`
    <article class="event-item">
      <span>${V(e.message)}</span>
      <time>${z(e.createdAt)}</time>
    </article>
  `}function A(e){let t={active:{label:`Активен`,tone:`success`},registered:{label:`Зарегистрирован`,tone:`info`},missing_profile:{label:`Нет файла профиля`,tone:`warning`},missing:{label:`Нет в OpenVPN`,tone:`warning`},revoked:{label:`Отозван`,tone:`secondary`},expired:{label:`Истёк`,tone:`danger`}}[e]||{label:e,tone:`secondary`};return`<span class="badge text-bg-${t.tone}">${V(t.label)}</span>`}function j(e,t,n){let r=H(e);r.className=`badge text-bg-${n}`,r.textContent=t}async function M(e,t){await P(`Готовлю файл профиля ${t}...`,`${e}:download:${t}`,async()=>{let n=await fetch(`/api/${e}/clients/${encodeURIComponent(t)}/profile`);if(!n.ok){await R(n,`Не удалось скачать профиль`),await x();return}let r=await n.blob(),i=e===`openvpn`?`ovpn`:`txt`,a=URL.createObjectURL(r),o=document.createElement(`a`);o.href=a,o.download=e===`openvpn`?`${t}.ovpn`:`${t}-vless.txt`,document.body.append(o),o.click(),o.remove(),URL.revokeObjectURL(a),L(`Файл ${t}.${i} готов`)})}async function N(t){let n=e.whitelists.find(e=>e.id===t);await P(`Готовлю файл ${n?.fileName||t}...`,`whitelist:download:${t}`,async()=>{let e=await fetch(`/api/whitelists/${encodeURIComponent(t)}/download`);if(!e.ok){await R(e,`Не удалось скачать белый список`),await x();return}let r=await e.blob(),i=URL.createObjectURL(r),a=document.createElement(`a`);a.href=i,a.download=n?.fileName||`${t}.txt`,document.body.append(a),a.click(),a.remove(),URL.revokeObjectURL(i),L(`Файл ${n?.fileName||t} готов`)})}async function P(t,n,r){e.busy=!0,e.busyAction=n,F(!0,t),C();try{await r()}finally{e.busy=!1,e.busyAction=null,F(!1,``),C()}}function F(e,t){v.hidden=!e,H(`busy-message`).textContent=t;for(let t of document.querySelectorAll(`button`))t.disabled=e}function I(t,n){return e.busyAction===t?`<span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${V(n)}</span>`:V(n)}function L(e){y.hidden=!1,y.textContent=e,window.setTimeout(()=>{y.hidden=!0},5e3)}async function R(e,t){let n=await e.json().catch(()=>({}));L(n.message||n.error||t)}function z(e){return new Intl.DateTimeFormat(`ru-RU`,{dateStyle:`short`,timeStyle:`medium`}).format(new Date(e))}function B(e){if(!Number.isFinite(e))return`0 B`;let t=[`B`,`KB`,`MB`,`GB`],n=e,r=0;for(;n>=1024&&r<t.length-1;)n/=1024,r+=1;return`${n.toFixed(r===0?0:1)} ${t[r]}`}function V(e){return e.replace(/[&<>"']/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`,"'":`&#039;`})[e]||e)}function H(e){let t=document.getElementById(e);if(!t)throw Error(`Missing element: #${e}`);return t}function U(){a.hidden=!1,u&&(u.hidden=!0),c.focus()}function W(){a.hidden=!0,u&&(u.hidden=!1)}P(`Загружаю состояние...`,`app:load`,x).catch(e=>{H(`server-state`).textContent=e instanceof Error?e.message:`Ошибка загрузки`});