// Act III (Karácsony éjjele), the finale, the epilogue and the ten endings as scene data.
// Source: forgatokonyv/03-III-felvonas-es-finale.md, with R6, R7, R9 and R10 from 01a-kiegeszito-rendszerek.md.
// Option weights w:{loyal, traitor} only steer the bots.
(function (CE) {
  'use strict';

  const S = CE.SCENES;
  const add = (sc) => { S[sc.id] = sc; };
  // Day 3 of the castle clock: Christmas night starts at 00:00 (absolute minutes).
  const DAY3 = 2880;
  const PASSAGES = ['boszorkany', 'fuz', 'vadkan'];
  const PASSAGE_NAMES = { boszorkany: 'A púpos boszorkány szobra', fuz: 'A Fúriafűz alagútja', vadkan: 'A Szükség Szobája és Ariana portréja' };

  // ---------- small helpers ----------

  const loyal = (g) => g.present().filter((p) => !g.isEvil(p));
  const keeperOf = (g) => (typeof g.f.kard_orzo === 'number' ? g.players[g.f.kard_orzo] : null);
  // A traitor who openly serves Bellatrix: caught, escaped from the cellar, or went with her in III-3.
  const openSide = (t) => !!(t.revealed || t.escaped || t.withBella);
  const names = (arr) => (arr.length <= 1 ? (arr[0] || '') : `${arr.slice(0, -1).join(', ')} és ${arr[arr.length - 1]}`);

  // Hungarian dative suffix for a first name (Kata → Katának, Bence → Bencének, Dóri → Dórinak).
  function dat(name) {
    let base = name;
    const last = name.slice(-1);
    if (last === 'a') base = `${name.slice(0, -1)}á`;
    else if (last === 'e') base = `${name.slice(0, -1)}é`;
    return base + (/[aáoóuú]/i.test(name) ? 'nak' : 'nek');
  }

  function takeSlow(p) { const s = (p && p.slow) || 0; if (p) p.slow = 0; return s; }

  function takeSword(g, p) {
    g.f.kard_hol = 'csapat';
    g.f.kard_orzo = p.id;
    p.hadSword = true;
    g.log('kard', `A kard ${p.name} kezében.`);
  }

  function loseSword(g, why) {
    g.f.kard_hol = 'bellatrix';
    g.f.kard_orzo = null;
    g.log('kard', `A kard Bellatrixé (${why}).`);
  }

  // Tracks the R3 goals that can only be judged at the end (map and sword held in Act III).
  function marks(g) {
    const m = g.mapHolder();
    if (m && m.status !== 'szellem') m.map3 = true;
    const k = keeperOf(g);
    if (k && g.f.kard_hol === 'csapat') k.hadSword = true;
  }

  // A player left behind in III-2 who was rescued later catches up with the team.
  function rejoin(g) {
    const back = [];
    g.players.forEach((p) => {
      if (p.leftBehind && p.status === 'el') { p.leftBehind = false; p.away = 0; p.absentNow = false; back.push(p.name); }
      if (p.carried && p.status !== 'haldoklik') p.carried = false;
    });
    return back;
  }

  // Shows an extra narration screen inside a scene (finale steps, office race, R6).
  async function interlude(g, title, paragraphs, music) {
    const sc = S[g.s.scene] || {};
    await g.io.narrate({ scene: { title, place: sc.place }, id: g.s.scene, paragraphs, music });
  }

  // Shows everything said since the last screen as a result screen, then starts a fresh one.
  async function flush(g, title) {
    const out = g.cur.out.splice(0).filter(Boolean);
    if (out.length) await g.io.result({ scene: { title }, id: g.s.scene, d: {}, out });
  }

  // A one-player reflex with the same toggles as the engine's reflex (Felix Felicis, Quidditch dodge).
  async function solo(g, p, title, options, time) {
    const toggles = [];
    if (p.role === 'bajital' && !p.powerUsed) toggles.push({ id: 'felix', t: 'Felix Felicis (egyszer)' });
    if (p.role === 'kviddics' && !p.powerUsed) toggles.push({ id: 'kiteres', t: 'Kitérés (egyszer)' });
    const dec = { options };
    const ans = await g.collect([p], () => ({ kind: 'choice', reflex: true, title, options: options.map((o) => ({ k: o.k, t: o.t, hint: o.hint })), toggles, meta: { type: 'reflex', dec } }), Math.max(2, time));
    const a = ans.get(p.id) || {};
    const o = options.find((x) => x.k === a.k) || options[0];
    const tg = a.toggles || [];
    const ctx = { felix: tg.includes('felix'), kiteres: tg.includes('kiteres'), partner: null, partnerChoice: null, prot: false };
    if (ctx.felix) p.powerUsed = true;
    return { o, ctx };
  }

  // A private one-player choice. The TV only shows "Valaki előtt döntés áll…" for the 'cross' meta type.
  async function secretChoice(g, p, title, options, sec, id) {
    const ans = await g.collect([p], () => ({ kind: 'choice', title, options, meta: { type: 'cross', id } }), sec);
    const a = ans.get(p.id);
    return (options.find((o) => a && o.k === a.k) || options[0]).k;
  }

  function pickHostage(g) {
    const k = keeperOf(g);
    let pool = g.present().filter((p) => !g.isEvil(p));
    if (pool.length > 1 && k) pool = pool.filter((p) => p !== k);
    if (!pool.length) return null;
    const pub = pool.filter((p) => p.mugli && p.mugliPublic);
    if (pub.length) return g.rng.pick(pub);
    const mug = pool.filter((p) => p.mugli);
    if (mug.length) return g.rng.pick(mug);
    return g.rng.pick(pool);
  }

  // ---------- the silver wave (script 1.3) ----------

  function waveExtra(g, p) {
    return (g.f.edzes ? 10 : 0) + (g.cur.waveBonus || 0) - (p.slow ? 10 : 0);
  }

  function silverWave(bonus) {
    return {
      type: 'reflex', prompt: 'EXPECTO PATRONUM!', time: 5, bonus,
      options: [{
        k: 'patr', t: 'Expecto Patronum!', mini: 'ritmus', w: { loyal: 1, traitor: 1 },
        hint(g, p) {
          if (!p.wand) return 'Nincs pálcád.';
          return p.memoryText ? `„${p.memoryText}” · utána ritmusra koppintasz` : 'utána ritmusra koppintasz';
        },
        res(g, p, c) {
          const w = g.cur.wave = g.cur.wave || { ok: [], fail: [] };
          const extra = waveExtra(g, p);
          p.slow = 0;
          // Without a wand there is no patronus (script part 2, 1.3).
          if (p.wand && g.castPatronus(p, c, extra)) w.ok.push(p.id);
          else w.fail.push({ id: p.id, c });
        }
      }]
    };
  }

  // Success if at least half of the participants succeeded; on failure every failed caster freezes with 50%.
  function settleWave(g) {
    const w = g.cur.wave || { ok: [], fail: [] };
    const n = w.ok.length + w.fail.length;
    // More than half must succeed.
    const ok = n > 0 && w.ok.length > n / 2;
    if (ok) g.add('ostrom', -2);
    else {
      g.add('ostrom', 1);
      w.fail.forEach(({ id, c }) => { const p = g.players[id]; g.risk(p, c, 50, () => g.freeze(p)); });
    }
    g.log('ezüsthullám', `${w.ok.length}/${n} → ${ok ? 'siker' : 'kudarc'}`);
    g.cur.wave = null;
    return ok;
  }

  // ---------- R6: Bellatrix's hand (commander screen of an open traitor) ----------

  const ATTACKS = [
    { k: 'dem', t: 'Dementorok a folyosón' },
    { k: 'fenrir', t: 'Fenrir a kard őrzője után' },
    { k: 'curse', t: 'Átok a leggyengébbre' }
  ];

  async function commander(g, tok) {
    if (!g.sys('R6')) return;
    const cmds = g.traitors().filter((t) => openSide(t) && (t.status === 'el' || t.status === 'bezarva'));
    for (const t of cmds) {
      let k = await secretChoice(g, t, 'Bellatrix keze: melyik támadást indítod?', ATTACKS.map((a) => ({ k: a.k, t: a.t })), 15, 'R6');
      g.check(tok);
      let text;
      if (k === 'curse') {
        const targets = g.present().filter((p) => p !== t);
        if (!targets.length) k = 'dem';
        else {
          const sorted = targets.slice().sort((a, b) => a.hp - b.hp);
          const id = await secretChoice(g, t, 'Kit átkozzanak meg?', sorted.map((p) => ({ k: String(p.id), t: `${p.name} (${p.hp} élet)` })), 15, 'R6-target');
          g.check(tok);
          const target = g.players[+id];
          g.s.r6Curse = (g.s.r6Curse || []).concat({ scene: g.s.scene, id: target.id });
          text = `Egy halálfaló pálcája ${target.name} felé fordul. A jelenet végén átok éri.`;
        }
      }
      if (k === 'dem') {
        g.f.r6_dem = (g.f.r6_dem || 0) + 10;
        text = 'Dementorok áramlanak a folyosókra. A következő ezüsthullám nehezebb lesz.';
      } else if (k === 'fenrir') {
        // A wounded Fenrir, or one whose plan the team overheard, is slower (script part 2, carry-over table).
        g.f.r6_fenrir = (g.f.r6_fenrir || 0) + (g.f.fenrir_sebesult || g.f.fenrir_terv ? 1 : 2);
        text = 'Fenrir szimatot fogott. A kard őrzője után ered.';
      }
      g.log('Bellatrix keze', `${t.name}: ${k}`);
      await g.io.info('Bellatrix keze', [text]);
      g.check(tok);
    }
  }

  // The extra curse reflex chosen with R6, at the end of the scene.
  async function r6CurseRun(g, tok) {
    const list = (g.s.r6Curse || []).filter((x) => x.scene === g.s.scene);
    g.s.r6Curse = (g.s.r6Curse || []).filter((x) => x.scene !== g.s.scene);
    for (const x of list) {
      const p = g.players[x.id];
      if (!p || p.status !== 'el' || p.away) continue;
      g.cur.out = [];
      await interlude(g, 'Bellatrix keze', [`Egy halálfaló pálcája ${p.name} felé fordul.`, 'ÁTOK!'], 'dark');
      const hp = p.hp;
      const dec = CE.curseReflex('ÁTOK!');
      dec.who = () => [p];
      dec.time = Math.max(2, 5 - takeSlow(p));
      await g.decide(dec, tok);
      g.check(tok);
      if (p.status === 'haldoklik') g.say(`${p.name} összeesik.`);
      else if (p.hp < hp) g.say(`${p.name} megsebesül.`);
      else g.say(`${p.name} megússza.`);
      await flush(g, 'Bellatrix keze');
    }
  }

  // K7 in Act III only matters before the break-in; afterwards a sneak opens nothing.
  const lateSneak = (g, p) => (g.cmd(p) === 'K7' ? false : undefined);

  // ---------- III-0 Éjfél ----------

  add({
    id: 'III-0', act: 3, title: 'Éjfél', place: 'Nagy Terem, éjfél', clockSet: DAY3, music: 'clock',
    enter(g) {
      g.s.group = null;
      g.s.k7Pick = [];
      // The thestral rider of Act II comes back now.
      g.cur.rider = null;
      if (typeof g.f.thesztral_lovas === 'number') {
        const r = g.players[g.f.thesztral_lovas];
        // The engine counts `away` down after every scene, so any positive value means the rider is still out.
        if (r && r.away > 0 && r.status === 'el' && !r.escaped) { r.away = 0; r.absentNow = false; g.cur.rider = r; }
        g.f.thesztral_lovas = null;
      }
      // The sword: with the team if they brought it in II-5, otherwise in the office.
      if (g.f.kard_hol == null) {
        const k = keeperOf(g);
        if (!k) g.f.kard_hol = 'iroda';
        else if (k.escaped || k.withBella) { loseSword(g, 'a megszökött áruló magával vitte'); }
        else if (k.status === 'szellem' || k.status === 'bezarva') {
          const to = g.rng.pick(loyal(g));
          if (to) takeSword(g, to); else { g.f.kard_hol = 'iroda'; g.f.kard_orzo = null; }
        } else g.f.kard_hol = 'csapat';
      }
      // R7: the crystal ball of Act III appears in III-0 or III-2, and the hostage is drawn now so a vision can show it.
      g.s.visionScene[3] = g.rng.pick(['III-0', 'III-2']);
      const h = pickHostage(g);
      g.f.tusz = h ? h.id : null;
      marks(g);
    },
    narr(g) {
      const out = [];
      const r = g.cur.rider;
      if (r) out.push(g.f.dumbledore_uzenet ? `Az ablak előtt szárnysuhogás. ${r.name} csapzottan, jéggel a hajában mászik be. „Átjutottam. Dumbledore tudja.”` : `Az ablak előtt szárnysuhogás. ${r.name} csapzottan, jéggel a hajában mászik be. Nem szól semmit, csak a fejét rázza.`);
      out.push(CE.V('III-0', [
        'Éjfél. A Nagy Terem fáin a gyertyák csonkig égtek. McGonagall professzor a terem közepén áll, pálcával a kezében.',
        'Éjfél. A toronyóra tizenkettőt üt, a hangja beleremeg a falakba. McGonagall professzor a terem közepén áll, pálcával a kezében.',
        'Éjfél. A varázsolt mennyezeten nem látszik egy csillag sem, csak a vihar. McGonagall professzor a terem közepén áll, pálcával a kezében.'
      ])(g));
      out.push('„Piertotum Locomotor!” A folyosókon a páncélok, amelyek tegnap még karácsonyi dalokat énekeltek, megcsikordulnak, leugranak a talapzatukról, és csörömpölve a kapu felé masíroznak.');
      return out;
    },
    secrets(g) {
      const out = [];
      g.traitors().filter((t) => t.status !== 'szellem').forEach((t) => {
        const c = CE.COMMANDS[t.cmds[3]];
        const base = t.resist >= 2 ? 'Itt vagyunk, kicsim. Már csak egy kis idő. …Miért nem felelsz?' : 'Itt vagyunk, kicsim. Már csak egy kis idő.';
        out.push({ to: t, text: c ? `${base}\n\n„${c.voice}”` : base, kind: 'parancs', style: 'bella' });
        if (t.status === 'bezarva') out.push({ to: t, text: 'A pince falában egy régi ajtó. Nem zárták be.', kind: 'igaz' });
      });
      g.players.filter((p) => p.heir && p.status !== 'szellem').forEach((h) => out.push({ to: h, text: 'Ha a kard őrzőjét megtalálod, mondd meg nekik. Senki nem fogja tudni, hogy te voltál.', kind: 'hangulat' }));
      return out;
    },
    // R1: the eagle asks for the last time, before the hall.
    async before(g, tok) {
      if (!g.sys('R1') || !g.present().length) return;
      await interlude(g, 'A sas kérdez', ['Mielőtt a csarnokba mentek, a bronz sas még egyszer megszólal. „Aki ma éjjel harcol, az feleljen.”'], 'bronze');
      g.check(tok);
      await g.decide({ type: 'text', time: 25, debate: 30 }, tok);
      g.check(tok);
    },
    decision: {
      type: 'vote', prompt: 'Mit visztek magatokkal?', options: [
        {
          k: 'A', t: 'Csokoládét Madam Pomfreytől.', w: { loyal: 2, traitor: 2 },
          res(g) { g.present().forEach((p) => g.giveItem(p, 'csoki')); return 'Madam Pomfrey mindenki zsebébe csúsztat egy csokibékát. „Dementor után. Nem előtte, nem helyette. Után.”'; }
        },
        {
          k: 'B', t: 'A Tekergők Térképét.', w: { loyal: 2, traitor: 1 },
          when: (g) => { const m = g.mapHolder(); return !!(m && !g.isEvil(m) && g.present().includes(m)); },
          res(g) { g.f.terkep_iii1 = 1; return 'A pergamenen a park felől apró pontok közelednek. Most már tudjátok, honnan jönnek.'; }
        },
        {
          k: 'C', t: 'Hagridot és Agyart.', w: { loyal: 2, traitor: 1 },
          when: (g) => !g.f.hagrid_serult,
          res(g) { g.f.hagrid_harcol = 1; g.add('ostrom', -1); return 'Hagrid leakasztja a számszeríját a falról. Agyar remegve, de vele tart.'; }
        }
      ]
    },
    kozben: {
      traitor: [{
        id: 'mcg', t: 'Elvonod McGonagall figyelmét.', cmd: 'K9', noWand: true, seen: 'elvonta McGonagall figyelmét, amikor a páncélokat ébresztette',
        fx(g) { if (g.chance(50)) { g.f.pancelok = 0; g.say('A kapunál a páncélok egyenként megállnak, és visszadermednek. McGonagall figyelmét valami elvonta, a bűbáj nem tartott ki.'); } }
      }]
    },
    // K7: the traitor opens a passage of his choice (chosen in after), or the gate bolt if all are sealed.
    onSneak(g, p) {
      if (g.cmd(p) !== 'K7') return undefined;
      if (!PASSAGES.some((k) => !g.f[`${k}_lezarva`])) { g.f.kapu_retesz = 1; return true; }
      g.s.k7Pick.push(p.id);
      return true;
    },
    resolve(g) {
      g.f.pancelok = 1;
      return '';
    },
    async after(g, d, tok) {
      // A traitor still in the cellar can sneak out through the old door (K7 only has an effect now).
      for (const t of g.traitors().filter((x) => x.status === 'bezarva' && x.sneaks > 0 && g.cmd(x) === 'K7')) {
        const k = await secretChoice(g, t, 'A pince falában egy régi ajtó. Nem zárták be.', [{ k: 'sneak', t: '✦ Kiosonsz a régi ajtón' }, { k: 'stay', t: 'Maradsz' }], 15, 'pince');
        g.check(tok);
        if (k !== 'sneak') continue;
        t.sneaks -= 1;
        g.s.sceneLog['III-0'].push({ actor: t.id, kind: 'sneak' });
        if (PASSAGES.some((x) => !g.f[`${x}_lezarva`])) g.s.k7Pick.push(t.id); else g.f.kapu_retesz = 1;
        g.log('kiosonás', `${t.name} kiosont a pincéből (K7).`);
        g.io.notice('Valaki egy időre eltűnt.');
      }
      for (const id of g.s.k7Pick) {
        const t = g.players[id];
        const free = PASSAGES.filter((k) => !g.f[`${k}_lezarva`]);
        if (!free.length) { g.f.kapu_retesz = 1; continue; }
        const k = await secretChoice(g, t, 'Kinyitod az utolsó ajtót. Melyiket?', free.map((x) => ({ k: x, t: PASSAGE_NAMES[x] })), 15, 'K7');
        g.check(tok);
        g.f[`${k}_nyitva`] = 1;
        g.log('K7', `${t.name} kinyitotta: ${k}`);
      }
      g.s.k7Pick = [];
    },
    next: 'III-1'
  });

  // ---------- III-1 Betörnek ----------

  const ENTRY_TEXT = {
    boszorkany: () => 'A harmadik emeleten a szobor púpja kipattan. Csuklyás alakok másznak ki, ezüst álarcban.',
    fuz: (g) => `A park felől üvöltés. Egy hatalmas, szürke, farkasszerű lény rohan a kapu felé a hóban. Telihold van.${g.f.fenrir_sebesult ? ' Az egyik hátsó lábát húzza.' : ''}`,
    vadkan: () => 'A hetedik emeleten egy ajtó jelenik meg a falon. Belülről nyitják.'
  };

  add({
    id: 'III-1', act: 3, title: 'Betörnek', place: 'Bejárati csarnok', clockSet: DAY3 + 20, music: 'storm',
    enter(g) {
      g.add('ostrom', 1);
      marks(g);
      // Where they come in: the trap first, then every open passage, then the gate.
      const open = g.openPassages();
      const strat = typeof g.f.strategia === 'string' ? g.f.strategia : '';
      const trap = strat.startsWith('csapda:') ? strat.slice(7) : null;
      let entry;
      if (trap && open.includes(trap)) {
        entry = { kind: 'csapda', where: [trap] };
        g.f.betores_atjaron = 1;
        g.f.csapda_siker = 1;
        g.add('ostrom', -2);
      } else if (open.length) {
        entry = { kind: 'atjaro', where: open };
        g.f.betores_atjaron = 1;
      } else {
        entry = { kind: 'kapu', where: [] };
        // Blowing up the gate is slower, unless someone drew the bolt from inside.
        if (!g.f.kapu_retesz) g.add('ostrom', -1);
      }
      g.s.entry = entry;
      if (g.f.pancelok) g.add('ostrom', -2);
      g.log('betörés', `${entry.kind}: ${entry.where.join(', ') || 'kapu'}`);
    },
    narr(g) {
      const e = g.s.entry;
      const out = [];
      if (e.kind === 'csapda') {
        out.push('Ott vártok rájuk, ahol jönnek.', ENTRY_TEXT[e.where[0]](g), 'Az első halálfaló még ki sem mászott, amikor már repülnek az átkok.');
      } else if (e.kind === 'atjaro') {
        e.where.forEach((k) => out.push(ENTRY_TEXT[k](g)));
      } else if (g.f.kapu_retesz) {
        out.push('A bejárati kapu reteszét valaki belülről elhúzta. A kapu hangtalanul kitárul. A hó és a köd befelé ömlik, a ködben rongyos alakok lebegnek.');
      } else {
        out.push('A bejárati kapu egy robbanással kiszakad. A hó és a köd befelé ömlik, a ködben rongyos alakok lebegnek.');
      }
      if (g.f.pancelok) out.push('A páncélok összezárnak a bejárati csarnokban. Kardok, buzogányok, csörömpölés. Egy karácsonyi dal foszlányát éneklik, miközben harcolnak.');
      if (g.f.hagrid_harcol) out.push('Hagrid a kapu mellett áll, Agyar a lábánál.');
      out.push('A halálfalókkal együtt a dementorok is beáramlanak. A fáklyák kialszanak. Minden boldog gondolat elszivárog.');
      out.push('Most. Mindannyian. Gondoljatok arra, amit leírtatok.');
      return out;
    },
    async before(g, tok) {
      await commander(g, tok);
      // The trap gives the first round to the team: +10% patronus. R6 dementors take 10% away.
      g.cur.waveBonus = (g.s.entry.kind === 'csapda' ? 10 : 0) - (g.f.r6_dem || 0);
      g.f.r6_dem = 0;
    },
    decision: silverWave((g) => (g.s.entry && g.s.entry.kind === 'csapda' ? 3 : 0) + (g.f.terkep_iii1 ? 3 : 0)),
    resolve(g) {
      const ok = settleWave(g);
      g.f.hullam1 = ok ? 1 : 0;
      if (ok) g.defense('sikeres ezüsthullám');
      return ok
        ? 'Ezüst fény tölti be a csarnokot. A dementorok visszavonulnak a ködbe. Utána a halálfalók szétszóródnak a kastélyban.'
        : 'Túl kevés az ezüst fény. A dementorok a csarnokban maradnak, a hideg mindenkit elér. Utána a halálfalók szétszóródnak a kastélyban.';
    },
    after: (g, d, tok) => r6CurseRun(g, tok),
    next: 'III-2'
  });

  // ---------- III-2 A lépcsők ----------

  add({
    id: 'III-2', act: 3, title: 'A lépcsők', place: 'A mozgó lépcsők', clockSet: DAY3 + 60, music: 'dark',
    enter(g) { g.add('ostrom', 1); marks(g); },
    narr: (g) => [
      CE.V('III-2', [
        'A halálfalók a lépcsőkön jönnek felfelé. A lépcsők mozognak, ahogy mindig, de most mintha szándékosan választanának szét titeket.',
        'Lépések dobognak alattatok. A halálfalók a mozgó lépcsőkön jönnek fel, a lépcsők nyikorogva fordulnak, és szétszakítják a csapatot.',
        'A lépcsőházban a portrék elmenekülnek a képeikből. Lent halálfalók jönnek felfelé, és a lépcsők, mintha ők is félnének, össze-vissza fordulnak.'
      ])(g),
      'Egy átok zöld fénye villan el a fejetek fölött.',
      'ÁTOK!'
    ],
    before: commander,
    decision() {
      const r = CE.curseReflex('ÁTOK!');
      r.options = r.options.concat([{
        k: 'lepcso', t: 'Átugrom a mozgó lépcsőre', w: { loyal: 1, traitor: 1 },
        // Safe, but out of III-3 and III-4; back in III-5 (and counts as a shield at the office in III-4).
        res(g, p) { p.lepcso = true; p.away = 2; g.say(`${p.name} átugrik egy elforduló lépcsőre. A lépcső elviszi.`); }
      }]);
      return r;
    },
    kozben: {
      traitor: [{ id: 'vissza', t: 'Azt mondod: úgyis visszajövünk érte.', cmd: 'K8', noWand: true, seen: 'arról beszélt, hogy úgyis visszajönnek érte' }],
      heir: [{
        id: 'irany', t: 'Rossz irányt mutatsz.', seen: 'rossz irányba mutatta az utat a lépcsőn',
        when: (g) => g.players.some((p) => p.lepcso && p.status === 'el' && p.away > 0),
        fx(g) {
          const x = g.rng.pick(g.players.filter((p) => p.lepcso && p.status === 'el' && p.away > 0));
          if (x) { x.lepcso = false; x.away = 0; x.lepcsoRossz = true; g.log('rossz irány', `${x.name} a Nagy Terembe ért.`); }
        }
      }]
    },
    onSneak: lateSneak,
    async after(g, d, tok) {
      await r6CurseRun(g, tok);
      // Carry the dying with you, or leave them in an armour room (K8 wants someone left behind).
      const dying = g.players.filter((p) => p.status === 'haldoklik' && p.away === 0 && !p.carried && !p.leftBehind);
      const voters = g.present();
      if (!dying.length || !voters.length) return;
      g.cur.out = [];
      const v = await g.vote({
        prompt: `${names(dying.map((p) => p.name))} haldoklik. Viszitek magatokkal?`, time: 30, options: [
          { k: 'A', t: 'Visszük.', w: { loyal: 3, traitor: 1 } },
          { k: 'B', t: 'Itt hagyjuk egy páncélteremben, visszajövünk érte.', w: { loyal: 1, traitor: 3 } }
        ]
      }, voters);
      g.check(tok);
      for (const n of dying) {
        let carrier = null;
        if (v.key === 'A') {
          const r = await g.decide({ type: 'volunteer', prompt: `Ki viszi? (${n.name})`, label: 'Én viszem', time: 15, bot: { loyal: 55, traitor: 15 } }, tok);
          g.check(tok);
          carrier = r.volunteer;
        }
        if (carrier) {
          n.carried = true;
          carrier.slow = (carrier.slow || 0) + 2;
          g.say(`${carrier.name} a hátára veszi: ${n.name}.`);
        } else {
          n.leftBehind = true;
          n.away = 99;
          g.say(`${n.name} egy páncélterem sarkában marad. Egyedül.`);
          g.log('hátrahagyva', n.name);
        }
      }
      await flush(g, 'A lépcsők');
    },
    next: 'III-3'
  });

  // ---------- III-3 Bellatrix ----------

  const DEMAND_TEXT = {
    kard: '„Egy kis cserét ajánlok. Ő… a kardért. Add ide a kardot.”',
    jelszo: '„Egy kis cserét ajánlok. Ő… a kardért. Mondd meg a jelszót.”',
    iroda: '„Egy kis cserét ajánlok. Ő… a kardért. Nyissátok ki nekem az irodát.”'
  };

  async function disarm(g, tok) {
    const host = g.players[g.f.tusz];
    const pool = g.present().filter((p) => p !== host);
    let att = pool.find((p) => p.role === 'parbajozo');
    let ctx = { felix: false, kiteres: false, prot: false };
    let pct = 45;
    if (att) {
      g.io.notice(`Reflektorban: ${att.name}`);
      const r = await solo(g, att, 'Lefegyverzed Bellatrixot!', [{ k: 'cap', t: 'Capitulatus!', hint: CE.mini ? 'utána párbaj: várd ki a jelet' : '70%' }], 5 - takeSlow(att));
      g.check(tok);
      ctx = r.ctx;
      att.powerUsed = true;
      pct = 70;
    } else {
      const r = await g.decide({ type: 'volunteer', prompt: 'Ki próbálja lefegyverezni Bellatrixot?', label: 'Capitulatus!', time: 5, bot: { loyal: 40, traitor: 10 }, who: () => pool }, tok);
      g.check(tok);
      att = r.volunteer;
      takeSlow(att);
    }
    const log = g.s.tuszLog;
    if (!att) {
      log.choice = 'B';
      g.say('Senki nem lép előre. Bellatrix vár egy pillanatig. „Kár.” Egy villanás.');
      g.dying(host, 'atok');
      g.say(`${host.name} összeesik. Bellatrix már a lépcsőn van.`);
      return;
    }
    log.attacker = att.id;
    // The disarm is a reaction duel on the attacker's phone; Felix Felicis still wins outright.
    let won = ctx.felix;
    if (!won && CE.mini) {
      const res = (await g.minigame([att], 'parbaj', { foe: 'Bellatrix', npc: 400 })).get(att.id);
      g.check(tok);
      won = g.duelWon(att, res, 400);
      if (res && res.falseStart) g.say(`${att.name} túl korán emelte a pálcáját.`);
      else if (res && res.reaction != null) g.say(`${att.name} reakcióideje: ${res.reaction} ms.`);
    } else if (!won) won = g.chance(pct);
    if (won) {
      log.ok = true;
      g.add('ostrom', -1);
      g.say(`${att.name}: „Capitulatus!” A pálca ívben repül át a lángoló fák fölött. Bellatrix sikolt, mint egy macska.`);
      g.say('Egy halálfaló visszadobja neki a pálcát, ő pedig az iroda felé menekül.');
      g.defense('Bellatrix lefegyverezve');
    } else {
      log.ok = false;
      const hit = g.risk(att, ctx, 100, () => g.dying(att, 'atok'));
      g.say(hit ? `Bellatrix gyorsabb. ${att.name} összeesik. A túszt eldobja, és a lépcső felé fut.` : 'Bellatrix gyorsabb, de az átok célt téveszt. A túszt eldobja, és a lépcső felé fut.');
    }
  }

  // "Gyere velem, kicsim." The traitor may openly go over to Bellatrix (R6 from then on).
  async function wink(g, tok) {
    const t = g.present().find((p) => p.traitor && !p.withBella) || g.present().find((p) => p.traitor2 && !p.withBella);
    if (!t) return;
    g.cur.out = [];
    await interlude(g, 'Bellatrix', ['Mielőtt eltűnik, Bellatrix valakire ránéz közületek, és kacsint.'], 'cold');
    g.check(tok);
    g.secret(t, 'Gyere velem, kicsim.', 'parancs', 'bella');
    const k = await secretChoice(g, t, 'Gyere velem, kicsim.', [{ k: 'go', t: 'Vele megyek.' }, { k: 'stay', t: 'Maradok.' }], 15, 'bella-hiv');
    g.check(tok);
    if (k === 'go') {
      t.revealed = true;
      t.withBella = true;
      t.away = 999;
      g.add('ostrom', 2);
      g.say(`${t.name} átsétál a lángoló fák között, és megáll Bellatrix mellett. Nem néz vissza.`);
      if (g.f.kard_hol === 'csapat' && keeperOf(g) === t) { loseSword(g, 'az áruló magával vitte'); g.say('A kard vele megy.'); }
      g.log('átállás', `${t.name} Bellatrix mellé állt.`);
    } else {
      g.say('Senki nem mozdult.');
    }
    await flush(g, 'Bellatrix');
  }

  add({
    id: 'III-3', act: 3, title: 'Bellatrix', place: 'Nagy Terem', clockSet: DAY3 + 120, music: 'storm',
    enter(g) {
      g.add('ostrom', 1);
      g.cur.back = rejoin(g);
      marks(g);
      const cur = g.f.tusz != null ? g.players[g.f.tusz] : null;
      if (!cur || !g.present().includes(cur) || g.isEvil(cur)) { const h = pickHostage(g); g.f.tusz = h ? h.id : null; }
      const k = keeperOf(g);
      const knowers = (g.f.jelszo_tudok || []).map((id) => g.players[id]).filter((p) => p && p.status !== 'szellem');
      if (g.f.kard_hol === 'csapat') g.s.demand = 'kard';
      else if (g.f.kard_hol === 'iroda' && knowers.length) g.s.demand = 'jelszo';
      else g.s.demand = 'iroda';
      g.s.demandKeeperHere = !!(k && g.present().includes(k));
      g.s.tuszLog = g.f.tusz != null ? { id: g.f.tusz, demand: g.s.demand, choice: null, attacker: null, ok: null } : null;
    },
    narr(g) {
      const out = [];
      if (g.cur.back.length) out.push(`${names(g.cur.back)} kormosan, de élve ér utol titeket.`);
      out.push('A Nagy Teremben a tizenkét karácsonyfa lángokban áll. A mennyezetről nem hó hull, hanem hamu.');
      out.push('A terem közepén egy nő táncol. Sűrű, fekete haj, nehéz szemhéj, fekete talár. Bellatrix Lestrange.');
      out.push('„Boldog karácsonyt, kicsikéim! Hoztatok nekem ajándékot?”');
      if (g.f.tusz == null) { out.push('Senkit nem ér el. Nevetve továbbáll az iroda felé.'); return out; }
      const h = g.players[g.f.tusz];
      out.push(`Bellatrix pálcája egy pillanat alatt ${h.name} torkához ér. ${h.name} nem tud mozdulni.`);
      out.push(DEMAND_TEXT[g.s.demand]);
      return out;
    },
    before: commander,
    decision(g) {
      if (g.f.tusz == null || !g.present().length) return null;
      return {
        type: 'vote', prompt: 'Mit tesztek?', time: 30, options: [
          {
            k: 'A', t: 'Odaadjuk, amit kér.', w: { loyal: 2, traitor: 3 },
            when: (gg) => gg.s.demand === 'jelszo' || (gg.s.demand === 'kard' && gg.s.demandKeeperHere),
            res(gg) {
              gg.s.tuszLog.choice = 'A';
              if (gg.s.demand === 'kard') loseSword(gg, 'a túszért cserébe');
              else gg.f.bella_jelszo = 1;
              return 'Bellatrix nevet, és a túszt a földre löki. „Okos gyerekek.”';
            }
          },
          {
            k: 'B', t: 'Nem.', w: { loyal: 1, traitor: 2 },
            res(gg) {
              const h = gg.players[gg.f.tusz];
              gg.s.tuszLog.choice = 'B';
              gg.dying(h, 'atok');
              return `„Kár.” Egy villanás. ${h.name} összeesik. Bellatrix már a lépcsőn van.`;
            }
          },
          {
            k: 'C', t: 'Lefegyverezzük.', w: { loyal: 3, traitor: 1 },
            res(gg) { gg.s.tuszLog.choice = 'C'; gg.cur.duel = true; return 'A csapat Bellatrix felé fordul.'; }
          }
        ]
      };
    },
    kozben: {
      heir: [{
        id: 'aruld', t: 'Elárulod a kard őrzőjét.', seen: 'Bellatrix felé intett, a kard őrzőjére mutatva',
        when: (g) => g.f.kard_hol === 'csapat',
        // Bellatrix now knows who holds the sword: her curse in III-4 aims straight at the keeper.
        fx(g) { const k = keeperOf(g); if (k) { g.f.orzo_elarulva = 1; g.secret(k, 'Bellatrix tudja, hogy nálad van a kard.', 'igaz'); } }
      }]
    },
    onSneak: lateSneak,
    async after(g, d, tok) {
      if (g.cur.duel) { g.cur.out = []; await disarm(g, tok); await flush(g, 'Capitulatus'); }
      await wink(g, tok);
      await r6CurseRun(g, tok);
    },
    next: 'III-4'
  });

  // ---------- III-4 A kard ----------

  async function officeRace(g, tok) {
    let inside = null;
    const lines = ['A vízköpő előtt álltok. Mögöttetek léptek, Bellatrix nevetése a lépcsőházban.'];
    const knowers = (g.f.jelszo_tudok || []).map((id) => g.players[id])
      .filter((p) => p && p.status === 'el' && !p.withBella && !p.escaped && (p.away === 0 || p.lepcso));
    let pw = knowers.length > 0;
    // Bellatrix knows the password (III-3 A): the team must get there first.
    if (pw && g.f.bella_jelszo && !g.chance(50)) {
      pw = false;
      lines.push('Mire odaértek, a vízköpő már félre van ugorva. Bellatrix tudta a jelszót, és előbb ért ide.');
    }
    if (g.f.piton_segitett) inside = 'piton';
    else if (pw) { inside = 'jelszo'; lines.push(`${knowers[0].name} kimondja a jelszót. A vízköpő félreugrik.`); }
    await interlude(g, 'A verseny az irodáért', lines, 'dark');
    g.check(tok);
    if (!inside && (g.f.piton_gyanu || 0) >= 1 && g.present().length) {
      const v = await g.vote({
        prompt: 'Piton professzor áll az iroda ajtajában. Elfogadjátok a segítségét?', time: 20, options: [
          { k: 'A', t: 'Igen, vele megyünk.', w: { loyal: 2, traitor: 1 } },
          { k: 'B', t: 'Nem bízunk benne.', w: { loyal: 1, traitor: 2 } }
        ]
      }, g.present());
      g.check(tok);
      if (v.key === 'A') inside = 'piton';
    }
    if (inside === 'piton') {
      g.f.piton_segitett = 1;
      g.add('ostrom', -1);
      await interlude(g, 'Piton', ['Az iroda ajtajában Piton professzor áll, pálcával. A lábánál két ájult halálfaló. Rátok néz, és a hangja ugyanolyan hideg, mint mindig.', '„Ennyi ideig tartott?”'], 'dark');
      g.check(tok);
      g.present().forEach((p) => g.secret(p, 'Piton egész karácsonykor a kardot őrizte. Dumbledore kérte meg.', 'igaz'));
    }
    if (inside) g.players.filter((p) => p.status === 'el' && (p.away === 0 || p.lepcso)).forEach((p) => { p.inOffice = true; });
    return inside;
  }

  // Bellatrix's curse at the sword keeper. Shield-holding helpers (Közben: Segítesz) and the stair-jumpers protect him.
  async function keeperReflex(g, d, tok) {
    const k = keeperOf(g);
    if (g.f.kard_hol !== 'csapat' || !k || k.status !== 'el' || (k.away && !k.lepcso)) return;
    g.cur.out = [];
    await interlude(g, 'A kard', ['Bellatrix megjelenik a lépcső tetején. Egyenesen a kard őrzőjére néz.', 'ÁTOK!'], 'dark');
    g.check(tok);
    const shields = (d.helpers || 0) + g.players.filter((p) => p.lepcso && p !== k && p.status === 'el').length;
    const aimed = g.f.orzo_elarulva ? 10 : 0;
    const prot = Math.min(95, 50 + 15 * shields - aimed);
    const time = 5 - (g.f.r6_fenrir || 0) - takeSlow(k);
    g.f.r6_fenrir = 0;
    const { o, ctx } = await solo(g, k, 'ÁTOK! Bellatrix rád céloz.', [
      { k: 'protego', t: 'Protego!', hint: `${prot}%`, w: { loyal: 2, traitor: 1 } },
      { k: 'fut', t: 'Futok a karddal.', hint: `${60 - aimed}%`, w: { loyal: 1, traitor: 2 } }
    ], time);
    g.check(tok);
    if (o.k === 'protego') {
      if (ctx.felix || g.chance(prot)) { g.say(`${k.name} pajzsa felragyog${shields ? ', a többiek pajzsaival együtt' : ''}. Az átok lepattan.`); }
      else if (g.risk(k, ctx, 100, () => g.dying(k, 'atok'))) {
        g.say(`${k.name} összeesik. A kard csörömpölve elcsúszik a padlón.`);
        const pool = g.present().filter((p) => p !== k);
        const r = pool.length ? await g.decide({ type: 'volunteer', prompt: 'A kard a padlón csúszik. Felkapod?', label: 'Felkapom', time: 5, bot: { loyal: 55, traitor: 70 }, who: () => pool }, tok) : {};
        g.check(tok);
        if (r.volunteer) { takeSword(g, r.volunteer); g.say(`${r.volunteer.name} felkapja a kardot.`); }
        else { loseSword(g, 'senki nem kapta fel'); g.say('Senki nem ér oda időben. Bellatrix lehajol, és felveszi a kardot.'); }
      }
    } else if (g.risk(k, ctx, 40 + aimed, () => g.wound(k, 'atok'))) {
      g.say(`Az átok súrolja ${k.name} vállát. A kard nála marad.`);
    } else {
      g.say(`${k.name} a karddal a kezében befordul a sarkon. Megúszta.`);
    }
    await flush(g, 'A kard');
  }

  add({
    id: 'III-4', act: 3, title: 'A kard', place: 'A vízköpő előtt', clockSet: DAY3 + 180, music: 'dark',
    enter(g) {
      g.add('ostrom', 1);
      g.cur.back = rejoin(g);
      marks(g);
    },
    narr(g) {
      const out = [];
      if (g.cur.back.length) out.push(`${names(g.cur.back)} kormosan, de élve ér utol titeket.`);
      if (g.f.kard_hol === 'iroda') out.push('Bellatrix az iroda felé tart. Ki ér oda előbb?');
      else if (g.f.kard_hol === 'csapat') out.push('A kard nálatok van. Bellatrix tudja. Hallani, ahogy a lépcsőházban nevetve közeledik.');
      else out.push('Bellatrix nevetése a lépcsőházban visszhangzik. A kard nála van.');
      return out;
    },
    async before(g, tok) {
      await commander(g, tok);
      g.cur.out = [];
      let inside = null;
      if (g.f.kard_hol === 'iroda') inside = await officeRace(g, tok);
      // Fawkes comes if the team stayed loyal to Dumbledore; the Sorting Hat brings the sword to whoever asks.
      if ((g.f.dumbledore_hu || 0) >= 2 && !g.f.fawkes) {
        g.f.fawkes = 1;
        g.add('ostrom', -2);
        const need = g.f.kard_hol !== 'csapat';
        await interlude(g, 'Fawkes', ['A lépcsőház tetejéről dal hull alá. Egy hattyú méretű, skarlátvörös madár száll le, farktollai aranylanak. Fawkes.'].concat(need ? ['A karmai között egy kopott, foltos varázslósüveg: a Teszlek Süveg.'] : []), 'phoenix');
        g.check(tok);
        if (need && g.present().length) {
          const r = await g.decide({ type: 'volunteer', prompt: 'Ki nyúl a Süvegbe?', label: 'Belenyúlok', time: 15, bot: { loyal: 60, traitor: 45 } }, tok);
          g.check(tok);
          // The sword only comes to someone the Hat finds brave enough: earlier volunteering and duelling help.
          const brave = r.volunteer && g.chance(55 + (r.volunteer.stats.volunteered > 1 ? 15 : 0) + (r.volunteer.role === 'parbajozo' ? 15 : 0));
          if (r.volunteer && !brave) {
            g.say(`${r.volunteer.name} belenyúl a Süvegbe. Üres. A Süveg nem adja a kardot.`);
          } else if (r.volunteer) {
            takeSword(g, r.volunteer);
            g.say('A Süvegben valami nehéz és hideg csillan. Egy kard markolata, rubinokkal kirakva.');
            g.say(`${r.volunteer.name} kihúzza Griffendél kardját. A kard ahhoz jön, aki igazán kéri.`);
          } else g.say('Senki nem nyúl a Süvegbe. Fawkes a lépcső korlátjára ül, és vár.');
        }
      }
      if (g.f.kard_hol === 'iroda' && inside && g.present().length) {
        const r = await g.decide({ type: 'volunteer', prompt: 'A vitrinben Griffendél kardja. Ki veszi magához?', label: 'Én', time: 15, bot: { loyal: 55, traitor: 50 } }, tok);
        g.check(tok);
        const p = r.volunteer || g.rng.pick(g.present());
        takeSword(g, p);
        g.say(`${p.name} kiemeli a kardot a vitrinből.`);
      }
      if (g.f.kard_hol === 'iroda') {
        loseSword(g, 'Bellatrix ért be előbb');
        g.say('Az iroda ajtaja kivágódik. Bellatrix nevetve lép ki rajta. A kezében rubinokkal kirakott kard.');
      }
      await flush(g, 'A kard');
    },
    kozben: {
      traitor: [{
        id: 'kez', t: 'Kinyújtod a kezed a kard felé.', noWand: true, seen: 'a kard felé nyúlt',
        when: (g) => g.f.kard_hol === 'csapat',
        // In the finale, if he obeys, the sword is within his reach: trust test with the keeper.
        fx(g, d, actor) { g.f.kard_kez = actor.id; }
      }]
    },
    onSneak: lateSneak,
    async after(g, d, tok) {
      await keeperReflex(g, d, tok);
      await r6CurseRun(g, tok);
      marks(g);
    },
    next: 'III-5'
  });

  // ---------- III-5 A megtört átok (finale) ----------

  // Step 1 outcome of the last suspicion vote.
  function holdSuspect(g, t) {
    g.s.suspicionResults = (g.s.suspicionResults || []).concat({ act: 3, id: t.id, correct: g.isEvil(t) });
    t.held = true;
    t.away = 99;
    if (t.traitor || t.traitor2) {
      t.revealed = true;
      g.f.vegso_gyanu = 'aruló';
      const duel = g.present().find((p) => p.role === 'parbajozo' && !p.powerUsed && !g.isEvil(p));
      if (duel) {
        duel.powerUsed = true;
        t.wand = false;
        t.disarmed = true;
        g.say(`${duel.name} pálcája megvillan: „Capitulatus!” ${t.name} pálcája ívben elrepül.`);
      } else t.halfObey = true;
      g.say(`Lefogják: ${t.name}. Nem tiltakozik. Csak néz maga elé, és dúdol valamit.`);
    } else {
      g.f.vegso_gyanu = 'rossz';
      g.f.vegso_gyanu_id = t.id;
      g.add('ostrom', 1);
      g.say(`Lefogják: ${t.name}. Bellatrix felnevet: „Rossz kéz.”`);
    }
  }

  // "Engedelmeskedem" with the sword in reach: the keeper (or a loyal neighbour) holds on or lets go.
  async function swordStruggle(g, t, tok) {
    if (g.f.kard_hol !== 'csapat' || t.held || t.withBella || t.escaped) return;
    const k = keeperOf(g);
    if (!k || k.status !== 'el') return;
    let other;
    if (k === t) other = g.rng.pick(g.present().filter((p) => p !== t && !g.isEvil(p)));
    else if (g.f.kard_kez === t.id && t.away === 0 && k.away === 0) other = k;
    else return;
    if (!other) { loseSword(g, 'az áruló átadta'); g.say(`${t.name} megfordul, és átnyújtja a kardot Bellatrixnak.`); return; }
    g.io.notice(`Bizalompróba: ${other.name} és a kard`);
    const ans = await g.collect([other], () => ({ kind: 'choice', title: `${t.name} a kard után nyúl. Szorítod, vagy elengeded?`, options: [{ k: 'hold', t: 'Szorítom' }, { k: 'let', t: 'Elengedem' }], meta: { type: 'trust', partner: t.id } }), 20);
    g.check(tok);
    const c = (ans.get(other.id) || {}).k || 'hold';
    g.log('bizalom', `${other.name}: ${c} (kard, ${t.name})`);
    if (c === 'let') {
      loseSword(g, 'elengedték');
      g.say(`${other.name} elengedi. ${t.name} megfordul, és a kard Bellatrix kezébe kerül.`);
    } else {
      g.wound(t, 'atok');
      g.wound(other, 'atok');
      if (k === t) takeSword(g, other);
      g.say(`${other.name} nem engedi el. Mindketten elesnek a lépcsőn, de a kard ${keeperOf(g).name} kezében marad.`);
    }
  }

  async function traitorChoice(g, tok) {
    for (const t of g.traitors().filter((x) => x.status === 'el')) {
      const opts = [];
      if (t.resist >= 3) opts.push({ k: 'resist', t: 'Ellenállok.' });
      opts.push(t.disarmed ? { k: 'none', t: 'Nem teszek semmit.' } : { k: 'obey', t: 'Engedelmeskedem.' });
      g.secret(t, 'Most, kicsim. Most!', 'parancs', 'bella');
      const k = await secretChoice(g, t, 'Most, kicsim. Most!', opts, 15, 'vegso');
      g.check(tok);
      g.log('végső döntés', `${t.name}: ${k}`);
      if (k === 'resist') {
        t.ellenallt = true;
        g.f.ellenallt = 1;
        g.add('ostrom', -3);
        g.cur.out = [];
        await interlude(g, 'Capitulatus', t.wand
          ? [`${t.name} remeg. Aztán felemeli a pálcáját. De nem felétek fordul.`, '„Capitulatus!”', 'Bellatrix pálcája kirepül a kezéből. Az arcán először látszik valami, ami nem nevetés.']
          : [`${t.name} remeg. Pálcája nincs, mégis kitépi magát, és Bellatrix karjába kapaszkodik.`, 'Bellatrix pálcája kirepül a kezéből. Az arcán először látszik valami, ami nem nevetés.'], 'silence');
        g.check(tok);
      } else if (k === 'obey') {
        g.cur.out = [];
        if (t.halfObey && !g.chance(50)) {
          g.say('Valaki megfeszül a lefogó kezek között, de nem tud kiszabadulni.');
        } else {
          t.obeyed = true;
          g.add('ostrom', 2);
          g.say('Bellatrix felnevet: „Ügyes, kicsim.” A dementorok közelebb ereszkednek.');
          await swordStruggle(g, t, tok);
        }
        await flush(g, 'Most!');
      } else {
        g.cur.out = ['Senki nem mozdult.'];
        await flush(g, 'Most!');
      }
    }
  }

  // R9: the ghosts fight too; then each ghost may whisper one word before the last wave.
  async function haunting(g, tok) {
    const ghosts = g.ghosts();
    if (!ghosts.length) return;
    if (g.sys('R9')) {
      await interlude(g, 'Kísértetjárás', ['A kastély kísértetei mind előjönnek a falakból. Mellettük a ti halottaitok, ezüstösen. Ma éjjel ők is harcolnak.'], 'silver');
      g.check(tok);
      const opts = [{ k: 'bella', t: 'Bellatrix' }, { k: 'fenrir', t: 'Fenrir' }, { k: 'dementor', t: 'A dementorok' }];
      const ans = await g.collect(ghosts, () => ({ kind: 'choice', title: 'Kire csaptok le?', options: opts, meta: { type: 'ghost' } }), 15);
      g.check(tok);
      const picks = ghosts.map((p) => (ans.get(p.id) || {}).k || 'dementor');
      g.cur.out = [];
      if (picks.every((x) => x === picks[0])) {
        g.add('ostrom', -Math.min(3, ghosts.length));
        const target = picks[0];
        g.f[`r9_${target}`] = 1;
        g.say(`A szellemek mind egyszerre csapnak le ${{ bella: 'Bellatrixra', fenrir: 'Fenrirre', dementor: 'a dementorokra' }[target]}.`);
        g.say({ bella: 'Bellatrix megtántorodik.', fenrir: 'Fenrir vonyítva hátrál.', dementor: 'A dementorok megremegnek. Az utolsó ezüsthullám erősebb lesz.' }[target]);
      } else {
        g.add('ostrom', -1);
        g.say('A szellemek szétszóródnak. A kastély kísértetei egyedül próbálják.');
      }
      g.log('kísértetjárás', picks.join(' '));
      await flush(g, 'Kísértetjárás');
    }
    const living = g.living().filter((p) => p.status !== 'szellem');
    if (!living.length) return;
    const wopts = [{ k: 'none', t: 'Most nem súgok' }].concat(CE.WHISPERS.map((w) => ({ k: `w:${w}`, t: w })));
    const ans = await g.collect(ghosts, () => ({ kind: 'choice', title: 'Súgj valakinek, mielőtt elkezdi.', options: wopts, targets: living.map((x) => ({ id: x.id, name: x.name })), meta: { type: 'whisper' } }), 15, { dflt: () => ({ k: 'none' }) });
    g.check(tok);
    ghosts.forEach((p) => {
      const a = ans.get(p.id);
      if (!a || !a.k || !a.k.startsWith('w:')) return;
      const to = (g.players[a.to] && g.players[a.to].status !== 'szellem') ? g.players[a.to] : g.rng.pick(living);
      g.secret(to, `${p.name} szelleme a füledbe súgja: „${a.k.slice(2)}”`, 'szellem');
      g.log('suttogás', `${p.name} → ${to.name}: ${a.k.slice(2)}`);
    });
  }

  add({
    id: 'III-5', act: 3, title: 'A megtört átok', place: 'A lépcsőház teteje', clockSet: DAY3 + 300, music: 'breath',
    enter(g) {
      g.cur.joined = [];
      g.players.forEach((p) => {
        if (!p.lepcso) return;
        p.lepcso = false;
        if (p.status === 'el') { p.away = 0; p.absentNow = false; g.cur.joined.push(p.name); }
      });
      g.cur.back = rejoin(g);
      marks(g);
    },
    narr(g) {
      const out = [];
      const all = g.cur.joined.concat(g.cur.back);
      if (all.length) out.push(`Egy mellékfolyosóról ${names(all)} fut be, kormosan, pálcával a ${all.length > 1 ? 'kezükben' : 'kezében'}.`);
      out.push('A lépcsőház tetején álltok. Alattatok égnek a karácsonyfák, körülöttetek dementorok köröznek, előttetek Bellatrix nevet.');
      out.push('„Egyikőtök már az enyém. Ugye, kicsim?”');
      return out;
    },
    async before(g, tok) {
      // Step 1: the last suspicion, unless every living traitor is already in the open.
      g.f.vegso_gyanu = 'senki';
      const hidden = g.traitors().filter((t) => t.status !== 'szellem' && !openSide(t));
      if (hidden.length && g.present().length > 1) {
        await interlude(g, 'Az utolsó gyanú', ['Utoljára. Mielőtt Bellatrix szól, le kell fognotok valakit.'], 'organ');
        g.check(tok);
        const r = await g.suspicion({ prompt: 'Kit fogtok le?', debate: 60 }, tok);
        g.check(tok);
        g.cur.out = [];
        if (r.target) holdSuspect(g, r.target);
        else g.say('Senki nem mozdul. Bellatrix nevet.');
        await flush(g, 'Az utolsó gyanú');
      }
      // Step 2: the traitor's secret choice.
      await traitorChoice(g, tok);
      // R9 before step 3.
      await haunting(g, tok);
      // Step 3: the last silver wave.
      await interlude(g, 'Az utolsó ezüsthullám', ['A dementorok mind egyszerre ereszkednek le. Ez az utolsó esély.', 'HIDEG ÁRAD!'], 'breath');
      g.check(tok);
      g.cur.out = [];
      g.cur.waveBonus = (g.f.r9_dementor ? 10 : 0) - (g.f.r6_dem || 0);
      g.f.r6_dem = 0;
      g.cur.wave = null;
      if (g.present().length) { await g.decide(silverWave(() => 0), tok); g.check(tok); }
      const ok = settleWave(g);
      if (ok) g.f.ezust_hajnal = 1;
      g.say(ok ? 'Az ezüst fény betölti a lépcsőházat. A dementorok szétszóródnak a sötét ég felé.' : 'Az ezüst köd elfogy. A dementorok maradnak.');
      await flush(g, 'Az utolsó ezüsthullám');
      // Step 4: dawn (R10: 06:00).
      g.s.clock = DAY3 + 360;
      g.io.update();
      if (g.f.dumbledore_uzenet) {
        g.add('ostrom', -3);
        g.f.dumbledore_vissza = 1;
        await interlude(g, 'Hajnal', ['Az ablakokon túl szürkülni kezd az ég. A bejárati csarnokban egy magas, ezüst szakállú alak lép be a hóból. Albus Dumbledore.', 'Nem mond semmit. Csak felemeli a pálcáját, és a dementorok, mint a köd a napfényben, eltűnnek.'], 'dawn');
      } else {
        await interlude(g, 'Hajnal', ['Az ablakokon túl szürkülni kezd az ég.'], 'dawn');
      }
      g.check(tok);
    },
    resolve(g) {
      if (g.f.ostrom >= 8) {
        g.f.kastely_elesett = 1;
        g.log('feloldás', 'a kastély elesett');
        return 'A kastély elesik. Bellatrix nevetése betölti a termet, a halálfalók elfoglalják a kastélyt.';
      }
      g.f.bella_menekult = 1;
      g.log('feloldás', `Bellatrix menekül (${g.f.kard_hol === 'bellatrix' ? 'a karddal' : 'üres kézzel'})`);
      return `Bellatrix sikoltva fut a lépcsőn lefelé, a halálfalók utána. A hóviharban egy pillanat alatt eltűnnek. ${g.f.kard_hol === 'bellatrix' ? 'A kezében ott a kard.' : 'Üres kézzel.'}`;
    },
    next: 'III-6'
  });

  // ---------- the endings (script section 2; the first match wins) ----------

  function cmdOk(g, t) {
    return Object.keys(g.s.cmdResults).filter((k) => k.startsWith(`${t.id}:`) && g.s.cmdResults[k].ok).length;
  }

  function teamWinners(g) {
    const w = ['csapat'];
    if (g.players.some((p) => p.traitor && p.ellenallt)) w.push('aruló');
    if (g.players.some((p) => p.traitor2 && !p.traitor && p.ellenallt)) w.push('aruló2');
    return w;
  }

  // Bellatrix's side: the heir always wins, the traitor with 2 fulfilled commands, the second one with 1; never after resisting.
  function bellaWinners(g) {
    const w = [];
    if (g.players.some((p) => p.traitor && !p.ellenallt && cmdOk(g, p) >= 2)) w.push('aruló');
    if (g.players.some((p) => p.traitor2 && !p.traitor && !p.ellenallt && cmdOk(g, p) >= 1)) w.push('aruló2');
    if (g.players.some((p) => p.heir)) w.push('nagyur');
    return w;
  }

  function computeEnding(g) {
    const f = g.f;
    const t1 = g.players.find((p) => p.traitor);
    const free = g.players.filter((p) => p.status === 'el' && !p.held && !p.withBella && !p.escaped);
    const sword = f.kard_hol === 'csapat' ? 'csapat' : 'bellatrix';
    const mk = (num, id, name, team, text) => ({ id, num, name, winners: team ? teamWinners(g) : bellaWinners(g), text });
    if (g.s.earlyEnd === 'aragog') {
      return mk(1, 'aragog', 'Aragog lakomája', false, ['A Rengetegből kevesen tértetek vissza. Éjfélkor senki nem állt a kapuban. A pókok a fák alatt lakmároznak, a halálfalók pedig nyitott kapun sétálnak be.']);
    }
    if (!free.length) {
      return mk(2, 'myrtle', 'Myrtle társasága', false, ['Reggel a második emeleti mosdóban szokatlanul sokan vannak. Ezüstös, áttetsző alakok, akik nem tudják, hogyan kerültek oda.', 'Myrtle boldog. Végre nem egyedül kísért.']);
    }
    if (f.kastely_elesett) {
      return mk(3, 'ostrom', 'Az ostrom', false, ['A Nagy Teremben halálfalók ülnek a tanári asztalnál, és a karácsonyi pudingot eszik. A páncélok darabokban hevernek a csarnokban.', 'A torony fölött zölden izzik a Sötét Jegy.']);
    }
    if (sword === 'csapat' && !g.s.deaths.length) {
      return mk(4, 'csendes_ej', 'Csendes éj', true, ['Mind ott vagytok. Kormosan, sebesen, csupa hamu és dér. De mind ott vagytok.', 'Dumbledore professzor végignéz rajtatok, és csak annyit mond: „Boldog karácsonyt.”', 'Hagrid sír, és mindenkit megölel. A mennyezetről hó hull.']);
    }
    if (sword === 'csapat' && f.ellenallt) {
      const who = names(g.traitors().filter((t) => t.ellenallt).map((t) => t.name));
      return mk(5, 'megtort_atok', 'A megtört átok', true, [`${who} a hosszú asztal végén ül, egy bögre forró csokoládéval, és még mindig remeg. Nem emlékszik mindenre.`, 'Arra viszont igen, hogy az utolsó pillanatban ő döntött. Nem a hang a fejében.', 'Valaki leül mellé. Aztán még valaki. Senki nem kérdez semmit.']);
    }
    if (sword === 'csapat' && f.ezust_hajnal) {
      const animals = [];
      g.players.filter((p) => p.stats.patronusOk > 0).forEach((p) => { if (!animals.includes(p.patronus) && animals.length < 4) animals.push(p.patronus); });
      const list = animals.length ? names(animals.map((a) => `egy ${a}`)) : 'egy vidra, egy nyúl, egy farkas, egy bagoly';
      return mk(6, 'ezust_hajnal', 'Ezüst hajnal', true, [`Amikor a nap felkel, a teremben még mindig ezüstös fények keringenek: ${list}. A patrónusaitok nem akarnak elmenni.`, 'McGonagall professzor nézi őket, és most az egyszer nem szól rátok, hogy menjetek aludni.']);
    }
    if (sword === 'csapat' && (f.fawkes || f.dumbledore_vissza)) {
      return mk(7, 'fawkes_dala', 'Fawkes dala', true, ['Fawkes a kiégett karácsonyfa egyik ágán ül, és énekel. A hangjától a seb a karotokon begyógyul, és a hamu alól kizöldell egy ág.', 'Griffendél kardja Dumbledore asztalán fekszik. A helyén.']);
    }
    if (sword === 'csapat') {
      return mk(8, 'hamvas', 'Hamvas karácsony', true, ['A kard a helyén van. Bellatrix elmenekült. De nem mindenki ünnepelhet.', 'Az asztalnál üres helyek. A gyengélkedőn csend. Valaki letörli a hamut egy szék támlájáról.']);
    }
    // Ending 9 needs an innocent in the cellar; holding the heir is a wrong hand too, but not an innocent one.
    if (f.vegso_gyanu === 'rossz' && f.vegso_gyanu_id != null && !g.isEvil(g.players[f.vegso_gyanu_id])) {
      const inno = g.players[f.vegso_gyanu_id];
      const holder = t1 && t1.status !== 'szellem' ? t1.name : 'Bellatrix';
      return mk(9, 'rossz_ember', 'Rossz embert zártatok be', false, [`${inno.name} a pince hideg kövén ül. Odafönt a halálfalók ünnepelnek.`, `${holder} a kard markolatát simogatja, és dúdol valamit. Egy gúnyos, éneklő dallamot.`]);
    }
    return mk(10, 'bellatrix', 'Bellatrix nevetése', false, ['Valahol a hóviharban, Roxmorts felé, egy nő nevet. A kezében rubinokkal kirakott kard csillog.', 'Dumbledore irodájában üres a vitrin.']);
  }

  // R3 goals that data.js leaves open (check returns null) are decided here, at the end of the game.
  const LATE_GOALS = {
    kard: (g, p) => g.f.kard_hol === 'csapat' && g.f.kard_orzo === p.id,
    kardH: (g, p) => !!p.hadSword,
    iroda: (g, p) => !!(p.inOffice || (g.f.jelszo_tudok || []).includes(p.id)),
    terkep3: (g, p) => !!p.map3,
    tavol: (g, p) => !!(p.tavol || ((g.s.history.includes('II-F2') || g.s.history.includes('II-V2')) && !g.s.deaths.some((x) => x.id === p.id && x.act < 2)))
  };

  function applyLateGoals(g) {
    g.players.forEach((p) => {
      if (!p.goal || p.goal.late || !LATE_GOALS[p.goal.id]) return;
      p.goal = Object.assign({}, p.goal, { late: true, check: LATE_GOALS[p.goal.id] });
    });
  }

  // ---------- III-6 Hajnal ----------

  add({
    id: 'III-6', act: 3, title: 'Hajnal', place: 'Roxfort, hajnal', clockSet: DAY3 + 370, music: 'bells',
    enter(g) {
      // The music depends on the sword (bells with the team, a single dying piano note without).
      this.music = g.f.kard_hol === 'csapat' && !g.f.kastely_elesett ? 'bells' : 'piano';
      g.cur.healed = [];
      // Fawkes' tears reach only one of the dying before the phoenix leaves.
      if (g.f.fawkes) {
        g.players.filter((p) => p.status === 'haldoklik').slice(0, 1).forEach((p) => { g.revive(p); g.cur.healed.push(p.name); });
      }
      g.endAct();
      g.s.ending = computeEnding(g);
      g.log('befejezés', `${g.s.ending.num}. ${g.s.ending.name} · nyert: ${g.s.ending.winners.join(', ') || 'senki'}`);
    },
    narr(g) {
      const out = [];
      if (g.cur.healed.length) out.push(`Fawkes leszáll a lépcsőházba. A könnyei ${names(g.cur.healed)} sebére hullanak, és a sebek begyógyulnak.`);
      g.s.deaths.filter((x) => x.act === 3).forEach((x) => out.push(`${g.players[x.id].name} nem éri meg a hajnalt. Halvány, ezüstös alak áll fel a lépcsőn, és a többiek mellé lép.`));
      out.push(g.f.kard_hol === 'csapat' && !g.f.kastely_elesett ? 'Valahol csengettyűk szólnak, egyre hangosabban.' : 'Egyetlen, elhaló zongorahang.');
      return out;
    },
    escort: false,
    next: 'E1'
  });

  // ---------- EPILOGUE ----------

  add({
    id: 'E1', act: 3, title: 'Hajnal a Nagy Teremben', place: 'Nagy Terem, karácsony utáni hajnal', music: 'dawn',
    enter(g) {
      if (g.s.earlyEnd) {
        // Act II ended early: the commands drawn for an Act III that never happened are dropped.
        g.traitors().forEach((t) => { if (!g.s.cmdResults[`${t.id}:3`]) delete t.cmds[3]; });
      }
      if (!g.s.ending) g.s.ending = computeEnding(g);
      this.music = g.s.ending.winners.includes('csapat') ? 'dawn' : 'dark';
      applyLateGoals(g);
    },
    narr(g) {
      return ['Karácsony utáni hajnal. A Nagy Teremben a fák kiégett csonkjai füstölögnek. A mennyezetről újra hó hull.'].concat(g.s.ending.text);
    },
    escort: false,
    next: 'E2'
  });

  add({
    id: 'E2', act: 3, title: 'Felfedés', place: 'Epilógus', music: 'organ',
    enter(g) { applyLateGoals(g); },
    narr(g) {
      const out = [];
      g.traitors().forEach((t) => {
        if (t.traitor2 && !t.traitor) out.push(`A második megszállott: ${t.name}, ${g.roleName(t).toLowerCase()}. A lakomán, a puding után…`);
        else out.push(`A megszállott: ${t.name}, ${g.roleName(t).toLowerCase()}. A Három Seprűben, a sarokasztalnál…`);
        if (t.ellenallt) out.push(`Az utolsó pillanatban ${t.name} ellenállt.`);
      });
      g.players.filter((p) => p.heir).forEach((h) => out.push(`A Nagyúr híve: ${h.name}.`));
      return out;
    },
    escort: false,
    async after(g) { await g.io.reveal(g.revealData()); },
    next: 'E3'
  });

  const WHEN = { 1: 'Szenteste', 2: 'Karácsony napján', 3: 'Karácsony éjjelén' };

  // E3: up to five lines from the run's log, in the script's priority order.
  function whoDidWhat(g) {
    const byName = (text, suffix) => g.players.find((p) => text.startsWith(p.name + suffix));
    const actOf = (e) => (S[e.scene] || {}).act;
    const cats = [[], [], [], [], [], []];
    g.s.log.forEach((e) => {
      if (e.kind === 'mentés') {
        const p = byName(e.text, ' megmenekült');
        const by = p && g.players.find((x) => x !== p && e.text.includes(`(${x.name})`));
        if (p && by) cats[0].unshift(`${p.name} már nem mozdult. ${by.name} visszament érte.`);
      } else if (e.kind === 'észrevette') {
        const w = g.players.find((p) => e.text.startsWith(`${p.name} látta: `));
        if (!w) return;
        const rest = e.text.slice(`${w.name} látta: `.length);
        const a = g.players.find((p) => rest.startsWith(`${p.name} `));
        // The engine's spotting texts are written to the watcher ("a táskádban"); the epilogue speaks about them.
        if (a && (a.traitor || a.traitor2)) cats[1].push(`${WHEN[actOf(e)] || 'Egyszer'} ${w.name} látta, hogy ${a.name} ${rest.slice(a.name.length + 1).replace('a táskádban', 'a táskájában')}. És tudta.`);
      } else if (e.kind === 'suttogás') {
        const gh = g.players.find((p) => e.text.startsWith(`${p.name} → `));
        if (!gh) return;
        const rest = e.text.slice(`${gh.name} → `.length);
        const to = g.players.find((p) => rest.startsWith(`${p.name}: `));
        if (to) cats[4].push(`${gh.name} szellemként ezt súgta ${dat(to.name)}: „${rest.slice(to.name.length + 2)}”.`);
      }
    });
    const tl = g.s.tuszLog;
    if (tl && tl.choice) {
      const h = g.players[tl.id].name;
      const att = tl.attacker != null ? g.players[tl.attacker].name : null;
      const thing = { kard: 'A csapat nem adta oda a kardot.', jelszo: 'A csapat nem árulta el a jelszót.', iroda: 'A csapat nem nyitotta ki neki az irodát.' }[tl.demand];
      if (tl.choice === 'A') cats[2].push(`${h} Bellatrix pálcája előtt állt. A csapat odaadta, amit kért.`);
      else if (tl.choice === 'B') cats[2].push(`${h} Bellatrix pálcája előtt állt. ${thing}`);
      else cats[2].push(`${h} Bellatrix pálcája előtt állt. ${att} ${tl.ok ? 'lefegyverezte Bellatrixot.' : 'megpróbálta lefegyverezni Bellatrixot.'}`);
    }
    // Category 4 (gifts to the traitor) is not in the engine log, so it stays empty.
    const whisperers = new Set();
    g.s.log.filter((e) => e.kind === 'suttogás').forEach((e) => { const gh = g.players.find((p) => e.text.startsWith(`${p.name} → `)); if (gh) whisperers.add(gh.id); });
    g.s.deaths.forEach((x) => { if (!whisperers.has(x.id)) cats[4].push(`${g.players[x.id].name} nem érte meg a hajnalt. A gyertyája ezüstös füstté vált.`); });
    cats[5].push('A puding elfogyott.', 'A Kövér Dáma még mindig énekel.');
    // One line per category first (priority order), then more from the same categories; the funny lines only fill up.
    const lines = [];
    const story = cats.slice(0, 5);
    story.forEach((c) => { if (c.length && lines.length < 5) lines.push(c.shift()); });
    story.concat([cats[5]]).forEach((c) => { while (c.length && lines.length < 5) lines.push(c.shift()); });
    return lines;
  }

  add({
    id: 'E3', act: 3, title: 'Ki mit tett', place: 'Epilógus', music: 'carol',
    enter(g) { applyLateGoals(g); },
    escort: false,
    async after(g) { await g.io.info('Ki mit tett', whoDidWhat(g)); },
    next: 'E4'
  });

  add({
    id: 'E4', act: 3, title: 'Győztesek és a gyűjtemény', place: 'Epilógus', music: 'bells',
    enter(g) { applyLateGoals(g); this.music = g.s.ending.winners.includes('csapat') ? 'bells' : 'dark'; },
    narr: (g) => [g.s.ending.name],
    escort: false,
    async after(g) { if (g.io.ending) await g.io.ending(g.s.ending); },
    next: 'E5'
  });

  add({
    id: 'E5', act: 3, title: 'A döntési fa', place: 'Epilógus', music: 'piano',
    escort: false,
    async after(g) { if (g.io.tree) await g.io.tree({ history: g.s.history }); },
    next: null
  });
})(window.CE = window.CE || {});
