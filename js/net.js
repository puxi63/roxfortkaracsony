// Phone play on the TV side: opens a room, lets phones join (PeerJS across devices, or BroadcastChannel
// between tabs of one browser for solo testing), and bridges engine prompts to the phones.
(function (CE) {
  'use strict';

  const PREFIX = 'csendesej-';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ROOM_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ';

  // ---------- transport ----------

  function hostTransport(room, local, h) {
    if (local) {
      const bc = new BroadcastChannel(PREFIX + room);
      const conns = new Map();
      bc.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.to !== 'host') return;
        let c = conns.get(d.from);
        if (!c) {
          c = { id: d.from, send: (m) => bc.postMessage({ from: 'host', to: d.from, msg: m }) };
          conns.set(d.from, c);
        }
        h.onData(c, d.msg);
      };
      setTimeout(() => h.onReady(), 0);
      return { close() { bc.close(); } };
    }
    if (!window.Peer) { setTimeout(() => h.onError({ type: 'nolib', message: 'A PeerJS nem töltődött be. Van internet?' }), 0); return { close() {} }; }
    const peer = new window.Peer(PREFIX + room);
    peer.on('open', () => h.onReady());
    peer.on('error', (e) => h.onError(e));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* retried by PeerJS */ } });
    peer.on('connection', (conn) => {
      const c = { id: conn.peer, send: (m) => { try { if (conn.open) conn.send(m); } catch (e) { /* phone gone */ } } };
      conn.on('data', (m) => h.onData(c, m));
      conn.on('close', () => h.onClose(c));
    });
    return { close() { try { peer.destroy(); } catch (e) { /* already closed */ } } };
  }

  // ---------- prompt and state serialisation ----------

  function wirePrompt(pr) {
    return {
      seq: pr.seq, kind: pr.kind, title: pr.title, label: pr.label, options: pr.options, toggles: pr.toggles || [],
      items: pr.items, targets: pr.targets, maxLen: pr.maxLen, extendable: !!pr.extendable, reflex: !!pr.reflex,
      type: pr.meta && pr.meta.type, msLeft: pr.deadline ? Math.max(0, pr.deadline.t - performance.now()) : null
    };
  }

  function viewOf(g, p) {
    const sc = CE.SCENES[g.s.scene] || {};
    return {
      name: p.name, role: CE.ROLES[p.role].name, sym: CE.ROLES[p.role].sym, hp: p.hp, status: p.status, away: p.away > 0,
      items: p.items.map((i) => (CE.ITEMS[i] ? CE.ITEMS[i].name : i)), map: g.mapHolder() === p,
      pages: CE.pages(g, p), inbox: p.inbox.slice(-12), clock: g.clockText(), scene: sc.title || ''
    };
  }

  // ---------- IO bridge: test-mode IO plus phone forwarding ----------

  class NetIO extends CE.TestIO {
    prompt(p, pr) {
      const promise = super.prompt(p, pr);
      const seat = net.seatOf(p.id);
      if (seat) seat.send({ t: 'prompt', pr: wirePrompt(pr) });
      return promise;
    }
    clear(p, pr) {
      super.clear(p, pr);
      const seat = net.seatOf(p.id);
      if (seat && pr) seat.send({ t: 'clear', seq: pr.seq });
    }
    secret(p, page) { super.secret(p, page); net.push(p.id); }
    vibrate(players, kind) {
      super.vibrate(players, kind);
      players.forEach((p) => { const s = net.seatOf(p.id); if (s) s.send({ t: 'vibrate', kind }); });
    }
    update() { super.update(); net.pushAll(); }
  }

  // ---------- host ----------

  const net = {
    room: null, local: false, transport: null, seats: [], started: false, timer: null,

    open(local) {
      this.close();
      this.local = local;
      this.started = false;
      this.seats = [];
      this.room = Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
      $('setup').hidden = true;
      $('lobby').hidden = false;
      $('lStatus').textContent = 'Szoba megnyitása…';
      this.transport = hostTransport(this.room, local, {
        onReady: () => { $('lStatus').textContent = 'A szoba nyitva. Olvassátok be a kódot!'; this.renderLobby(); CE.music.play('lobby'); },
        onError: (e) => {
          if (e && e.type === 'unavailable-id') { this.open(local); return; }
          $('lStatus').textContent = `Hiba: ${e && (e.message || e.type)}. Próbáld újra, vagy használd az egy gépes módot.`;
        },
        onData: (c, m) => this.onData(c, m),
        onClose: (c) => { const s = this.seats.find((x) => x.conn === c); if (s) { s.online = false; this.renderLobby(); } }
      });
      this.renderLobby();
    },

    close() {
      if (this.transport) this.transport.close();
      this.transport = null;
    },

    phoneUrl() {
      const base = ($('lBase').value || '').trim();
      return `${base}?szoba=${this.room}${this.local ? '&helyi=1' : ''}`;
    },

    defaultBase() {
      if (/^https?:/.test(location.protocol)) return location.href.replace(/[^/]*([?#].*)?$/, '') + 'telefon.html';
      return 'https://puxi63.github.io/csendes-ej/telefon.html';
    },

    seatOf(id) {
      const s = this.seats[id];
      return s && !s.bot && s.conn ? { send: (m) => s.conn.send(m) } : null;
    },

    onData(c, m) {
      if (!m || !m.t) return;
      if (m.t === 'join') return this.join(c, m);
      const idx = this.seats.findIndex((s) => s.conn === c);
      if (idx < 0) return;
      const ui = CE.ui;
      if (m.t === 'answer' && this.started && ui.io) {
        const e = ui.io.pending.get(idx);
        if (e && e.pr.seq === m.seq) e.resolve(m.a);
      } else if (m.t === 'time' && this.started && ui.game) {
        ui.game.requestTime(ui.game.players[idx]);
      }
    },

    join(c, m) {
      const token = String(m.token || '');
      const name = String(m.name || '').trim().slice(0, 14) || 'Diák';
      let idx = this.seats.findIndex((s) => !s.bot && s.token === token);
      if (idx >= 0) {
        this.seats[idx].conn = c;
        this.seats[idx].online = true;
      } else if (!this.started && this.seats.length < 10) {
        const taken = new Set(this.seats.map((s) => s.name));
        let n = name;
        for (let i = 2; taken.has(n); i++) n = `${name} ${i}`;
        this.seats.push({ name: n, token, conn: c, online: true });
        idx = this.seats.length - 1;
      } else {
        c.send({ t: 'rejected', reason: this.started ? 'A játék már elindult.' : 'Betelt a szoba (10 fő).' });
        return;
      }
      c.send({ t: 'welcome', seat: idx, name: this.seats[idx].name, started: this.started });
      if (this.started) {
        this.push(idx);
        const e = CE.ui.io && CE.ui.io.pending.get(idx);
        if (e) c.send({ t: 'prompt', pr: wirePrompt(e.pr) });
      }
      this.renderLobby();
    },

    addBot() {
      if (this.started || this.seats.length >= 10) return;
      const taken = new Set(this.seats.map((s) => s.name));
      const name = CE.NAMES.find((n) => !taken.has(n)) || `Gép ${this.seats.length + 1}`;
      this.seats.push({ name, bot: true, online: true });
      this.renderLobby();
    },

    removeLast() {
      if (this.started || !this.seats.length) return;
      this.seats.pop();
      this.renderLobby();
    },

    renderLobby() {
      if ($('lobby').hidden) return;
      $('lRoom').textContent = this.room || '…';
      if (!$('lBase').value) $('lBase').value = this.defaultBase();
      const url = this.phoneUrl();
      $('lUrl').textContent = url;
      const lb = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(url) && !this.local;
      $('lStatus').dataset.warn = lb ? '1' : '';
      if (lb) $('lStatus').textContent = 'Figyelem: a telefonok nem érik el a „localhost” címet. Lent írd át a laptop IP-címére (ipconfig) vagy a GitHub Pages címére.';
      const qr = $('lQr');
      if (qr.dataset.url !== url) {
        qr.innerHTML = '';
        qr.dataset.url = url;
        if (window.QRCode) new window.QRCode(qr, { text: url, width: 260, height: 260, correctLevel: window.QRCode.CorrectLevel.M });
        else qr.textContent = 'A QR-kód könyvtár nem töltődött be. Írjátok be a címet kézzel.';
      }
      $('lSeats').innerHTML = this.seats.map((s) => `<span class="chip ${s.online === false ? 'away' : ''}">${s.bot ? '🤖 ' : ''}${esc(s.name)}</span>`).join('') || '<span class="muted">Még senki nincs bent.</span>';
      const n = this.seats.length;
      $('lCount').textContent = `${n} játékos${n < 4 ? ` · legalább 4 kell` : ''}`;
      $('lStart').disabled = n < 4 || n > 10;
    },

    start() {
      const n = this.seats.length;
      if (n < 4 || n > 10) return;
      const ui = CE.ui;
      const settings = {
        count: n, names: this.seats.map((s) => s.name), humans: this.seats.map((s, i) => (s.bot ? -1 : i)).filter((i) => i >= 0),
        forceTraitor: -1, systems: ui.systems(), sweaters: []
      };
      this.started = true;
      $('lobby').hidden = true;
      ui.startWith(settings, NetIO, { net: true });
      this.seats.forEach((s, i) => { if (!s.bot && s.conn) s.conn.send({ t: 'welcome', seat: i, name: s.name, started: true }); });
      this.pushAll();
    },

    push(idx) {
      const g = CE.ui.game;
      const s = this.seats[idx];
      if (!g || !s || s.bot || !s.conn) return;
      s.conn.send({ t: 'state', me: viewOf(g, g.players[idx]) });
    },

    pushAll() {
      if (this.timer) return;
      this.timer = setTimeout(() => { this.timer = null; this.seats.forEach((s, i) => this.push(i)); }, 150);
    }
  };

  CE.net = net;
})(window.CE = window.CE || {});
