// Act II (Karácsony napja) as scene data. Source: forgatokonyv/02-II-felvonas.md, plus R5 (the second touch)
// and R6 (the cellar escape) from forgatokonyv/01a-kiegeszito-rendszerek.md.
// Option weights w:{loyal, traitor} and volunteer bot percents only steer the bots.
(function (CE) {
  'use strict';

  const S = CE.SCENES;
  const DAY = 1440;

  // ---------- helpers ----------

  const loyal = (g) => g.present().filter((p) => !g.isEvil(p));
  const names = (list) => list.map((p) => p.name).join(', ');
  const isTraitor = (p) => !!(p && (p.traitor || p.traitor2));
  const traitorSecret = (g, text) => g.traitors().filter((t) => t.status === 'el' && t.away === 0).map((t) => ({ to: t, text, kind: 'parancs', style: 'bella' }));

  // Mrs. Weasley's caramel heals one wound, once; it is eaten automatically at the start of a scene.
  function eatCaramels(g) {
    g.players.forEach((p) => {
      if ((p.status === 'el' || p.status === 'bezarva') && p.hp > 0 && p.hp < 3 && g.takeItem(p, 'karamella')) {
        g.heal(p, 1);
        if (p.status === 'bezarva') p.hp = Math.min(3, p.hp + 1);
        g.secret(p, 'Megetted Mrs. Weasley házi karamelláját. Puha, édes, otthonszagú. (+1 élet)', 'hangulat');
      }
    });
  }

  // Every Act II scene: act 2, and the caramel check runs before the scene's own enter hook.
  function add(sc) {
    const own = sc.enter;
    sc.act = 2;
    sc.enter = (g) => { eatCaramels(g); if (own) own(g); };
    S[sc.id] = sc;
  }

  // Shows the lines said since `mark` on an info screen (for hooks that run after the result screen).
  async function flush(g, title, mark) {
    const lines = g.cur.out.splice(mark);
    if (lines.length) await g.io.info(title, lines);
  }

  // A private one-player choice; the TV only shows "Valaki előtt döntés áll…".
  async function ask(g, p, title, options, sec, dflt) {
    const ans = await g.collect([p], () => ({ kind: 'choice', title, options, meta: { type: 'cross', id: 'act2' } }), sec, { dflt: () => ({ k: dflt }) });
    const a = ans.get(p.id);
    return a && options.some((o) => o.k === a.k) ? a.k : dflt;
  }

  // Reflex options that only record the choice; the scene resolves everything together in resolve().
  const rec = (k) => (g, p, c) => { (g.cur.rx = g.cur.rx || []).push({ p, k, c }); };

  // Plays the planned random events of one step (the same as the engine does after a branch scene).
  async function playEvents(g, step, tok) {
    const due = (g.s.eventsPlan || []).filter((e) => e.step === step);
    for (const e of due) {
      const ev = (CE.EVENTS[g.s.act] || []).find((x) => x.id === e.id);
      if (!ev) continue;
      g.cur.out = [];
      if (ev.fx) { const r = ev.fx(g); if (typeof r === 'string') g.say(r); }
      await g.io.narrate({ scene: { title: ev.title, place: 'Közjáték' }, id: ev.id, paragraphs: g.text(ev.narr), event: true });
      if (g.cur.out.length) await g.io.result({ scene: { title: ev.title }, id: ev.id, d: {}, out: g.cur.out.slice() });
      g.check(tok);
    }
  }

  // The first traitor (or second traitor) who sneaked out in this act, if any.
  function sneakedTraitor(g) {
    const ids = g.traitors().map((t) => t.id);
    for (const id of g.s.history) {
      if (!S[id] || S[id].act !== 2) continue;
      const a = (g.s.sceneLog[id] || []).find((x) => x.kind === 'sneak' && ids.includes(x.actor));
      if (a) return g.players[a.actor];
    }
    return null;
  }

  // Branch scenes of the evening limit the scene to one team when the team split up (II-4 D).
  function splitWatch(g) { if (g.s.group) g.cur.halfWatch = true; }
  const afterBranch = (g) => (g.s.group ? 'II-SPLIT' : 'II-5');

  const LOCS = [
    { k: 'konyvtar', t: 'Könyvtár', in: 'a könyvtárban', cold: 'A könyvtárban megfagy a tinta a kalamárisokban. A polcok között dér fut végig.' },
    { k: 'klub', t: 'Klubhelyiség', in: 'a klubhelyiségben', cold: 'A klubhelyiségben kialszik a tűz. A kandalló kövein dér fut végig.' },
    { k: 'bagoly', t: 'Bagolyház', in: 'a bagolyházban', cold: 'A bagolyházban megfagy a baglyok lehelete. A szalmán dér fut végig.' },
    { k: 'gyengelkedo', t: 'Gyengélkedő', in: 'a gyengélkedőn', cold: 'A gyengélkedőn befagynak az ablakok. Az üres ágyakon dér fut végig.' },
    { k: 'hagrid', t: 'Hagrid kunyhója', in: 'Hagrid kunyhójában', cold: 'Hagrid kunyhójában Agyar nyüszíteni kezd. Az ajtón dér fut végig.' }
  ];
  const LOC = {};
  LOCS.forEach((l) => { LOC[l.k] = l; });

  const BRANCH = {
    F: { t: 'A Fúriafűzhöz.', to: 'A Fúriafűz alá', name: 'a Fúriafűz és a Szellemszállás', scene: 'II-F2' },
    V: { t: 'A Szükség Szobájához.', to: 'A Szükség Szobájába', name: 'a Szükség Szobája és a Szárnyas Vadkan', scene: 'II-V2' },
    H: { t: 'Hagridhoz és a thesztrálokhoz.', to: 'Hagridhoz és a Rengeteg szélére', name: 'Hagrid és a Rengeteg széle', scene: 'II-H2' }
  };

  const DOORS = { boszorkany: 'A púpos boszorkány szobra', fuz: 'A Fúriafűz alagútja', vadkan: 'A Szükség Szobája és Ariana portréja' };

  // ---------- ACT II: random events (S5-S8) ----------

  CE.EVENTS[2] = [
    {
      id: 'S5', title: 'Hóborc és a fagyöngy',
      narr: 'Hóborc fagyöngyöt lógat a lépcsőre, és aki alatta áll, nem mehet tovább, amíg meg nem csókolja a másikat.',
      fx(g) {
        const two = g.rng.shuffle(g.present()).slice(0, 2);
        if (two.length < 2) return 'Hóborc kuncogva továbbrepül. Most senki nem állt a fagyöngy alatt.';
        two.forEach((p) => { p.away = 1; });
        return `${two[0].name} és ${two[1].name} a fagyöngy alá ragadt. Egy jelenetig nem mennek sehová. Mindenki nevet.`;
      }
    },
    {
      id: 'S6', title: 'Hisztis Myrtle',
      narr: 'Hisztis Myrtle sír a csövekben, és a víz a Nagy Terembe is lecsorog.',
      fx(g) { const k = g.byRole('kisertet'); if (k) g.secret(k, 'Myrtle szerint valaki ma éjjel a harmadik emeleten sziszegve mondott egy szót.', 'igaz'); }
    },
    { id: 'S7', title: 'Piton', narr: 'Piton professzor egy bájitalos üveget rejt a talárjába, amikor meglát titeket.' },
    { id: 'S8', title: 'A páncélok', narr: 'A páncélok a folyosón egyszerre fordulnak a bejárat felé, és elhallgatnak.', fx(g) { g.add('ostrom', 1); } },
    { id: 'S13', title: 'Hagrid hóembere', narr: 'Hagrid hatalmas hóembert épít a bejárat elé. A fején egy vödör, a nyakában Hagrid sála. A vihar egy óra alatt betemeti.' },
    {
      id: 'S14', title: 'Flitwick hópelyhei', narr: 'Flitwick professzor int a pálcájával, és a Nagy Teremben hulló hópelyhek egy pillanatra megállnak a levegőben, majd csillagokká rendeződnek. Egy percre mindenki elfelejti a vihart.',
      fx(g) { g.present().forEach((p) => { p.patronusBonus += 5; }); return 'Ma este mindenkinek könnyebben jut eszébe egy boldog emlék.'; }
    },
    {
      id: 'S15', title: 'Mrs. Norris', narr: 'Mrs. Norris egész délután egyetlen ajtó előtt ül, és fúj, ha bárki a közelébe megy.',
      fx(g) { const p = g.rng.pick(g.present().filter((x) => !g.isEvil(x))); if (p) g.secret(p, `Mrs. Norris egész délután ${g.f.fuz_lezarva ? 'a hetedik emeleten, egy üres fal előtt' : 'a park felé néző ajtó előtt'} ült.`, 'hangulat'); }
    },
    { id: 'S16', title: 'Dementorok', narr: 'A park fölött dementorok köröznek. Az ablaküvegen jégvirág nő, belülről.', fx(g) { g.add('ostrom', 1); } }
  ];

  // ---------- II-0: Christmas morning ----------

  const PACKAGE = {
    type: 'vote', prompt: 'Mit kezdtek a névtelen csomaggal?', options: [
      { k: 'A', t: 'Kibontjuk. Kézzel.', w: { loyal: 1, traitor: 2 } },
      { k: 'B', t: 'Pálcával, messziről nyitjuk ki.', w: { loyal: 3, traitor: 1 } },
      { k: 'C', t: 'Elvisszük Piton professzorhoz.', w: { loyal: 2, traitor: 2 } },
      { k: 'D', t: 'Bedobjuk a kandallóba.', w: { loyal: 2, traitor: 1 } }
    ]
  };

  add({
    id: 'II-0', title: 'Karácsony reggel', place: 'Hálóterem, majd a Nagy Terem', clockSet: DAY + 7 * 60, music: 'bells',
    enter(g) {
      ['fuz_nyitva', 'fuz_lezarva', 'vadkan_nyitva', 'vadkan_lezarva', 'piton_segitett', 'piton_gyanu', 'dumbledore_uzenet', 'fenrir_terv',
        'fenrir_sebesult', 'edzes', 'jelolt_ismert', 'szetvaltak', 'egyedul_volt', 'tamadas_volt'].forEach((k) => { if (g.f[k] == null) g.f[k] = 0; });
      if (!Array.isArray(g.f.jelszo_tudok)) g.f.jelszo_tudok = [];
      g.s.frics2 = g.f.frics_gyanakszik;
      // Whoever Filch locked up last night misses II-0 and II-1 and is released at the end of the feast.
      g.players.forEach((p) => { if (p.status === 'bezarva') p.away = Math.max(p.away, 2); });
      // R5 is rolled now, so a crystal ball can already foresee it.
      const n = g.players.length;
      g.s.secondTouch = g.sys('R5') && g.chance(n <= 5 ? 0 : n <= 7 ? 35 : 50) ? 1 : 0;
      if (g.s.secondTouch) g.f.masodik_erintes_jon = 1;
      // Second gift (the P3 table; cloak, sneakoscope and parchment at most once per run) plus the Christmas list.
      const given = new Set();
      (g.s.log || []).forEach((e) => { if (e.kind === 'lap') CE.UNIQUE_GIFTS.forEach((it) => { if (e.text.includes(`jándékot kaptál: ${CE.ITEMS[it].name}`)) given.add(it); }); });
      g.players.forEach((p) => p.items.forEach((it) => { if (CE.UNIQUE_GIFTS.includes(it)) given.add(it); }));
      g.players.filter((p) => p.status !== 'szellem').forEach((p) => {
        let item = g.rng.pick(CE.FIRST_GIFTS);
        for (let i = 0; i < 30 && CE.UNIQUE_GIFTS.includes(item) && given.has(item); i++) item = g.rng.pick(CE.FIRST_GIFTS);
        if (CE.UNIQUE_GIFTS.includes(item) && given.has(item)) item = 'csoki';
        if (CE.UNIQUE_GIFTS.includes(item)) given.add(item);
        // Stays wrapped until the player presses "Kibontom" (see before).
        const items = [item, 'karamella', 'sapka'];
        let text = `Karácsonyi ajándékot kaptál: ${CE.ITEMS[item].name}. ${CE.ITEMS[item].text}\n\nA karácsonyi listáról: Házi karamella. Mrs. Weasley mindenkinek küldött. Puha, édes, otthonszagú. És egy kötött sapka. Kicsit szúr. Kicsit nagy. Melegen tart.`;
        if ((g.settings.sweaters || []).includes(p.id) && !p.items.includes('pulover')) { items.push('pulover'); text += '\n\nÉs egy új Weasley-pulóver, mert a régit elhasználtad.'; }
        g.setGift(p, items, text);
      });
    },
    narr(g) {
      const out = [
        'Karácsony reggel. A hálótermek ablakán vastag jégvirág, odakint még mindig tombol a vihar. Az ágyak végében ajándékok halma.',
        'Valaki már a tépett csomagolópapírban ül, és nevet. Egy pillanatra minden olyan, mint régen.'
      ];
      if (g.players.some((p) => p.status === 'bezarva')) out.push('Egy ágy üres. Frics tegnap este levitt valakit a pincébe. Az ajándékai érintetlenül várnak.');
      out.push('A Nagy Terem fája alatt egy utolsó csomag. Nincs rajta név, csak egy cédula: Boldog karácsonyt.');
      return out;
    },
    secrets(g) {
      const out = g.players.filter((p) => p.mugli && p.status !== 'szellem').map((p) => ({ to: p, text: 'A csomagolópapírodon halvány, sötét jel. Egy kígyó. Mintha valaki megjelölte volna.', kind: 'igaz' }));
      const h = g.players.find((p) => p.heir && p.status !== 'szellem');
      if (h) out.push({ to: h, text: 'Ma is kérdezhetsz. És nézd meg a csomagolópapírokat.', kind: 'igaz' });
      const km = g.byRole('konyvmoly');
      if (km && !g.isEvil(km)) out.push({ to: km, text: 'A fa alatt maradt egy csomag, címzés nélkül. A zsinórja fekete. Ilyet a Borgin és Burkesben használnak.', kind: 'igaz' });
      return out;
    },
    // The package vote runs here so the volunteer and the gloves are settled before the result screen.
    async before(g, tok) {
      // Everyone unwraps their own presents on the phone; prisoners find theirs later.
      await g.ackAll({ prompt: 'Bontsd ki az ajándékaidat!', label: 'Kibontom', time: 25, onAck: (gg, p) => { if (p.status !== 'bezarva') gg.unwrap(p); } });
      g.check(tok);
      g.players.forEach((p) => { if (p.status !== 'bezarva') g.unwrap(p); });
      const h = g.players.find((p) => p.heir && g.present().includes(p));
      if (h) {
        const k = await ask(g, h, 'Megnézed a csomagolópapírokat?', [{ k: 'look', t: 'Megnézem' }, { k: 'no', t: 'Most nem' }], 15, 'no');
        g.check(tok);
        const m = k === 'look' ? g.rng.pick(g.players.filter((p) => p.mugli && !h.knownMugli.includes(p.id))) : null;
        if (m) { h.knownMugli.push(m.id); g.secret(h, `${m.name} csomagolópapírján halvány kígyó. ${m.name} mugliszületésű.`, 'igaz'); }
      }
      const v = await g.vote(PACKAGE, g.present());
      g.check(tok);
      if (v.key === 'A') {
        const r = await g.volunteer({ type: 'volunteer', prompt: 'Ki bontja ki a csomagot? Kézzel.', label: 'Kibontom', time: 10, bot: { loyal: 30, traitor: 30 } });
        g.check(tok);
        const p = r.volunteer;
        if (!p) { g.say('Senki nem mer hozzányúlni. A csomag érintetlenül marad a fa alatt.'); return; }
        const ans = await g.collect([p], () => ({ kind: 'choice', reflex: true, title: 'Gyorsan! Kesztyűt húzol?', options: [{ k: 'glove', t: 'Kesztyűt húzok' }, { k: 'bare', t: 'Csak kibontom' }], meta: { type: 'gloves' } }), 3, { dflt: () => ({ k: 'bare' }) });
        g.check(tok);
        if ((ans.get(p.id) || {}).k === 'glove') { g.say(`Egy opálnyaklánc. Gyönyörű. ${p.name} kesztyűs kézzel emeli fel, és nem történik semmi.`); return; }
        g.say(`Egy opálnyaklánc. Gyönyörű. Ahogy a bőréhez ér, ${p.name} felsikolt, és a földre zuhan.`);
        g.dying(p, 'atok');
      } else if (v.key === 'B') {
        g.f.belso_arulo = 1;
        g.say('A papír magától hámlik le. Egy opálnyaklánc. Senki nem nyúl hozzá.');
        g.say('A csomagon nincs hó, nincs bagolynyom. Valaki a kastélyon belül tette a fa alá.');
      } else if (v.key === 'C') {
        g.add('piton_gyanu', 1);
        g.say('Piton ránéz, és az arca nem mozdul. „Átkozott opálnyaklánc. Senki ne nyúljon hozzá.” Elviszi. Hová?');
      } else {
        g.say('A lángok zöldre váltanak, és a csomag sikolt, mielőtt elhamvad.');
      }
    },
    next: 'II-1'
  });

  // ---------- II-1: the feast ----------

  const CRACKERS = [
    { k: 'korona', tv: 'papírkorona.' },
    { k: 'eger', tv: 'egy élő fehér egér!' },
    { k: 'csoki', tv: 'csokibéka.', item: 'csoki' },
    { k: 'gyanuszkop', tv: 'gyanuszkóp.', item: 'gyanuszkop' },
    { k: 'fust', tv: 'semmi, csak füst.' }
  ];

  add({
    id: 'II-1', title: 'A lakoma', place: 'Nagy Terem, délben', clockSet: DAY + 12 * 60, music: 'carol',
    narr: CE.V('II-1', [
      [
        'Délben a Nagy Teremben terített asztal vár. Pulykák, sült krumpli, karácsonyi puding, és varázsdurranók, amelyek ágyúlövésként pukkannak.',
        'A mennyezetről hó hull. Flitwick egy virágos boszorkánykalapot visel, amit a durranóból húzott. Hagrid könnyes szemmel áll fel.',
        '„Dumbledore professzorra! Bárhol is van most!”', 'A tanári asztal közepén egy palack áll, masnival: tölgyfahordós mézbor, Dumbledore professzornak, ajándékba.'
      ],
      [
        'Délben a Nagy Teremben a karácsonyi lakoma vár: száz kövér sült pulyka, sült krumpli, mártás és lángoló karácsonyi puding. A varázsdurranók nem pukkannak, hanem ágyúként dörrennek.',
        'A mennyezetről hó hull. Flitwick professzor egy boszorkánykalapot visel, a durranóból húzta. Hagrid a poharát emelve áll fel.',
        '„Dumbledore professzorra! Bárhol is van most!”', 'A tanári asztal közepén egy palack áll, masnival: tölgyfahordós mézbor, Dumbledore professzornak, ajándékba.'
      ],
      [
        'Délben megterítenek a Nagy Teremben. Pulyka, kis kolbászkák, sült krumpli, karácsonyi puding. Az egyik varázsdurranóból egy tengernagyi kalap és néhány élő fehér egér kerül elő.',
        'A mennyezetről hó hull. Flitwick vidáman felveszi a virágos kalapot. Hagrid könnyes szemmel áll fel.',
        '„Dumbledore professzorra! Bárhol is van most!”', 'A tanári asztal közepén egy palack áll, masnival: tölgyfahordós mézbor, Dumbledore professzornak, ajándékba.'
      ]
    ]),
    // Everyone pulls a cracker on the phone.
    async before(g, tok) {
      const pres = g.present();
      if (!pres.length) return;
      await g.collect(pres, () => ({ kind: 'ack', title: 'Húzd meg a varázsdurranódat!', label: 'Meghúzom' }), 15);
      g.check(tok);
      const lines = pres.map((p) => {
        const c = g.rng.pick(CRACKERS);
        if (c.item) { g.giveItem(p, c.item); g.secret(p, `A varázsdurranódból ez esett ki: ${CE.ITEMS[c.item].name}. ${CE.ITEMS[c.item].text}`, 'hangulat'); }
        return `${p.name}: ${c.tv}`;
      });
      await g.io.info('Varázsdurranók', lines);
      g.check(tok);
    },
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Mi is koccintunk Dumbledore-ra.', w: { loyal: 3, traitor: 2 }, res(g) { g.add('dumbledore_hu', 1); return 'Poharak csendülnek. Odakint egy pillanatra elül a szél.'; } },
        { k: 'B', t: 'Inkább csendben eszünk. Nem bízunk senkiben.', w: { loyal: 1, traitor: 2 }, res(g) { g.s.sneakVoid = true; return 'Csendben esztek. A puding kihűl. Hagrid szomorúan néz rátok.'; } }
      ]
    },
    kozben: {
      traitor: [{
        id: 'mead', cmd: 'K5', t: 'Töltesz a mézborból a szomszédodnak.', seen: 'mézbort töltött a szomszédja poharába',
        fx(g, d, actor) {
          const v = g.rng.pick(g.present().filter((p) => p !== actor));
          if (!v) return;
          g.dying(v, 'mereg');
          g.cur.poisoned = v.id;
          g.say(`${v.name} pohara kicsúszik a kezéből. Összegörnyed, a szája habzik.`);
        }
      }]
    },
    postSecrets(g) {
      const out = traitorSecret(g, 'Ügyes. Még egy kicsit. Ma este már bent leszünk.').map((x) => (x.to.resist >= 1 ? Object.assign(x, { text: `${x.text} …Miért remeg a kezed?` }) : x));
      const p = g.rng.pick(loyal(g));
      if (p) out.push({ to: p, text: 'A mézborban lévő méreg szaga ugyanolyan volt, mint a Piton szertárából áradó szag. Vagy nem?', kind: 'hamis' });
      return out;
    },
    async after(g, d, tok) {
      const mark = g.cur.out.length;
      // A bezoar or the healer first; if neither saves the poisoned student, Snape steps in with 60%.
      // The generic rescue (escort and the rest) still follows after the scene.
      const v = g.cur.poisoned != null ? g.players[g.cur.poisoned] : null;
      if (v && v.status === 'haldoklik') {
        const helpers = g.present().filter((p) => p !== v && g.rescueOptions(p, v).some((o) => o.k === 'bezoar' || o.k === 'heal'));
        if (helpers.length) {
          const opts = (p) => g.rescueOptions(p, v).filter((o) => o.k === 'bezoar' || o.k === 'heal' || o.k === 'no');
          const ans = await g.collect(helpers, (p) => ({ kind: 'choice', title: `${v.name} haldoklik (méreg). Segítesz?`, options: opts(p), meta: { type: 'rescue', target: v.id } }), 15, {
            stopWhen: (m) => [...m.values()].some((a) => a && a.k !== 'no'), dflt: () => ({ k: 'no' })
          });
          g.check(tok);
          const h = helpers.find((p) => { const a = ans.get(p.id); return a && opts(p).some((o) => o.k === a.k && o.k !== 'no'); });
          if (h) {
            if (ans.get(h.id).k === 'heal') { h.healsThisAct += 1; g.say(`${h.name} ellátja: ${v.name}. ${v.name} köhög. Lélegzik.`); }
            else { g.takeItem(h, 'bezoar'); g.say(`${h.name} bezoárt nyom ${v.name} torkába. ${v.name} köhög. Lélegzik.`); }
            g.revive(v, h);
          }
        }
        if (v.status === 'haldoklik' && g.chance(60)) {
          g.revive(v, null);
          g.f.piton_segitett = 1;
          g.f.piton_gyanu = 0;
          g.say(`Piton professzor egyetlen ugrással ott terem, a zsebébe nyúl, és egy fonnyadt, szürke követ nyom ${v.name} torkába. ${v.name} köhög. Lélegzik.`);
          g.say('Piton nem néz senkire. „A mézbor mérgezett volt. Senki ne igyon belőle.”');
        }
        await flush(g, 'A mézbor', mark);
        g.check(tok);
      }
      // Pudding for whoever sits in the cellar (offered for any prisoner, so the offer reveals nothing).
      const jailed = g.players.filter((p) => p.status === 'bezarva');
      if (jailed.length && g.present().length) {
        const r = await g.volunteer({ type: 'volunteer', prompt: 'Leviszel egy tányér pudingot a pincébe?', label: 'Leviszem', time: 10, bot: { loyal: 45, traitor: 20 } });
        g.check(tok);
        if (r.volunteer) {
          jailed.forEach((p) => { g.resist(p, 1); g.secret(p, 'Valaki gondolt rád.', 'hangulat'); });
          g.say(`${r.volunteer.name} levisz egy tányér pudingot a pincébe.`);
        }
      }
      jailed.filter((p) => p.away <= 1).forEach((p) => g.say(`Frics elengedi: ${p.name}. „Karácsony van. Na, menj.”${p.wand === false ? ' A pálcáját nem kapja vissza.' : ''}`));
      await flush(g, 'A pince', mark);
      g.check(tok);
      // R5: the second touch. Everyone holds the page for the same time, touched or not.
      if (!g.sys('R5')) return;
      await g.io.info('A lakoma vége', ['A lakoma végén egy pillanatra minden gyertya meglobban. Mintha valaki elhaladt volna mögöttetek, és megérintett volna egy vállat.', 'Tartsátok nyomva a lapot.']);
      g.check(tok);
      const all = g.players.filter((p) => p.status !== 'szellem');
      await g.collect(all, () => ({ kind: 'ack', title: 'Tartsd nyomva a lapot.', label: 'Nyomva tartom' }), 8);
      g.check(tok);
      let touched = null;
      if (g.s.secondTouch) touched = g.rng.pick(g.players.filter((p) => p.status === 'el' && !p.traitor && !p.traitor2 && !p.heir)) || null;
      g.s.secondTouch = 0;
      g.f.masodik_erintes_jon = 0;
      if (touched) {
        touched.traitor2 = true;
        touched.cmds[2] = g.rng.pick(CE.COMMANDS_BY_ACT[2]);
        touched.sneaks = 2;
        touched.wand = true;
        g.log('második érintés', `${touched.name} lett a második megszállott (${touched.cmds[2]}).`);
      }
      all.forEach((p) => {
        if (p === touched) g.secret(p, `A Három Seprű óta először megint hallod a hangot. „Szia, kicsim. Te is kellesz.”\n\n„${CE.COMMANDS[p.cmds[2]].voice}”\n\nKétszer kioshatsz ebben a felvonásban. Vigyázz, ki figyel.`, 'parancs', 'bella');
        else g.secret(p, 'Semmi. Csak a puding.', 'hangulat');
      });
    },
    next: 'II-2'
  });

  // ---------- II-2: the afternoon, everyone goes somewhere ----------

  add({
    id: 'II-2', branch: 1, title: 'Délután: hová mész?', place: 'A kastély', clockSet: DAY + 14 * 60, music: 'clock',
    narr: [
      'Délután a vihar újra erőre kap. A tanárok a kastély védelmét erősítik, a folyosók kiürülnek.',
      'Mindenki elmegy valahová. Döntsétek el, ki hová. Nyíltan beszélhettek róla, de a telefonon mindenki maga választ.'
    ],
    decision: { type: 'each', prompt: 'Hová mész délután?', time: 45, options: LOCS.map((l) => ({ k: l.k, t: l.t })) },
    kozben: {
      heir: [{
        id: 'lure', t: 'Elcsalod a megjelöltet.', seen: 'elcsalt valakit a folyosón',
        when(g) { const h = g.players.find((p) => p.heir); return !!h && g.present().some((p) => p.mugli && h.knownMugli.includes(p.id)); },
        fx(g, d, actor) { g.cur.lure = actor.id; }
      }]
    },
    resolve(g, d) {
      g.s.loc = {};
      g.present().forEach((p) => { if (d.per[p.id]) g.s.loc[p.id] = d.per[p.id]; });
      // Stealing the wand back only works where the keeper is.
      const orzo = g.f.palca_orzo;
      d.sabs = d.sabs.filter((a) => a.id !== 'stealwand' || (typeof orzo === 'number' && g.s.loc[a.actor] === g.s.loc[orzo]));
      return 'A folyosók kiürülnek. Mindenki elindul a maga útján.';
    },
    // K4 sneak: "Elcsalsz valakit." A random player's place is rewritten. After toast B the first sneak does nothing.
    onSneak(g, p) {
      if (g.s.sneakVoid) { g.s.sneakVoid = false; return false; }
      if (g.cmd(p) !== 'K4') return undefined;
      const v = g.rng.pick(g.present().filter((x) => g.s.loc[x.id]));
      if (!v) return false;
      g.s.loc[v.id] = g.rng.pick(LOCS.filter((l) => l.k !== g.s.loc[v.id])).k;
      return true;
    },
    async after(g, d, tok) {
      const loc = g.s.loc || (g.s.loc = {});
      // The heir sends a muggle-born he knows to the place he chooses.
      if (g.cur.lure != null) {
        const h = g.players[g.cur.lure];
        const m = g.rng.pick(g.present().filter((p) => p.mugli && h.knownMugli.includes(p.id) && loc[p.id]));
        if (m) {
          loc[m.id] = await ask(g, h, `Hová csalod a megjelöltet? (${m.name})`, LOCS.map((l) => ({ k: l.k, t: l.t })), 15, g.rng.pick(LOCS).k);
          g.check(tok);
        }
      }
      // Madam Pomfrey takes the dying in without an escort, if anyone went to the hospital wing.
      if (g.present().some((p) => loc[p.id] === 'gyengelkedo')) {
        g.players.filter((p) => p.status === 'haldoklik').forEach((p) => {
          g.revive(p, null);
          if (p.away === 0) loc[p.id] = 'gyengelkedo';
          g.io.notice(`${p.name} a gyengélkedőre kerül. Madam Pomfrey ellátja.`);
        });
      }
      const here = g.present().filter((p) => loc[p.id]);
      const by = {};
      here.forEach((p) => { (by[loc[p.id]] = by[loc[p.id]] || []).push(p); });
      const alone = Object.values(by).filter((list) => list.length === 1).map((list) => list[0].id);
      if (alone.length) g.f.egyedul_volt = 1;
      g.s.lastAlone = alone;
      g.s.afternoon = { alone };
      here.forEach((p) => {
        const k = loc[p.id];
        if (k === 'konyvtar') g.secret(p, 'A Szükség Szobája bármivé válik, amire szükséged van. Akár ajtóvá is, amely kifelé vezet.', 'igaz');
        else if (k === 'bagoly') { const elsewhere = here.filter((y) => loc[y.id] !== 'bagoly'); const x = g.rng.pick(elsewhere.length ? elsewhere : here.filter((y) => y !== p)); if (x) g.secret(p,`${x.name} délután ${LOC[loc[x.id]].in} volt. Láttad, amikor a bagolyházba mentél.`, 'igaz'); }
        else if (k === 'gyengelkedo') g.heal(p, 1);
        else if (k === 'hagrid') { g.f.hagrid_halas = 1; g.secret(p, 'Hagrid szerint valaki a Fúriafűznél járt hajnalban.', 'igaz'); }
      });
    },
    next: 'II-2t'
  });

  // ---------- II-2t: the afternoon attack (reflex only for the attacked place) ----------

  function afternoonReflex(at) {
    const extra = at.full ? 0 : 15;
    const here = (g) => g.present().filter((p) => at.ids.includes(p.id));
    return {
      type: 'reflex', prompt: 'HIDEG ÁRAD!', time: 5, bonus: (g) => (g.f.pihent ? 2 : 0), who: here,
      options: [
        { k: 'patr', t: 'Expecto Patronum!', hint: (g, p) => `${g.patronusChance(p, extra)}%`, w: { loyal: 3, traitor: 2 }, res: rec('patr') },
        { k: 'run', t: 'Futok.', w: { loyal: 2, traitor: 3 }, res: rec('run') },
        { k: 'pair', t: 'Magam elé rántom a társamat.', protects: true, when: (g) => here(g).length > 1, w: { loyal: 1, traitor: 1 }, res: rec('pair') }
      ]
    };
  }

  add({
    id: 'II-2t', title: 'Valahol a kastélyban', place: 'Délután', clock: 60, music: 'breath',
    // Attack rule: a marked muggle-born with at most one companion draws a full attack; otherwise anyone alone a weaker one.
    enter(g) {
      const loc = g.s.loc || {};
      const by = {};
      g.present().filter((p) => loc[p.id]).forEach((p) => { (by[loc[p.id]] = by[loc[p.id]] || []).push(p); });
      const marked = (p, n) => p.target || (p.mugli && !(p.mugliPublic && n > 1));
      const full = Object.keys(by).filter((k) => by[k].length <= 2 && by[k].some((p) => marked(p, by[k].length)));
      const weak = Object.keys(by).filter((k) => by[k].length === 1);
      let at = null;
      if (full.length) { const k = g.rng.pick(full); at = { loc: k, full: true, ids: by[k].map((p) => p.id) }; }
      else if (weak.length) { const k = g.rng.pick(weak); at = { loc: k, full: false, ids: by[k].map((p) => p.id) }; }
      g.s.attack = at;
      g.s.attackRes = null;
    },
    narr(g) {
      const at = g.s.attack;
      if (!at) return ['A délután lassan telik. Senki nem marad egyedül. Az ablakok előtt rongyos alakok sodródnak el. Benéznek. És továbbmennek.'];
      return [LOC[at.loc].cold, 'HIDEG ÁRAD!'];
    },
    before(g) {
      const at = g.s.attack;
      if (at) g.present().filter((p) => !at.ids.includes(p.id)).forEach((p) => g.secret(p, 'Valahol valami történik. Nem tudod, hol.', 'hangulat'));
    },
    decision: (g) => (g.s.attack ? afternoonReflex(g.s.attack) : null),
    resolve(g, d) {
      d.alone = (g.s.afternoon && g.s.afternoon.alone) || [];
      const at = g.s.attack;
      if (!at) return '';
      g.f.tamadas_volt = 1;
      const rx = g.cur.rx || [];
      const res = { loc: at.loc, full: at.full, victims: [], kiss: null, casters: [] };
      g.s.attackRes = res;
      res.casters = rx.filter((r) => r.k === 'patr' && g.castPatronus(r.p, r.c, at.full ? 0 : 15)).map((r) => r.p.id);
      if (res.casters.length) {
        g.say('Az ezüst fénytől a dementor hátrahőköl, és kisodródik a viharba.');
      } else {
        rx.forEach((r) => {
          if (r.k === 'patr') g.risk(r.p, r.c, 50, () => g.freeze(r.p));
          else if (r.k === 'run') g.risk(r.p, r.c, 40, () => g.freeze(r.p));
          else {
            // Pulling the companion away: the companion is safe, you freeze (unless both did the same).
            g.risk(r.p, r.c, r.c.partner && r.c.partnerChoice !== 'pair' ? 100 : 40, () => g.freeze(r.p));
            if (isTraitor(r.c.partner)) g.resist(r.c.partner, 1);
          }
        });
        res.victims = rx.filter((r) => r.p.status === 'dermedt').map((r) => r.p.id);
        if (at.full && rx.length && rx.every((r) => r.p.status !== 'el')) {
          const pool = rx.map((r) => r.p).filter((p) => p.status === 'dermedt');
          const marked = pool.filter((p) => p.mugli || p.target);
          const v = g.rng.pick(marked.length ? marked : pool);
          if (v) {
            g.dying(v, 'seb');
            res.kiss = v.id;
            g.say(`A dementor ${v.name} fölé hajol. A csók előtti utolsó pillanatban vagytok.`);
          }
        } else {
          g.say('A dementor lassan továbblebeg. A hideg vele megy.');
        }
      }
      g.players.forEach((p) => { if (p.target) p.target = false; });
      return '';
    },
    next: 'II-3'
  });

  // ---------- II-3: Dumbledore's office ----------

  const CLUE = {
    marked: () => 'A dementor nem találomra jött. Egyenesen hozzám. Mintha tudta volna, ki vagyok.',
    window: () => 'Láttam, hogy a gyengélkedő ablaka nyitva volt. Belülről nyitották ki.',
    sneak: (g, t) => `Mielőtt elsötétült minden, láttam ${g.roleName(t).toLowerCase()} szerepű diákot a folyosó végén.`
  };

  const PAPER = {
    type: 'vote', prompt: 'Megnézzük mindenki csomagolópapírját?', time: 30, options: [
      { k: 'igen', t: 'Igen', w: { loyal: 2, traitor: 3 } },
      { k: 'nem', t: 'Nem', w: { loyal: 1, traitor: 1 } }
    ]
  };

  const PASSWORD = {
    type: 'vote', prompt: 'Ki menjen fel McGonagall professzorral?', options: [
      { k: 'A', t: 'Egy ember kísérje el.', w: { loyal: 2, traitor: 3 } },
      { k: 'B', t: 'Mindenki menjen vele.', w: { loyal: 1, traitor: 3 } },
      { k: 'C', t: 'Senki. Jobb, ha senki nem tudja.', w: { loyal: 2, traitor: 1 } }
    ]
  };

  const listening = (g, p) => !(g.f.jelszo_tudok || []).includes(p.id);

  add({
    id: 'II-3', title: 'Dumbledore irodája', place: 'A vízköpő előtt', clockSet: DAY + 17 * 60, music: 'omen',
    enter(g) {
      g.s.sneakVoid = false;
      // Madam Pomfrey's chocolate thaws the frozen victims of the afternoon.
      const r = g.s.attackRes;
      if (r) r.victims.forEach((id) => { const p = g.players[id]; if (p.status === 'dermedt') g.revive(p, null); });
    },
    narr(g) {
      const out = [];
      const r = g.s.attackRes;
      const vid = r ? (r.kiss != null ? r.kiss : r.victims[0]) : null;
      if (vid != null) out.push(`Amikor odaértek, ${g.players[vid].name} a földön fekszik, a szája kék, a szeme üres. Madam Pomfrey csokoládét tör a kezébe.`);
      out.push('McGonagall professzor magához hív titeket. Sápadt.');
      out.push('„Fel kell mennem Dumbledore professzor irodájába. Ellenőrizni, hogy minden a helyén van-e. Ha valami történne velem, valakinek tudnia kell a jelszót.”');
      return out;
    },
    // Clue pages, the wrapping paper question and the password vote all happen before the secret step,
    // because the overhearing traitor needs to know who went up.
    async before(g, tok) {
      const r = g.s.attackRes;
      const mark = g.cur.out.length;
      // A successful patronus in the next scene can still bring back the one the dementor bent over.
      const kissed = r && r.kiss != null ? g.players[r.kiss] : null;
      if (kissed && kissed.status === 'haldoklik') {
        const cands = g.present().filter((p) => p !== kissed && p.wand);
        if (cands.length) {
          const ans = await g.collect(cands, () => ({ kind: 'choice', title: `${kissed.name} alig lélegzik. Megpróbálod elűzni mellőle a hideget?`, options: [{ k: 'patr', t: 'Expecto Patronum!' }, { k: 'no', t: 'Nem' }], meta: { type: 'kiss' } }), 15, {
            stopWhen: (m) => [...m.values()].some((a) => a && a.k === 'patr'), dflt: () => ({ k: 'no' })
          });
          g.check(tok);
          const c = cands.find((p) => (ans.get(p.id) || {}).k === 'patr');
          if (c) {
            if (g.castPatronus(c, {}, 0)) { g.revive(kissed, c); g.say(`A hideg visszahúzódik. ${kissed.name} köhög. Lélegzik.`); }
            else g.say('Csak ezüst köd. A hideg marad.');
            await flush(g, 'Expecto Patronum!', mark);
            g.check(tok);
          }
        }
      }
      // The victim, or whoever cast a successful patronus, gets a true page and may put it on the TV.
      if (r) {
        const sneaker = sneakedTraitor(g);
        const ids = [...new Set(r.victims.concat(r.kiss != null ? [r.kiss] : [], r.casters))];
        const recv = ids.map((id) => g.players[id]).filter((p) => p.status !== 'szellem' && !g.isEvil(p));
        const pages = new Map();
        recv.forEach((p) => {
          const victim = r.victims.includes(p.id) || r.kiss === p.id;
          let key = 'window';
          if (victim && r.full && p.mugli) key = 'marked';
          else if (victim && sneaker) key = g.rng.pick(['window', 'sneak']);
          const text = CLUE[key](g, sneaker);
          g.secret(p, text, 'igaz');
          pages.set(p.id, { key, text });
        });
        if (recv.length) {
          const ans = await g.collect(recv, () => ({ kind: 'choice', title: 'Kiteszed a lapodat a TV-re?', options: [{ k: 'show', t: 'Kiteszem a TV-re' }, { k: 'keep', t: 'Megtartom magamnak' }], meta: { type: 'cross', id: 'clue' } }), 20, { dflt: () => ({ k: 'keep' }) });
          g.check(tok);
          recv.forEach((p) => {
            if ((ans.get(p.id) || {}).k !== 'show') return;
            const pg = pages.get(p.id);
            g.say(`${p.name}: „${pg.text}”`);
            if (pg.key === 'marked') g.f.jelolt_ismert = 1;
            if (pg.key === 'window') g.f.belso_arulo = 1;
          });
          await flush(g, 'A TV-n', mark);
          g.check(tok);
        }
      }
      // If the team knows the muggle-borns were marked, they may check everyone's wrapping paper.
      if (g.f.jelolt_ismert && !g.f.papir_nezve && g.present().length) {
        g.f.papir_nezve = 1;
        const v = await g.vote(PAPER, g.present());
        g.check(tok);
        if (v.key === 'igen') {
          const mug = g.players.filter((p) => p.mugli);
          mug.forEach((p) => { p.mugliPublic = true; });
          g.players.filter((p) => g.isEvil(p)).forEach((e) => mug.forEach((m) => { if (!e.knownMugli.includes(m.id)) e.knownMugli.push(m.id); }));
          await g.io.info('A csomagolópapírok', [`Kígyójel van ${mug.length > 1 ? 'ezeken' : 'ezen'}: ${names(mug)}.`, 'Mostantól mindenki megvédheti őket. De mindenki tudja, kik ők.']);
        } else {
          await g.io.info('A csomagolópapírok', ['Minden marad titokban.']);
        }
        g.check(tok);
      }
      const pv = await g.vote(PASSWORD, g.present());
      g.check(tok);
      let vol = null;
      if (pv.key === 'A') {
        const rv = await g.volunteer({ type: 'volunteer', prompt: 'Elkíséred McGonagall professzort a vízköpőhöz?', label: 'Elkísérem', time: 15, bot: { loyal: 35, traitor: 55 } });
        g.check(tok);
        vol = rv.volunteer;
      }
      g.cur.pw = { key: pv.key, vol: vol ? vol.id : null };
    },
    kozben: {
      traitor: [{
        id: 'listen', cmd: 'K6', t: 'A lépcső aljáról hallgatózol.', seen: 'a vízköpő lépcsőjének aljáról hallgatózott',
        // Only when the traitor did not go up; with everyone going up there is nothing left to overhear.
        when(g) { const pw = g.cur.pw; if (!pw) return true; if (pw.key === 'B') return false; return !(pw.vol != null && isTraitor(g.players[pw.vol])); },
        fx(g, d, actor) { if (listening(g, actor) && g.chance(50)) g.f.jelszo_tudok.push(actor.id); }
      }]
    },
    resolve(g) {
      const pw = g.cur.pw || { key: 'C', vol: null };
      let ids = [];
      if (pw.key === 'A' && pw.vol != null) {
        ids = [pw.vol];
        g.say(`${g.players[pw.vol].name} elkíséri. A vízköpő előtt McGonagall halkan kimond egy szót. Egy édesség nevét. A vízköpő félreugrik.`);
      } else if (pw.key === 'B') {
        ids = g.present().map((p) => p.id);
        g.say('A vízköpő előtt McGonagall halkan kimond egy szót. Egy édesség nevét. Mindannyian hallottátok. Most már mindannyian tudjátok.');
      } else if (pw.key === 'A') {
        g.say('Senki nem jelentkezik. McGonagall egyedül megy fel.');
      } else {
        g.say('McGonagall bólint. „Bölcs döntés.” Egyedül megy fel.');
      }
      g.f.jelszo_tudok = ids;
      if (ids.length) {
        g.say('A forgó lépcső tetején a kerek iroda. Ezüst műszerek pöfögnek, a falon alvó igazgatók portréi. Egy üvegvitrinben, rubinokkal kirakott markolattal: Griffendél kardja.');
        g.say('A vitrin előtt valaki áll. Piton professzor. Megfordul. „McGonagall professzor. Csak ellenőriztem.”');
        if (!g.f.piton_segitett) g.add('piton_gyanu', 1);
      }
    },
    // K6 sneak: listening at the foot of the stairs, 50%.
    onSneak(g, p) {
      if (g.cmd(p) !== 'K6') return undefined;
      if (!listening(g, p)) return true;
      const ok = g.chance(50);
      if (ok) g.f.jelszo_tudok.push(p.id);
      return ok;
    },
    next: 'II-S'
  });

  // ---------- II-S: the eagle asks (R1, second pair) ----------

  add({
    id: 'II-S', title: 'A sas kérdez', place: 'A hollóhátas torony kopogtatója', clock: 30, music: 'bronze',
    narr: ['Mielőtt besötétedik, a sasos kopogtató újra megszólal. „Aki éjjel ajtót akar nyitni, annak előbb felelnie kell.”', 'Írjátok le a válaszotokat. Röviden.'],
    decision: { type: 'text', time: 25, debate: 45 },
    next: 'II-4'
  });

  // ---------- II-4: the evening, which door ----------

  add({
    id: 'II-4', title: 'Este: melyik ajtó?', place: 'Nagy Terem, sötétedéskor', clockSet: DAY + 18 * 60, music: 'storm',
    narr: (g) => [
      CE.V('II-4', [
        'Besötétedik. McGonagall szerint a kastélynak három titkos ajtaja van, amely kifelé vezet. Az egyiket már ismeritek: a púpos boszorkányét.',
        'Délután négykor már sötét van. McGonagall professzor összehívja a megmaradtakat: a kastélyból három titkos út vezet kifelé. Az egyiket már ismeritek: a púpos boszorkányét.',
        'Odakint gyorsan sötétedik, a vihar újra erősödik. McGonagall halkan beszél: három titkos ajtó vezet ki a kastélyból. Az egyiket már ismeritek: a púpos boszorkányét.'
      ])(g),
      'A második a Fúriafűz alatt kezdődik, és a Szellemszállásba visz.',
      'A harmadik a Szükség Szobájából indul, és Roxmortsba, a Szárnyas Vadkanba vezet.',
      'Hagrid pedig azt mondja, ha valaki üzenni akar Dumbledore-nak a viharon át, annak a thesztrálok segíthetnek.'
    ],
    decision: {
      type: 'vote', prompt: 'Merre mentek?', options: [
        { k: 'A', t: BRANCH.F.t, w: { loyal: 2, traitor: 2 }, next: 'II-F1' },
        { k: 'B', t: BRANCH.V.t, w: { loyal: 2, traitor: 1 }, next: 'II-V1' },
        { k: 'C', t: BRANCH.H.t, w: { loyal: 2, traitor: 2 }, next: 'II-H1' },
        { k: 'D', t: 'Szétválunk: két csapat, két ajtó.', w: { loyal: 1, traitor: 3 }, next: 'II-SPLIT', res(g) { g.f.szetvaltak = 1; return 'Szétváltok. Mindenki maga dönti el, melyik ajtóhoz megy.'; } }
      ]
    },
    kozben: { traitor: [{ id: 'argue', cmd: 'K4', t: 'A D mellett érvelsz.', seen: 'végig a szétválás mellett érvelt' }] },
    // D: everyone picks a door; the two most picked branches run, one scene each.
    async after(g, d, tok) {
      if (d.key !== 'D') return;
      const pres = g.present();
      if (!pres.length) return;
      const r = await g.each({ type: 'each', prompt: 'Melyik ajtóhoz mész?', time: 15, options: ['F', 'V', 'H'].map((k) => ({ k, t: BRANCH[k].t })) });
      g.check(tok);
      const counts = { F: 0, V: 0, H: 0 };
      pres.forEach((p) => { counts[r.per[p.id]] += 1; });
      const order = g.rng.shuffle(['F', 'V', 'H']).sort((a, b) => counts[b] - counts[a]).slice(0, 2);
      const groups = { [order[0]]: [], [order[1]]: [] };
      const rest = [];
      pres.forEach((p) => { if (groups[r.per[p.id]]) groups[r.per[p.id]].push(p.id); else rest.push(p.id); });
      rest.forEach((id) => { groups[groups[order[0]].length <= groups[order[1]].length ? order[0] : order[1]].push(id); });
      // Two teams means two teams: move someone over if everyone picked the same door.
      if (pres.length >= 2) {
        order.forEach((b, i) => {
          const o = order[1 - i];
          if (!groups[b].length && groups[o].length > 1) groups[b].push(groups[o].splice(g.rng.int(groups[o].length), 1)[0]);
        });
      }
      g.s.split = { order, groups, i: 0, ran: 0, evDone: false };
      g.log('szétválás', order.map((b) => `${b}: ${groups[b].map((id) => g.players[id].name).join(', ')}`).join(' · '));
    }
  });

  // ---------- II-SPLIT: dispatcher for the split evening (II-4 D) ----------

  add({
    id: 'II-SPLIT', title: 'Két csapat, két ajtó', place: 'A kastély folyosói', clock: 10, music: 'storm',
    enter(g) {
      const sp = g.s.split;
      g.cur.split = null;
      // The second planned random event plays after the first team's scene.
      g.cur.evAfter = !!(sp && sp.ran > 0 && !sp.evDone);
      if (g.cur.evAfter) sp.evDone = true;
      while (sp && sp.i < sp.order.length) {
        const b = sp.order[sp.i];
        sp.i += 1;
        if (!sp.groups[b].some((id) => g.players[id].status === 'el' && g.players[id].away === 0)) continue;
        g.s.group = sp.groups[b].slice();
        g.cur.split = { b, first: sp.ran === 0 };
        sp.ran += 1;
        return;
      }
      g.s.group = null;
    },
    narr(g) {
      const c = g.cur.split;
      const sp = g.s.split;
      if (!c || !sp) return ['A két csapat visszaindul a kastélyba.'];
      const team = (b) => names(sp.groups[b].map((id) => g.players[id]));
      if (c.first) return [`Szétváltok. ${sp.order.map((b) => `${BRANCH[b].to}: ${team(b)}.`).join(' ')}`, `Először: ${BRANCH[c.b].name}.`];
      return [`Közben a másik csapat: ${BRANCH[c.b].name}.`];
    },
    async after(g, d, tok) { if (g.cur.evAfter) await playEvents(g, 2, tok); },
    next: (g) => (g.cur.split ? BRANCH[g.cur.split.b].scene : 'II-5')
  });

  // ---------- II-F: the Whomping Willow and the Shrieking Shack ----------

  add({
    id: 'II-F1', branch: 2, title: 'A Fúriafűz', place: 'A park', clock: 40, music: 'wind',
    narr: [
      'A fűz a viharban tombol. Az ágai korbácsként csapkodnak, a hó porzik körülötte. A törzse tövében, a gyökerek között egy rés: az alagút bejárata.',
      'Valahol a törzsön van egy csomó. Ha megnyomják, a fa megdermed.'
    ],
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Valaki egy hosszú bottal megnyomja a csomót.', w: { loyal: 2, traitor: 2 } },
        {
          k: 'B', t: 'Immobilus! Megdermesztjük a fát.', w: { loyal: 2, traitor: 1 },
          res(g, d) {
            // The team draws the Immobilus movement together (challenge); without the mini-game the old helper rule holds.
            const ok = d.wand ? d.wand.ok : g.helpersHalf(d);
            if (ok) { g.cur.f1ok = true; return 'Immobilus! A fa megdermed. Az ágak megállnak a levegőben.'; }
            g.present().forEach((p) => { if (g.chance(30)) g.wound(p); });
            return 'A varázslat lepattan a kérgéről. Az ágak lecsapnak. Sajgó tagokkal visszahúzódtok.';
          }
        },
        { k: 'C', t: 'Visszafordulunk.', w: { loyal: 1, traitor: 2 }, next: 'II-5', res: () => 'Visszafordultok. Mögöttetek a fűz tovább csapkod a hóban.' }
      ]
    },
    kozben: { traitor: [{ id: 'shout', t: 'Rossz pillanatban kiáltasz.', seen: 'rossz pillanatban kiáltott a fűz alatt' }] },
    // B: everyone present draws the Immobilus movement; the team average decides.
    async challenge(g, d, tok) {
      if (d.key !== 'B' || !CE.mini) return;
      const team = g.present().filter((p) => p.wand);
      if (!team.length) { d.wand = { ok: false, avg: 0 }; return; }
      const res = await g.minigame(team, 'palca', { spell: 'Immobilus' });
      g.check(tok);
      const avg = team.reduce((a, p) => a + ((res.get(p.id) || {}).score || 0), 0) / team.length;
      d.wand = { ok: avg >= 0.55, avg };
      g.log('immobilus', `átlag ${Math.round(avg * 100)}%`);
    },
    // A: a volunteer pokes the knot. Reflex "Előre!" / "Hátra!"; a hit means another try (at most three).
    async after(g, d, tok) {
      if (d.key !== 'A') return;
      const mark = g.cur.out.length;
      const r = await g.volunteer({ type: 'volunteer', prompt: 'Ki nyomja meg a csomót a hosszú bottal?', label: 'Én megyek', time: 15, bot: { loyal: 45, traitor: 40 } });
      g.check(tok);
      const v = r.volunteer;
      if (!v) { g.say('Senki nem mer a csapkodó ágak közé lépni. Visszafordultok.'); await flush(g, 'A Fúriafűz', mark); return; }
      const time = Math.max(2, 5 + (g.f.hagrid_figyel ? 3 : 0) - (g.sab(d, 'shout') ? 2 : 0));
      for (let i = 0; i < 3 && !g.cur.f1ok && v.status === 'el'; i++) {
        const opts = [{ k: 'elore', t: 'Előre!' }, { k: 'hatra', t: 'Hátra!' }];
        if (v.role === 'hagrid' && !v.powerUsed) opts.push({ k: 'ero', t: 'Hagrid trükkje (erő, egyszer)' });
        const ans = await g.collect([v], () => ({ kind: 'choice', reflex: true, title: 'Az ágak lecsapnak!', options: opts, meta: { type: 'knot' } }), time, { dflt: () => ({ k: 'hatra' }) });
        g.check(tok);
        const k = (ans.get(v.id) || {}).k || 'hatra';
        if (k === 'ero') { v.powerUsed = true; g.cur.f1ok = true; }
        else if (k === 'elore' && g.chance(70)) g.cur.f1ok = true;
        else if (k === 'elore') { g.wound(v); g.say(`Egy ág eltalálja ${v.name} vállát. Még egyszer kell.`); }
        else g.say(`${v.name} hátraugrik az ág elől. Még egyszer kell.`);
      }
      if (g.cur.f1ok) g.say(`${v.name} botja eléri a csomót. A fa megdermed. Az ágak megállnak a levegőben.`);
      else g.say('A fűz nem nyugszik. Visszafordultok.');
      await flush(g, 'A Fúriafűz', mark);
    },
    next: (g) => (g.cur.f1ok ? 'II-F2' : 'II-5')
  });

  // The Act I curse reflex, with a Stupor line that fits the Shrieking Shack.
  function shackReflex() {
    const dec = CE.curseReflex('ÁTOK!');
    dec.options = dec.options.map((o) => (o.k !== 'stupor' ? o : Object.assign({}, o, {
      res(g, p, c) {
        if (c.felix || g.chance(p.role === 'parbajozo' ? 70 : 40)) {
          if (!g.cur.stunned) { g.cur.stunned = true; g.add('ostrom', -1); g.say(`${p.name} átka eltalálja az egyik halálfalót. A falnak csapódik, és nem kel fel.`); }
        } else {
          g.risk(p, c, 100, () => g.dying(p, 'atok'));
        }
      }
    })));
    return dec;
  }

  add({
    id: 'II-F2', title: 'A Szellemszállás', place: 'Roxmorts széle', clock: 40, music: 'dark',
    enter(g) { splitWatch(g); g.f.fenrir_terv = 1; },
    narr: [
      'Az alagút végén egy elhagyott ház. Repedt falak, összetört bútorok, a padlón mély karmolások.',
      'Az emeletről hangok. Egy rekedt, morgó férfihang és egy másik, nyugodtabb.',
      '„…éjfélkor. A mi emberünk belülről nyitja. Addig várunk.”',
      '„És ha nem nyitja?”',
      '„Akkor szétszedjük a kaput. Telihold lesz, Rookwood. Nem fogok sokáig várni.”',
      'Szürkehátú Fenrir. Ennyi elég, hogy a hideg végigfusson rajtatok.'
    ],
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        {
          k: 'A', t: 'Csendben visszavonulunk, és beomlasztjuk az alagutat.', w: { loyal: 3, traitor: 1 },
          res(g) {
            g.f.fuz_lezarva = 1; g.f.fuz_nyitva = 0;
            g.present().forEach((p) => { if (g.chance(25)) g.wound(p); });
            g.defense('a Fúriafűz alagútja beomlott');
            return 'Bombarda! A föld megmozdul. A ház felől üvöltés. Az alagút mögöttetek bezárul.';
          }
        },
        { k: 'B', t: 'Megtámadjuk őket, amíg nem számítanak ránk.', w: { loyal: 1, traitor: 2 }, res: () => 'Fenrir üvöltve ugrik le a lépcsőn.' },
        { k: 'C', t: 'Visszamegyünk, és nyitva hagyjuk: ott csapdát állíthatunk.', w: { loyal: 1, traitor: 3 }, res(g) { g.f.fuz_nyitva = 1; return 'Az alagút sötéten ásít mögöttetek. Hadd jöjjenek.'; } }
      ]
    },
    kozben: {
      traitor: [{
        id: 'creak', t: 'Megreccsented a padlót.', seen: 'szándékosan megreccsentette a padlót',
        fx(g, d) {
          if (d.key !== 'A' && d.key !== 'C') return;
          g.say('A padló megreccsen. Fenrir mégis észrevesz titeket.');
          g.present().forEach((p) => { if (g.chance(30)) g.wound(p); });
        }
      }]
    },
    // B: the curse reflex, then Fenrir strikes one of you.
    async after(g, d, tok) {
      if (d.key !== 'B') return;
      const mark = g.cur.out.length;
      const fighters = g.present();
      const before = new Map(fighters.map((p) => [p.id, p.hp]));
      await g.reflex(shackReflex());
      g.check(tok);
      g.say('Az átkok villognak. Aztán vér a deszkán, és csend.');
      // The duellist counts double in a curse fight.
      const ok = fighters.reduce((n, p) => n + (p.status === 'el' && p.hp >= before.get(p.id) ? (p.role === 'parbajozo' ? 2 : 1) : 0), 0);
      const v = g.rng.pick(g.present());
      if (v) { g.dying(v, 'karmok'); g.say(`Fenrir karmai elérik: ${v.name} a padlóra zuhan.`); }
      if (fighters.length && ok >= Math.ceil(fighters.length / 2)) {
        g.f.fenrir_sebesult = 1;
        g.add('ostrom', -2);
        g.say('Fenrir is vérzik. Üvöltve menekül a sötétbe.');
        g.defense('Fenrir megsebesült');
      }
      await flush(g, 'A Szellemszállás', mark);
    },
    next: afterBranch
  });

  // ---------- II-V: the Room of Requirement and the Hog's Head ----------

  add({
    id: 'II-V1', branch: 2, title: 'A hetedik emelet', place: 'A Szükség Szobája előtt', clock: 40, music: 'silver',
    narr: ['A hetedik emeleten egy csupasz fal áll egy táncoló trollokat ábrázoló faliszőnyeggel szemben. Háromszor kell elsétálni előtte, és arra gondolni, amire szükségetek van.'],
    decision: {
      type: 'vote', prompt: 'Mire van szükségetek?', time: 30, options: [
        { k: 'A', t: '„Egy ajtóra, amely kivezet a kastélyból.”', w: { loyal: 2, traitor: 2 } },
        { k: 'B', t: '„Egy helyre, ahol felkészülhetünk.”', w: { loyal: 2, traitor: 1 } },
        { k: 'C', t: '„Egy helyre, ahol senki nem talál ránk.”', w: { loyal: 2, traitor: 1 } }
      ]
    },
    kozben: {
      traitor: [{
        id: 'wish', t: 'Mást kívánsz, mint a többiek.', seen: 'a fal előtt mást motyogott, mint a többiek',
        fx(g, d, actor) { if (d.key === 'A') g.secret(actor, 'A szoba ajtó is lehetett volna. Kifelé.', 'igaz'); }
      }]
    },
    resolve(g, d) {
      // The traitor's different wish turns the door into a training room.
      const k = d.key === 'A' && g.sab(d, 'wish') ? 'B' : d.key;
      g.cur.v1 = k;
      if (k === 'A') return 'Egy ajtó jelenik meg a falon. Mögötte egy szoba, és a falon egy festmény: egy szőke lány mosolyog le rátok. A kép mögött alagút.';
      if (k === 'B') { g.f.edzes = 1; return 'Párnák, könyvek, tükrök. Egy órán át gyakoroljátok a patrónust. Az ezüst fények egyre erősebbek.'; }
      g.present().forEach((p) => g.heal(p, 1));
      return 'Egy meleg, csendes szoba, kandallóval. Itt egy órára elfelejtitek a vihart.';
    },
    next: (g) => (g.cur.v1 === 'A' ? 'II-V2' : 'II-5')
  });

  add({
    id: 'II-V2', title: 'A Szárnyas Vadkan', place: 'Roxmorts', clock: 40, music: 'fire',
    enter: splitWatch,
    narr: [
      'Az alagút egy kocsma emeletére vezet. Koszos ablakok, poros pult, kecskeszag.',
      'Egy hosszú, ősz szakállú, kék szemű öregember néz rátok. Ismerős a szeme. Aberforth Dumbledore.',
      '„Szóval ti vagytok a karácsonyi meglepetés. Tegnap egy nő ült itt. Aranyban fizetett, és nevetett. A falu szélén dementorok várnak. Sokan.',
      'Albus nem jön reggelig. Mit akartok?”'
    ],
    decision: {
      type: 'vote', prompt: 'Mit kértek Aberforthtól?', options: [
        {
          k: 'A', t: 'Kérjük, zárja le a portrét.', w: { loyal: 2, traitor: 1 },
          res(g) {
            g.f.vadkan_lezarva = 1; g.f.vadkan_nyitva = 0;
            g.defense('Aberforth lezárta a portrét');
            return 'Aberforth bólint. „Ezt az ajtót én őrzöm. Ezen ma éjjel senki nem megy át.”';
          }
        },
        { k: 'B', t: 'Kérjük, üzenjen a bátyjának.', w: { loyal: 3, traitor: 1 }, res(g) { g.f.dumbledore_uzenet = 1; g.add('dumbledore_hu', 1); return 'Aberforth morog, aztán kimondja a varázsigét. Egy ezüst kecske ugrik ki a pálcájából, és eltűnik a viharban.'; } },
        {
          k: 'C', t: 'Elfogadjuk, amit felajánl.', w: { loyal: 2, traitor: 2 },
          res(g) {
            const p = g.rng.pick(g.present());
            if (p) g.giveItem(p, 'tukorszilank');
            return `Egy darab törött tükröt nyom a kezetekbe. „Ha baj van, nézzetek bele. Én látni fogom.”${p ? ` ${p.name} teszi el.` : ''}`;
          }
        }
      ]
    },
    // The remembered way opens the portrait at the end of the act, unless Aberforth sealed it.
    kozben: { traitor: [{ id: 'route', t: 'Megjegyzed az utat.', seen: 'megjegyezte az utat a portré mögött', fx(g, d) { if (d.key !== 'A') g.s.vadkanPending = 1; } }] },
    next: afterBranch
  });

  // ---------- II-H: Hagrid and the thestrals ----------

  add({
    id: 'II-H1', branch: 2, title: 'A kunyhó', place: 'Hagrid kunyhója', clock: 40, music: 'fire',
    narr: [
      'Hagrid kunyhójában forró tea, számszeríj a falon, Agyar a lábatoknál.',
      '„Dumbledore-nak tudnia kell, mi folyik itt. A baglyok nem bírják a vihart. De a thesztrálok… ők bírják.”',
      'Kint a hóban, a fák szélén, csontos, fekete, szárnyas lovak állnak. Legalábbis Hagrid szerint. Nem mindenki látja őket.'
    ],
    // Only those who were there when someone died can see the thestrals.
    secrets(g) {
      return g.present().map((p) => (p.sawDeath
        ? { to: p, text: 'Látod őket. Csontvázszerűek, és gyönyörűek.', kind: 'igaz' }
        : { to: p, text: 'Nem látsz semmit. Csak a havat.', kind: 'hangulat' }));
    },
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Valaki elrepül egy thesztrálon Londonba.', w: { loyal: 2, traitor: 2 } },
        { k: 'B', t: 'Hagriddal őrjáratra megyünk a Rengeteg szélén.', w: { loyal: 1, traitor: 2 }, next: 'II-H2', res: () => 'Hagrid leemeli a számszeríját. „Gyertek. De maradjatok mögöttem.”' },
        {
          k: 'C', t: 'Hagrid mesél: mit látott a hóban.', w: { loyal: 2, traitor: 1 }, next: 'II-5',
          res(g) { g.f.fenrir_terv = 1; g.say('„Lábnyomok a Fúriafűz felé. Emberé, és egy hatalmas farkasé.”'); return 'Hagrid a szakállát gyűri. „Farkas. Nem közönséges. Telihold lesz ma éjjel.”'; }
        }
      ]
    },
    kozben: { traitor: [{ id: 'spook', t: 'Megriasztod a thesztrált.', seen: 'megriasztotta a thesztrált' }] },
    // A: the rider is away until III-0; a fall sends the team to the edge of the Forest.
    async after(g, d, tok) {
      if (d.key !== 'A') return;
      const mark = g.cur.out.length;
      const r = await g.volunteer({ type: 'volunteer', prompt: 'Elrepülsz egy thesztrálon Londonba?', label: 'Elrepülök', time: 15, bot: { loyal: 35, traitor: 25 } });
      g.check(tok);
      const v = r.volunteer;
      if (!v) { g.say('Senki nem jelentkezik. Hagrid csalódottan bólint.'); await flush(g, 'A thesztrál', mark); return; }
      g.say(`Egy szárnysuhogás, és ${v.name} eltűnik a hóviharban.`);
      const pct = (v.sawDeath ? 80 : 50) - (g.sab(d, 'spook') ? 30 : 0);
      if (g.chance(pct)) {
        g.f.dumbledore_uzenet = 1;
        g.add('dumbledore_hu', 1);
        g.f.thesztral_lovas = v.id;
        v.away = 99;
        g.log('thesztrál', `${v.name} átjutott a viharon.`);
      } else {
        g.s.thestralCrash = v.id;
        v.away = 1;
        g.cur.h1crash = true;
        g.say('Aztán a Rengeteg széléről egy tompa puffanás.');
        g.log('thesztrál', `${v.name} lezuhant.`);
      }
      await flush(g, 'A thesztrál', mark);
    },
    next: (g) => (g.cur.h1crash ? 'II-H2' : 'II-5')
  });

  add({
    id: 'II-H2', title: 'A Rengeteg széle', place: 'Tiltott Rengeteg', clock: 40, music: 'dark',
    enter(g) {
      splitWatch(g);
      // The fallen thestral rider turns up here, dying.
      if (g.s.thestralCrash != null) {
        const p = g.players[g.s.thestralCrash];
        g.s.thestralCrash = null;
        if (p.status === 'el') {
          p.away = 0;
          g.dying(p, 'seb');
          (g.s.forestDying = g.s.forestDying || []).push(p.id);
          g.cur.crashed = p.id;
        }
      }
    },
    narr(g) {
      const out = [];
      if (g.cur.crashed != null) out.push(`A hóban, egy kidőlt fa tövében ott fekszik ${g.players[g.cur.crashed].name}. Nem mozdul.`);
      return out.concat(['A fák között a hó szürke. Valami nagy mozog az ágakon. Nem egy. Sok.', 'Akromantulák. Kocsi méretű pókok, csillogó szemekkel. A viharban éhesek.', 'Hagrid kiált: „FUSSATOK!”']);
    },
    // Hagrid's friend can lead everyone out, once.
    async before(g, tok) {
      const h = g.presentRole('hagrid');
      if (!h || h.powerUsed) return;
      const k = await ask(g, h, 'Hagrid barátja vagy. Kivezeted a csapatot a fák közül? (Egyszer használható.)', [{ k: 'lead', t: 'Kivezetem őket' }, { k: 'no', t: 'Most nem' }], 10, 'no');
      g.check(tok);
      if (k === 'lead') { h.powerUsed = true; g.cur.led = h.id; }
    },
    decision: {
      type: 'reflex', prompt: 'FUSSATOK!', time: 5, who: (g) => (g.cur.led != null ? [] : g.present()),
      options: [
        { k: 'run', t: 'Futok a kunyhó felé.', w: { loyal: 2, traitor: 3 }, res: rec('run') },
        { k: 'pair', t: 'Megfogom a mellettem állót, és együtt futunk.', w: { loyal: 2, traitor: 1 }, res: rec('pair') },
        { k: 'hagrid', t: 'Hagrid mögé állok.', w: { loyal: 2, traitor: 2 }, res: rec('hagrid') }
      ]
    },
    resolve(g) {
      if (g.cur.led != null) return `${g.players[g.cur.led].name} Agyarral az élen kivezet mindenkit a fák közül. A pókok a hóban maradnak.`;
      const rx = g.cur.rx || [];
      const bite = (p) => () => { g.dying(p, 'mereg'); (g.s.forestDying = g.s.forestDying || []).push(p.id); g.say(`${p.name} felkiált: egy pók megmarta.`); };
      // Two players who both chose to run together form a pair.
      const pairs = rx.filter((r) => r.k === 'pair');
      for (let i = 0; i + 1 < pairs.length; i += 2) { pairs[i].mate = pairs[i + 1].p; pairs[i + 1].mate = pairs[i].p; }
      let behind = false;
      rx.forEach((r) => {
        if (r.k === 'hagrid') { behind = true; g.risk(r.p, r.c, 10, bite(r.p)); }
        else if (r.k === 'pair' && r.mate) { g.risk(r.p, r.c, 15, bite(r.p)); if (isTraitor(r.mate)) g.resist(r.mate, 1); }
        else g.risk(r.p, r.c, 30, bite(r.p));
      });
      if (behind) { g.f.hagrid_serult = 1; g.say('Hagrid felordít: egy pók a karjába mar. Kibírja, de ma éjjel már nem harcolhat.'); }
      if (!rx.some((r) => r.p.status === 'haldoklik')) g.say('Mindenki kijut a fák közül. Mögöttetek csattognak a csáprágók.');
      return '';
    },
    next: afterBranch
  });

  // ---------- II-5: the carol and the plan ----------

  add({
    id: 'II-5', title: 'Karácsonyi ének és a terv', place: 'Nagy Terem, este tíz', clockSet: DAY + 22 * 60, music: 'carol',
    enter(g) { g.s.group = null; g.s.split = null; },
    narr: (g) => CE.V('II-5', [
      ['Este tíz óra. Akik visszaértetek, a Nagy Teremben gyűltök össze. A fák gyertyái még égnek, a mennyezetről hó hull.', 'Senki nem mondta, hogy idejöjjetek. Mégis itt vagytok.', 'A folyosón a páncélok is énekelnek, halkan. Két óra múlva éjfél.'],
      ['Este tíz óra. A Nagy Teremben gyűltök össze, akik visszaértetek. A karácsonyfákon még égnek a gyertyák, a varázsolt mennyezeten hóviharos az ég.', 'Senki nem hívott ide. Mégis mindenki eljött.', 'Valahol a folyosón egy páncél halkan dúdol. Két óra múlva éjfél.'],
      ['Este tíz óra. Akik visszaértetek, a Nagy Terem hosszú asztalánál ültök. A tűz pattog, a gyertyák lángja meg-meglebben, pedig nincs huzat.', 'Nem beszéltétek meg, hogy idejöttök. Mégis itt vagytok, mindannyian.', 'A páncélok a folyosón most nem énekelnek. Két óra múlva éjfél.']
    ])(g).concat([
      'McGonagall professzor feláll. „Éjfélkor jönnek. Tudom, hogy nem kellene diákokat kérnem erre. De nincs más.',
      'Hogyan védjük meg a kastélyt?”'
    ]),
    secrets(g) {
      const out = traitorSecret(g, 'Énekelnek. Milyen aranyosak. Éjfélkor mind az enyémek.').map((x) => (x.to.resist >= 2 ? Object.assign(x, { text: `${x.text} …Ne sírj. Miért sírsz?` }) : x));
      const b = g.byRole('bajital');
      if (b && !g.isEvil(b) && b.status === 'el') out.push({ to: b, text: 'Piton professzor nincs a teremben.', kind: 'igaz' });
      return out;
    },
    async before(g, tok) {
      // The dying can be brought here; Madam Pomfrey treats them without an escort.
      for (const n of g.players.filter((p) => p.status === 'haldoklik')) {
        const cands = g.present().filter((p) => p !== n);
        if (!cands.length) continue;
        const ans = await g.collect(cands, () => ({ kind: 'choice', title: `${n.name} haldoklik. Behozod Madam Pomfreyhoz?`, options: [{ k: 'carry', t: 'Behozom' }, { k: 'no', t: 'Nem' }], meta: { type: 'rescue', target: n.id } }), 15, {
          stopWhen: (m) => [...m.values()].some((a) => a && a.k === 'carry'), dflt: () => ({ k: 'no' })
        });
        g.check(tok);
        const h = cands.find((p) => (ans.get(p.id) || {}).k === 'carry');
        // Carrying someone through the dark castle does not always work in time.
        if (h && g.chance(50)) { g.revive(n, h); g.say(`${h.name} behozza a Nagy Terembe: ${n.name}. Madam Pomfrey azonnal ellátja.`); }
        else if (h) g.say(`${h.name} elindul ${n.name} felé, de a lépcsők rossz irányba fordulnak. Nem ér oda időben.`);
      }
      // Everyone alive and free sings together: +1 life each, and Dumbledore's feather glows.
      const missing = g.players.filter((p) => p.status !== 'szellem' && p.status !== 'bezarva' && !p.escaped && (p.status === 'haldoklik' || p.away > 0));
      missing.filter((p) => p.status === 'el').forEach((p) => { p.stats.skippedTogether += 1; });
      if (!missing.length && g.present().length) {
        g.players.filter((p) => p.status === 'el').forEach((p) => g.heal(p, 1));
        g.add('dumbledore_hu', 1);
        g.say('Mindannyian itt vagytok. Valaki énekelni kezd, és lassan mindenki beszáll. A gyertyák lángja kiegyenesedik.');
      }
    },
    decision: {
      type: 'vote', prompt: 'Hogyan védjük meg a kastélyt?', time: 45, options: [
        { k: 'A', t: 'Védekezés. Lezárunk mindent, és a Nagy Teremben várunk.', w: { loyal: 2, traitor: 1 }, res(g) { g.f.strategia = 'vedekezes'; g.f.pancelok = 1; return 'McGonagall bólint. Éjfélkor életre kelti a páncélokat. A kard az irodában marad.'; } },
        { k: 'B', t: 'Csapda. Egy ajtót nyitva hagyunk, és ott várjuk őket.', w: { loyal: 2, traitor: 2 }, when: (g) => Object.keys(DOORS).some((k) => !g.f[`${k}_lezarva`]) },
        { k: 'C', t: 'A kard nálunk. Elhozzuk az irodából, és magunknál tartjuk.', w: { loyal: 2, traitor: 2 }, when: (g) => (g.f.jelszo_tudok || []).length > 0 }
      ]
    },
    kozben: {
      traitor: [{ id: 'guard', t: 'Azt javaslod, te őrizd a kardot.', seen: 'azt javasolta, hogy ő őrizze a kardot', when: (g, d) => d.key === 'C' }]
    },
    // B and C need a second, short vote: which door, and who keeps the sword.
    async after(g, d, tok) {
      const pres = g.present();
      if (d.key === 'B') {
        const doors = Object.keys(DOORS).filter((k) => !g.f[`${k}_lezarva`]);
        const v = await g.vote({ type: 'vote', prompt: 'Melyik ajtónál várjuk őket?', time: 20, options: doors.map((k) => ({ k, t: DOORS[k] })) }, pres);
        g.check(tok);
        g.f.strategia = `csapda:${v.key}`;
        g.f[`${v.key}_nyitva`] = 1;
        await g.io.info('Csapda', [`${DOORS[v.key]}: ott vártok rájuk. Az ajtót nyitva hagyjátok.`]);
      } else if (d.key === 'C' && pres.length) {
        const v = await g.vote({ type: 'vote', prompt: 'Ki őrizze a kardot?', time: 20, options: pres.map((p) => ({ k: String(p.id), t: p.name })) }, pres);
        g.check(tok);
        let pick = v.key;
        // A traitor who proposed himself counts twice among the candidates.
        const boosted = d.sabs.filter((a) => a.id === 'guard').map((a) => String(a.actor));
        if (boosted.length && v.votes) {
          const counts = {};
          v.votes.forEach((a) => { if (a && a.k != null) counts[a.k] = (counts[a.k] || 0) + (boosted.includes(a.k) ? 2 : 1); });
          const max = Math.max(0, ...Object.values(counts));
          const top = Object.keys(counts).filter((k) => counts[k] === max);
          if (max > 0) pick = g.rng.pick(top);
        }
        const keeper = g.players[+pick];
        g.f.strategia = 'kard_nalunk';
        g.f.kard_hol = 'csapat';
        g.f.kard_orzo = keeper.id;
        await g.io.info('Griffendél kardja', [`A kard nálatok marad. ${keeper.name} őrzi. Bellatrix a kard után megy, akárhol is van.`]);
      }
    },
    next: 'II-6'
  });

  // ---------- II-6: suspicion, and the cellar ----------

  add({
    id: 'II-6', title: 'Gyanú', place: 'Klubhelyiség, egy óra éjfélig', clockSet: DAY + 23 * 60, music: 'organ',
    enter(g) {
      // Same as I-X3: Filch locks someone up on his own if his suspicion reached 3 during this act.
      if (g.f.frics_gyanakszik >= 3 && (g.s.frics2 == null || g.s.frics2 < 3)) {
        const cands = g.present();
        const most = cands.slice().sort((a, b) => b.spottedBy.length - a.spottedBy.length)[0];
        const who = most && most.spottedBy.length ? most : g.rng.pick(cands);
        if (who) { g.lockUp(who, 3); g.io.notice(`Frics nem vár tovább: ${who.name} a pincébe kerül.`); g.s.fricsLocked2 = who.id; }
      }
      const h = g.players.find((p) => p.heir && p.status !== 'szellem');
      if (h) { const m = g.rng.pick(g.players.filter((p) => p.mugli && !h.knownMugli.includes(p.id))); if (m) { h.knownMugli.push(m.id); g.secret(h, `A kérdésedre választ kaptál: ${m.name} mugliszületésű.`, 'igaz'); } }
    },
    narr: [
      'Egy óra éjfélig. A klubhelyiség tüze ég, de senki nem melegszik.',
      'Ma valaki megint ajtót nyitott a sötétnek. Ma valakit megint elért a hideg.',
      'Éjfél után már nem lesz idő gyanakodni.'
    ],
    decision: { type: 'suspicion', prompt: 'Kit zár be Frics a pincébe?' },
    resolve(g, d) {
      const t = d.target;
      if (!t) return 'Senki nem mer dönteni. Az óra tovább ketyeg.';
      // Locked for II-END, III-0 and III-1: out of the first two scenes of Act III.
      g.lockUp(t, 3);
      g.s.suspicionResults = (g.s.suspicionResults || []).concat({ act: 2, id: t.id, correct: g.isEvil(t) });
      if (isTraitor(t)) {
        g.cur.tookWand = t.wand !== false;
        t.wand = false;
        t.revealed = true;
        return `Frics zörgő kulcscsomóval a pincébe vezeti: ${t.name}. ${g.cur.tookWand ? 'McGonagall elveszi a pálcáját. ' : ''}${t.name} nem tiltakozik. Csak néz maga elé, és dúdol valamit.`;
      }
      return `Frics a pincébe vezeti: ${t.name}. ${t.name} visszanéz rátok. Nem fél. Csalódott.`;
    },
    async after(g, d, tok) {
      const t = d.target;
      if (t && isTraitor(t) && g.cur.tookWand) {
        const voters = g.present();
        if (voters.length) {
          const v = await g.vote({ type: 'vote', prompt: 'Kinél legyen a pálcája?', options: voters.map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, voters);
          g.check(tok);
          g.f.palca_orzo = +v.key;
          g.io.notice(`A pálcát ${g.players[+v.key].name} őrzi.`);
        }
      }
      // R6: a locked traitor may slip out through the old door of the cellar.
      if (!g.sys('R6')) return;
      for (const p of g.traitors().filter((x) => x.status === 'bezarva')) {
        const k = await ask(g, p, 'A pince falában egy régi ajtó. Nem zárták be.', [{ k: 'go', t: 'Megszököm a régi ajtón' }, { k: 'stay', t: 'Maradok' }], 15, 'stay');
        g.check(tok);
        if (k !== 'go') continue;
        if (g.chance(50)) {
          p.escaped = true;
          p.revealed = true;
          p.status = 'el';
          p.away = 999;
          g.secret(p, 'A régi ajtó mögött lépcső vezet fel a hóba. Odakint egy női hang nevet. „Végre itt vagy, kicsim. Éjfélkor te vezeted őket.”', 'parancs', 'bella');
          g.log('szökés', `${p.name} megszökött a pincéből.`);
        } else {
          g.add('frics_gyanakszik', 1);
          g.secret(p, 'A lépcső tetején Frics lámpása. Visszaküld a pincébe.', 'igaz');
          g.log('szökés', `${p.name} szökése nem sikerült.`);
        }
      }
    },
    escort: false,
    next: 'II-END'
  });

  // ---------- II-END: midnight ----------

  add({
    id: 'II-END', title: 'Éjfél', place: 'Roxfort', clockSet: DAY + 24 * 60, music: 'storm',
    enter(g) {
      if (g.s.vadkanPending && !g.f.vadkan_lezarva) g.f.vadkan_nyitva = 1;
      g.endAct();
      g.openPassages().forEach(() => g.add('ostrom', 2));
      // Early end: fewer than two living, free players left.
      if (g.players.filter((p) => p.status === 'el' && !p.escaped).length < 2) g.s.earlyEnd = 'aragog';
    },
    narr(g) {
      const out = [];
      g.s.deaths.filter((x) => x.act === 2).forEach((x) => {
        const p = g.players[x.id];
        const forest = (g.s.forestDying || []).includes(p.id);
        out.push(`${p.name} ${forest ? 'nem tér vissza a Rengetegből' : 'szeme lecsukódik'}. Éjfél előtt halvány, ezüstös alak lebeg be a Nagy Terem ajtaján. A gyertyák fénye átsüt rajta.`);
      });
      return out.concat(['Tizenkettőt üt az óra a toronyban. A páncélok elhallgatnak.', 'Odakint, a viharban, egy női hang nevet.', 'Karácsony éjjele van.']);
    },
    escort: false,
    next: (g) => (g.s.earlyEnd ? (CE.SCENES.E1 ? 'E1' : 'DEMO-END') : (CE.SCENES['III-0'] ? 'III-0' : 'DEMO-END'))
  });
})(window.CE = window.CE || {});
