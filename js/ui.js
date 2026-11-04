// Test-mode UI: setup screen, TV renderer, virtual phones, narrator view and the TestIO bridge to the engine.
(function (CE) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const words = (arr) => arr.join(' ').split(/\s+/).filter(Boolean).length;
  const SYSTEMS = [['R1', 'A sas kérdez'], ['R2', 'Hamis lap'], ['R4', 'Útkereszteződések'], ['R7', 'Jóslatgömbök'], ['R8', 'A védelem erői'], ['R9', 'Kísértetek nagy szavazata'], ['R10', 'Kastélyóra, időkérés'], ['R11', 'Rezgés']];
  const MOOD = { cold: 'cold', breath: 'cold', storm: 'cold', dark: 'cold', drip: 'cold', carol: 'warm', bells: 'warm', dawn: 'warm', piano: '' };
  const STATUS = { el: '', dermedt: 'dermedt', haldoklik: 'haldoklik ♥', szellem: 'szellem', bezarva: 'pincében' };

  // ---------- text-to-speech ----------

  const tts = {
    voice: null,
    pick() {
      if (!window.speechSynthesis) return null;
      const hu = speechSynthesis.getVoices().filter((v) => /^hu/i.test(v.lang));
      hu.sort((a, b) => (/natural|online/i.test(b.name) ? 1 : 0) - (/natural|online/i.test(a.name) ? 1 : 0));
      this.voice = hu[0] || null;
      return this.voice;
    },
    speak(paragraphs) {
      return new Promise((resolve) => {
        try {
          if (!window.speechSynthesis) return resolve();
          speechSynthesis.cancel();
          if (!this.voice) this.pick();
          const parts = paragraphs.slice();
          music.duck = 0.35;
          music.apply();
          const finish = () => { music.duck = 1; music.apply(); resolve(); };
          const next = () => {
            if (!parts.length) return finish();
            const u = new SpeechSynthesisUtterance(parts.shift());
            u.lang = 'hu-HU';
            u.rate = 0.95;
            if (this.voice) u.voice = this.voice;
            u.onend = next;
            u.onerror = () => finish();
            speechSynthesis.speak(u);
          };
          next();
        } catch (e) { resolve(); }
      });
    },
    stop() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ } if (music.duck !== 1) { music.duck = 1; music.apply(); } }
  };
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => tts.pick();

  // ---------- background music: two audio elements cross-fading between scene moods ----------

  const music = {
    on: true, vol: 0.5, duck: 1, key: null, cur: null, fades: new Map(),
    el() { const a = new Audio(); a.loop = true; a.preload = 'auto'; a.volume = 0; a.onerror = () => { /* missing file: keep silent */ }; return a; },
    target() { return this.on ? this.vol * this.duck : 0; },
    fade(a, to, ms, done) {
      clearInterval(this.fades.get(a));
      const from = a.volume;
      const steps = Math.max(1, Math.round(ms / 50));
      let i = 0;
      const t = setInterval(() => {
        i += 1;
        a.volume = Math.max(0, Math.min(1, from + ((to - from) * i) / steps));
        if (i >= steps) { clearInterval(t); this.fades.delete(a); if (done) done(); }
      }, 50);
      this.fades.set(a, t);
    },
    // Switches to the mood's track; unknown or missing moods keep the current track.
    play(mood) {
      const file = CE.MUSIC && CE.MUSIC[mood];
      if (!file || mood === this.key) return;
      this.key = mood;
      const old = this.cur;
      const a = this.el();
      a.src = `assets/music/${file}`;
      this.cur = a;
      const p = a.play();
      if (p && p.catch) p.catch(() => { /* autoplay blocked until the next click */ });
      this.fade(a, this.target(), 1800);
      if (old) this.fade(old, 0, 1800, () => { old.pause(); old.src = ''; });
    },
    apply() { if (this.cur) this.fade(this.cur, this.target(), 400); },
    stop() { if (this.cur) { const a = this.cur; this.fade(a, 0, 800, () => { a.pause(); a.src = ''; }); } this.cur = null; this.key = null; }
  };
  CE.music = music;

  // ---------- IO bridge used by the engine ----------

  class TestIO {
    constructor(ui) {
      this.ui = ui;
      this.pending = new Map();
    }

    now() { return performance.now(); }
    ms(sec) { return (sec * 1000) / this.ui.speed; }
    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    // Waits for a duration, or until "Tovább" is pressed.
    wait(ms) {
      return new Promise((resolve) => {
        const done = () => { clearTimeout(t); if (this.ui.skip === done) this.ui.skip = null; resolve(); };
        const t = setTimeout(done, ms);
        this.ui.skip = done;
      });
    }

    readMs(paragraphs, min = 2.5) { return (Math.max(min, words(paragraphs) * 0.33) * 1000) / this.ui.speed; }

    async narrate(screen) {
      this.ui.showScene(screen);
      if (!screen.paragraphs.length) return;
      if (this.ui.tts && this.ui.speed <= 2) {
        let skipped = false;
        const w = this.wait(this.readMs(screen.paragraphs) * 3).then(() => { skipped = true; tts.stop(); });
        await Promise.race([tts.speak(screen.paragraphs), w]);
        if (!skipped && this.ui.skip) this.ui.skip();
        return;
      }
      await this.wait(this.readMs(screen.paragraphs));
    }

    async result(info) {
      const out = info.out.filter(Boolean);
      const changes = info.changes || [];
      if (!out.length && !changes.length) { await this.wait(500 / this.ui.speed); return; }
      this.ui.showResult(out, changes);
      if (!out.length) { await this.wait((2500 + changes.length * 700) / this.ui.speed); return; }
      if (this.ui.tts && this.ui.speed <= 2) {
        await Promise.race([tts.speak(out), this.wait(this.readMs(out) * 3)]);
        if (this.ui.skip) this.ui.skip();
        return;
      }
      await this.wait(this.readMs(out, 2) + (changes.length * 500) / this.ui.speed);
    }

    chronicle() { if (this.ui.chronOn) this.ui.showChronicle(); }

    prompt(p, pr) {
      return new Promise((resolve) => {
        const entry = {
          pr, done: false,
          resolve: (a) => {
            if (entry.done) return;
            entry.done = true;
            if (this.pending.get(p.id) === entry) this.pending.delete(p.id);
            resolve(a);
            this.ui.renderTabs();
            if (this.ui.tab === p.id) this.ui.renderPhone();
          }
        };
        this.pending.set(p.id, entry);
        const g = this.ui.game;
        if (!this.ui.humans.has(p.id)) {
          const base = pr.reflex ? 300 + Math.random() * 1200 : (pr.kind === 'ack' ? 300 : 700) + Math.random() * 2200;
          setTimeout(() => { if (!entry.done && g === this.ui.game) entry.resolve(CE.Bot.answer(g, g.players[p.id], pr)); }, base / this.ui.speed);
          if (pr.extendable && CE.Bot.wantsTime(g, p)) setTimeout(() => { if (!entry.done && g === this.ui.game) g.requestTime(g.players[p.id]); }, (base * 0.6) / this.ui.speed);
        }
        this.ui.renderTabs();
        if (this.ui.tab === p.id) this.ui.renderPhone();
      });
    }

    clear(p, pr) {
      const e = this.pending.get(p.id);
      if (e && e.pr === pr) { e.done = true; this.pending.delete(p.id); }
      this.ui.renderTabs();
      if (this.ui.tab === p.id) this.ui.renderPhone();
    }

    clearAll() { this.pending.forEach((e) => { e.done = true; }); this.pending.clear(); }

    progress(col) { this.ui.renderLive(col); }
    secret(p) { this.ui.unread[p.id] = (this.ui.unread[p.id] || 0) + 1; this.ui.renderTabs(); if (this.ui.tab === p.id) this.ui.renderPhone(); }
    vibrate(players) { if (this.ui.game && this.ui.game.sys('R11')) this.ui.buzz(players.map((p) => p.id)); }
    notice(text) { this.ui.toast(text); }
    patronus(p) { if (!(CE.art && CE.art.patronus)) this.ui.toast(`Ezüst ${p.patronus}: ${p.name} patrónusa`, 'silver'); this.ui.showPatronus(p); }
    update() { this.ui.renderAll(); }
    log(entry) { this.ui.appendLog(entry); }

    async debate(ms, label) { this.ui.showDebate(label, ms); await this.wait(ms); }
    async answers(data) { this.ui.showAnswers(data); await this.wait((3000 + data.rows.length * 900) / this.ui.speed); }
    async tally(data) { this.ui.showTally(data); await this.wait(4000 / this.ui.speed); }
    async info(title, lines) { this.ui.showInfo(title, lines); await this.wait(this.readMs(lines, 3)); }
    async reveal(data) { this.ui.showReveal(data); await this.wait(data.ending ? this.readMs(['x'], 25) : 60 * 60 * 1000); }
    async ending(data) { const isNew = this.ui.discover(data, this.ui.game.s.history); this.ui.showEnding(data, isNew); await this.wait(this.readMs(data.text || [], 12)); }
    async tree(data) { this.ui.showTree(data); await this.wait(60 * 60 * 1000); }
    missing(id) { this.ui.showInfo('Még nincs megírva', [`A(z) ${id} jelenet még nincs a játékban. A II. és a III. felvonás hamarosan jön.`]); }
    error(e, scene) { console.error(e); this.ui.showInfo('Hiba történt', [`Jelenet: ${scene}`, String(e && e.message || e)], true); }
  }

  // ---------- the UI ----------

  const ui = {
    game: null, io: null, speed: 4, tts: false, humans: new Set(), tab: 0, unread: {}, showPages: {}, showInbox: {},
    toggleSel: {}, sub: {}, saved: [], skip: null, narratorOn: false, liveCol: null, typing: false, dirty: false,

    // --- setup ---
    initSetup() {
      const sc = $('sCount');
      for (let n = 4; n <= 10; n++) sc.add(new Option(`${n} játékos`, n, n === 6, n === 6));
      sc.onchange = () => this.fillSeats();
      this.fillSeats();
      $('sSeed').value = 1 + Math.floor(Math.random() * 99999);
      const fs = $('sSystems');
      SYSTEMS.forEach(([code, name]) => {
        const l = document.createElement('label');
        l.innerHTML = `<input type="checkbox" data-sys="${code}" checked> ${code} ${esc(name)}`;
        fs.appendChild(l);
      });
      $('startBtn').onclick = () => this.start();
      $('batchBtn').onclick = () => this.runBatch();
      $('cNext').onclick = () => { if (this.skip) this.skip(); tts.stop(); };
      $('cSpeed').onchange = (e) => { this.speed = +e.target.value; };
      $('cTts').onchange = (e) => { this.tts = e.target.checked; if (!this.tts) tts.stop(); };
      $('cMusic').onchange = (e) => { music.on = e.target.checked; if (music.on && music.key && !music.cur) { const k = music.key; music.key = null; music.play(k); } else music.apply(); };
      $('cVol').oninput = (e) => { music.vol = +e.target.value / 100; music.apply(); };
      $('cNarr').onclick = () => { this.narratorOn = !this.narratorOn; $('narrator').hidden = !this.narratorOn; this.renderNarrator(); };
      $('cJumpGo').onclick = () => this.jump($('cJump').value);
      $('cUndo').onclick = () => this.undo();
      $('cSnap').onclick = () => this.saveSnap();
      $('cLoad').onclick = () => this.loadSnap($('cSnaps').value);
      $('cNew').onclick = () => this.backToSetup();
      $('cChron').onclick = () => { this.chronOn = !this.chronOn; if (this.chronOn) this.showChronicle(); else $('chron').hidden = true; };
      $('cFull').onclick = () => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen().catch(() => {}); };
      $('netBtn').onclick = () => CE.net.open(false);
      $('netLocalBtn').onclick = () => CE.net.open(true);
      $('lBot').onclick = () => CE.net.addBot();
      $('lRemove').onclick = () => CE.net.removeLast();
      $('lStart').onclick = () => CE.net.start();
      $('lBack').onclick = () => { CE.net.close(); music.stop(); $('lobby').hidden = true; $('setup').hidden = false; };
      $('lBase').onchange = () => { $('lQr').dataset.url = ''; CE.net.renderLobby(); };
      $('lOpenPhone').onclick = () => window.open(CE.net.phoneUrl(), '_blank');
      document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { if (this.skip) this.skip(); }
      });
    },

    fillSeats() {
      const n = +$('sCount').value;
      const h = $('sHuman');
      const t = $('sTraitor');
      h.innerHTML = '';
      t.innerHTML = '';
      h.add(new Option('Senki, csak nézem', -1));
      t.add(new Option('Véletlen', -1));
      for (let i = 0; i < n; i++) { h.add(new Option(CE.NAMES[i], i)); t.add(new Option(CE.NAMES[i], i)); }
      h.value = '0';
    },

    systems() {
      const s = {};
      document.querySelectorAll('[data-sys]').forEach((c) => { s[c.dataset.sys] = c.checked; });
      return s;
    },

    start() {
      const count = +$('sCount').value;
      const human = +$('sHuman').value;
      const sweaters = [];
      for (let i = 0; i < +$('sSweater').value; i++) sweaters.push(i);
      const settings = { count, humans: human >= 0 ? [human] : [], forceTraitor: +$('sTraitor').value, systems: this.systems(), sweaters };
      this.speed = +$('sSpeed').value;
      this.startWith(settings, TestIO, {});
    },

    // Starts a game; opts.net = phone play (real speed, no phone sidebar or narrator on the TV).
    startWith(settings, IOClass, opts) {
      this.net = !!opts.net;
      if (this.net) this.speed = 1;
      this.tts = $('sTts').checked;
      $('cSpeed').value = String(this.speed);
      $('cTts').checked = this.tts;
      music.on = $('sMusic').checked;
      $('cMusic').checked = music.on;
      $('app').classList.toggle('net', this.net);
      this.narratorOn = false;
      $('narrator').hidden = true;
      this.humans = new Set(settings.humans);
      this.tab = settings.humans.length ? settings.humans[0] : 0;
      this.unread = {}; this.showPages = {}; this.showInbox = {}; this.toggleSel = {}; this.sub = {}; this.saved = [];
      $('nLog').innerHTML = '';
      if (this.game) this.game.stop();
      if (this.io) this.io.clearAll();
      this.io = new IOClass(this);
      const seed = this.net ? 1 + Math.floor(Math.random() * 99999) : (+$('sSeed').value || 1);
      this.game = new CE.Game({ settings, io: this.io, seed });
      this.game.botRng = new CE.Rng(seed * 7 + 3);
      this.game.setup();
      $('setup').hidden = true;
      $('app').hidden = false;
      this.fillJump();
      this.renderAll();
      this.game.run('P1');
      this.tick();
    },

    backToSetup() {
      if (this.game) this.game.stop();
      if (this.io) this.io.clearAll();
      tts.stop();
      music.stop();
      this.clearArt();
      if (this.net && CE.net) CE.net.close();
      this.net = false;
      this.game = null;
      $('app').hidden = true;
      $('setup').hidden = false;
    },

    fillJump() {
      const sel = $('cJump');
      sel.innerHTML = '';
      Object.values(CE.SCENES).forEach((s) => sel.add(new Option(`${s.id} · ${s.title}`, s.id)));
    },

    restart(id) {
      tts.stop();
      this.io.clearAll();
      this.renderLive(null);
      if (this.skip) this.skip();
      this.game.run(id);
    },

    jump(id) {
      if (!this.game || !CE.SCENES[id]) return;
      this.game.stop();
      this.toast(`Ugrás: ${id}`);
      setTimeout(() => this.restart(id), 50);
    },

    undo() {
      const g = this.game;
      if (!g || g.snaps.length < 2) return;
      g.stop();
      g.snaps.pop();
      const snap = g.snaps.pop();
      g.restore(snap);
      this.toast(`Vissza: ${snap.label}`);
      setTimeout(() => this.restart(snap.scene), 50);
    },

    saveSnap() {
      const g = this.game;
      if (!g || !g.snaps.length) return;
      const snap = Object.assign({}, g.snaps[g.snaps.length - 1]);
      snap.label = `Mentés ${this.saved.length + 1}: ${snap.label}`;
      this.saved.push(snap);
      this.renderSnaps();
      this.toast('Pillanatkép elmentve (a jelenet elejéről).');
    },

    loadSnap(idx) {
      const snap = this.saved[+idx];
      if (!snap || !this.game) return;
      this.game.stop();
      this.game.restore(snap);
      this.toast(`Betöltve: ${snap.label}`);
      setTimeout(() => this.restart(snap.scene), 50);
    },

    renderSnaps() {
      const sel = $('cSnaps');
      sel.innerHTML = '';
      this.saved.forEach((s, i) => sel.add(new Option(s.label, i)));
    },

    // --- TV ---
    // Art behind the text (js/art.js): a scene's background, figures and lasting effects.
    // Only redrawn when the picture changes, so animations do not restart on every screen.
    renderArt(id) {
      if (!(CE.art && CE.art.forScene)) return;
      const known = (CE.SCENE_ART && CE.SCENE_ART[id]) || (CE.EVENT_ART && CE.EVENT_ART[id]);
      if (!known) return;
      this.showArt(CE.art.forScene(id));
    },

    showArt(a) {
      if (!a) return;
      const bg = a.bg || this.artBg || 'nagyterem';
      const key = JSON.stringify([bg, a.chars || [], a.fx || [], a.patronus || null]);
      if (key === this.artKey) return;
      this.artKey = key;
      this.artBg = bg;
      const fx = a.fx || [];
      const under = fx.filter((n) => (CE.art.FX_UNDER || []).includes(n)).map((n) => CE.art.effect(n)).join('');
      const over = fx.filter((n) => !(CE.art.FX_UNDER || []).includes(n)).map((n) => CE.art.effect(n)).join('');
      $('artScene').innerHTML = CE.art.background(bg) + under + CE.art.characters(a.chars || []) + over + (a.patronus ? CE.art.patronus(a.patronus, { small: true }) : '');
      $('tv').classList.add('has-art');
    },

    clearArt() {
      ['artScene', 'artTop'].forEach((id) => { const el = $(id); if (el) el.innerHTML = ''; });
      this.artBg = this.artKey = null;
      $('tv').classList.remove('has-art');
    },

    showScene(screen) {
      const sc = screen.scene || {};
      if (screen.music) music.play(screen.music);
      this.renderArt(screen.id);
      $('tv').classList.remove('cold', 'warm');
      if (MOOD[screen.music]) $('tv').classList.add(MOOD[screen.music]);
      $('tvPlace').textContent = sc.place || '';
      $('tvTitle').textContent = sc.title || '';
      $('tvBody').innerHTML = screen.paragraphs.map((p) => `<p${/^[A-ZÁÉÍÓÖŐÚÜŰ !]+!$/.test(p) ? ' class="shout"' : ''}>${esc(p)}</p>`).join('');
      $('tvLive').innerHTML = '';
      this.renderHud();
    },

    showResult(out, changes = []) {
      const icon = { good: '✔', bad: '✘', death: '✝', neutral: '•' };
      const list = changes.length
        ? `<div class="changes"><p class="changes-h">Mi változott</p>${changes.map((c, i) => `<div class="chg ${c.tone}" style="animation-delay:${(i * 0.45) / this.speed}s"><span>${icon[c.tone] || '•'}</span>${esc(c.text)}</div>`).join('')}</div>`
        : '';
      $('tvBody').innerHTML = `<div class="result-wrap">${out.length ? `<div class="result">${out.map((p) => `<p>${esc(p)}</p>`).join('')}</div>` : ''}${list}</div>`;
      $('tvLive').innerHTML = '';
      this.renderHud();
      this.renderChips();
      changes.filter((c) => c.tone === 'death').forEach((c) => this.deathMoment(c.who));
    },

    // A death is a big moment on the TV: a toast now, and the art layer's effect if it is loaded.
    deathMoment(name) {
      this.toast(`${name} meghalt. A gyertyája kialszik.`, 'silver');
      if (CE.art && CE.art.effect) this.playEffect('death');
    },

    playEffect(name) {
      if (!(CE.art && CE.art.play)) return;
      const node = CE.art.play($('artTop'), name);
      // Looping effects (e.g. the dementor cold) are shown only for a moment here.
      if (node && !(CE.art.FX_DURATION || {})[name]) setTimeout(() => node.remove(), 3500);
    },

    // A silver animal runs across the TV for a successful patronus.
    showPatronus(p) {
      if (!(CE.art && CE.art.patronus)) return;
      const top = $('artTop');
      const tpl = document.createElement('template');
      tpl.innerHTML = CE.art.patronus(p.patronus).trim();
      const node = tpl.content.firstElementChild;
      if (!node || !top) return;
      top.querySelectorAll('.art-patronus').forEach((x) => x.remove());
      // The owner's name under the silver animal.
      const tag = document.createElement('div');
      tag.className = 'pat-name';
      tag.textContent = `${p.name} · ${p.patronus}`;
      node.appendChild(tag);
      top.appendChild(node);
      setTimeout(() => node.classList.add('art-out'), 2200);
      setTimeout(() => node.remove(), 3700);
    },

    showChronicle() {
      const g = this.game;
      if (!g) return;
      const box = $('chron');
      const items = (g.s.chronicle || []).slice().reverse();
      const icon = { good: '✔', bad: '✘', death: '✝', neutral: '•' };
      box.innerHTML = `<div class="chron-head"><b>Krónika</b><button type="button" id="chronClose">Bezár</button></div>` + (items.length ? items.map((e) => `<div class="chron-item"><div class="chron-t">${esc(e.time)} · ${esc(e.title)}</div>${e.choice ? `<div class="chron-c">Döntés: ${esc(e.choice)}</div>` : ''}${e.changes.map((c) => `<div class="chg ${c.tone}"><span>${icon[c.tone] || '•'}</span>${esc(c.text)}</div>`).join('')}</div>`).join('') : '<p class="muted">Még nem történt semmi.</p>');
      box.hidden = false;
      $('chronClose').onclick = () => { this.chronOn = false; box.hidden = true; };
    },

    showDebate(label, ms) {
      $('tvBody').innerHTML = `<p class="shout">${esc(label)}</p><p>Beszéljétek meg. ${Math.round(ms * this.speed / 1000)} másodpercetek van. (Tovább: kihagyás)</p>`;
      this.liveCol = { dl: { t: performance.now() + ms, start: performance.now() } };
      $('tvLive').innerHTML = '';
    },

    showAnswers(data) {
      $('tvTitle').textContent = 'A sas kérdez';
      $('tvBody').innerHTML = `<p>${esc(data.question)}</p>` + data.rows.map((r, i) => `<div class="qa-row" style="animation-delay:${(i * 0.9) / this.speed}s"><b>${esc(r.name)}</b><span>${esc(r.text)}</span></div>`).join('');
      $('tvLive').innerHTML = '';
    },

    showTally(data) {
      const rows = data.opts.map((o) => `<div class="vrow"><span class="k">•</span><span>${esc(o.t)}</span><span class="c">${data.counts[o.k] || 0}</span></div>`).join('');
      $('tvBody').innerHTML = `<p>${data.target ? `A pincébe: ${esc(data.target.name)}` : 'Nincs elég szavazat. Senki nem kerül a pincébe.'}</p>`;
      $('tvLive').innerHTML = rows;
    },

    showInfo(title, lines, bad) {
      $('tvTitle').textContent = title;
      $('tvBody').innerHTML = lines.map((l) => `<p class="${bad ? 'err' : ''}">${esc(l)}</p>`).join('');
      $('tvLive').innerHTML = '';
    },

    showReveal(d) {
      const tr = d.traitors.map((t) => `<div class="traitor"><h4>${t.second ? 'A második megszállott' : 'Az áruló'}: ${esc(t.name)} · ${esc(t.role)}</h4><ul>${t.cmds.map((c) => `<li>${c.act}. felvonás: ${esc(c.text)} ${c.ok === true ? '✔' : c.ok === false ? '✘' : '…'}</li>`).join('')}</ul><p>Ellenállás: ${t.resist}</p></div>`).join('');
      const qa = d.qa.map((x) => `<li>${esc(x.q)}<br><i>Az áruló kérdése: ${esc(x.t)}</i><br>${x.rows.filter((r) => r.odd).map((r) => `${esc(r.name)}: „${esc(r.text)}”`).join(', ')}</li>`).join('');
      const goals = d.goals.map((x) => `<li>${esc(x.name)}: ${esc(x.goal)} ${x.ok === true ? '★' : x.ok === null ? '(később dől el)' : '✘'}</li>`).join('');
      $('tvTitle').textContent = 'Felfedés';
      $('tvBody').innerHTML = `<div class="reveal"><div>${tr}${d.heir.length ? `<p>A Nagyúr híve: ${esc(d.heir.join(', '))}</p>` : ''}<p>Mugliszületésűek: ${esc(d.mugli.join(', '))}</p>${d.deaths.length ? `<p>Szellemek: ${esc(d.deaths.join(', '))}</p>` : ''}</div><div><h4>A sas kérdései</h4><ul>${qa || '<li>nem volt</li>'}</ul><h4>Személyes célok</h4><ul>${goals}</ul><h4>Patrónusok</h4><p>${d.patronus.map((p) => `${esc(p.name)}: ${esc(p.animal)} (${p.ok}×)`).join(' · ')}</p></div></div>`;
      $('tvLive').innerHTML = '';
    },

    // R7: endings, scenes and visions found so far, kept in this browser.
    loadDiscovery() {
      try { return JSON.parse(localStorage.getItem('csendesej.felfedezes')) || { endings: [], scenes: [] }; } catch (e) { return { endings: [], scenes: [] }; }
    },

    discover(ending, history) {
      const d = this.loadDiscovery();
      const isNew = !!ending && !d.endings.includes(ending.id);
      if (ending && isNew) d.endings.push(ending.id);
      history.forEach((id) => { if (!d.scenes.includes(id)) d.scenes.push(id); });
      try { localStorage.setItem('csendesej.felfedezes', JSON.stringify(d)); } catch (e) { /* storage may be blocked */ }
      return isNew;
    },

    showEnding(e, isNew) {
      const d = this.loadDiscovery();
      const who = { csapat: 'a csapat', 'aruló': 'az áruló', 'aruló2': 'a második áruló', nagyur: 'a Nagyúr híve' };
      $('tv').classList.remove('cold', 'warm');
      $('tv').classList.add((e.winners || []).includes('csapat') ? 'warm' : 'cold');
      if (CE.art && CE.art.forEnding) this.showArt(CE.art.forEnding(e.id));
      $('tvPlace').textContent = isNew ? `Új befejezés felfedezve! ${d.endings.length}/10` : `Befejezések: ${d.endings.length}/10`;
      $('tvTitle').textContent = e.name || 'Vége';
      $('tvBody').innerHTML = (e.text || []).map((p) => `<p>${esc(p)}</p>`).join('') + `<p class="shout">Nyert: ${esc((e.winners || []).map((w) => who[w] || w).join(', ') || 'senki')}</p>`;
      $('tvLive').innerHTML = '';
    },

    showTree(data) {
      const d = this.loadDiscovery();
      const seen = new Set(data.history);
      const acts = [[0, 'Prológus'], [1, 'I. Szenteste'], [2, 'II. Karácsony napja'], [3, 'III. Karácsony éjjele']];
      const all = Object.values(CE.SCENES).filter((s) => !/^(DEMO-END|E\d)$/.test(s.id));
      $('tvTitle').textContent = 'A döntési fa';
      $('tvPlace').textContent = `Felfedezett jelenetek: ${all.filter((s) => d.scenes.includes(s.id)).length} / ${all.length} · befejezések: ${d.endings.length} / 10`;
      $('tvBody').innerHTML = acts.map(([a, name]) => `<p><b>${esc(name)}:</b> ${all.filter((s) => s.act === a).map((s) => seen.has(s.id) ? `<span style="color:var(--gold)">${esc(s.title)}</span>` : (d.scenes.includes(s.id) ? `<span style="color:var(--dim)">${esc(s.title)}</span>` : '<span style="color:var(--dim)">?</span>')).join(' · ')}</p>`).join('') + '<p class="muted">Aranyszínnel ez a menet, szürkén a korábbi menetekben látott jelenetek, kérdőjellel a még fel nem fedezettek.</p>';
      $('tvLive').innerHTML = '';
    },

    renderLive(col) {
      this.liveCol = col;
      const live = $('tvLive');
      if (!col) { live.innerHTML = ''; return; }
      const pr = col.prompts && col.prompts.values().next().value;
      if (!pr) return;
      const meta = pr.meta || {};
      // A reflex starts with a jolt on the TV.
      if (pr.reflex && col.answers.size === 0 && this.fxFor !== pr.seq) {
        this.fxFor = pr.seq;
        this.playEffect(/HIDEG/i.test(pr.title || '') ? 'dementor-cold' : 'curse');
      }
      const dots = `<div class="answered">${col.players.map((p) => `<span class="${col.answers.has(p.id) ? 'd' : ''}" title="${esc(p.name)}">${esc(p.name[0])}</span>`).join('')}</div>`;
      if (pr.kind === 'choice' && (meta.type === 'vote' || meta.type === 'suspicion')) {
        const counts = {};
        col.answers.forEach((a) => { if (a && a.k != null) counts[a.k] = (counts[a.k] || 0) + 1; });
        const opts = meta.type === 'suspicion' ? (() => { const m = new Map(); col.prompts.forEach((x) => x.options.forEach((o) => m.set(o.k, o))); return [...m.values()]; })() : pr.options;
        const total = col.players.length || 1;
        live.innerHTML = `<div class="prompt">${esc(pr.title)}</div>` + opts.map((o) => `<div class="vrow"><span class="k">${esc(o.k.length <= 2 ? o.k : '•')}</span><span>${esc(o.t)}<div class="bar" style="width:${((counts[o.k] || 0) / total) * 100}%"></div></span><span class="c">${counts[o.k] || 0}</span></div>`).join('') + dots;
        return;
      }
      const label = pr.kind === 'kozben' || meta.type === 'whisper' ? 'Közben… mindenki titokban választ' : meta.type === 'cross' ? 'Valaki előtt döntés áll…' : pr.kind === 'text' ? 'Mindenki a telefonján válaszol' : pr.kind === 'memory' ? 'Mindenki a boldog emlékére gondol' : pr.title;
      live.innerHTML = `<div class="prompt">${esc(label)}</div>${meta.type === 'cross' ? '' : dots}`;
    },

    renderHud() {
      const g = this.game;
      if (!g) return;
      $('hClock').textContent = g.clockText();
      $('hFeather').textContent = `🪶 ${g.f.dumbledore_hu}/3`;
      $('hFeather').classList.toggle('lit', g.f.dumbledore_hu >= 2);
      $('hFrost').textContent = `❄ ${g.f.ostrom}/8`;
      $('hCandles').textContent = `🕯 ${g.players.filter((p) => p.status !== 'szellem').length}`;
      const o = g.f.ostrom;
      $('frost').style.boxShadow = `inset 0 0 ${o * 1.4}cqw rgba(221,232,240,${o ? 0.1 + o * 0.06 : 0})`;
    },

    renderChips() {
      const g = this.game;
      if (!g) return;
      const tok = (p) => (CE.art && CE.art.player ? `<span class="tok">${CE.art.player(p.name, { status: p.status, index: p.id })}</span>` : '');
      $('tvChips').innerHTML = g.players.map((p) => `<span class="chip ${p.status} ${p.away ? 'away' : ''}">${tok(p)}${esc(p.name)}${STATUS[p.status] ? ' · ' + STATUS[p.status] : ''}${p.away && p.status === 'el' ? ' · távol' : ''}</span>`).join('');
    },

    toast(text, cls = '') {
      const t = document.createElement('div');
      t.className = `toast ${cls}`;
      t.textContent = text;
      $('toasts').appendChild(t);
      setTimeout(() => t.remove(), Math.max(2500, 7000 / Math.sqrt(this.speed)));
      while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    },

    buzz(ids) {
      ids.forEach((id) => {
        const b = document.querySelector(`#tabs button[data-id="${id}"]`);
        if (b) { b.classList.remove('buzz'); void b.offsetWidth; b.classList.add('buzz'); }
      });
    },

    tick() {
      const col = this.liveCol;
      const bar = $('timerBar');
      if (col && col.dl) {
        const now = performance.now();
        const left = Math.max(0, col.dl.t - now);
        const total = Math.max(1, col.dl.t - col.dl.start);
        bar.style.width = `${(left / total) * 100}%`;
      } else bar.style.width = '0';
      const pt = document.querySelector('#phone .ptimer i');
      const e = this.io && this.io.pending.get(this.tab);
      if (pt && e && e.pr.deadline) {
        const left = Math.max(0, e.pr.deadline.t - performance.now());
        pt.style.width = `${Math.min(100, (left / Math.max(1, e.pr.deadline.t - e.pr.deadline.start)) * 100)}%`;
      }
      if (this.game) requestAnimationFrame(() => this.tick());
    },

    renderAll() {
      this.renderHud();
      this.renderChips();
      this.renderTabs();
      this.renderPhone();
      if (this.narratorOn) this.renderNarrator();
    },

    // --- phones ---
    renderTabs() {
      const g = this.game;
      if (!g) return;
      const box = $('tabs');
      box.innerHTML = '';
      g.players.forEach((p) => {
        const b = document.createElement('button');
        b.dataset.id = p.id;
        b.className = `${this.tab === p.id ? 'on' : ''} ${this.io.pending.has(p.id) ? 'wait' : ''}`;
        const st = p.status === 'szellem' ? ' 👻' : p.status === 'haldoklik' ? ' ♥' : p.status === 'dermedt' ? ' ❄' : p.status === 'bezarva' ? ' 🔒' : '';
        b.innerHTML = `${this.humans.has(p.id) ? '👤 ' : ''}${esc(p.name)}${st}${this.unread[p.id] ? `<span class="badge">${this.unread[p.id]}</span>` : ''}`;
        b.onclick = () => { this.tab = p.id; this.renderTabs(); this.renderPhone(); };
        box.appendChild(b);
      });
    },

    renderPhone() {
      const g = this.game;
      if (!g) return;
      if (this.typing) { this.dirty = true; return; }
      const p = g.players[this.tab];
      if (!p) return;
      const role = CE.ROLES[p.role];
      const e = this.io.pending.get(p.id);
      const hearts = p.status === 'szellem' ? 'szellem' : '♥'.repeat(Math.max(0, p.hp)) + '♡'.repeat(Math.max(0, 3 - p.hp));
      let html = `<div class="ph ${p.status === 'szellem' ? 'ghost' : ''}">
        <div class="ph-top"><span class="ph-name">${esc(role.sym)} ${esc(p.name)}</span><span>${hearts}${STATUS[p.status] ? ' · ' + STATUS[p.status] : ''}</span></div>
        <div class="items">${p.items.map((i) => `<span>${esc(CE.ITEMS[i].name)}</span>`).join('')}${g.mapHolder() === p ? '<span>Tekergők Térképe</span>' : ''}</div>
        <div class="ph-row"><button type="button" data-a="pages">${this.showPages[p.id] ? 'Lapjaim elrejtése' : 'Lapjaim'}</button><button type="button" data-a="inbox">Titkos lapok${this.unread[p.id] ? `<span class="badge">${this.unread[p.id]}</span>` : ''}</button>
        <label class="bot-toggle"><input type="checkbox" data-a="bot" ${this.humans.has(p.id) ? '' : 'checked'}> gép játssza</label></div>`;
      if (this.showPages[p.id]) html += CE.pages(g, p).map((pg) => `<div class="page ${pg.style || ''}"><small>${esc(pg.title)}</small>${esc(pg.text)}</div>`).join('');
      if (this.showInbox[p.id]) {
        const last = p.inbox.slice(-6).reverse();
        html += last.length ? last.map((pg) => `<div class="page ${pg.style || ''}"><small>titkos lap · ${esc(pg.scene || '')}</small>${esc(pg.text)}</div>`).join('') : '<p class="idle">Még nincs titkos lapod.</p>';
      }
      html += e ? this.promptHtml(p, e.pr) : `<p class="idle">${p.status === 'szellem' ? 'Szellem vagy. Figyeld a többieket.' : 'Nézd a TV-t.'}</p>`;
      html += '</div>';
      const box = $('phone');
      box.innerHTML = html;
      this.bindPhone(p, e);
    },

    promptHtml(p, pr) {
      const sub = this.sub[p.id];
      const tg = this.toggleSel[p.id] || new Set();
      let h = `<div class="prompt ${pr.reflex ? 'reflex' : ''}"><div class="ptimer"><i></i></div><h4>${esc(pr.title || '')}</h4>`;
      if (pr.kind === 'ack') h += `<button class="opt primary" data-k="ok">${esc(pr.label || 'Rendben')}</button>`;
      else if (pr.kind === 'memory') h += `<textarea id="phText" rows="3" maxlength="200" placeholder="Egy boldog emléked…"></textarea><button class="opt primary" data-a="memok">Kész</button><button class="opt" data-a="memno">Nem írok</button>`;
      else if (pr.kind === 'text') h += `<input id="phText" type="text" maxlength="${pr.maxLen || 25}" placeholder="Rövid válasz"><button class="opt primary" data-a="textok">Küldés</button>`;
      else if (pr.kind === 'volunteer') h += `<button class="opt primary" data-k="yes">${esc(pr.label || 'Vállalom')}</button><button class="opt" data-k="no">Nem</button>`;
      else if (pr.kind === 'kozben' && sub) {
        if (sub === 'give') h += `<label>Mit? <select id="phItem">${pr.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`;
        h += `<label>Kinek? <select id="phTarget">${pr.targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><button class="opt primary" data-a="subok">${sub === 'give' ? 'Átadom' : 'Elküldöm'}</button><button class="opt" data-a="subback">Mégsem</button>`;
      } else {
        if (pr.meta && pr.meta.type === 'whisper') h += `<label>Kinek? <select id="phTarget">${pr.targets.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label>`;
        h += (pr.options || []).map((o) => `<button class="opt" data-k="${esc(o.k)}">${esc(o.t)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</button>`).join('');
        if (pr.toggles && pr.toggles.length) h += `<div class="tog">${pr.toggles.map((t) => `<button type="button" data-tog="${t.id}" class="${tg.has(t.id) ? 'on' : ''}">${esc(t.t)}</button>`).join('')}</div>`;
      }
      if (pr.extendable && this.game.sys('R10')) h += '<button class="opt" data-a="time">+30 mp időt kérek</button>';
      return h + '</div>';
    },

    bindPhone(p, e) {
      const box = $('phone');
      const answer = (a) => { if (!e) return; this.sub[p.id] = null; this.toggleSel[p.id] = new Set(); e.resolve(a); };
      box.querySelectorAll('[data-a="pages"]').forEach((b) => { b.onclick = () => { this.showPages[p.id] = !this.showPages[p.id]; this.renderPhone(); }; });
      box.querySelectorAll('[data-a="inbox"]').forEach((b) => { b.onclick = () => { this.showInbox[p.id] = !this.showInbox[p.id]; this.unread[p.id] = 0; this.renderTabs(); this.renderPhone(); }; });
      box.querySelectorAll('[data-a="bot"]').forEach((c) => { c.onchange = () => { if (c.checked) this.humans.delete(p.id); else this.humans.add(p.id); this.renderTabs(); }; });
      box.querySelectorAll('input[type=text], textarea').forEach((el) => {
        el.onfocus = () => { this.typing = true; };
        el.onblur = () => { this.typing = false; if (this.dirty) { this.dirty = false; setTimeout(() => this.renderPhone(), 0); } };
        el.onkeydown = (ev) => { if (ev.key === 'Enter' && el.tagName === 'INPUT') { ev.preventDefault(); box.querySelector('[data-a="textok"]').click(); } };
      });
      if (!e) return;
      const pr = e.pr;
      box.querySelectorAll('[data-k]').forEach((b) => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (pr.kind === 'kozben' && (k === 'give' || k === 'fake')) { this.sub[p.id] = k; this.renderPhone(); return; }
          const to = pr.meta && pr.meta.type === 'whisper' && $('phTarget') ? +$('phTarget').value : undefined;
          answer({ k, to, toggles: [...(this.toggleSel[p.id] || [])] });
        };
      });
      box.querySelectorAll('[data-tog]').forEach((b) => {
        b.onclick = () => { const s = this.toggleSel[p.id] = this.toggleSel[p.id] || new Set(); if (s.has(b.dataset.tog)) s.delete(b.dataset.tog); else s.add(b.dataset.tog); this.renderPhone(); };
      });
      const act = (name, fn) => { const b = box.querySelector(`[data-a="${name}"]`); if (b) b.onclick = fn; };
      act('memok', () => { this.typing = false; answer({ text: $('phText').value }); });
      act('memno', () => { this.typing = false; answer({ text: null }); });
      act('textok', () => { this.typing = false; answer({ text: $('phText').value }); });
      act('subok', () => { const k = this.sub[p.id]; answer({ k, item: k === 'give' ? $('phItem').value : null, to: +$('phTarget').value }); });
      act('subback', () => { this.sub[p.id] = null; this.renderPhone(); });
      act('time', () => { const ok = this.game.requestTime(this.game.players[p.id]); this.toast(ok ? `${p.name} időt kért.` : 'Most nem lehet időt kérni.'); });
    },

    // --- narrator view ---
    renderNarrator() {
      const g = this.game;
      if (!g || !this.narratorOn) return;
      const rows = g.players.map((p) => {
        const tags = `${p.traitor ? '<span class="tag t">áruló</span>' : ''}${p.traitor2 ? '<span class="tag t">2. áruló</span>' : ''}${p.heir ? '<span class="tag h">Nagyúr híve</span>' : ''}${p.mugli ? '<span class="tag m">mugli</span>' : ''}`;
        const cmd = (p.traitor || p.traitor2) && g.cmd(p) ? `${g.cmd(p)} · kioson: ${p.sneaks} · ell.: ${p.resist}` : '';
        return `<tr><td>${esc(p.name)} ${tags}</td><td>${esc(CE.ROLES[p.role].name)}${p.powerUsed ? ' (erő ✓)' : ''}</td><td>${p.hp} ${esc(STATUS[p.status] || '')}${p.away ? ` · távol ${p.away}` : ''}</td><td>${esc(cmd)}</td><td>${esc(p.items.map((i) => CE.ITEMS[i].name).join(', '))}</td><td>${esc(p.goal ? p.goal.t : '')}</td></tr>`;
      }).join('');
      $('nPlayers').innerHTML = `<table class="ptable"><tr><th>Név</th><th>Szerep</th><th>Élet</th><th>Parancs</th><th>Tárgyak</th><th>Cél</th></tr>${rows}</table>`;
      const flags = Object.entries(g.f).map(([k, v]) => `<span class="${v ? 'on' : ''}">${esc(k)}=${esc(typeof v === 'number' && k === 'terkep' ? g.players[v].name : v)}</span>`).join('');
      $('nFlags').innerHTML = `<div class="flags">${flags}</div><p>Jelenet: ${esc(g.s.scene)} · védelmi pont: ${g.s.defense} · erők várnak: ${esc(g.s.powersPending.join(', ') || '–')} · időkérés: ${g.s.extensions} · jóslatgömb: ${esc(g.s.visionScene[g.s.act] || '–')}</p>`;
    },

    appendLog(entry) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="k">${esc(entry.t)} ${esc(entry.kind)}</span> ${esc(entry.text)}`;
      const log = $('nLog');
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 400) log.lastChild.remove();
      if (this.narratorOn) this.renderNarrator();
    },

    // --- batch ---
    async runBatch() {
      const runs = Math.max(10, +$('bRuns').value || 200);
      $('batchBtn').disabled = true;
      $('bResult').innerHTML = '';
      const t0 = performance.now();
      const stats = await CE.runBatch({ runs, seed: +$('sSeed').value || 1000, settings: { systems: this.systems() } }, (i, n) => { $('bProgress').textContent = `${i} / ${n} menet…`; });
      $('bProgress').textContent = `${stats.runs} menet kész, ${((performance.now() - t0) / 1000).toFixed(1)} mp alatt.`;
      $('batchBtn').disabled = false;
      $('bResult').innerHTML = this.batchHtml(stats);
    },

    batchHtml(s) {
      const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
      const byCount = Object.entries(s.byCount).map(([n, c]) => `<tr><td>${n} fő</td><td>${c.runs}</td><td>${(c.cmdOk / c.runs).toFixed(2)}</td><td>${pct(c.caught, c.runs)}</td><td>${(c.deaths / c.runs).toFixed(2)}</td><td>${c.finished ? pct(c.evilWins, c.finished) : '–'}</td></tr>`).join('');
      const endings = Object.entries(s.endings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td><td>${pct(v, s.finished)}</td></tr>`).join('');
      const cmd = Object.entries(s.cmd).map(([k, c]) => `<tr><td>${k}: ${esc(CE.COMMANDS[k].short)}</td><td>${pct(c.ok, c.n)}</td></tr>`).join('');
      const goals = Object.entries(s.goals).map(([k, c]) => `<tr><td>${esc(k)}</td><td>${c.later ? 'később dől el' : pct(c.ok, c.n)}</td></tr>`).join('');
      const errs = s.errors.length ? `<p class="bad">Hibák: ${s.errors.length}</p><ul>${s.errors.slice(0, 8).map((e) => `<li>${esc(e.kind)} ${esc(e.scene || e.id || '')}: ${esc(e.message || '')}</li>`).join('')}</ul>` : '<p class="ok">Hiba nem volt.</p>';
      return `${errs}
        ${s.finished ? `<table class="stat-table"><tr><th>Befejezés</th><th>Menet</th><th>Arány</th></tr>${endings}</table><p>Bellatrix oldala nyert: ${pct(s.evilWins, s.finished)} · második érintés: ${s.secondTouch} menetben</p>` : ''}
        <table class="stat-table"><tr><th>Létszám</th><th>Menet</th><th>Teljesült parancs / menet</th><th>Az árulót bezárták</th><th>Halál / menet</th><th>Bellatrix nyert</th></tr>${byCount}</table>
        <table class="stat-table"><tr><th>Parancs</th><th>Teljesült</th></tr>${cmd}</table>
        <table class="stat-table"><tr><th>Gyanú-szavazás</th><th></th></tr><tr><td>eltalálta az árulót</td><td>${s.suspicion.correct}</td></tr><tr><td>ártatlant zárt be</td><td>${s.suspicion.wrong}</td></tr><tr><td>nem zárt be senkit</td><td>${s.suspicion.none}</td></tr></table>
        <table class="stat-table"><tr><th>Egyéb, menetenként</th><th></th></tr>
          <tr><td>kiosonás</td><td>${(s.sneaks / s.runs).toFixed(2)}</td></tr>
          <tr><td>dermedés</td><td>${(s.frozen / s.runs).toFixed(2)}</td></tr>
          <tr><td>jóslatgömb</td><td>${(s.visions / s.runs).toFixed(2)}</td></tr>
          <tr><td>védelmi pont</td><td>${(s.defense / s.runs).toFixed(2)}</td></tr>
          <tr><td>ostrom (dér) a felvonás végén</td><td>${(s.ostrom / s.runs).toFixed(2)}</td></tr>
          <tr><td>útkereszteződések</td><td>${esc(JSON.stringify(s.cross))}</td></tr></table>
        <table class="stat-table"><tr><th>Személyes cél</th><th>Teljesült</th></tr>${goals}</table>
        <p>Le nem játszott jelenetek: ${s.unvisited.length ? esc(s.unvisited.join(', ')) : 'nincs'}</p>`;
    }
  };

  CE.ui = ui;
  CE.TestIO = TestIO;
  CE.tts = tts;
  window.addEventListener('DOMContentLoaded', () => ui.initSetup());
})(window.CE = window.CE || {});
