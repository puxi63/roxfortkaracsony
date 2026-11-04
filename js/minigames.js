// Phone mini-games: configs (made by the engine with its seeded rng), the phone UI, the TV picture and bot results.
// Used by the TV page (test-mode phones, TV, bots) and by telefon.html (real phones).
(function (CE) {
  'use strict';

  const now = () => performance.now();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Wand movements as normalised checkpoints (0..1), traced in order.
  const circle = (n) => Array.from({ length: n + 1 }, (_, i) => [0.5 + 0.32 * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n), 0.5 + 0.32 * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n)]);
  const SHAPES = {
    swish: [[0.12, 0.7], [0.3, 0.42], [0.52, 0.32], [0.72, 0.42], [0.66, 0.62], [0.86, 0.22]],
    zigzag: [[0.12, 0.25], [0.38, 0.72], [0.62, 0.28], [0.88, 0.75]],
    loop: circle(8),
    bolt: [[0.62, 0.1], [0.36, 0.5], [0.64, 0.5], [0.38, 0.9]]
  };
  const SPELLS = { Reparo: 'loop', Bombarda: 'bolt', Immobilus: 'zigzag', Capitulatus: 'swish' };

  // Antidote ingredients and the clues the TV gives for them.
  const INGREDIENTS = {
    'Szárított csalán': 'valami, ami szúr, és már ki is száradt',
    'Kígyófog': 'valami egy hüllő szájából',
    'Szarvas csiga': 'valami lassú, ami házat hord a hátán',
    'Sündisznótüske': 'valami tüskés, egy kis erdei állattól',
    'Mandragóragyökér': 'egy gyökér, ami sikolt, ha kihúzzák',
    'Unikornisszőr': 'valami ezüstös, egy fehér lény sörényéből'
  };

  const TITLES = {
    ritmus: 'Expecto Patronum! Koppints a fényre!',
    lopakodas: 'Lopakodj, amíg háttal van!',
    parbaj: 'Párbaj! Várd ki a jelet!',
    palca: 'Rajzold le a pálcamozdulatot!',
    terkep: 'Nézd a TV-t, és jegyezd meg, ki hol van!'
  };

  function make(game, rng, opts = {}) {
    switch (game) {
      case 'ritmus': {
        const beats = 6;
        const interval = 720;
        const lead = 1500;
        return { beats, interval, lead, window: opts.memory ? 175 : 135, total: lead + beats * interval + 900 };
      }
      case 'lopakodas': {
        // alert: the watcher turns more often (e.g. after a sneeze).
        const turns = [];
        const end = 15000;
        const gap = opts.alert ? 900 : 1300;
        const spread = opts.alert ? 1300 : 1900;
        let t = 1800 + rng.int(800);
        while (t < end - 1200) {
          const look = 1100 + rng.int(900);
          turns.push([t, t + look]);
          t += look + gap + rng.int(spread);
        }
        return { goal: 14, turns, total: end, watcher: opts.watcher || 'Mrs. Norris', char: opts.char || 'mrs-norris' };
      }
      case 'parbaj': {
        const delay = 1800 + rng.int(2600);
        return { delay, npc: opts.npc || 420, foe: opts.foe || 'Bellatrix', total: delay + 2300 };
      }
      case 'palca': {
        const spell = opts.spell || 'Reparo';
        return { spell, shape: SPELLS[spell] || 'swish', total: 9000 };
      }
      case 'terkep':
        // answer is only for bots and the engine; net.js strips it before a prompt goes to a phone.
        return { showMs: 5200, places: opts.places || [], question: opts.question || '', options: opts.options || [], answer: opts.answer, total: 5200 + 12000 };
      default:
        return { total: 5000 };
    }
  }

  // Result when a player does not play (timeout).
  function worst(game) {
    return { ritmus: { score: 0 }, lopakodas: { steps: 0, caught: false }, parbaj: { reaction: null, falseStart: false }, palca: { score: 0 }, terkep: { k: null } }[game] || {};
  }

  // ---------- the phone side ----------

  // Mounts a mini-game into el. startAt is the local time the game started (performance.now() clock).
  function mount(el, pr, done, startAt) {
    const cfg = pr.cfg || {};
    const t0 = startAt == null ? now() : startAt;
    let finished = false;
    let raf = 0;
    const finish = (r) => { if (finished) return; finished = true; cancelAnimationFrame(raf); done(r); };
    const loop = (fn) => { const step = () => { if (finished) return; fn(now() - t0); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };

    if (pr.game === 'ritmus') {
      el.innerHTML = '<div class="mg mg-ritmus"><p class="mg-h">Koppints, amikor az ezüst kör felvillan!</p><button type="button" class="mg-pulse" aria-label="Koppintás"></button><p class="mg-s">Készülj…</p></div>';
      const btn = el.querySelector('.mg-pulse');
      const info = el.querySelector('.mg-s');
      const used = new Set();
      let hits = 0;
      const beatAt = (i) => cfg.lead + i * cfg.interval;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const t = now() - t0;
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < cfg.beats; i++) { const d = Math.abs(t - beatAt(i)); if (!used.has(i) && d < bd) { bd = d; best = i; } }
        if (best >= 0 && bd <= cfg.window) { used.add(best); hits += 1; btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 160); }
        else { btn.classList.add('miss'); setTimeout(() => btn.classList.remove('miss'), 160); }
        info.textContent = `${hits} / ${cfg.beats}`;
      });
      loop((t) => {
        let near = Infinity;
        for (let i = 0; i < cfg.beats; i++) near = Math.min(near, Math.abs(t - beatAt(i)));
        const glow = clamp(1 - near / 260, 0, 1);
        btn.style.setProperty('--glow', glow.toFixed(2));
        if (t > cfg.total - 400) finish({ score: hits / cfg.beats });
      });
    } else if (pr.game === 'lopakodas') {
      el.innerHTML = `<div class="mg mg-norris"><p class="mg-h">Lépj, amíg ${esc(cfg.watcher || 'Mrs. Norris')} háttal van! Ha néz, ne mozdulj.</p><p class="mg-cat">Háttal van</p><div class="mg-bar"><i></i></div><button type="button" class="mg-big">Lépek</button></div>`;
      const cat = el.querySelector('.mg-cat');
      const bar = el.querySelector('.mg-bar i');
      const btn = el.querySelector('.mg-big');
      let steps = 0;
      const state = (t) => {
        for (const [a, b] of cfg.turns) {
          if (t >= a - 380 && t < a) return 'warn';
          if (t >= a && t < b) return 'look';
        }
        return 'safe';
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const t = now() - t0;
        // A little grace right after she turns, so network lag does not punish.
        const looking = cfg.turns.some(([a, b]) => t >= a + 250 && t < b);
        steps += 1;
        bar.style.width = `${(steps / cfg.goal) * 100}%`;
        if (looking) { cat.textContent = 'Észrevett!'; finish({ steps, caught: true }); return; }
        if (steps >= cfg.goal) finish({ steps, caught: false, done: true });
      });
      loop((t) => {
        const s = state(t);
        cat.textContent = s === 'look' ? 'NÉZ! Ne mozdulj!' : s === 'warn' ? 'Megmozdul…' : 'Háttal van';
        cat.className = `mg-cat ${s}`;
        if (t > cfg.total) finish({ steps, caught: false });
      });
    } else if (pr.game === 'parbaj') {
      el.innerHTML = `<div class="mg mg-duel"><p class="mg-h">Párbaj: ${esc(cfg.foe)}. Ne üss előre!</p><button type="button" class="mg-big wait">Várj a jelre…</button></div>`;
      const btn = el.querySelector('.mg-big');
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const t = now() - t0;
        if (t < cfg.delay) { btn.textContent = 'Túl korán!'; btn.className = 'mg-big bad'; finish({ reaction: null, falseStart: true }); return; }
        const reaction = Math.round(t - cfg.delay);
        btn.textContent = `${reaction} ms`;
        finish({ reaction, falseStart: false });
      });
      loop((t) => {
        if (t >= cfg.delay && !btn.classList.contains('go')) { btn.className = 'mg-big go'; btn.textContent = 'MOST! Capitulatus!'; }
        if (t > cfg.delay + 2000) finish({ reaction: null, falseStart: false });
      });
    } else if (pr.game === 'palca') {
      el.innerHTML = `<div class="mg mg-wand"><p class="mg-h">${esc(cfg.spell)}! Húzd végig az ujjad a vonalon, a számok sorrendjében.</p><canvas class="mg-canvas"></canvas><p class="mg-s"></p></div>`;
      const cv = el.querySelector('canvas');
      const info = el.querySelector('.mg-s');
      const size = Math.min(320, Math.max(220, el.clientWidth || 300));
      const dpr = window.devicePixelRatio || 1;
      cv.width = size * dpr;
      cv.height = size * dpr;
      cv.style.width = `${size}px`;
      cv.style.height = `${size}px`;
      const ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      const pts = SHAPES[cfg.shape] || SHAPES.swish;
      let reached = 0;
      let drawing = false;
      const trail = [];
      const draw = () => {
        ctx.clearRect(0, 0, size, size);
        ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(214,178,97,.25)';
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * size, y * size) : ctx.moveTo(x * size, y * size))); ctx.stroke();
        // Drawn last-to-first, so where a loop closes on its start the "1" stays on top.
        pts.map((pt, i) => [pt, i]).reverse().forEach(([[x, y], i]) => {
          ctx.fillStyle = i < reached ? '#58b091' : 'rgba(214,178,97,.8)';
          ctx.beginPath(); ctx.arc(x * size, y * size, 9, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#0c1210'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), x * size, y * size);
        });
        ctx.strokeStyle = '#dde8f0'; ctx.lineWidth = 4;
        ctx.beginPath(); trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      };
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const visit = ([x, y]) => {
        if (reached >= pts.length) return;
        const [px, py] = pts[reached];
        if (Math.hypot(x / size - px, y / size - py) < 0.13) reached += 1;
      };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; trail.length = 0; reached = 0; const p = pos(e); trail.push(p); visit(p); draw(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); trail.push(p); visit(p); draw(); });
      cv.addEventListener('pointerup', () => {
        if (!drawing) return;
        drawing = false;
        const score = reached / pts.length;
        info.textContent = score >= 0.99 ? 'Tökéletes!' : `${reached} / ${pts.length} pont`;
        if (trail.length > 3) finish({ score });
      });
      draw();
      loop((t) => { if (t > cfg.total) finish({ score: reached / pts.length }); });
    } else if (pr.game === 'terkep') {
      el.innerHTML = '<div class="mg mg-map"><p class="mg-h">Nézd a TV-t! Jegyezd meg, ki hol van a térképen.</p><div class="mg-q"></div></div>';
      const q = el.querySelector('.mg-q');
      let asked = false;
      loop((t) => {
        if (!asked && t >= cfg.showMs) {
          asked = true;
          q.innerHTML = `<h4>${esc(cfg.question)}</h4>${cfg.options.map((o) => `<button type="button" class="opt" data-k="${esc(o.k)}">${esc(o.t)}</button>`).join('')}`;
          q.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => finish({ k: b.dataset.k }); });
        }
        if (t > cfg.total) finish({ k: null });
      });
    } else {
      el.innerHTML = '<p class="idle">Ismeretlen játék.</p>';
      finish({});
    }
    return { stop() { finished = true; cancelAnimationFrame(raf); } };
  }

  // ---------- the TV side ----------

  function tv(el, pr, startAt) {
    const cfg = pr.cfg || {};
    const t0 = startAt == null ? now() : startAt;
    let stopped = false;
    let raf = 0;
    const loop = (fn) => { const step = () => { if (stopped) return; fn(now() - t0); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };

    if (pr.game === 'ritmus') {
      el.innerHTML = '<div class="mgtv mgtv-ritmus"><div class="mgtv-ring"></div><p>Expecto Patronum! Koppintsatok, amikor felvillan!</p></div>';
      const ring = el.querySelector('.mgtv-ring');
      loop((t) => {
        let near = Infinity;
        for (let i = 0; i < cfg.beats; i++) near = Math.min(near, Math.abs(t - (cfg.lead + i * cfg.interval)));
        ring.style.setProperty('--glow', clamp(1 - near / 260, 0, 1).toFixed(2));
      });
    } else if (pr.game === 'lopakodas') {
      const cat = CE.art && CE.art.character ? CE.art.character(cfg.char || 'mrs-norris') : '';
      el.innerHTML = `<div class="mgtv mgtv-norris"><div class="mgtv-cat">${cat}</div><p class="mgtv-who">${esc(cfg.watcher || 'Mrs. Norris')}</p><p class="mgtv-state">Háttal van</p></div>`;
      const box = el.querySelector('.mgtv-norris');
      const label = el.querySelector('.mgtv-state');
      loop((t) => {
        let s = 'safe';
        for (const [a, b] of cfg.turns) { if (t >= a - 380 && t < a) s = 'warn'; if (t >= a && t < b) s = 'look'; }
        box.dataset.state = s;
        label.textContent = s === 'look' ? 'NÉZ!' : s === 'warn' ? 'Megmozdul…' : 'Háttal van';
      });
    } else if (pr.game === 'parbaj') {
      el.innerHTML = `<div class="mgtv mgtv-duel"><p class="mgtv-big">Várj…</p><p>${esc(cfg.foe)} pálcája felemelkedik.</p></div>`;
      const big = el.querySelector('.mgtv-big');
      loop((t) => {
        if (t < cfg.delay) big.textContent = t < 900 ? 'Várj…' : 'Vááárj…';
        else { big.textContent = 'MOST!'; big.classList.add('go'); }
      });
    } else if (pr.game === 'palca') {
      const pts = SHAPES[cfg.shape] || SHAPES.swish;
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 100).toFixed(1)} ${(y * 100).toFixed(1)}`).join(' ');
      el.innerHTML = `<div class="mgtv mgtv-wand"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" /></svg><p class="mgtv-big">${esc(cfg.spell)}!</p></div>`;
    } else if (pr.game === 'terkep') {
      el.innerHTML = `<div class="mgtv mgtv-map"><div class="mgtv-grid">${cfg.places.map((pl) => `<div class="mgtv-place"><b>${esc(pl.name)}</b><span>${pl.who.map(esc).join(', ') || '—'}</span></div>`).join('')}</div></div>`;
      const grid = el.querySelector('.mgtv-grid');
      loop((t) => { if (t >= cfg.showMs && !grid.classList.contains('gone')) { grid.classList.add('gone'); el.querySelector('.mgtv-map').insertAdjacentHTML('beforeend', `<p class="mgtv-big">${esc(cfg.question)}</p>`); } });
    }
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }

  // ---------- bots ----------

  function bot(game, cfg, rng, p, evil) {
    const r = () => rng.next();
    switch (game) {
      case 'ritmus': return { score: clamp(0.3 + r() * 0.65 + (p.memory ? 0.08 : 0) - (evil && r() < 0.3 ? 0.4 : 0), 0, 1) };
      case 'lopakodas': {
        if (r() < (cfg.watcher === 'Frics' ? 0.28 : 0.22)) return { steps: 3 + Math.floor(r() * 8), caught: true };
        const done = r() < 0.8;
        return { steps: done ? cfg.goal : 6 + Math.floor(r() * 7), caught: false, done };
      }
      case 'parbaj': return r() < 0.07 ? { reaction: null, falseStart: true } : { reaction: Math.round(260 + r() * 380 - (p.role === 'parbajozo' ? 40 : 0)), falseStart: false };
      case 'palca': return { score: clamp(0.35 + r() * 0.62 - (evil && r() < 0.3 ? 0.3 : 0), 0, 1) };
      case 'terkep': return { k: cfg.answer != null && r() < 0.68 ? cfg.answer : (cfg.options[Math.floor(r() * cfg.options.length)] || {}).k };
      default: return {};
    }
  }

  CE.mini = { make, worst, mount, tv, bot, TITLES, SHAPES, SPELLS, INGREDIENTS };
})(window.CE = window.CE || {});
