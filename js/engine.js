// Game engine: runs the scene graph from js/story-*.js against an IO layer.
// The IO layer is either the test-mode UI (TestIO) or the headless batch runner (BatchIO);
// later the PeerJS phone transport will implement the same interface.
(function (CE) {
  'use strict';

  class Cancelled extends Error {}
  CE.Cancelled = Cancelled;
  CE.SCENES = CE.SCENES || {};
  CE.EVENTS = CE.EVENTS || {};

  const LOCKED_TYPES = ['ack', 'memory', 'text', 'suspicion', 'none'];

  class Game {
    constructor({ settings, io, seed }) {
      this.settings = settings;
      this.io = io;
      this.seed = seed;
      this.rng = new CE.Rng(seed);
      this.sc = CE.scale(settings.count);
      this.token = 0;
      this.promptSeq = 0;
      this.snaps = [];
      this.cur = null;
      this.curCollect = null;
    }

    get f() { return this.s.flags; }
    get players() { return this.s.players; }
    sys(code) { return !this.settings.systems || this.settings.systems[code] !== false; }

    // ---------- setup ----------

    setup() {
      const n = this.settings.count;
      const rng = this.rng;
      let roles = rng.shuffle(Object.keys(CE.ROLES)).slice(0, n);
      if (this.sc.forceHealer && !roles.includes('gyengelkedo')) roles[rng.int(n)] = 'gyengelkedo';
      const pats = rng.shuffle(CE.PATRONUS);
      const players = [];
      for (let i = 0; i < n; i++) {
        players.push({
          id: i, name: (this.settings.names && this.settings.names[i]) || CE.NAMES[i], role: roles[i],
          hp: 3, status: 'el', away: 0, absentNow: false, items: [], mugli: false,
          traitor: false, traitor2: false, heir: false, patronus: pats[i], memory: false, patronusBonus: 0,
          powerUsed: false, healsThisAct: 0, sneaks: 0, wand: true, goal: null, resist: 0, cmds: {},
          knownMugli: [], fakeUsed: false, bigVoteUsed: false, crossUsed: false, sawDeath: false,
          investigated: false, spottedBy: [], dyingCause: null, personality: rng.pick(['ovatos', 'bator', 'veletlen']),
          stats: { saves: 0, patronusOk: 0, patronusFail: 0, frozen: 0, giftsGiven: 0, volunteered: 0, wounds: 0, skippedTogether: 0, loneVote: 0, prefectSame: 0 },
          inbox: []
        });
      }
      const forced = this.settings.forceTraitor;
      const tIdx = forced != null && forced >= 0 && forced < n ? forced : rng.int(n);
      players[tIdx].traitor = true;
      if (this.sc.heir) rng.pick(players.filter((p) => !p.traitor)).heir = true;
      rng.shuffle(players.filter((p) => !p.heir)).slice(0, this.sc.mugli).forEach((p) => { p.mugli = true; });
      const goals = rng.shuffle(CE.GOALS);
      players.forEach((p) => {
        if (p.heir) p.goal = rng.pick(CE.HEIR_GOALS);
        else if (!p.traitor) p.goal = goals.pop();
      });
      const map = players.find((p) => p.role === 'csinytevo');
      this.s = {
        players, act: 0, scene: null, clock: 16 * 60, history: [], log: [],
        flags: {
          boszorkany_nyitva: 0, boszorkany_lezarva: 0, ablak_nyitva: 0, ablak_lezarva: 0,
          terkep: map ? map.id : 'frics_fiok', bellatrix_ismert: 0, belso_arulo: 0, frics_gyanakszik: 0,
          dumbledore_hu: 0, ostrom: 0, hagrid_halas: 0, jokedv: 0, pihent: 0, konyv_nyom: 0, hagrid_figyel: 0,
          palca_orzo: null, or: null
        },
        defense: 0, powersPending: [], powersUsed: 0, extensions: 0, extensionBy: [],
        qa: [], sceneLog: {}, eventsPlan: [], visionScene: {}, visionsSeen: [], crossCount: {},
        forcedSpot: null, excludeStar: null, lastAlone: [], missing: null, cmdResults: {}, deaths: []
      };
      this.log('setup', `Létszám: ${n}, seed: ${this.seed}, áruló: ${players[tIdx].name}`);
      return this.s;
    }

    // ---------- queries used by story data ----------

    // s.group limits the scene to part of the team (used when the team splits up).
    present() { const grp = this.s.group; return this.players.filter((p) => p.status === 'el' && p.away === 0 && (!grp || grp.includes(p.id))); }
    living() { return this.players.filter((p) => p.status !== 'szellem'); }
    ghosts() { return this.players.filter((p) => p.status === 'szellem'); }
    byRole(role) { return this.players.find((p) => p.role === role && p.status !== 'szellem'); }
    presentRole(role) { return this.present().find((p) => p.role === role); }
    traitors() { return this.players.filter((p) => p.traitor || p.traitor2); }
    isEvil(p) { return p.traitor || p.traitor2 || p.heir; }
    cmd(p) { return p.cmds[this.s.act]; }
    cmdNow(code) { return this.traitors().some((p) => p.cmds[this.s.act] === code); }
    mapHolder() { return typeof this.f.terkep === 'number' ? this.players[this.f.terkep] : null; }
    moveMap(p) { this.f.terkep = p ? p.id : 'frics_fiok'; }
    didWatch(p) { return !!(this.cur && this.cur.d && this.cur.d.watchers.some((w) => w.p === p)); }
    helpersHalf(d) { return d.helpers >= Math.ceil(Math.max(1, d.presentCount) / 2); }
    sab(d, id) { return d.sabs.some((a) => a.id === id); }
    chance(pct) { return this.rng.chance(pct); }
    has(p, item) { return p.items.includes(item); }
    roleName(p) { return CE.ROLES[p.role].name; }
    clockText() { const m = ((this.s.clock % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

    // ---------- state changes used by story data ----------

    say(text) { if (this.cur && text) this.cur.out.push(text); }
    log(kind, text) {
      const entry = { t: this.s ? this.clockText() : '', scene: this.s ? this.s.scene : null, kind, text };
      if (this.s) this.s.log.push(entry);
      this.io.log(entry);
    }

    secret(p, text, kind = 'igaz', style = 'normal') {
      if (!p) return;
      const page = { text, kind, style, scene: this.s.scene, seq: ++this.promptSeq };
      p.inbox.push(page);
      this.io.secret(p, page);
      if (this.sys('R11')) this.io.vibrate(this.players, 'page');
      this.log('lap', `${p.name}: ${text}`);
    }

    add(flag, delta) {
      const lim = { ostrom: [0, 8], dumbledore_hu: [0, 3], frics_gyanakszik: [0, 3] }[flag] || [-999, 999];
      this.f[flag] = Math.max(lim[0], Math.min(lim[1], (this.f[flag] || 0) + delta));
    }

    giveItem(p, item) { p.items.push(item); }
    takeItem(p, item) { const i = p.items.indexOf(item); if (i >= 0) p.items.splice(i, 1); return i >= 0; }

    wound(p, cause = 'seb') {
      if (!p || p.status !== 'el') return;
      if (this.takeItem(p, 'pulover')) { this.say(`${p.name} Weasley-pulóvere elnyelte az ütést.`); return; }
      p.hp -= 1;
      p.stats.wounds += 1;
      if (this.cur) this.cur.ev.wounded.push(p);
      this.log('seb', `${p.name} megsebesült (${p.hp} élet).`);
      if (p.hp <= 0) this.dying(p, cause);
    }

    dying(p, cause = 'atok') {
      if (!p || p.status === 'szellem') return;
      p.status = 'haldoklik';
      p.hp = 0;
      p.dyingCause = cause;
      this.markHurt(p);
      if (this.cur) this.cur.ev.dying.push(p);
      this.present().forEach((x) => { x.witnessedDying = (x.witnessedDying || []).concat(p.id); });
      if (this.s.act === 3) this.add('ostrom', 1);
      if (this.sys('R11')) this.io.vibrate([p], 'heart');
      this.log('haldoklik', `${p.name} haldoklik (${cause}).`);
    }

    freeze(p) {
      if (!p || p.status !== 'el') return;
      p.status = 'dermedt';
      p.stats.frozen += 1;
      this.markHurt(p);
      if (this.cur) this.cur.ev.frozen.push(p);
      if (this.sys('R11')) this.io.vibrate([p], 'cold');
      this.log('dermedt', `${p.name} megdermedt.`);
      this.secret(p, `Mielőtt minden elsötétült: ${this.trueClue(p)}`, 'igaz');
    }

    revive(p, by) {
      if (!p) return;
      if (p.status === 'dermedt') p.status = 'el';
      else if (p.status === 'haldoklik') { p.status = 'el'; p.hp = 1; p.dyingCause = null; p.rescueRounds = 0; }
      if (by && by !== p) {
        by.stats.saves += 1;
        if (p.traitor || p.traitor2) this.resist(p, 2);
      }
      this.log('mentés', `${p.name} megmenekült${by ? ` (${by.name})` : ''}.`);
    }

    heal(p, n = 1) { if (p && p.status === 'el') p.hp = Math.min(3, p.hp + n); }

    // Records that a muggle-born was hurt in this act (command K5).
    markHurt(p) {
      if (!p.mugli) return;
      this.s.mugliHurt = this.s.mugliHurt || {};
      this.s.mugliHurt[this.s.act] = true;
    }

    // Opens the first passage that is not sealed; returns its key or null (command K7 and similar).
    openPassage(prefer) {
      const order = prefer ? [prefer, 'boszorkany', 'fuz', 'vadkan'] : ['boszorkany', 'fuz', 'vadkan'];
      for (const k of order) {
        if (!this.f[`${k}_lezarva`]) { this.f[`${k}_nyitva`] = 1; return k; }
      }
      return null;
    }

    openPassages() { return ['boszorkany', 'fuz', 'vadkan'].filter((k) => this.f[`${k}_nyitva`] && !this.f[`${k}_lezarva`]); }

    resist(p, n) {
      if (p && (p.traitor || p.traitor2)) { p.resist += n; this.log('ellenállás', `${p.name} ellenállása: ${p.resist}`); }
    }

    defense(reason) {
      if (!this.sys('R8')) return;
      this.s.defense += 1;
      const power = CE.POWERS[Math.min(this.s.defense, CE.POWERS.length) - 1];
      this.s.powersPending.push(power);
      this.say(`Védelmi pont: ${reason}. Feloldva: ${CE.POWER_NAMES[power]}.`);
      this.log('védelem', `${reason} → ${CE.POWER_NAMES[power]}`);
    }

    lockUp(p, scenes) {
      p.status = 'bezarva';
      p.away = scenes;
      this.log('pince', `${p.name} a pincébe került.`);
    }

    // A true clue for a frozen or dying player, from what the team may not know yet.
    trueClue() {
      const t = this.players.find((p) => p.traitor);
      const opts = [];
      const actScenes = this.s.history.filter((id) => (CE.SCENES[id] || {}).act === this.s.act);
      if (t && actScenes.some((id) => (this.s.sceneLog[id] || []).some((a) => a.actor === t.id))) {
        opts.push(`${this.roleName(t).toLowerCase()} szerepű diák nem volt veletek, amikor elindultatok.`);
      }
      if (!this.f.bellatrix_ismert) opts.push('láttad a halálfaló álarca mögött a szemét. Egy nő volt. Nevetett.');
      if (this.cmdNow('K1')) opts.push('hallottad, ahogy valaki a sötétben azt suttogja: Dissendium.');
      if (this.cmdNow('K3')) opts.push('láttad: az üvegszilánkok kint voltak a párkányon. Belülről törték be.');
      if (!opts.length) opts.push('a hideg nem az ablak felől jött, hanem a lépcső felől.');
      return this.rng.pick(opts);
    }

    text(x) {
      const v = typeof x === 'function' ? x(this) : x;
      if (!v) return [];
      return (Array.isArray(v) ? v : [v]).filter(Boolean);
    }

    check(tok) { if (tok !== this.token) throw new Cancelled(); }

    // ---------- snapshots ----------

    snapshot(label, sceneId) {
      const scene = sceneId || this.s.scene;
      const snap = { scene, label: label || `${scene} · ${this.clockText()}`, state: JSON.stringify(this.s, (k, v) => (k === 'goal' && v ? v.id : v)), rng: this.rng.state, at: Date.now() };
      this.snaps.push(snap);
      if (this.snaps.length > 150) this.snaps.shift();
      return snap;
    }

    restore(snap) {
      this.s = JSON.parse(snap.state);
      // Goals hold check functions, so they are stored by id and looked up again.
      const all = CE.GOALS.concat(CE.HEIR_GOALS);
      this.s.players.forEach((p) => { if (p.goal) p.goal = all.find((x) => x.id === p.goal) || null; });
      this.rng.state = snap.rng;
    }

    // ---------- main loop ----------

    async run(from) {
      const tok = ++this.token;
      let id = from;
      try {
        while (id) {
          if (!CE.SCENES[id]) { this.s.missing = id; this.io.missing(id); return { end: 'missing', id }; }
          id = await this.scene(id, tok);
        }
        return { end: 'done' };
      } catch (e) {
        if (e instanceof Cancelled) return { end: 'cancelled' };
        this.io.error(e, this.s && this.s.scene);
        return { end: 'error', error: e, scene: this.s && this.s.scene };
      }
    }

    // Cancel the running flow (jump, snapshot load, new game).
    stop() { this.token += 1; this.curCollect = null; }

    async scene(id, tok) {
      const sc = CE.SCENES[id];
      const s = this.s;
      // Snapshot before any change, so loading it replays this scene from the start.
      this.snapshot(`${id} · ${sc.title || ''} · ${this.clockText()}`, id);
      s.scene = id;
      if (sc.act != null && sc.act !== s.act) this.startAct(sc.act);
      s.history.push(id);
      this.players.forEach((p) => { p.absentNow = p.away > 0; });
      if (sc.clock) s.clock += sc.clock;
      if (sc.clockSet != null) s.clock = sc.clockSet;
      this.cur = { id, sc, out: [], ev: { frozen: [], wounded: [], dying: [] }, d: null, halfWatch: false, noSneak: false };
      if (s.noSneakNext) { this.cur.noSneak = true; s.noSneakNext = false; }
      s.sceneLog[id] = s.sceneLog[id] || [];
      if (sc.enter) sc.enter(this);
      const dec = typeof sc.decision === 'function' ? sc.decision(this) : sc.decision;
      this.io.update();

      await this.io.narrate({ scene: sc, id, paragraphs: this.text(sc.narr), music: sc.music });
      this.check(tok);
      if (sc.secrets) (sc.secrets(this) || []).forEach((x) => x && this.secret(x.to, x.text, x.kind, x.style));
      if (sc.before) await sc.before(this, tok);
      this.check(tok);

      let d = { key: null, option: null, helpers: 0, presentCount: this.present().length, sabs: [], sneaks: [], fakes: [], watchers: [], per: {} };
      this.cur.d = d;
      if (dec) Object.assign(d, await this.decide(dec, tok));
      this.check(tok);
      if (sc.afterDecision) sc.afterDecision(this, d);
      if (sc.kozben && this.present().length) await this.kozben(sc.kozben, d, tok);
      this.check(tok);

      if (d.option && d.option.res) { const r = d.option.res(this, d); if (typeof r === 'string') this.say(r); }
      if (sc.resolve) { const r = sc.resolve(this, d); if (typeof r === 'string') this.say(r); }
      d.sabs.forEach((a) => { if (a.fx) a.fx(this, d, this.players[a.actor]); });
      this.resolveSneaks(d);
      this.resolveSpotting(d);
      if (sc.postSecrets) (sc.postSecrets(this, d) || []).forEach((x) => x && this.secret(x.to, x.text, x.kind, x.style));
      this.s.lastAlone = d.alone || [];

      await this.io.result({ scene: sc, id, d, out: this.cur.out.slice() });
      this.check(tok);
      if (sc.after) await sc.after(this, d, tok);
      this.check(tok);
      await this.rescue(tok);
      await this.afterScene(sc, d, tok);

      this.players.forEach((p) => {
        if (p.absentNow && p.away > 0) {
          p.away -= 1;
          if (p.away === 0 && p.status === 'bezarva') p.status = 'el';
        }
      });
      const next = (d.option && d.option.next) || (typeof sc.next === 'function' ? sc.next(this, d) : sc.next);
      this.io.update();
      return next;
    }

    startAct(act) {
      this.s.act = act;
      this.players.forEach((p) => {
        p.healsThisAct = 0;
        if (p.traitor || p.traitor2) {
          const pool = CE.COMMANDS_BY_ACT[act];
          if (pool && !p.cmds[act]) p.cmds[act] = this.rng.pick(pool);
          p.sneaks = 2;
        }
      });
      this.s.crossCount[act] = 0;
      // R7: one random scene of the act gets a crystal ball.
      const actScenes = Object.values(CE.SCENES).filter((x) => x.act === act && x.kozben).map((x) => x.id);
      if (actScenes.length) this.s.visionScene[act] = this.rng.pick(actScenes);
      // Random events: 1-2, after branch step 1 or 2.
      const evs = CE.EVENTS[act] || [];
      if (evs.length) {
        const count = 1 + this.rng.int(2);
        this.s.eventsPlan = this.rng.shuffle(evs).slice(0, count).map((e, i) => ({ id: e.id, step: i + 1 }));
      }
      this.log('felvonás', `${act}. felvonás`);
    }

    // ---------- collecting answers ----------

    async collect(players, mk, sec, opts = {}) {
      const tok = this.token;
      const io = this.io;
      const dl = { t: io.now() + io.ms(sec), total: sec, start: io.now(), ext: new Set(), stop: false };
      const answers = new Map();
      const prompts = new Map();
      const col = { dl, players, answers, opts, prompts };
      this.curCollect = col;
      players.forEach((p) => {
        const pr = mk(p);
        pr.deadline = dl;
        pr.seq = ++this.promptSeq;
        prompts.set(p.id, pr);
        io.prompt(p, pr).then((a) => {
          if (tok !== this.token || answers.has(p.id) || this.curCollect !== col) return;
          answers.set(p.id, a);
          io.progress(col);
          if (opts.stopWhen && opts.stopWhen(answers)) dl.stop = true;
        });
      });
      io.progress(col);
      while (answers.size < players.length && !dl.stop && io.now() < dl.t) {
        await io.sleep(40);
        this.check(tok);
      }
      players.forEach((p) => {
        if (!answers.has(p.id) && !opts.noDefault) answers.set(p.id, opts.dflt ? opts.dflt(p, prompts.get(p.id)) : this.randomAnswer(prompts.get(p.id)));
        io.clear(p, prompts.get(p.id));
      });
      this.curCollect = null;
      io.progress(null);
      return answers;
    }

    randomAnswer(pr) {
      if (!pr) return null;
      if (pr.kind === 'kozben') return { k: 'help' };
      if (pr.options && pr.options.length) return { k: this.rng.pick(pr.options).k };
      if (pr.kind === 'text') return { text: '' };
      if (pr.kind === 'memory') return { text: null };
      if (pr.kind === 'volunteer') return { k: 'no' };
      return { k: 'ok' };
    }

    // R10: a player asks for 30 more seconds; two different requests extend the current timer.
    requestTime(p) {
      const col = this.curCollect;
      if (!col || !col.opts.extendable || !this.sys('R10')) return false;
      col.dl.ext.add(p.id);
      if (col.dl.ext.size >= 2) {
        col.dl.t += this.io.ms(30);
        const names = [...col.dl.ext].map((id) => this.players[id].name);
        col.dl.ext.clear();
        this.s.extensions += 1;
        this.s.extensionBy.push(...names);
        if (this.s.extensions % 2 === 0) this.add('ostrom', 1);
        this.io.notice(`+30 mp: ${names.join(' és ')} kért időt.${this.s.extensions % 2 === 0 ? ' A dér előrébb kúszik.' : ''}`);
        this.log('idő', `+30 mp (${names.join(', ')})`);
      }
      return true;
    }

    // ---------- decisions ----------

    async decide(dec, tok) {
      switch (dec.type) {
        case 'ack': return this.ackAll(dec);
        case 'memory': return this.memory(dec);
        case 'vote': return this.vote(dec, this.present());
        case 'spotlight': return this.spotlight(dec);
        case 'volunteer': return this.volunteer(dec);
        case 'reflex': return this.reflex(dec);
        case 'each': return this.each(dec);
        case 'trust': return this.trust(dec);
        case 'text': return this.question(dec);
        case 'suspicion': return this.suspicion(dec, tok);
        default: return {};
      }
    }

    async ackAll(dec) {
      const who = this.players.filter((p) => p.status !== 'szellem');
      await this.collect(who, () => ({ kind: 'ack', title: dec.prompt || 'Tovább', label: dec.label || 'Elolvastam' }), dec.time || 40);
      return {};
    }

    async memory(dec) {
      const ans = await this.collect(this.players, () => ({ kind: 'memory', title: dec.prompt }), dec.time || 60);
      ans.forEach((a, id) => {
        const p = this.players[id];
        p.memory = !!(a && a.text && a.text.trim());
        p.memoryText = p.memory ? a.text.trim() : '';
        this.secret(p, `A patrónusod: ${p.patronus}.`, 'hangulat');
      });
      return {};
    }

    options(dec) { return dec.options.filter((o) => !o.when || o.when(this)); }

    async vote(dec, voters) {
      const opts = this.options(dec);
      if (!voters.length) { const o = this.rng.pick(opts); return { key: o.k, option: o, counts: {} }; }
      const ans = await this.collect(voters, () => ({ kind: 'choice', title: dec.prompt, options: opts.map((o) => ({ k: o.k, t: o.t })), extendable: true, meta: { type: 'vote', dec } }), dec.time || this.sc.vote, { extendable: true });
      const counts = {};
      opts.forEach((o) => { counts[o.k] = 0; });
      ans.forEach((a) => { if (a && counts[a.k] != null) counts[a.k] += 1; });
      const max = Math.max(...Object.values(counts));
      const top = opts.filter((o) => counts[o.k] === max);
      const option = this.rng.pick(top);
      this.log('szavazás', `${dec.prompt} → ${option.k} (${JSON.stringify(counts)})`);
      return { key: option.k, option, counts, votes: ans };
    }

    async spotlight(dec) {
      let who = null;
      if (this.s.forcedSpot != null) { who = this.present().find((p) => p.id === this.s.forcedSpot); this.s.forcedSpot = null; }
      if (!who && dec.role) who = this.presentRole(dec.role);
      if (!who && dec.pick) who = dec.pick(this);
      if (!who) return this.vote(dec, this.present());
      const opts = this.options(dec);
      this.io.notice(`Reflektorban: ${who.name}`);
      const ans = await this.collect([who], () => ({ kind: 'choice', title: dec.prompt, options: opts.map((o) => ({ k: o.k, t: o.t })), meta: { type: 'spotlight', dec } }), 25);
      const a = ans.get(who.id);
      const option = opts.find((o) => o.k === (a && a.k)) || this.rng.pick(opts);
      this.log('reflektor', `${who.name}: ${option.k}`);
      return { key: option.k, option, chooser: who };
    }

    async volunteer(dec) {
      const cands = dec.who ? dec.who(this) : this.present();
      const ans = await this.collect(cands, () => ({ kind: 'volunteer', title: dec.prompt, label: dec.label || 'Vállalom', meta: { type: 'volunteer', dec } }), dec.time || 15, {
        stopWhen: (m) => [...m.values()].some((a) => a && a.k === 'yes'),
        dflt: () => ({ k: 'no' })
      });
      const yes = cands.filter((p) => { const a = ans.get(p.id); return a && a.k === 'yes'; });
      const volunteer = yes.length ? yes[0] : null;
      if (volunteer) volunteer.stats.volunteered += 1;
      this.log('önkéntes', volunteer ? volunteer.name : 'senki');
      return { volunteer };
    }

    async reflex(dec) {
      const parts = dec.who ? dec.who(this) : this.present();
      const opts = this.options(dec);
      const time = (dec.time || 5) + (dec.bonus ? dec.bonus(this) : 0);
      const mk = (p) => {
        const toggles = [];
        if (p.role === 'bajital' && !p.powerUsed) toggles.push({ id: 'felix', t: 'Felix Felicis (egyszer)' });
        if (p.role === 'kviddics' && !p.powerUsed) toggles.push({ id: 'kiteres', t: 'Kitérés (egyszer)' });
        return { kind: 'choice', reflex: true, title: dec.prompt, options: opts.map((o) => ({ k: o.k, t: o.t, hint: o.hint && o.hint(this, p) })), toggles, meta: { type: 'reflex', dec } };
      };
      const ans = await this.collect(parts, mk, time);
      const per = {};
      parts.forEach((p) => { const a = ans.get(p.id); per[p.id] = a; });
      // An option with protects:true shields the neighbour, unless the neighbour chose the same.
      const partnerOf = (i) => (parts.length > 1 ? parts[(i + 1) % parts.length] : null);
      const prot = new Set();
      parts.forEach((p, i) => {
        const o = opts.find((x) => x.k === (per[p.id] || {}).k);
        const partner = partnerOf(i);
        if (o && o.protects && partner && (per[partner.id] || {}).k !== o.k) prot.add(partner.id);
      });
      parts.forEach((p, i) => {
        const a = per[p.id];
        const o = opts.find((x) => x.k === (a && a.k)) || opts[0];
        const tg = (a && a.toggles) || [];
        const partner = partnerOf(i);
        const ctx = { felix: tg.includes('felix'), kiteres: tg.includes('kiteres'), partner, partnerChoice: partner ? (per[partner.id] || {}).k : null, prot: prot.has(p.id) };
        if (ctx.felix) p.powerUsed = true;
        o.res(this, p, ctx);
      });
      this.log('reflex', parts.map((p) => `${p.name}:${(per[p.id] || {}).k}`).join(' '));
      return { per };
    }

    // Everyone chooses on their own (e.g. where to spend the afternoon); the scene resolves d.per itself.
    async each(dec) {
      const parts = dec.who ? dec.who(this) : this.present();
      const opts = this.options(dec);
      const ans = await this.collect(parts, () => ({ kind: 'choice', title: dec.prompt, options: opts.map((o) => ({ k: o.k, t: o.t })), meta: { type: 'each', dec } }), dec.time || this.sc.vote);
      const per = {};
      parts.forEach((p) => { const a = ans.get(p.id); per[p.id] = (a && opts.some((o) => o.k === a.k)) ? a.k : this.rng.pick(opts).k; });
      this.log('egyéni', parts.map((p) => `${p.name}:${per[p.id]}`).join(' '));
      return { per };
    }

    // Shared reflex outcome helpers: they respect Felix Felicis and the Quidditch dodge.
    risk(p, ctx, pct, bad) {
      if (ctx.felix || ctx.prot) return false;
      if (!this.rng.chance(pct)) return false;
      if (ctx.kiteres && !p.powerUsed) { p.powerUsed = true; this.say(`${p.name} az utolsó pillanatban kitért.`); return false; }
      if (bad) bad();
      return true;
    }

    patronusChance(p, extra = 0) {
      let c = 50 + (p.memory ? 25 : 0) + (p.role === 'parbajozo' ? 15 : 0) + p.patronusBonus + extra;
      if (this.players.some((x) => x.status === 'dermedt' || x.status === 'haldoklik')) c -= 15;
      return Math.max(5, Math.min(95, c));
    }

    castPatronus(p, ctx, extra = 0) {
      const ok = ctx.felix || this.rng.chance(this.patronusChance(p, extra));
      if (ok) { p.stats.patronusOk += 1; p.patronusBonus = 0; this.say(`${p.name} patrónusa, egy ezüst ${p.patronus}, ragyogva tör előre.`); this.io.patronus(p); }
      else { p.stats.patronusFail += 1; }
      return ok;
    }

    async trust(dec) {
      const pres = this.present();
      if (pres.length < 2) return {};
      let a; let b;
      const t = pres.find((p) => p.traitor || p.traitor2);
      if (t && this.rng.chance(50)) { a = t; b = this.rng.pick(pres.filter((p) => p !== t)); } else { [a, b] = this.rng.shuffle(pres).slice(0, 2); }
      this.io.notice(`Bizalompróba: ${a.name} és ${b.name}`);
      const mk = (p) => ({ kind: 'choice', title: dec.prompt, options: [{ k: 'hold', t: dec.hold || 'Fogom a kezét' }, { k: 'let', t: dec.let || 'Elengedem' }], meta: { type: 'trust', partner: p === a ? b.id : a.id } });
      const ans = await this.collect([a, b], mk, 20);
      const ca = (ans.get(a.id) || {}).k || 'hold';
      const cb = (ans.get(b.id) || {}).k || 'hold';
      if (ca === 'hold' && cb === 'hold') { this.say(`${a.name} és ${b.name} egymást fogva jutnak fel.`); if (a.traitor || a.traitor2) this.resist(a, 1); if (b.traitor || b.traitor2) this.resist(b, 1); }
      else if (ca === 'hold' && cb === 'let') { this.wound(a); this.say(`${b.name} elengedte ${a.name} kezét. ${a.name} megcsúszik.`); }
      else if (ca === 'let' && cb === 'hold') { this.wound(b); this.say(`${a.name} elengedte ${b.name} kezét. ${b.name} megcsúszik.`); }
      else { this.wound(a); this.wound(b); this.say(`${a.name} és ${b.name} egyszerre engedik el egymást. Mindketten elesnek.`); }
      this.log('bizalom', `${a.name}:${ca} ${b.name}:${cb}`);
      return { pair: [a.id, b.id], choices: [ca, cb] };
    }

    // R1: the eagle asks a question; traitors get a slightly different one.
    async question(dec) {
      if (!this.sys('R1')) return {};
      const used = this.s.qa.map((x) => x.qi);
      const pool = CE.QUESTIONS.map((q, i) => i).filter((i) => !used.includes(i));
      const qi = this.rng.pick(pool.length ? pool : [0]);
      const q = CE.QUESTIONS[qi];
      const who = this.present();
      const ans = await this.collect(who, (p) => ({ kind: 'text', title: (p.traitor || p.traitor2) ? q.t : q.q, maxLen: 25, meta: { type: 'question', qi } }), dec.time || 25, { dflt: () => ({ text: '' }) });
      const rows = who.map((p) => ({ id: p.id, name: p.name, text: ((ans.get(p.id) || {}).text || '').slice(0, 25) || '…', odd: !!(p.traitor || p.traitor2) }));
      this.s.qa.push({ qi, act: this.s.act, rows });
      await this.io.answers({ question: q.q, rows });
      await this.io.debate(this.io.ms(dec.debate || 45), 'Vita');
      return { qi };
    }

    // ---------- Közben ----------

    kozbenOptions(p, kz, d) {
      const opts = [{ k: 'help', t: 'Segítesz' }, { k: 'watch', t: 'Figyelsz' }];
      const extras = [];
      const starOk = this.s.excludeStar !== p.id;
      if (p.items.length) extras.push({ k: 'give', t: 'Átadsz egy tárgyat' });
      if (p.role === 'csinytevo' && !p.powerUsed && this.mapHolder() === p) extras.push({ k: 'mapwatch', t: 'Figyelsz a térképpel (egyszer)' });
      if ((p.traitor || p.traitor2) && starOk) {
        (kz.traitor || []).forEach((o) => {
          if (o.cmd && o.cmd !== this.cmd(p)) return;
          if (o.when && !o.when(this, d)) return;
          if (!p.wand && !o.noWand) return;
          extras.push({ k: 'sab:' + o.id, t: '✦ ' + o.t, sab: o });
        });
        const orzo = typeof this.f.palca_orzo === 'number' ? this.players[this.f.palca_orzo] : null;
        if (!p.wand && orzo && this.present().includes(orzo)) extras.unshift({ k: 'stealwand', t: '✦ Visszalopod a pálcádat' });
        if (p.sneaks > 0 && !this.cur.noSneak && CE.COMMANDS[this.cmd(p)] && CE.COMMANDS[this.cmd(p)].sneak) extras.push({ k: 'sneak', t: '✦ Kiosonsz' });
        if (!p.fakeUsed && p.wand && this.sys('R2')) extras.push({ k: 'fake', t: '✦ Hamis lapot küldesz' });
      }
      if (p.heir && starOk) (kz.heir || []).forEach((o) => { if (!o.when || o.when(this, d)) extras.push({ k: 'sab:' + o.id, t: '✦ ' + o.t, sab: o }); });
      const fill = this.rng.shuffle(CE.FILLERS);
      const all = opts.concat(extras.slice(0, 3));
      while (all.length < 5) all.push({ k: 'filler', t: fill.pop() });
      return all;
    }

    async kozben(kz, d, tok) {
      const parts = this.present();
      const ghosts = this.ghosts();
      const optMap = new Map();
      const mk = (p) => {
        if (p.status === 'szellem') {
          return { kind: 'choice', title: 'Szellemként súghatsz egy szót valakinek.', options: [{ k: 'none', t: 'Most nem súgok' }].concat(CE.WHISPERS.map((w) => ({ k: 'w:' + w, t: w }))), targets: this.living().filter((x) => x.status !== 'szellem').map((x) => ({ id: x.id, name: x.name })), meta: { type: 'whisper' } };
        }
        const options = this.kozbenOptions(p, kz, d);
        optMap.set(p.id, options);
        return {
          kind: 'kozben', title: 'Közben…', options: options.map((o) => ({ k: o.k, t: o.t })),
          items: p.items.map((i) => ({ id: i, name: CE.ITEMS[i].name })),
          targets: this.living().filter((x) => x !== p).map((x) => ({ id: x.id, name: x.name })),
          meta: { type: 'kozben' }
        };
      };
      const ans = await this.collect(parts.concat(ghosts), mk, 15, { dflt: (p) => (p.status === 'szellem' ? { k: 'none' } : { k: 'help' }) });
      this.check(tok);
      ghosts.forEach((p) => {
        const a = ans.get(p.id);
        if (!a || !a.k || !a.k.startsWith('w:')) return;
        const to = this.players[a.to] || this.rng.pick(this.living().filter((x) => x.status !== 'szellem'));
        if (!to) return;
        this.secret(to, `${p.name} szelleme a füledbe súgja: „${a.k.slice(2)}”`, 'szellem');
        this.log('suttogás', `${p.name} → ${to.name}: ${a.k.slice(2)}`);
      });
      parts.forEach((p) => {
        const a = ans.get(p.id) || { k: 'help' };
        const opt = (optMap.get(p.id) || []).find((o) => o.k === a.k);
        if (!opt) { d.helpers += 1; return; }
        if (opt.k === 'help' || opt.k === 'filler') { if (opt.k === 'help') d.helpers += 1; return; }
        if (opt.k === 'watch') {
          let sure = false;
          if (this.takeItem(p, 'kopeny')) sure = true;
          d.watchers.push({ p, sure });
          return;
        }
        if (opt.k === 'mapwatch') { p.powerUsed = true; d.watchers.push({ p, sure: true }); return; }
        if (opt.k === 'give') {
          const to = this.players[a.to];
          const item = a.item && p.items.includes(a.item) ? a.item : p.items[0];
          if (to && item && to.status !== 'szellem') {
            this.takeItem(p, item);
            this.giveItem(to, item);
            p.stats.giftsGiven += 1;
            if (item === 'terkep') this.moveMap(to);
            this.resist(to, 1);
            this.say(`${p.name} ajándékot adott ${to.name} kezébe.`);
            this.log('ajándék', `${p.name} → ${to.name}: ${CE.ITEMS[item] ? CE.ITEMS[item].name : item}`);
          }
          return;
        }
        if (opt.k === 'sneak') { p.sneaks -= 1; d.sneaks.push({ actor: p.id }); return; }
        if (opt.k === 'stealwand') {
          const orzo = this.players[this.f.palca_orzo];
          const guarded = orzo && ans.get(orzo.id) && ans.get(orzo.id).k === 'watch';
          d.sabs.push({ actor: p.id, id: 'stealwand', seen: 'a táskádban kutatott a pálca után', fx: guarded ? null : (g) => {
            const caught = d.watchers.some((w) => w.p !== p && (w.sure || g.chance(g.sc.watch)));
            if (caught) return;
            p.wand = true; g.f.palca_orzo = null;
            g.secret(orzo, 'A pálca eltűnt a táskádból.', 'igaz');
            g.log('pálca', `${p.name} visszalopta a pálcáját.`);
          } });
          return;
        }
        if (opt.k === 'fake') {
          const to = this.players[a.to] || this.rng.pick(this.present().filter((x) => x !== p));
          p.fakeUsed = true;
          d.fakes.push({ actor: p.id, to: to.id });
          return;
        }
        if (opt.sab) { d.sabs.push({ actor: p.id, id: opt.sab.id, seen: opt.sab.seen, fx: opt.sab.fx }); }
      });
      d.helpersKnown = true;
    }

    resolveSneaks(d) {
      let any = false;
      d.sneaks.forEach((a) => {
        const p = this.players[a.actor];
        const c = CE.COMMANDS[this.cmd(p)];
        // A scene may define its own sneak effect (onSneak); otherwise the command's generic one runs.
        const sc = this.cur && this.cur.sc;
        const own = sc && sc.onSneak ? sc.onSneak(this, p, d) : undefined;
        a.ok = own !== undefined ? !!own : !!(c && c.sneak && c.sneak(this, p));
        any = true;
        this.log('kiosonás', `${p.name} kiosont (${this.cmd(p)}: ${a.ok ? 'sikerült' : 'nem sikerült'})`);
      });
      if (any) this.say('Valaki egy időre eltűnt.');
      d.fakes.forEach((a) => {
        const to = this.players[a.to];
        this.s.fakes = (this.s.fakes || []).concat({ from: a.actor, to: a.to, scene: this.s.scene });
        this.secret(to, `${this.rng.pick(CE.FAKE_PAGES)}\n\n(Ezt nem tőle kaptad. Valaki hamisította.)`, 'hamis', 'bella');
        this.log('hamis lap', `${this.players[a.actor].name} → ${to.name}`);
      });
    }

    resolveSpotting(d) {
      const acts = [];
      d.sabs.forEach((a) => acts.push({ actor: a.actor, desc: a.seen || 'valamit művelt a háttérben', kind: 'sab' }));
      d.sneaks.forEach((a) => acts.push({ actor: a.actor, desc: 'kiosont', kind: 'sneak' }));
      d.fakes.forEach((a) => acts.push({ actor: a.actor, desc: 'egy pergamenre írt, és valaki táskájába csúsztatta', kind: 'fake' }));
      const log = this.s.sceneLog[this.s.scene];
      acts.forEach((a) => log.push({ actor: a.actor, kind: a.kind }));
      if (!acts.length) return;
      const pct = this.sc.watch / (this.cur.halfWatch ? 2 : 1);
      const guard = this.f.or != null ? this.players[this.f.or] : null;
      acts.forEach((a) => {
        const actor = this.players[a.actor];
        const seen = new Set();
        d.watchers.forEach((w) => {
          if (w.p === actor || seen.has(w.p.id)) return;
          if (w.sure || this.rng.chance(pct)) seen.add(w.p.id);
        });
        if (guard && guard !== actor && !guard.traitor && a.kind === 'sneak' && guard.status === 'el') seen.add(guard.id);
        seen.forEach((id) => {
          const w = this.players[id];
          this.secret(w, `Láttad, hogy ${actor.name} ${a.desc}.`, 'igaz');
          actor.spottedBy.push(id);
          this.log('észrevette', `${w.name} látta: ${actor.name} ${a.desc}`);
        });
      });
    }

    // ---------- rescue after each scene ----------

    async rescue(tok) {
      const needy = this.players.filter((p) => p.status === 'haldoklik' || p.status === 'dermedt');
      for (const n of needy) {
        if (n.status !== 'haldoklik' && n.status !== 'dermedt') continue;
        // The dying can be helped at the end of at most two scenes; after that only the story can save them.
        if (n.status === 'haldoklik') {
          n.rescueRounds = (n.rescueRounds || 0) + 1;
          if (n.rescueRounds > (this.s.act >= 2 ? 1 : 2)) continue;
        }
        const rescuers = this.present().filter((p) => p !== n && this.rescueOptions(p, n).length > 1);
        if (!rescuers.length) continue;
        const label = n.status === 'dermedt' ? `${n.name} megdermedt.` : `${n.name} haldoklik (${{ seb: 'sebek', atok: 'átok', mereg: 'méreg', karmok: 'karmok' }[n.dyingCause] || n.dyingCause}).`;
        const ans = await this.collect(rescuers, (p) => ({ kind: 'choice', title: `${label} Segítesz?`, options: this.rescueOptions(p, n), meta: { type: 'rescue', target: n.id } }), 15, {
          stopWhen: (m) => [...m.values()].some((a) => a && a.k !== 'no'),
          dflt: () => ({ k: 'no' })
        });
        this.check(tok);
        const helper = rescuers.find((p) => { const a = ans.get(p.id); return a && a.k !== 'no'; });
        if (!helper) continue;
        const k = ans.get(helper.id).k;
        if (k === 'heal') { helper.healsThisAct += 1; this.revive(n, helper); this.io.notice(`${helper.name} ellátta ${n.name} sebeit.`); }
        else if (k === 'csoki') { this.takeItem(helper, 'csoki'); this.revive(n, helper); this.io.notice(`${helper.name} csokibékát adott ${n.name} kezébe.`); }
        else if (k === 'bezoar') { this.takeItem(helper, 'bezoar'); this.revive(n, helper); this.io.notice(`${helper.name} bezoárt nyomott ${n.name} torkába.`); }
        else if (k === 'aberforth') { this.takeItem(helper, 'tukorszilank'); this.revive(n, helper); this.add('ostrom', -1); this.io.notice(`${helper.name} belenéz a tükörszilánkba. Aberforth Dumbledore átjön, és felemeli ${n.name}t.`); }
        else if (k === 'escort') {
          helper.away = 1;
          if (this.s.act >= 2 && !this.rng.chance(40)) { this.io.notice(`${helper.name} elindul ${n.name} kíséretében, de nem érnek oda időben.`); continue; }
          this.revive(n, helper); n.away = 1; this.io.notice(`${helper.name} Madam Pomfreyhoz kíséri: ${n.name}.`);
        }
      }
    }

    rescueOptions(p, n) {
      const o = [];
      if (p.role === 'gyengelkedo' && (n.status === 'dermedt' || p.healsThisAct < this.sc.healerPerAct)) o.push({ k: 'heal', t: 'Ellátom (gyengélkedős erő)' });
      // Chocolate thaws the frozen; it does not save the dying (script part 1, 2.5).
      if (p.items.includes('csoki') && n.status === 'dermedt') o.push({ k: 'csoki', t: 'Odaadom a csokibékámat' });
      if (p.items.includes('bezoar') && n.status === 'haldoklik' && n.dyingCause === 'mereg') o.push({ k: 'bezoar', t: 'Odaadom a bezoáromat' });
      if (p.items.includes('tukorszilank') && n.status === 'haldoklik') o.push({ k: 'aberforth', t: 'Belenézek a tükörszilánkba (Aberforth)' });
      // Escorting to the hospital wing is sure on Christmas Eve, risky on Christmas Day, and impossible during the siege.
      if (n.status === 'haldoklik' && this.s.act < 3 && this.cur && this.cur.sc && this.cur.sc.escort !== false) o.push({ k: 'escort', t: `Elkísérem Madam Pomfreyhoz (mindketten kimaradunk egy jelenetből${this.s.act === 2 ? ', nem biztos, hogy odaérünk' : ''})` });
      o.push({ k: 'no', t: 'Nem' });
      return o;
    }

    // ---------- after each scene: events, crossroads, visions ----------

    async afterScene(sc, d, tok) {
      if (sc.branch) {
        const due = this.s.eventsPlan.filter((e) => e.step === sc.branch);
        for (const e of due) {
          const ev = (CE.EVENTS[this.s.act] || []).find((x) => x.id === e.id);
          if (!ev) continue;
          this.cur.out = [];
          if (ev.fx) { const r = ev.fx(this); if (typeof r === 'string') this.say(r); }
          await this.io.narrate({ scene: { title: ev.title, place: 'Közjáték' }, id: ev.id, paragraphs: this.text(ev.narr), event: true });
          if (this.cur.out.length) await this.io.result({ scene: { title: ev.title }, id: ev.id, d: {}, out: this.cur.out.slice() });
          this.check(tok);
        }
      }
      if (this.sys('R7') && this.s.visionScene[this.s.act] === sc.id && d.watchers.length) {
        const vs = CE.VISIONS.filter((v) => v.when(this));
        const w = this.rng.pick(d.watchers).p;
        const v = this.rng.pick(vs);
        if (v && w.status === 'el') {
          this.io.notice('Valaki egy kristálygömböt talált a lépcsőn. Belenézett.');
          this.secret(w, `Vízió (${v.kind}): ${v.text(this)}`, 'vizio', 'vision');
          this.s.visionsSeen.push(v.kind);
        }
      }
      if (this.sys('R4') && (this.s.crossCount[this.s.act] || 0) < 2) {
        const ev = this.cur.ev;
        for (const p of this.present()) {
          if (p.crossUsed || (this.s.crossCount[this.s.act] || 0) >= 2) continue;
          const c = CE.CROSSROADS.find((x) => x.trigger(this, p, ev));
          if (!c) continue;
          p.crossUsed = true;
          this.s.crossCount[this.s.act] = (this.s.crossCount[this.s.act] || 0) + 1;
          this.io.notice('Valaki előtt döntés áll…');
          if (this.sys('R11')) this.io.vibrate([p], 'soft');
          const ans = await this.collect([p], () => ({ kind: 'choice', title: c.t, options: c.options.map((o) => ({ k: o.k, t: o.t })), meta: { type: 'cross', id: c.id } }), 15);
          this.check(tok);
          const a = ans.get(p.id);
          const o = c.options.find((x) => x.k === (a && a.k)) || c.options[1];
          this.cur.out = [];
          o.res(this, p, ev);
          this.log('útkereszteződés', `${p.name}: ${c.id} → ${o.k}`);
          if (this.cur.out.length) this.io.notice(this.cur.out.join(' '));
        }
      }
    }

    // ---------- suspicion ----------

    async usePowers(tok) {
      while (this.s.powersPending.length) {
        const power = this.s.powersPending.shift();
        this.s.powersUsed += 1;
        this.io.notice(`Erő: ${CE.POWER_NAMES[power]}`);
        const pres = this.present();
        if (power === 'terkep') {
          const alone = this.s.lastAlone.map((id) => this.players[id].name);
          await this.io.info('Pillantás a térképre', [alone.length ? `Az előző jelenetben egyedül volt: ${alone.join(', ')}.` : 'Az előző jelenetben senki nem volt egyedül.']);
        } else if (power === 'veritaszerum' && pres.length > 1) {
          const v = await this.vote({ prompt: 'Ki kérdezzen a Veritaszérummal?', options: pres.map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, pres);
          const asker = this.players[+v.key];
          const targets = pres.filter((p) => p !== asker && !p.investigated);
          if (targets.length) {
            const ans = await this.collect([asker], () => ({ kind: 'choice', title: 'Kit kérdezel ki?', options: targets.map((p) => ({ k: String(p.id), t: p.name })), meta: { type: 'veritaserum' } }), 20);
            const tg = this.players[+((ans.get(asker.id) || {}).k || targets[0].id)] || targets[0];
            tg.investigated = true;
            this.secret(asker, `Veritaszérum: ${tg.name} ${this.isEvil(tg) ? 'Bellatrix oldalán áll' : 'hűséges'}. Most bármit mondhatsz.`, 'igaz');
            await this.io.info('Veritaszérum', [`${asker.name} kikérdezte ${tg.name}t. Csak ő tudja, mit hallott.`]);
          }
        } else if (power === 'merengo' && pres.length) {
          const v = await this.vote({ prompt: 'Merengő: kinek az emlékét nézzük meg?', options: this.living().map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, pres);
          const tg = this.players[+v.key];
          const scenes = this.s.history.filter((id) => (CE.SCENES[id] || {}).kozben).slice(-6);
          const v2 = await this.vote({ prompt: 'Melyik jelenetet?', options: scenes.map((id) => ({ k: id, t: CE.SCENES[id].title })), time: 20 }, pres);
          const did = (this.s.sceneLog[v2.key] || []).some((a) => a.actor === tg.id);
          await this.io.info('Merengő', [`${tg.name} a „${CE.SCENES[v2.key].title}” jelenetben ${did ? 'szabotált vagy kiosont.' : 'nem szabotált és nem osont ki.'}`]);
        } else if (power === 'prefektusi' && pres.length > 1) {
          const v = await this.vote({ prompt: 'Ki legyen a következő reflektor?', options: pres.map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, pres);
          this.s.forcedSpot = +v.key;
          const v2 = await this.vote({ prompt: 'Kit zártok ki a következő titkos lépésből?', options: pres.map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, pres);
          this.s.excludeStar = +v2.key;
        } else if (power === 'vedelem') {
          this.add('ostrom', -1);
          await this.io.info('Kastélyvédelem', ['A dér visszahúzódik egy kicsit.']);
        }
        this.check(tok);
      }
    }

    async suspicion(dec, tok) {
      await this.usePowers(tok);
      await this.io.debate(this.io.ms(dec.debate || this.sc.debate), 'Gyanú-vita');
      this.check(tok);
      const voters = this.players.filter((p) => p.status === 'el' || p.status === 'dermedt' || p.status === 'szellem').filter((p) => p.away === 0 || p.status === 'szellem');
      const cands = this.players.filter((p) => (p.status === 'el' || p.status === 'dermedt') && p.away === 0);
      const opts = cands.map((p) => ({ k: String(p.id), t: p.name })).concat([{ k: 'none', t: 'Senki' }]);
      const mk = (p) => ({
        kind: 'choice', title: dec.prompt, options: opts.filter((o) => o.k !== String(p.id)), extendable: true,
        toggles: p.status === 'szellem' && !p.bigVoteUsed && this.sys('R9') ? [{ id: 'big', t: 'Teljes súllyal (egyszer)' }] : [],
        meta: { type: 'suspicion' }
      });
      const ans = await this.collect(voters, mk, 20, { extendable: true });
      const counts = {};
      opts.forEach((o) => { counts[o.k] = 0; });
      const byTarget = {};
      ans.forEach((a, id) => {
        const p = this.players[id];
        if (!a || counts[a.k] == null) return;
        let w = 1;
        if ((a.toggles || []).includes('big') && p.status === 'szellem' && !p.bigVoteUsed) { w = 2; p.bigVoteUsed = true; this.io.notice(`${p.name} szelleme teljes súlyával szavazott.`); }
        counts[a.k] += w;
        (byTarget[a.k] = byTarget[a.k] || []).push(p);
      });
      const pref = this.byRole('prefektus');
      const prefChoice = pref ? (ans.get(pref.id) || {}).k : null;
      ans.forEach((a, id) => {
        const p = this.players[id];
        if (!a) return;
        if (a.k !== 'none' && (byTarget[a.k] || []).length === 1) p.stats.loneVote += 1;
        if (pref && p !== pref && prefChoice && a.k === prefChoice) p.stats.prefectSame += 1;
      });
      const real = Object.entries(counts).filter(([k]) => k !== 'none');
      const max = Math.max(0, ...real.map(([, c]) => c));
      const top = real.filter(([, c]) => c === max);
      const need = Math.ceil(voters.length / 3);
      let target = null;
      if (max > 0 && top.length === 1 && max >= need && max > counts.none) target = this.players[+top[0][0]];
      this.log('gyanú', `${JSON.stringify(counts)} → ${target ? target.name : 'senki'}`);
      await this.io.tally({ counts, opts, target });
      return { target, counts };
    }

    // ---------- act end and reveal ----------

    endAct() {
      const act = this.s.act;
      this.players.forEach((p) => {
        if (p.status === 'haldoklik') {
          p.status = 'szellem';
          this.s.deaths.push({ id: p.id, act });
          this.players.forEach((x) => { if ((x.witnessedDying || []).includes(p.id)) x.sawDeath = true; });
          this.log('halál', `${p.name} meghalt, szellem lett.`);
          if (this.sys('R11')) this.io.vibrate([p], 'fade');
        }
        if (p.status === 'dermedt') { p.status = 'el'; p.hp = Math.max(1, p.hp - 1); }
      });
      this.traitors().forEach((t) => {
        const code = t.cmds[act];
        if (!code) return;
        const ok = !!CE.COMMANDS[code].check(this);
        this.s.cmdResults[`${t.id}:${act}`] = { code, ok };
        this.log('parancs', `${t.name} ${code}: ${ok ? 'teljesült' : 'nem teljesült'}`);
      });
      this.f.or = null;
    }

    goalStatus(p) {
      if (!p.goal) return null;
      const v = p.goal.check(this, p);
      return v;
    }

    revealData() {
      const t = this.traitors();
      return {
        traitors: t.map((p) => ({ name: p.name, role: this.roleName(p), second: p.traitor2, resist: p.resist, cmds: Object.entries(p.cmds).map(([act, code]) => ({ act, code, text: CE.COMMANDS[code].short, ok: (this.s.cmdResults[`${p.id}:${act}`] || {}).ok })) })),
        heir: this.players.filter((p) => p.heir).map((p) => p.name),
        mugli: this.players.filter((p) => p.mugli).map((p) => p.name),
        qa: this.s.qa.map((x) => ({ q: CE.QUESTIONS[x.qi].q, t: CE.QUESTIONS[x.qi].t, rows: x.rows })),
        goals: this.players.filter((p) => p.goal).map((p) => ({ name: p.name, goal: p.goal.t, ok: this.goalStatus(p) })),
        patronus: this.players.map((p) => ({ name: p.name, animal: p.patronus, ok: p.stats.patronusOk })),
        deaths: this.s.deaths.map((x) => this.players[x.id].name),
        fakes: (this.s.fakes || []).map((x) => `${this.players[x.from].name} → ${this.players[x.to].name}`),
        ending: this.s.ending || null,
        history: this.s.history.slice()
      };
    }
  }

  CE.Game = Game;
})(window.CE = window.CE || {});
