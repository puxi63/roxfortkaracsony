// The phone page: joins the TV's room and shows the player's cards, secret pages and the current choice.
(function () {
  'use strict';

  const PREFIX = 'csendesej-';
  const qs = new URLSearchParams(location.search);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const VIBRATE = { page: [60], cold: [500, 120, 500], heart: [90, 140, 90, 700, 90, 140, 90], fade: [400], soft: [40], prompt: [30] };
  const STATUS = { el: '', dermedt: 'dermedt', haldoklik: 'haldoklik', szellem: 'szellem', bezarva: 'pincében' };

  const st = {
    room: (qs.get('szoba') || '').toUpperCase(), local: qs.get('helyi') === '1',
    // The name is typed in every time on purpose; only the seat token is remembered for reconnecting.
    name: '', token: null, joined: false, started: false, seat: null,
    view: null, prompt: null, promptAt: 0, sent: false, sub: null, toggles: new Set(), hold: null, seenInbox: 0,
    status: '', send: () => {}, typing: false, dirty: false
  };

  // ---------- connection ----------

  let peer = null;
  let retrying = false;

  function connect() {
    st.token = store.get(`csendesej.token.${st.room}`);
    if (!st.token) { st.token = Math.random().toString(36).slice(2) + Date.now().toString(36); store.set(`csendesej.token.${st.room}`, st.token); }
    const join = () => st.send({ t: 'join', name: st.name, token: st.token });
    if (st.local) {
      const id = 'p' + Math.random().toString(36).slice(2);
      const bc = new BroadcastChannel(PREFIX + st.room);
      bc.onmessage = (ev) => { const d = ev.data || {}; if (d.to === id) handle(d.msg); };
      st.send = (m) => bc.postMessage({ from: id, to: 'host', msg: m });
      join();
      return;
    }
    if (!window.Peer) { st.status = 'A kapcsolódáshoz internet kell. Frissítsd az oldalt.'; render(); return; }
    st.status = 'Kapcsolódás…';
    render();
    peer = new window.Peer();
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + st.room, { reliable: true });
      st.send = (m) => { try { if (conn.open) conn.send(m); } catch (e) { /* reconnecting */ } };
      conn.on('open', () => { st.status = ''; join(); render(); });
      conn.on('data', handle);
      conn.on('close', retry);
      conn.on('error', retry);
    });
    peer.on('error', (e) => { st.status = e && e.type === 'peer-unavailable' ? 'Nincs ilyen szoba. Nézd meg a kódot a TV-n.' : 'Kapcsolódás…'; render(); retry(); });
  }

  function retry() {
    if (retrying) return;
    retrying = true;
    setTimeout(() => { retrying = false; try { if (peer) peer.destroy(); } catch (e) { /* gone */ } connect(); }, 2500);
  }

  function handle(m) {
    if (!m || !m.t) return;
    if (m.t === 'welcome') { st.joined = true; st.seat = m.seat; st.name = m.name; st.started = !!m.started; st.status = ''; }
    else if (m.t === 'rejected') { st.status = m.reason; st.joined = false; }
    else if (m.t === 'state') { st.view = m.me; st.started = true; }
    else if (m.t === 'prompt') { st.prompt = m.pr; st.promptAt = performance.now(); st.sent = false; st.sub = null; st.toggles = new Set(); buzz('prompt'); }
    else if (m.t === 'clear') { if (st.prompt && st.prompt.seq === m.seq) { st.prompt = null; st.sent = false; } }
    else if (m.t === 'vibrate') buzz(m.kind);
    render();
  }

  function buzz(kind) { try { if (navigator.vibrate) navigator.vibrate(VIBRATE[kind] || [50]); } catch (e) { /* not supported */ } }

  // Keep the screen awake while playing.
  let lock = null;
  async function wake() { try { if ('wakeLock' in navigator && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { /* refused */ } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });

  // ---------- rendering ----------

  const root = document.getElementById('root');

  function render() {
    if (st.typing) { st.dirty = true; return; }
    if (!st.room) { root.innerHTML = joinForm(true); bindJoin(); return; }
    if (!st.joined) { root.innerHTML = joinForm(false); bindJoin(); return; }
    if (!st.started || !st.view) {
      root.innerHTML = `<div class="ph"><p class="eyebrow">Csendes éj Roxfortban</p><div class="ph-name">${esc(st.name)}</div><p class="idle">Feliratkoztál McGonagall listájára. Várj, amíg a játék elindul.</p>${st.status ? `<p class="idle">${esc(st.status)}</p>` : ''}</div>`;
      return;
    }
    const v = st.view;
    const ghost = v.status === 'szellem';
    const hearts = ghost ? 'szellem' : '♥'.repeat(Math.max(0, v.hp)) + '♡'.repeat(Math.max(0, 3 - v.hp));
    const unread = Math.max(0, v.inbox.length - st.seenInbox);
    let h = `<div class="ph ${ghost ? 'ghost' : ''}">
      <div class="ph-top"><span class="ph-name">${esc(v.name)}</span><span>${hearts}${STATUS[v.status] ? ' · ' + STATUS[v.status] : ''}</span></div>
      <div class="ph-top"><span>${esc(v.scene)}</span><span>${esc(v.clock)}</span></div>
      <div class="ph-row"><button class="hold-btn" data-hold="pages" type="button">Tartsd nyomva: lapjaim</button><button class="hold-btn" data-hold="inbox" type="button">Tartsd nyomva: titkos lapok${unread ? `<span class="badge">${unread}</span>` : ''}</button></div>`;
    // Role, items and the map are secret too: they only show while the button is held.
    if (st.hold === 'pages') {
      const things = v.items.concat(v.map ? ['Tekergők Térképe'] : []);
      h += `<div class="page"><small>Tárgyaid</small>${things.length ? things.map(esc).join(', ') : 'Nincs tárgyad.'}</div>`;
      h += v.pages.map((pg) => `<div class="page ${pg.style || ''}"><small>${esc(pg.title)}</small>${esc(pg.text)}</div>`).join('');
    }
    else if (st.hold === 'inbox') h += v.inbox.length ? v.inbox.slice(-6).reverse().map((pg) => `<div class="page ${pg.style || ''}"><small>titkos lap</small>${esc(pg.text)}</div>`).join('') : '<p class="idle">Még nincs titkos lapod.</p>';
    else if (st.prompt && !st.sent) h += promptHtml(st.prompt);
    else if (st.prompt && st.sent) h += '<p class="idle">Elküldve. Nézd a TV-t.</p>';
    else h += `<p class="idle">${ghost ? 'Szellem vagy. Figyeld a többieket.' : v.away ? 'Most nem vagy a jelenetben.' : 'Nézd a TV-t.'}</p>`;
    if (st.status) h += `<p class="idle">${esc(st.status)}</p>`;
    // The chronicle is public: what the team decided and what it caused.
    const chron = v.chronicle || [];
    h += `<button class="opt" data-a="chron" type="button">${st.showChron ? 'Krónika elrejtése' : `Krónika: mi történt eddig (${chron.length})`}</button>`;
    if (st.showChron) {
      const icon = { good: '✔', bad: '✘', death: '✝', neutral: '•' };
      h += `<div class="phone-chron">${chron.slice().reverse().map((e) => `<div class="chron-item"><div class="chron-t">${esc(e.time)} · ${esc(e.title)}</div>${e.choice ? `<div class="chron-c">Döntés: ${esc(e.choice)}</div>` : ''}${e.changes.map((c) => `<div class="chg ${c.tone}"><span>${icon[c.tone] || '•'}</span>${esc(c.text)}</div>`).join('')}</div>`).join('') || '<p class="idle">Még nem történt semmi.</p>'}</div>`;
    }
    root.innerHTML = h + '</div>';
    bind();
    attachMini();
  }

  // The mini-game node survives re-renders (state messages, holding the card buttons) while its prompt is open.
  function attachMini() {
    const pr = st.prompt;
    if (st.mini && (!pr || st.sent || st.mini.seq !== pr.seq)) { st.mini.ctrl.stop(); st.mini = null; }
    const host = root.querySelector('.mg-host');
    const mini = window.CE && window.CE.mini;
    if (!host || !pr || pr.kind !== 'mini' || !mini) return;
    if (st.mini) { host.appendChild(st.mini.el); return; }
    const el = document.createElement('div');
    host.appendChild(el);
    const startAt = st.promptAt - (pr.startedAgo || 0);
    st.mini = { seq: pr.seq, el, ctrl: null };
    st.mini.ctrl = mini.mount(el, pr, (r) => { if (st.prompt && st.prompt.seq === pr.seq && !st.sent) answer(r); }, startAt);
  }

  function joinForm(askRoom) {
    return `<div class="ph"><p class="eyebrow">Csendes éj Roxfortban</p><h4 class="ph-name">Feliratkozás</h4>
      ${askRoom ? '<label>Szoba kódja <input id="jRoom" type="text" maxlength="4" autocapitalize="characters"></label>' : `<p class="muted">Szoba: <b>${esc(st.room)}</b></p>`}
      <label>A neved <input id="jName" type="text" maxlength="14" autocomplete="off" autocorrect="off" spellcheck="false"></label>
      <button id="jGo" class="opt primary" type="button">Belépek</button>
      ${st.status ? `<p class="idle">${esc(st.status)}</p>` : ''}</div>`;
  }

  function bindJoin() {
    document.getElementById('jGo').onclick = () => {
      const r = document.getElementById('jRoom');
      if (r) st.room = r.value.trim().toUpperCase();
      st.name = document.getElementById('jName').value.trim().slice(0, 14);
      if (!st.room || !st.name) { st.status = 'Add meg a szoba kódját és a neved.'; render(); return; }
      wake();
      connect();
    };
  }

  function promptHtml(pr) {
    let h = `<div class="prompt ${pr.reflex ? 'reflex' : ''}"><div class="ptimer"><i id="ptimer"></i></div><h4>${esc(pr.title || '')}</h4>`;
    if (pr.kind === 'mini') return `${h}<div class="mg-host"></div></div>`;
    if (pr.kind === 'ack') h += `<button class="opt primary" data-k="ok">${esc(pr.label || 'Rendben')}</button>`;
    else if (pr.kind === 'memory') h += '<textarea id="pText" rows="3" maxlength="200" placeholder="Egy boldog emléked…"></textarea><button class="opt primary" data-a="memok">Kész</button><button class="opt" data-a="memno">Nem írok</button>';
    else if (pr.kind === 'text') h += `<input id="pText" type="text" maxlength="${pr.maxLen || 25}" placeholder="Rövid válasz"><button class="opt primary" data-a="textok">Küldés</button>`;
    else if (pr.kind === 'volunteer') h += `<button class="opt primary" data-k="yes">${esc(pr.label || 'Vállalom')}</button><button class="opt" data-k="no">Nem</button>`;
    else if (pr.kind === 'kozben' && st.sub) {
      if (st.sub === 'give') h += `<label>Mit? <select id="pItem">${pr.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`;
      h += `<label>Kinek? <select id="pTarget">${pr.targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><button class="opt primary" data-a="subok">${st.sub === 'give' ? 'Átadom' : 'Elküldöm'}</button><button class="opt" data-a="subback">Mégsem</button>`;
    } else {
      if (pr.type === 'whisper') h += `<label>Kinek? <select id="pTarget">${pr.targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`;
      h += (pr.options || []).map((o) => `<button class="opt" data-k="${esc(o.k)}">${esc(o.t)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('');
      if (pr.toggles && pr.toggles.length) h += `<div class="tog">${pr.toggles.map((t) => `<button type="button" data-tog="${t.id}" class="${st.toggles.has(t.id) ? 'on' : ''}">${esc(t.t)}</button>`).join('')}</div>`;
    }
    if (pr.extendable) h += '<button class="opt" data-a="time">+30 mp időt kérek</button>';
    return h + '</div>';
  }

  function answer(a) {
    const pr = st.prompt;
    if (!pr) return;
    st.send({ t: 'answer', seq: pr.seq, a });
    st.sent = true;
    st.sub = null;
    render();
  }

  function bind() {
    root.querySelectorAll('[data-hold]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        st.hold = b.dataset.hold;
        if (st.hold === 'inbox' && st.view) st.seenInbox = st.view.inbox.length;
        wake();
        render();
      });
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const chronBtn = root.querySelector('[data-a="chron"]');
    if (chronBtn) chronBtn.onclick = () => { st.showChron = !st.showChron; render(); };
    root.querySelectorAll('input[type=text], textarea').forEach((el) => {
      el.onfocus = () => { st.typing = true; };
      el.onblur = () => { st.typing = false; if (st.dirty) { st.dirty = false; setTimeout(render, 0); } };
    });
    const pr = st.prompt;
    if (!pr) return;
    root.querySelectorAll('[data-k]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (pr.kind === 'kozben' && (k === 'give' || k === 'fake')) { st.sub = k; render(); return; }
        const t = document.getElementById('pTarget');
        answer({ k, to: pr.type === 'whisper' && t ? +t.value : undefined, toggles: [...st.toggles] });
      };
    });
    root.querySelectorAll('[data-tog]').forEach((b) => {
      b.onclick = () => { if (st.toggles.has(b.dataset.tog)) st.toggles.delete(b.dataset.tog); else st.toggles.add(b.dataset.tog); render(); };
    });
    const act = (name, fn) => { const b = root.querySelector(`[data-a="${name}"]`); if (b) b.onclick = fn; };
    act('memok', () => { st.typing = false; answer({ text: document.getElementById('pText').value }); });
    act('memno', () => { st.typing = false; answer({ text: null }); });
    act('textok', () => { st.typing = false; answer({ text: document.getElementById('pText').value }); });
    act('subok', () => answer({ k: st.sub, item: st.sub === 'give' ? document.getElementById('pItem').value : null, to: +document.getElementById('pTarget').value }));
    act('subback', () => { st.sub = null; render(); });
    act('time', () => { st.send({ t: 'time' }); const b = root.querySelector('[data-a="time"]'); if (b) { b.disabled = true; b.textContent = 'Időt kértél'; } });
    const input = document.getElementById('pText');
    if (input && input.tagName === 'INPUT') input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); root.querySelector('[data-a="textok"]').click(); } };
  }

  // Releasing anywhere hides the cards again.
  const release = () => { if (st.hold) { st.hold = null; render(); } };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  // Timer bar for the current prompt.
  function tick() {
    const bar = document.getElementById('ptimer');
    if (bar && st.prompt && st.prompt.msLeft != null) {
      const left = Math.max(0, st.prompt.msLeft - (performance.now() - st.promptAt));
      bar.style.width = `${Math.min(100, (left / Math.max(1, st.prompt.msLeft)) * 100)}%`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  render();
})();
