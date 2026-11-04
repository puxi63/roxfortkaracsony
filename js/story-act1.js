// Prologue and Act I (Szenteste) as scene data. Source: forgatokonyv/01-prologus-es-I-felvonas.md.
// Option weights w:{loyal, traitor} only steer the bots.
(function (CE) {
  'use strict';

  const S = CE.SCENES;
  const add = (sc) => { S[sc.id] = sc; };
  const loyal = (g) => g.present().filter((p) => !g.isEvil(p));
  const traitorSecret = (g, cmd, text) => g.traitors().filter((t) => !cmd || g.cmd(t) === cmd).map((t) => ({ to: t, text, kind: 'parancs', style: 'bella' }));

  // ---------- phone pages (role, origin, loyalty, goal) ----------

  CE.pages = function (g, p) {
    const r = CE.ROLES[p.role];
    const pages = [{ title: r.name, text: `${r.text}\n\nErő: ${r.power}` }];
    pages.push({ title: 'Származás', text: p.mugli ? 'Mugliszületésű vagy. A halálfalók a hozzád hasonlókat keresik. Nem kell elmondanod senkinek.' : 'Varázslócsaládból származol. Téged nem keresnek. Ezt csak te tudod.' });
    if (p.traitor || p.traitor2) {
      const code = p.cmds[g.s.act] || p.cmds[Math.max(1, g.s.act)];
      const cmd = code ? CE.COMMANDS[code].voice : 'Még várj, kicsim. Hamarosan szólok.';
      pages.push({ title: 'Hűség', style: 'bella', text: 'Az utolsó roxmortsi hétvégén a Három Seprűben egy nő ült a sarokasztalnál. Amikor elmentél mellette, megérintette a válladat. Azóta néha hallasz egy hangot.\n\n„Szia, kicsim. Lesz egy kis dolgod karácsonykor.”\n\nImperius-átok alatt állsz. Ha Bellatrix megszerzi a kardot, és legalább 2 parancsot teljesítettél, nyersz. Ha a többiek háromszor segítenek neked, a fináléban lerázhatod az átkot.' });
      pages.push({ title: 'A hang parancsa', style: 'bella', text: `„${cmd}”\n\nKiosonás: ${p.sneaks} maradt. Ellenállás: ${p.resist}.` });
    } else if (p.heir) {
      pages.push({ title: 'Hűség', text: 'A családod régóta a Sötét Nagyúr pártján áll. Tudod, hogy karácsonykor jönni fognak. Segíts nekik, és ne kérdezd, ki segít még.' });
    } else {
      pages.push({ title: 'Hűség', text: 'Hű vagy Roxforthoz. De valaki közületek nem az, aki volt. Figyeld, ki tűnik el, és ki terel.' });
    }
    if (p.goal) pages.push({ title: 'Személyes cél', text: p.goal.t });
    else if (p.traitor) pages.push({ title: 'Személyes cél', text: 'Neked nincs szükséged saját célra. Neked parancsaid vannak.' });
    pages.push({ title: 'Patrónus', text: `A patrónusod: ${p.patronus}.${p.memory ? ' A boldog emléked megvan.' : ''}` });
    return pages;
  };

  // ---------- shared reflexes ----------

  CE.dementorReflex = function (prompt, mod = 0, extraHurt = 0) {
    return {
      type: 'reflex', prompt, time: 5, bonus: (g) => (g.f.pihent ? 2 : 0),
      options: [
        {
          k: 'patr', t: 'Expecto Patronum!', hint: (g, p) => `${g.patronusChance(p, mod)}%`, w: { loyal: 3, traitor: 2 },
          res(g, p, c) {
            if (g.castPatronus(p, c, mod)) { g.cur.patronusOk = (g.cur.patronusOk || 0) + 1; return; }
            g.risk(p, c, 50, () => { g.freeze(p); if (extraHurt && g.chance(extraHurt)) g.wound(p); });
          }
        },
        { k: 'back', t: 'Hátrálok', w: { loyal: 2, traitor: 3 }, res(g, p, c) { g.risk(p, c, 30, () => g.freeze(p)); } },
        {
          k: 'pair', t: 'A mellettem állót húzom hátra', protects: true, w: { loyal: 1, traitor: 1 },
          res(g, p, c) {
            if (c.partnerChoice !== 'pair') g.risk(p, c, 100, () => g.freeze(p));
            if (c.partner && (c.partner.traitor || c.partner.traitor2)) g.resist(c.partner, 1);
          }
        }
      ]
    };
  };

  CE.curseReflex = function (prompt) {
    return {
      type: 'reflex', prompt, time: 5,
      options: [
        { k: 'protego', t: 'Protego!', w: { loyal: 3, traitor: 2 }, res(g, p, c) { g.risk(p, c, 40, () => g.wound(p, 'atok')); } },
        { k: 'hasra', t: 'Hasra vetem magam', w: { loyal: 2, traitor: 3 }, res(g, p, c) { g.risk(p, c, 20, () => g.wound(p, 'atok')); } },
        {
          k: 'stupor', t: 'Stupor! Visszaátkozom', w: { loyal: 1, traitor: 0 },
          res(g, p, c) {
            const hit = c.felix || g.chance(p.role === 'parbajozo' ? 70 : 40);
            if (hit) {
              if (!g.cur.stunned) { g.cur.stunned = true; g.add('ostrom', -1); g.say(`${p.name} átka eltalálja. Az alak a falnak csapódik, aztán az alagút felé menekül. Roxfortban nem lehet dehoppanálni.`); }
            } else {
              g.risk(p, c, 100, () => g.dying(p, 'atok'));
            }
          }
        }
      ]
    };
  };

  // ---------- PROLOGUE ----------

  add({
    id: 'P1', act: 0, title: 'A lista', place: 'Roxfort, december', clockSet: 9 * 60, music: 'piano',
    narr: [
      'December. Roxfortban hetek óta a Reggeli Próféta címlapjáról beszél mindenki: halálfalók szöktek meg az Azkabanból. Köztük Bellatrix Lestrange.',
      'A diákok sorra iratkoznak fel, hogy hazamenjenek karácsonyra. Otthon biztonságosabb, mondják a szülők.',
      'McGonagall professzor listáján, azok között, akik itt maradnak, alig néhány név áll. A tiétek.',
      'Vegyétek kézbe a telefont, és takarjátok el. Nézzétek meg a lapjaitokat: kik vagytok.'
    ],
    decision: { type: 'ack', prompt: 'Nézd meg a lapjaidat (tartsd nyomva a gombot), aztán nyomd meg:', label: 'Elolvastam', time: 60 },
    next: 'P2'
  });

  add({
    id: 'P2', act: 0, title: 'A patrónus', place: 'Sötét varázslatok kivédése', music: 'silver',
    narr: [
      'Az utolsó sötét varázslatok kivédése órán mindenki megpróbálta a patrónusbűbájt. Kevés kell hozzá. Csak egy igazán boldog emlék.',
      'Gondoljatok egyre. Ha akarjátok, írjátok le a telefonotokon. Senki nem fogja látni, csak ti.'
    ],
    decision: { type: 'memory', prompt: 'Egy boldog emléked. Csak a telefonodon marad, a TV nem látja.', time: 60 },
    resolve(g) { return `${g.players.filter((p) => p.memory).length} ezüst fény gyúlt ki.`; },
    next: 'P3'
  });

  add({
    id: 'P3', act: 0, title: 'Az első ajándék', place: 'Nagy Terem, reggel', clock: 60, music: 'bells',
    narr: [
      'Másnap reggel, még a vihar előtt, utoljára jön a bagolyposta. A mennyezetről puha, varázslatos hó hull, de a padlót soha nem éri el.',
      'Mindenki elé egy kis csomag pottyan. Korai karácsonyi ajándék.'
    ],
    enter(g) {
      const taken = new Set();
      g.players.forEach((p) => {
        let item;
        do { item = g.rng.pick(CE.FIRST_GIFTS); } while (CE.UNIQUE_GIFTS.includes(item) && taken.has(item));
        taken.add(item);
        g.giveItem(p, item);
        if ((g.settings.sweaters || []).includes(p.id)) g.giveItem(p, 'pulover');
        g.secret(p, `Ajándékot kaptál: ${CE.ITEMS[item].name}. ${CE.ITEMS[item].text}`, 'hangulat');
      });
    },
    decision: { type: 'ack', prompt: 'Bontsd ki az ajándékodat!', label: 'Kibontom', time: 30 },
    next: (g) => g.rng.pick(['P4a', 'P4b', 'P4c'])
  });

  const bonus = {
    hagrid: (g) => { g.f.hagrid_halas = 1; },
    jokedv: (g) => { g.f.jokedv = 1; },
    pihent: (g) => { g.f.pihent = 1; },
    konyv: (g) => { g.f.konyv_nyom = 1; },
    pletyka: (g) => { const h = g.players.find((p) => p.heir); if (h) { const m = g.rng.pick(g.players.filter((p) => p.mugli && !h.knownMugli.includes(p.id))); if (m) { h.knownMugli.push(m.id); g.secret(h, `A pletykából kiderült: ${m.name} mugliszületésű.`, 'igaz'); } } }
  };

  add({
    id: 'P4a', act: 0, title: 'Az utolsó vonat', place: 'Roxmorts, állomás', clock: 240, music: 'train',
    narr: ['A Roxfort Expressz elindul Roxmortsból. A peronon a hazautazók integetnek, a ti csizmátok alatt ropog a hó.', 'Hagrid egy egész fenyőfát vonszol fel a lejtőn, és fújtat, mint egy sárkány. Az ég alja furcsán sötét.'],
    decision: {
      type: 'vote', prompt: 'Mit csináltok?', options: [
        { k: 'A', t: 'Segítünk Hagridnak behúzni a fát.', w: { loyal: 2, traitor: 1 }, res(g) { bonus.hagrid(g); return 'Hagrid hátba vereget valakit, majdnem a hóba. „Gyertek le teára, ha kedvetek tartja!”'; } },
        { k: 'B', t: 'Hógolyócsata a parkban.', w: { loyal: 2, traitor: 2 }, res(g) { bonus.jokedv(g); return 'Félóra múlva mindenki csupa hó. Rég nevettetek ennyit.'; } },
        { k: 'C', t: 'Vissza a kastélyba, a kandallóhoz.', w: { loyal: 1, traitor: 1 }, res(g) { bonus.pihent(g); return 'A klubhelyiség tüze pattog, a kakaó forró.'; } }
      ]
    },
    next: 'P5'
  });

  add({
    id: 'P4b', act: 0, title: 'A Reggeli Próféta', place: 'Nagy Terem, reggeli', clock: 240, music: 'murmur',
    narr: ['A reggelinél mindenki ugyanazt az újságot olvassa. A címlapon Bellatrix Lestrange mozgó fényképe nevet rátok.', 'Valaki megjegyzi: a szökött halálfalókat Roxmorts környékén is látták.'],
    decision: {
      type: 'vote', prompt: 'Mit csináltok?', options: [
        { k: 'A', t: 'Lemegyünk Hagridhoz teázni.', w: { loyal: 2, traitor: 1 }, res(g) { bonus.hagrid(g); return 'Hagrid kőkemény süteménnyel kínál. Senki nem meri visszautasítani.'; } },
        { k: 'B', t: 'Beszállunk a pletykába.', w: { loyal: 1, traitor: 2 }, res(g) { bonus.pletyka(g); return 'Sok szó esik, kevés igaz. De valaki figyelmesen hallgatott.'; } },
        { k: 'C', t: 'Korán lefekszünk.', w: { loyal: 2, traitor: 1 }, res(g) { bonus.pihent(g); return 'A hálóteremben csak a szél süvít.'; } }
      ]
    },
    next: 'P5'
  });

  add({
    id: 'P4c', act: 0, title: 'Díszítés', place: 'Nagy Terem', clock: 240, music: 'bells',
    narr: ['A Nagy Teremben készülnek a karácsonyra. Hagrid fákat cipel be, Flitwick professzor aranyló gömböket akaszt az ágakra, a páncélok a folyosón karácsonyi dalokat próbálgatnak.'],
    decision: {
      type: 'vote', prompt: 'Mit csináltok?', options: [
        { k: 'A', t: 'Hagriddal cipeljük a fákat.', w: { loyal: 2, traitor: 1 }, res(g) { bonus.hagrid(g); return 'Tizenkét fa áll a teremben. Hagrid büszkén törli a homlokát.'; } },
        { k: 'B', t: 'Flitwicknek segítünk.', w: { loyal: 2, traitor: 2 }, res(g) { bonus.jokedv(g); return 'Az egyik gömb ének hangján csilingel. Flitwick majdnem leesik a létráról nevettében.'; } },
        { k: 'C', t: 'Inkább a könyvtárban olvasunk.', w: { loyal: 1, traitor: 1 }, res(g) { bonus.konyv(g); return 'Csend, pergamenszag, és egy könyv a kastély titkos átjáróiról, amelyből valaki kitépett egy lapot.'; } }
      ]
    },
    next: 'P5'
  });

  add({
    id: 'P5', act: 0, title: 'Az első titkos lap', place: 'Hálóterem, este', clock: 600, music: 'clock',
    narr: ['Este, mielőtt elalszotok, mindenki talál valamit. Egy gondolatot, egy hangot, egy cetlit a párnán.', 'Nézzétek meg a titkos lapotokat. Ezentúl minden jelenetben kaphattok egyet.'],
    secrets(g) {
      const out = [];
      const role = (r) => g.byRole(r);
      if (role('hagrid')) out.push({ to: role('hagrid'), text: 'Hagrid szerint a Rengeteg szélén, a hóban emberi lábnyomok vannak. És mellettük valami másé. Nagy, karmos nyomok.' });
      if (role('kisertet')) out.push({ to: role('kisertet'), text: 'Nick szerint a harmadik emeleten huzat van, ahol nem kellene.' });
      const mapper = role('csinytevo') || g.rng.pick(loyal(g));
      if (mapper) out.push({ to: mapper, text: 'Ha ma este ránézel a térképre, látod, ki hol jár, de csak egyszer.' });
      if (role('konyvmoly')) out.push({ to: role('konyvmoly'), text: g.f.konyv_nyom ? 'A kitépett lap a púpos boszorkány szobráról szólt. A jelszót is leírták rá.' : 'Valaki a titkos átjárókról kérdezett a könyvtárban.' });
      if (role('prefektus')) out.push({ to: role('prefektus'), text: 'Ma este te osztod be, ki megy merre. McGonagall rád számít.', kind: 'hangulat' });
      if (role('gyengelkedo')) out.push({ to: role('gyengelkedo'), text: 'Madam Pomfrey egész délután csokoládét pakolt a szekrényébe. Sokat. Mintha tudna valamit.' });
      if (role('bajital')) out.push({ to: role('bajital'), text: 'Piton professzor ma háromszor ment fel Dumbledore irodájához. Miért?' });
      if (role('mardekar')) out.push({ to: role('mardekar'), text: 'A klubhelyiségben valaki azt mondta: „Az apám szerint karácsonykor nagy meglepetés lesz.”' });
      if (role('kviddics')) out.push({ to: role('kviddics'), text: 'A lelátóról láttál valakit a tó felől sietni. Nem ismerted fel.', kind: 'hamis' });
      return out.filter((x) => !g.isEvil(x.to)).concat(g.traitors().map((t) => ({ to: t, text: `„${CE.COMMANDS[t.cmds[1]] ? CE.COMMANDS[t.cmds[1]].voice : 'Hamarosan, kicsim.'}” Kétszer kioshatsz ebben a felvonásban. Vigyázz, ki figyel.`, kind: 'parancs', style: 'bella' })));
    },
    enter(g) {
      // Commands for Act I are drawn now so the first page can show them.
      g.traitors().forEach((t) => { if (!t.cmds[1]) t.cmds[1] = g.rng.pick(CE.COMMANDS_BY_ACT[1]); });
      const h = g.players.find((p) => p.heir);
      if (h) g.secret(h, 'Ma még kérdezhetsz: ki mugliszületésű? (A következő gyanú-szavazás előtt választhatsz.)', 'igaz');
    },
    decision: { type: 'ack', prompt: 'Nézd meg a titkos lapodat.', label: 'Megnéztem', time: 30 },
    next: 'I-0'
  });

  // ---------- ACT I: random events ----------

  CE.EVENTS[1] = [
    { id: 'S1', title: 'Hóborc', narr: 'Hóborc tintát borít a lépcsőre, és dalban kiabálja a neveteket. Frics két emelettel lejjebb is hallja.', fx(g) { g.add('frics_gyanakszik', 1); } },
    { id: 'S2', title: 'A Kövér Dáma', narr: 'A Kövér Dáma a barátnőjével ünnepel, kicsit sokat ivott, és nem enged be senkit, amíg el nem énekeltek vele egy karácsonyi dalt. Mindannyian ott álltok a portré előtt.', fx(g) { g.s.noSneakNext = true; } },
    { id: 'S3', title: 'Félig Fej Nélküli Nick', narr: 'Félig Fej Nélküli Nick megkérdezi, nem fáztok-e. Ő is érzi, hogy a harmadik emeleten huzat van.', fx(g) { const p = g.rng.pick(loyal(g)); if (p) g.secret(p, 'Nick szerint a huzat a púpos boszorkány szobra felől jön.', 'igaz'); } },
    { id: 'S4', title: 'Piton', narr: 'Piton professzor elsuhan, és hosszan végignéz rajtatok. Egy szót sem szól.' }
  ];

  // ---------- ACT I ----------

  add({
    id: 'I-0', act: 1, title: 'A vihar', place: 'Nagy Terem, szenteste', clockSet: 16 * 60, music: 'storm',
    narr: [
      'Szenteste délután. A hó megállás nélkül esik, a szél úgy üvölt a tornyok körül, mint egy sebzett állat. Ez nem természetes vihar.',
      'A Nagy Teremben egyszer csak ezüstös fény gyúl: egy fényből szőtt főnix száll le az asztalra. Dumbledore professzor patrónusa. Az ő hangján szól: „A Hop-hálózatot lezárták. Reggelig nem jutok vissza. Maradjatok együtt, és ne nyissatok ki semmit, ami…”',
      'A főnix szétfoszlik. A mondat vége elvész.',
      'Ugyanekkor három dolog történik a kastélyban. A harmadik emeleten a púpos boszorkány szobra mögül jeges huzat süvít. A Csillagvizsgáló-toronyban betört egy ablak, és dér kúszik lefelé a lépcsőn. Frics irodájából pedig ordítás hallatszik: valaki havat hordott be a kastélyba.'
    ],
    secrets: (g) => traitorSecret(g, null, 'Hallod őket? Már a kapu előtt vannak. Csak egy kis segítség kell, kicsim.'),
    decision: {
      type: 'vote', prompt: 'Merre mentek?', options: [
        { k: 'A', t: 'A púpos boszorkányhoz', w: { loyal: 2, traitor: 1 }, next: 'I-A1' },
        { k: 'B', t: 'A Csillagvizsgáló-toronyba', w: { loyal: 2, traitor: 1 }, next: 'I-B1' },
        { k: 'C', t: 'Frics irodájához', w: { loyal: 2, traitor: 2 }, next: 'I-C1' }
      ]
    },
    kozben: {},
    postSecrets(g, d) {
      const p = g.rng.pick(loyal(g));
      if (!p) return [];
      const acted = d.sneaks.length || d.sabs.length;
      return [{ to: p, text: 'Mintha valaki halkan dúdolt volna a hátad mögött. Egy gúnyos, éneklő dallamot.', kind: acted ? 'igaz' : 'hamis' }];
    }
  });

  // --- Branch A: the humpbacked witch ---

  add({
    id: 'I-A1', act: 1, branch: 1, title: 'Huzat a harmadik emeleten', place: 'Harmadik emelet', clock: 40, music: 'wind',
    narr: ['A harmadik emeleti folyosón jéghideg van. A púpos, félszemű boszorkány szobra egy arasznyit félrecsúszott, mögüle hó szitál a kőpadlóra.', 'A hóban lábnyomok. Nem kifelé vezetnek. Befelé.'],
    secrets(g) {
      const out = [];
      const km = g.byRole('konyvmoly');
      if (km && g.f.konyv_nyom && !g.isEvil(km)) out.push({ to: km, text: 'A szó, amivel nyílik: Dissendium.' });
      return out.concat(traitorSecret(g, 'K1', 'Ez az, kicsim. Csak ki kell mondanod a szót, amikor senki nem figyel.'));
    },
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        {
          k: 'A', t: 'Szólunk Flitwick professzornak, hogy zárja le.', w: { loyal: 3, traitor: 1 }, next: 'I-A3',
          res(g, d) {
            if (!g.helpersHalf(d)) return 'Flitwick nem hisz nektek. „Huzat? Szenteste? Ugyan.” Nem történik semmi.';
            if (!g.sab(d, 'distract')) { g.f.boszorkany_lezarva = 1; g.f.boszorkany_nyitva = 0; g.defense('a púpos boszorkány lezárva'); }
            g.add('dumbledore_hu', 1);
            return 'Flitwick a pálcájával hosszan rajzol a szoborra. A púp sziszegve összezárul. „Ezt ma éjjel senki nem nyitja ki.”';
          }
        },
        { k: 'B', t: 'Bemászunk, és megnézzük, hová vezet.', w: { loyal: 2, traitor: 2 }, next: 'I-A2', res: () => 'A púp mögött szűk, sötét lyuk. Lefelé csúszós lépcső.' },
        { k: 'C', t: 'Elbújunk, és megvárjuk, ki jön.', w: { loyal: 1, traitor: 2 }, next: 'I-A3', res: () => 'A páncélok mögé húzódtok. A szél fütyül. Senki nem jön.' }
      ]
    },
    kozben: {
      traitor: [{ id: 'distract', t: 'Elvonod Flitwick figyelmét.', seen: 'elvonta Flitwick figyelmét, amikor a szobrot zárta' }],
      heir: [{ id: 'wipe', t: 'Elmosod a lábnyomokat.', seen: 'elmosta a lábnyomokat a hóban' }]
    }
  });

  add({
    id: 'I-A2', act: 1, branch: 2, title: 'Az alagút', place: 'Alagút a Mézesfalás alá', clock: 60, music: 'drip',
    narr: ['Az alagút hosszú, alacsony és kanyargós. Egy órányi görnyedt gyaloglás után kőlépcső vezet felfelé, egy csapóajtóhoz.', 'Fölötte egy pince. Ládák, zsákok, karácsonyi édességes dobozok: Mézesfalás, Roxmorts.', 'A poros padlón friss lábnyomok. És a ládák között valami csillan: egy ezüstös álarc darabja.'],
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Felmegyünk a boltba, és kinézünk az utcára.', w: { loyal: 2, traitor: 2 }, next: 'I-A2b' },
        {
          k: 'B', t: 'Elhozzuk az álarcdarabot, és visszafordulunk.', w: { loyal: 2, traitor: 1 }, next: 'I-A3',
          res(g, d) {
            if (g.sab(d, 'dust')) return 'Az álarc hideg, mint a jég. A lábnyomokat viszont valaki elmaszatolta.';
            if (g.presentRole('konyvmoly') || g.presentRole('csinytevo')) { g.f.belso_arulo = 1; return 'Az álarc hideg, mint a jég. Ezüst, és halálfalóé. A lábnyomok viszont odafentről lefelé is vezetnek: valaki a kastélyból járt itt.'; }
            return 'Az álarc hideg, mint a jég. Ezüst, és halálfalóé.';
          }
        },
        {
          k: 'C', t: 'Beomlasztjuk az alagutat.', w: { loyal: 2, traitor: 0 }, next: 'I-A3',
          res(g, d) {
            g.present().forEach((p) => { if (g.chance(25)) g.wound(p); });
            if (g.sab(d, 'weak')) return 'Bombarda! A mennyezet lezúdul. Por, csend. Legalábbis úgy tűnik.';
            g.f.boszorkany_lezarva = 1; g.f.boszorkany_nyitva = 0; g.defense('az alagút beomlott');
            return 'Bombarda! A mennyezet lezúdul. Por, csend. Ezen az úton ma éjjel senki nem jön.';
          }
        }
      ]
    },
    kozben: {
      traitor: [
        { id: 'weak', t: 'Gyengén célzol, ha robbantani kell.', seen: 'félrecélzott a robbantásnál' },
        { id: 'dust', t: 'Elmaszatolod a lábnyomokat.', seen: 'elmaszatolta a lábnyomokat a porban' }
      ]
    }
  });

  add({
    id: 'I-A2b', act: 1, title: 'Roxmorts főutcája', place: 'Mézesfalás, kirakat', clock: 20, music: 'cold',
    narr: ['Az utcán köd, a kirakatok jegesek. A Három Seprű előtt két csuklyás alak lebeg.', 'Mögöttük egy nő nevet, magasan, élesen. Az egyik alak megfordul. Felétek.'],
    decision: CE.dementorReflex('HIDEG ÁRAD!'),
    resolve(g) { g.f.bellatrix_ismert = 1; return 'Visszarohantok az alagútba. Most már tudjátok, ki nevetett: Bellatrix Lestrange.'; },
    next: 'I-A3'
  });

  add({
    id: 'I-A3', act: 1, branch: 3, title: 'Őrség a szobornál', place: 'Harmadik emelet', clock: 30, music: 'clock',
    narr: ['Indulnotok kell, a vacsora kezdődik. De ha valaki ma éjjel újra kinyitja a szobrot, valakinek látnia kell.', 'Ki marad itt egyedül, a hidegben?'],
    decision: { type: 'volunteer', prompt: 'Vállalod az őrséget a szobornál?', label: 'Itt maradok', time: 15, bot: { loyal: 30, traitor: 35 } },
    resolve(g, d) {
      const v = d.volunteer;
      if (!v) return 'Senki nem marad. A szobor üresen áll a sötétben.';
      g.f.or = v.id;
      v.stats.skippedTogether += 1;
      v.away = 2;
      d.alone = [v.id];
      if (g.chance(30)) g.wound(v);
      return `${v.name} a falnak dől, és nézi a szobrot. A szél fütyül.`;
    },
    next: 'I-S'
  });

  // --- Branch B: the Astronomy Tower ---

  add({
    id: 'I-B1', act: 1, branch: 1, title: 'Dér a lépcsőn', place: 'Csillagvizsgáló-torony', clock: 40, music: 'cold',
    narr: ['A Csillagvizsgáló-torony csigalépcsőjén fehér dér kúszik lefelé, mintha élne. Minden lépéssel hidegebb lesz.', 'Fent az egyik ablak betörve. A viharban sötét, rongyos alakok köröznek. Nem madarak.'],
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Felmegyünk, és megjavítjuk az ablakot.', w: { loyal: 3, traitor: 2 }, next: 'I-B2', res: () => 'Fent a hideg már fáj. A szilánkok a padlón csillognak.' },
        { k: 'B', t: 'Szólunk McGonagall professzornak.', w: { loyal: 2, traitor: 1 }, next: 'I-B3', res(g) { g.f.ablak_lezarva = 1; g.f.ablak_nyitva = 0; g.add('dumbledore_hu', 1); g.defense('a torony ablaka lezárva'); return 'McGonagall egyetlen pálcamozdulattal visszaforrasztja az üveget. Aztán rátok néz. „Mit kerestek itt?”'; } },
        { k: 'C', t: 'Elzárjuk a lépcsőt, és továbbmegyünk.', w: { loyal: 1, traitor: 3 }, next: 'I-B3', res(g, d) { g.f.ablak_nyitva = 1; if (g.sab(d, 'door')) g.add('ostrom', 1); return 'Egy ajtó, egy zár. A dér az ajtó alatt is átkúszik.'; } }
      ]
    },
    kozben: { traitor: [{ id: 'door', t: 'Résnyire nyitva hagyod a lépcsőajtót.', cmd: 'K3', seen: 'résnyire nyitva hagyta a lépcsőajtót' }] }
  });

  add({
    id: 'I-B2', act: 1, branch: 2, title: 'A dementor', place: 'A torony teteje', clock: 20, music: 'breath',
    narr: ['Amikor Reparo-t mondanátok az ablakra, egy alak lebeg be rajta. Rongyos köpeny, a csuklya alatt sötétség. Egy rothadó, szürke kéz nyúl felétek.', 'Minden boldog gondolat elszivárog belőletek.', 'HIDEG ÁRAD!'],
    decision: CE.dementorReflex('HIDEG ÁRAD!'),
    resolve(g) {
      if (g.cur.patronusOk) {
        if (!g.f.ablak_lezarva) { g.f.ablak_lezarva = 1; g.f.ablak_nyitva = 0; g.defense('sikeres patrónus a toronyban'); }
        return 'Az ezüst fénytől a dementor hátrahőköl, és kisodródik a viharba. A csapat megjavítja az ablakot.';
      }
      g.f.ablak_nyitva = 1;
      return 'Senkinek nem sikerült. A dementor lassan kilebeg az ablakon, de az ablak nyitva marad.';
    },
    postSecrets(g) { return g.cur.ev.frozen.map((p) => ({ to: p, text: 'Az ablaküveg szilánkjai kint voltak a párkányon. Belülről törték be.' })); },
    next: 'I-B3'
  });

  add({
    id: 'I-B3', act: 1, branch: 3, title: 'A Sötét Jegy', place: 'Csillagvizsgáló-torony', clock: 20, music: 'omen',
    narr: ['A torony ablakából látni a Rengeteget és mögötte Roxmorts fényeit. A falu fölött, a hóviharban, zöld fény gyúl.', 'Egy óriási koponya, a szájából kígyó tekereg elő. A Sötét Jegy. Valaki suttog: „Ott vannak. Egész közel.”'],
    enter(g) { g.f.bellatrix_ismert = 1; },
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Szólunk Hagridnak, hogy figyelje a parkot.', w: { loyal: 2, traitor: 1 }, res(g) { g.f.hagrid_figyel = 1; return 'Hagrid lámpása imbolyog a hóban, ahogy kiballag a kunyhóból, kezében a számszeríjával.'; } },
        { k: 'B', t: 'Megjegyezzük, honnan jön a fény.', w: { loyal: 2, traitor: 1 }, res(g) { const p = g.rng.pick(loyal(g)); if (p) g.secret(p, 'A Jegy a Mézesfalás fölött lebegett. Onnan vezet alagút a kastélyba.', 'igaz'); return 'Pontosan a főutca fölött. Ott, ahol az édességbolt áll.'; } },
        { k: 'C', t: 'Gyorsan le, mielőtt valaki meglát minket.', w: { loyal: 1, traitor: 2 }, res: () => 'A lépcsőn lefelé csak a saját szívdobogásotokat halljátok.' }
      ]
    },
    kozben: { traitor: [{ id: 'window2', t: 'Kinyitod a másik ablakot is.', cmd: 'K3', seen: 'kinyitotta a torony másik ablakát', fx(g) { if (!g.f.ablak_lezarva) g.f.ablak_nyitva = 1; } }] },
    next: 'I-S'
  });

  // --- Branch C: Filch and the map ---

  add({
    id: 'I-C1', act: 1, branch: 1, title: 'Frics', place: 'Frics irodája', clock: 40, music: 'chains',
    narr: ['Frics irodájában a falon láncok, az asztalon kartotékok. Frics dühösen mutat a padlóra: olvadó hó, sáros lábnyomok.', '„Valaki behordta a havat! Szenteste! A harmadik emelettől egészen idáig!”', 'Mrs. Norris a lábánál ül, és mereven néz valakit közületek. Aztán fúj egyet.'],
    decision: {
      type: 'vote', prompt: 'Mit tesztek?', options: [
        { k: 'A', t: 'Felajánljuk, hogy segítünk megtalálni, ki volt.', w: { loyal: 2, traitor: 2 }, next: 'I-C2', res(g, d) { if (g.helpersHalf(d)) { const p = g.rng.pick(loyal(g)); if (p) g.secret(p, 'A nyomok a púpos boszorkány szobrától indulnak.', 'igaz'); return 'Frics gyanakodva méreget, de végül morog: „A harmadik emelet. Ott kezdődik.”'; } g.add('frics_gyanakszik', 1); return 'Frics nem hisz nektek. Felírja a neveteket.'; } },
        { k: 'B', t: 'Megkérdezzük, kire fújt Mrs. Norris.', w: { loyal: 2, traitor: 0 }, next: 'I-C2', res(g) { g.add('frics_gyanakszik', 1); const t = g.players.find((p) => p.traitor); const pick = g.chance(60) && t && t.away === 0 ? t : g.rng.pick(g.present()); return `„Ő okosabb nálatok. Rá fújt.” Frics egy ujjal rámutat: ${pick.name}.`; } },
        { k: 'C', t: 'Amíg Frics beszél, valaki a fiókjához oson.', w: { loyal: 2, traitor: 1 }, next: 'I-C2', res: () => 'Frics hátat fordít, hogy egy kartotékot keressen. Most vagy soha.' }
      ]
    },
    kozben: { traitor: [{ id: 'sneeze', t: 'Tüsszentesz.', seen: 'szándékosan tüsszentett', fx(g) { g.f.tusszentes = 1; } }] }
  });

  add({
    id: 'I-C2', act: 1, branch: 2, title: 'Az elkobzott holmik fiókja', place: 'Frics irodája', clock: 20, music: 'drawer',
    narr: (g) => ['Az íróasztal alján egy fiók, rajta címke: Elkobzott és Igen Veszélyes.', g.f.terkep === 'frics_fiok' ? 'Bent egy üres, összehajtott pergamen. Régi és kopott. Aki ismeri, tudja, mi az.' : 'Bent trágyabombák, harapós frizbik, és egy doboz, amelyben valami zörög.'],
    decision: {
      type: 'spotlight', role: 'csinytevo', prompt: 'Mit veszel ki?',
      pick: (g) => g.rng.pick(g.present()),
      options: [
        { k: 'A', t: 'Kiveszem, ami bent van.', w: { loyal: 3, traitor: 2 }, res(g, d) {
          const who = d.chooser || g.rng.pick(g.present());
          const caught = g.chance((g.f.tusszentes ? 50 : 25) + (g.sab(d, 'cough') ? 15 : 0));
          if (g.f.terkep === 'frics_fiok') { g.moveMap(who); g.say(`${who.name} zsebre teszi a pergament.`); } else { g.giveItem(who, 'tragyabomba'); g.say(`${who.name} zsebre tesz egy trágyabombát.`); }
          if (caught) { who.status = 'bezarva'; who.away = 1; g.add('frics_gyanakszik', 1); return `Frics megfordul. „Te! Büntetőmunka!” ${who.name} egy jelenetre Frics fogságába kerül.`; }
          return 'Frics semmit nem vett észre.';
        } },
        { k: 'B', t: 'Nem viszek el semmit.', w: { loyal: 1, traitor: 2 }, res: () => 'A fiók halkan becsukódik.' }
      ]
    },
    kozben: { heir: [{ id: 'cough', t: 'Halkan köhintesz.', seen: 'szándékosan köhintett Frics háta mögött' }] },
    afterDecision(g) { g.f.tusszentes = 0; },
    next: 'I-C3'
  });

  add({
    id: 'I-C3', act: 1, branch: 3, title: 'A térkép', place: 'Frics irodája előtt', clock: 20, music: 'ink',
    narr: (g) => g.mapHolder() && !g.isEvil(g.mapHolder())
      ? ['A pergamenen lassan kirajzolódik a kastély. Folyosók, lépcsők, és apró, mozgó pontok, mindegyik mellett egy név.', 'A harmadik emeleten, a púpos boszorkány alagútjában egy név villan fel egy pillanatra, aztán eltűnik a térkép széle felé, Roxmorts irányába.', 'Bellatrix Lestrange.']
      : ['Hóborc kacag, Frics ordít, ti futtok.'],
    enter(g) { if (g.mapHolder() && !g.isEvil(g.mapHolder())) g.f.bellatrix_ismert = 1; },
    decision: (g) => (g.mapHolder() && !g.isEvil(g.mapHolder())) ? {
      type: 'vote', prompt: 'Mit kezdtek a térképpel?', options: [
        { k: 'A', t: 'Megnézzük, ki hol volt az elmúlt órában.', w: { loyal: 3, traitor: 1 }, res(g) {
          const t = g.players.find((p) => p.traitor);
          const acted = t && g.s.history.some((id) => (CE.SCENES[id] || {}).act === 1 && (g.s.sceneLog[id] || []).some((a) => a.actor === t.id && a.kind === 'sneak'));
          return acted ? `A pontok lassan visszafelé kúsznak az időben. A harmadik emeleten egy név: ${t.name}.` : 'A pontok lassan visszafelé kúsznak az időben. A harmadik emeleten senki.';
        } },
        { k: 'B', t: 'Rohanunk a szoborhoz, és lezárjuk.', w: { loyal: 2, traitor: 1 }, res(g, d) { if (g.helpersHalf(d)) { g.f.boszorkany_lezarva = 1; g.f.boszorkany_nyitva = 0; g.defense('a púpos boszorkány lezárva'); return 'A púp nehezen mozdul, de a varázslat megtartja.'; } return 'Mire odaértek, a szobor már nem mozdul. Nem tudjátok, zárva van-e.'; } },
        { k: 'C', t: 'Odaadjuk a térképet McGonagallnek.', w: { loyal: 1, traitor: 3 }, res(g) { g.add('dumbledore_hu', 1); g.f.terkep = 'mcgonagall'; return 'McGonagall elsápad, amikor meglátja a nevet. „Köszönöm. Most menjenek vacsorázni. Mindannyian.”'; } }
      ]
    } : null,
    resolve(g) { if (!(g.mapHolder() && !g.isEvil(g.mapHolder())) && g.present().length) { g.wound(g.rng.pick(g.present())); } },
    kozben: {},
    next: 'I-S'
  });

  // --- Join: the eagle asks (R1) ---

  add({
    id: 'I-S', act: 1, title: 'A sas kérdez', place: 'A hollóhátas torony kopogtatója', clock: 30, music: 'bronze',
    narr: ['A vacsora előtt a hollóhátas torony sasos kopogtatója mellett gyűltök össze, mert a Kövér Dáma még mindig nem enged be senkit.', 'A bronz sas kinyitja a csőrét. Ma este mindenkinek feltesz egy kérdést. Írjátok le a válaszotokat. Röviden.'],
    decision: { type: 'text', time: 25, debate: 45 },
    next: 'I-X1'
  });

  add({
    id: 'I-X1', act: 1, title: 'Szenteste a Nagy Teremben', place: 'Nagy Terem', clockSet: 19 * 60, music: 'carol',
    narr: ['A Nagy Teremben tizenkét karácsonyfa áll, ágaikon gyertyák és aranyló gömbök. A mennyezetről hó hull, és elolvad, mielőtt elérné a fejeteket.', 'Egyetlen asztal van megterítve. McGonagall, Flitwick, Madam Pomfrey és Hagrid ül veletek. Piton professzor a sarokban, egy szót sem szól.', 'A folyosón a páncélok karácsonyi dalokat énekelnek, kicsit hamisan. Egy órára mintha minden rendben volna.'],
    enter(g) {
      if (g.f.jokedv) { const w = g.players.find((p) => p.status === 'el' && p.hp < 3); if (w) g.heal(w, 1); }
      g.players.forEach((p) => { if (p.status === 'haldoklik' || p.status === 'dermedt') { p.status = 'el'; p.hp = Math.max(1, p.hp); p.dyingCause = null; } if (p.status === 'bezarva' && p.away <= 1) { p.status = 'el'; p.away = 0; } });
    },
    secrets(g) {
      return g.players.filter((p) => p.status === 'el').map((p) => {
        if (p.traitor || p.traitor2) return { to: p, text: p.resist >= 1 ? 'Milyen kedvesek veled. Ne feledd, kié vagy. …Miért mosolyogsz? Ne mosolyogj.' : 'Milyen kedvesek veled. Ne feledd, kié vagy.', kind: 'parancs', style: 'bella' };
        return { to: p, text: g.rng.pick(['A pudingban egy ezüst sarló volt.', 'McGonagall rád nézett, és majdnem elmosolyodott.', 'Hagrid megölelt. Fájt.']), kind: 'hangulat' };
      });
    },
    decision: {
      type: 'vote', prompt: 'Hogyan töltitek az estét?', options: [
        { k: 'A', t: 'Együtt maradunk egész este.', w: { loyal: 3, traitor: 1 }, res(g) { g.present().forEach((p) => g.heal(p, 1)); return 'Valaki énekelni kezd. Rossz hangon, de mindenki beszáll. Még Flitwick is vezényel a villájával.'; } },
        { k: 'B', t: 'Ki-ki megy a dolgára.', w: { loyal: 1, traitor: 3 }, res(g) { g.present().forEach((p) => { p.stats.skippedTogether += 1; }); return 'Egyenként szivárogtok ki. A gyertyák lassan leégnek.'; } }
      ]
    },
    afterDecision(g, d) { if (d.key === 'A') g.cur.noSneak = true; else g.cur.halfWatch = true; },
    kozben: {},
    next: 'I-X2'
  });

  add({
    id: 'I-X2', act: 1, title: 'Kialszanak a gyertyák', place: 'Folyosó a hálótermek felé', clockSet: 22 * 60, music: 'dark',
    narr(g) {
      const base = 'Vacsora után, a hálótermek felé menet, egyszerre kialszik minden fáklya a folyosón. A lehelletetek fehér.';
      if (g.f.ablak_nyitva) return [base, 'A lépcső tetején egy, kettő, három rongyos alak lebeg lefelé. A páncélok énekének utolsó hangja megfagy.', 'HIDEG ÁRAD!'];
      if (g.f.boszorkany_nyitva) return [base, 'A folyosó végén egy csuklyás alak áll. Ezüst álarc. A pálcája vége zölden izzik.', 'ÁTOK!'];
      return [base, 'Az ablak előtt, a viharban egy rongyos alak lebeg. Benéz. Aztán továbbsodródik. Ma éjjel még nem jutott be.'];
    },
    decision(g) {
      if (g.f.ablak_nyitva) return CE.dementorReflex('HIDEG ÁRAD!', -10, 20);
      if (g.f.boszorkany_nyitva) return CE.curseReflex('ÁTOK!');
      return null;
    },
    resolve(g) { if (!g.f.ablak_nyitva && !g.f.boszorkany_nyitva) { g.f.jokedv = 1; return 'Mindenki megkönnyebbül.'; } return ''; },
    next: 'I-X3'
  });

  add({
    id: 'I-X3', act: 1, title: 'Gyanú', place: 'Klubhelyiség, éjfél előtt', clockSet: 23 * 60 + 30, music: 'organ',
    narr: ['Éjfél felé jár. A klubhelyiségben ültök, a tűz már csak parázslik.', 'Valaki kinyitotta azt, amit nem kellett volna. Valaki közületek nem a saját akaratából teszi, amit tesz.', 'Frics azt mondta: ha megnevezitek, bezárja a pincébe, McGonagall pedig elveszi a pálcáját.'],
    enter(g) {
      if (g.f.frics_gyanakszik >= 3) {
        const cands = g.present();
        const most = cands.slice().sort((a, b) => b.spottedBy.length - a.spottedBy.length)[0];
        const who = most && most.spottedBy.length ? most : g.rng.pick(cands);
        if (who) { g.lockUp(who, 2); g.io.notice(`Frics nem vár tovább: ${who.name} a pincébe kerül.`); g.s.fricsLocked = who.id; }
      }
      const h = g.players.find((p) => p.heir && p.status !== 'szellem');
      if (h) { const m = g.rng.pick(g.players.filter((p) => p.mugli && !h.knownMugli.includes(p.id))); if (m) { h.knownMugli.push(m.id); g.secret(h, `A kérdésedre választ kaptál: ${m.name} mugliszületésű.`, 'igaz'); } }
    },
    decision: { type: 'suspicion', prompt: 'Kit zár be Frics a pincébe?' },
    resolve(g, d) {
      const t = d.target;
      if (!t) return 'Senki nem mer dönteni. Ma éjjel mindenki egyedül alszik el.';
      g.lockUp(t, 2);
      g.s.suspicionResults = (g.s.suspicionResults || []).concat({ act: 1, id: t.id, correct: g.isEvil(t) });
      if (t.traitor || t.traitor2) { t.wand = false; t.revealed = true; return `Frics zörgő kulcscsomóval vezeti le ${t.name}t a pincébe. McGonagall elveszi a pálcáját. ${t.name} nem tiltakozik. Csak néz maga elé, és dúdol valamit.`; }
      return `Frics levezeti ${t.name}t. ${t.name} visszanéz rátok. Nem fél. Csalódott.`;
    },
    async after(g, d) {
      const t = d.target;
      if (!t || !(t.traitor || t.traitor2)) return;
      const voters = g.present();
      if (!voters.length) return;
      const v = await g.vote({ prompt: 'Kinél legyen a pálcája?', options: voters.map((p) => ({ k: String(p.id), t: p.name })), time: 20 }, voters);
      g.f.palca_orzo = +v.key;
      g.io.notice(`A pálcát ${g.players[+v.key].name} őrzi.`);
    },
    escort: false,
    next: 'I-END'
  });

  add({
    id: 'I-END', act: 1, title: 'Hajnal', place: 'Roxfort', clockSet: 24 * 60 + 6 * 60, music: 'dawn',
    enter(g) {
      g.endAct();
      if (g.f.boszorkany_nyitva) g.add('ostrom', 2);
      if (g.f.ablak_nyitva) g.add('ostrom', 2);
    },
    narr(g) {
      const out = [];
      const dead = g.s.deaths.filter((x) => x.act === 1).map((x) => g.players[x.id].name);
      dead.forEach((n) => out.push(`${n} szeme lecsukódik. Reggel a klubhelyiség hideg kandallója mellett halvány, ezüstös alak ül. Integet.`));
      if (!g.f.boszorkany_nyitva && !g.f.ablak_nyitva) out.push('Hajnalban a vihar egy pillanatra elcsendesedik. A szobor szilárdan áll, az ablak ép. Ma éjjel nem jutottak be.');
      else out.push('Hajnalban Frics ordítása veri fel a kastélyt. Friss hó a harmadik emeleten. Dér a toronylépcsőn. Valaki ma éjjel is nyitva hagyott valamit.');
      out.push('Boldog karácsonyt, Roxfort. Az ágyatok végében ajándékok várnak.');
      return out;
    },
    escort: false,
    next: (g) => (CE.SCENES['II-0'] ? 'II-0' : 'DEMO-END')
  });

  add({
    id: 'DEMO-END', act: 1, title: 'Folytatás hamarosan', place: 'Az I. felvonás vége',
    narr: ['Itt ér véget a játék jelenleg megírt része. A II. és a III. felvonás következik.', 'Lássuk, ki mit tett eddig.'],
    escort: false,
    async after(g) { await g.io.reveal(g.revealData()); },
    next: null
  });
})(window.CE = window.CE || {});
