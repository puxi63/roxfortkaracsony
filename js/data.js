// Shared game tables: roles, items, commands and the content banks of the extra systems (R1-R11).
// UI strings are Hungarian; identifiers and comments are English.
(function (CE) {
  'use strict';

  CE.NAMES = ['Anna', 'Bence', 'Dóri', 'Gergő', 'Kata', 'Laci', 'Marci', 'Nóri', 'Panni', 'Zoli'];

  CE.ROLES = {
    prefektus: { name: 'Prefektus', sym: '✦', text: 'A jelvényed miatt éjjel is járhatsz a folyosókon.', power: 'Egyszer kimenthetsz valakit egy veszélyes jelenetből: „Vissza a hálóba!”' },
    gyengelkedo: { name: 'Gyengélkedős segítő', sym: '✚', text: 'Madam Pomfrey keze alá dolgozol.', power: 'Felvonásonként megmenthetsz egy haldoklót, és bármikor feloldhatsz egy dermedést.' },
    konyvmoly: { name: 'Könyvmoly', sym: '❧', text: 'Ismered a könyvtár minden polcát.', power: 'Egyszer igaz nyomot kapsz, és felismered az átkokat.' },
    parbajozo: { name: 'Párbajozó', sym: '⚔', text: 'A legjobb vagy a sötét varázslatok kivédésén.', power: 'Átoknál duplán számítasz, a patrónusod +15%. Egyszer lefegyverezhetsz valakit.' },
    csinytevo: { name: 'Csínytevő', sym: '⌖', text: 'Nálad van a Tekergők Térképe.', power: 'Egyszer 100%-ra emelheted a figyelést a térképpel.' },
    hagrid: { name: 'Hagrid barátja', sym: '♣', text: 'A kunyhóban mindig szívesen látnak, Agyar követ.', power: 'A parkban és a Rengetegben egyszer kivezeted a csapatot.' },
    kisertet: { name: 'A kísértetek barátja', sym: '☾', text: 'Myrtle, Nick és a Kövér Dáma is szóba áll veled.', power: 'Élő szellem nélkül is kapsz súgást a kísértetektől.' },
    bajital: { name: 'Bájitalfőző', sym: '⚗', text: 'Még Piton professzor is elismeri, hogy tehetséges vagy.', power: 'Egy korty Felix Felicis: egyszer egy reflex vagy próba biztosan sikerül.' },
    mardekar: { name: 'Mardekáros diák', sym: '⚘', text: 'Becsületes vagy, de mindenki gyanakszik rád.', power: 'A mardekáros klubhelyiségben hallgatózhatsz.' },
    kviddics: { name: 'Kviddicsjátékos', sym: '✶', text: 'Gyors vagy, jó a reflexed.', power: 'Egyszer elkerülhetsz egy halálos átkot vagy egy dermedést.' }
  };

  CE.PATRONUS = ['vidra', 'nyúl', 'macska', 'farkas', 'ló', 'bagoly', 'róka', 'hattyú', 'szarvas', 'kutya'];

  CE.ITEMS = {
    csoki: { name: 'Csokibéka', text: 'A kártyán egy híres varázsló. Dementor után a csoki a legjobb.' },
    pulover: { name: 'Weasley-pulóver', text: 'Kötött, meleg, a kezdőbetűd rajta. Egy sebet elnyel.' },
    bezoar: { name: 'Bezoár', text: 'Kecske gyomrából való kő. A legtöbb méreg ellen véd.' },
    kopeny: { name: 'Láthatatlanná tévő köpeny', text: 'Nem a tiéd. Egy jelenetben észrevétlen vagy, és figyelőként biztosan látsz.' },
    gyanuszkop: { name: 'Gyanuszkóp', text: 'Ha megbízhatatlan ember van a közelben, pörögni kezd. Egyszer megmondja, volt-e szabotázs.' },
    pergamen: { name: 'Üres pergamen', text: 'Egy üres lap. Semmi nincs rajta.' },
    tragyabomba: { name: 'Trágyabomba', text: 'Kerek, büdös, és tökéletes. Egy veszélyből kimenekít.' },
    terkep: { name: 'Tekergők Térképe', text: 'A kastély minden lakója rajta van.' },
    karamella: { name: 'Házi karamella', text: 'Mrs. Weasley küldte. Egy sebet gyógyít.' },
    sapka: { name: 'Kötött sapka', text: 'Kicsit szúr. Kicsit nagy. Melegen tart.' },
    tukorszilank: { name: 'Tükörszilánk', text: 'Aberforth adta. Ha baj van, belenézel, és ő átjön.' }
  };
  CE.FIRST_GIFTS = ['csoki', 'csoki', 'pulover', 'bezoar', 'kopeny', 'gyanuszkop', 'pergamen'];
  CE.UNIQUE_GIFTS = ['kopeny', 'gyanuszkop', 'pergamen'];

  // Player-count scaling (script part 1, 2.8).
  CE.scale = function (n) {
    if (n <= 5) return { mugli: 1, heir: 0, watch: 40, healerPerAct: 2, forceHealer: true, vote: 30, debate: 60 };
    if (n <= 7) return { mugli: 2, heir: 0, watch: 35, healerPerAct: 1, forceHealer: false, vote: 40, debate: 90 };
    return { mugli: 3, heir: 1, watch: 25, healerPerAct: 1, forceHealer: false, vote: 45, debate: 120 };
  };

  // Traitor commands. sneak(g, p) is the effect of a sneak-out; check(g) decides success at act end.
  CE.COMMANDS = {
    K1: {
      act: 1, voice: 'Nyisd ki a boszorkány púpját, kicsim. Tudod a szót.', short: 'nyisd ki a púpos boszorkányt',
      sneak(g) { if (!g.f.boszorkany_lezarva) { g.f.boszorkany_nyitva = 1; return true; } return false; },
      check(g) { return g.f.boszorkany_nyitva === 1; }
    },
    K2: {
      act: 1, voice: 'Az a térkép mindent lát. Tűnjön el.', short: 'tüntesd el a térképet',
      sneak(g, p) {
        const holder = g.mapHolder();
        if (g.f.terkep === 'frics_fiok') { g.moveMap(p); return true; }
        if (holder && holder !== p && !g.didWatch(holder)) { g.moveMap(p); return true; }
        return false;
      },
      check(g) { const h = g.mapHolder(); return !h || h.traitor || h.traitor2 || h.heir; }
    },
    K3: {
      act: 1, voice: 'Hideg van odakint. Engedd be a barátaimat.', short: 'engedd be a hideget',
      sneak(g) { if (!g.f.ablak_lezarva) { g.f.ablak_nyitva = 1; return true; } return false; },
      check(g) { return g.f.ablak_nyitva === 1; }
    }
  };
  // Act II. Scenes may override the sneak effect with onSneak (e.g. II-2 for K4, II-3 for K6).
  Object.assign(CE.COMMANDS, {
    K4: {
      act: 2, voice: 'Szedd szét őket, kicsim. Egyedül olyan törékenyek.', short: 'szedd szét a csapatot',
      sneak() { return false; },
      check(g) { return !!(g.f.szetvaltak || g.f.egyedul_volt); }
    },
    K5: {
      act: 2, voice: 'Egy sárvérű se ünnepeljen ma.', short: 'egy mugliszületésű se ünnepeljen',
      sneak() { return false; },
      check(g) { return !!(g.s.mugliHurt && g.s.mugliHurt[2]); }
    },
    K6: {
      act: 2, voice: 'Tudd meg a vízköpő jelszavát.', short: 'tudd meg a vízköpő jelszavát',
      sneak() { return false; },
      check(g) { return g.traitors().some((t) => (g.f.jelszo_tudok || []).includes(t.id)); }
    },
    // Act III.
    K7: {
      act: 3, voice: 'Nyisd ki az utolsó ajtót, kicsim.', short: 'nyisd ki az utolsó ajtót',
      sneak(g) { return !!g.openPassage(); },
      check(g) { return !!g.f.betores_atjaron; }
    },
    K8: {
      act: 3, voice: 'Hagyj hátra valakit. Hadd lássák, mi vár rájuk.', short: 'hagyj hátra valakit',
      sneak() { return false; },
      check(g) { return g.s.deaths.some((x) => x.act === 3); }
    },
    K9: {
      act: 3, voice: 'A páncélok aludjanak tovább.', short: 'a páncélok aludjanak tovább',
      sneak() { return false; },
      check(g) { return !g.f.pancelok; }
    }
  });
  CE.COMMANDS_BY_ACT = { 1: ['K1', 'K2', 'K3'], 2: ['K4', 'K5', 'K6'], 3: ['K7', 'K8', 'K9'] };

  // R1: question pairs [loyal, traitor] and bot answer banks.
  CE.QUESTIONS = [
    { q: 'Mit vinnél magaddal egy sötét alagútba?', t: 'Mit vinnél magaddal egy hideg toronyba?', a: ['lámpást', 'pálcát', 'Agyart', 'csokit', 'egy barátot'], ta: ['sálat', 'pokrócot', 'forró teát', 'kesztyűt'] },
    { q: 'Mi a kedvenc karácsonyi ételed?', t: 'Mi a kedvenc nyári ételed?', a: ['bejgli', 'pulyka', 'halászlé', 'puding', 'töltött káposzta'], ta: ['dinnye', 'fagyi', 'lecsó', 'lángos'] },
    { q: 'Hány ember fér el kényelmesen a Szellemszállásban?', t: 'Hány ember fér el kényelmesen Hagrid kunyhójában?', a: ['6', '10', '8', 'húsz'], ta: ['3', '4', 'kettő', '5'] },
    { q: 'Melyik roxforti tantárgyat hagynád ki legszívesebben?', t: 'Melyik roxforti tantárgyat vennéd fel még egyszer?', a: ['bájitaltan', 'mágiatörténet', 'jóslástan', 'számmisztika'], ta: ['bűbájtan', 'gyógynövénytan', 'SVK', 'átváltoztatástan'] },
    { q: 'Milyen színű lenne a patrónusod, ha lehetne színe?', t: 'Milyen színű lenne a sárkányod, ha lehetne sárkányod?', a: ['arany', 'kék', 'ezüst', 'zöld'], ta: ['vörös', 'fekete', 'bronz', 'lila'] },
    { q: 'Mit kérnél karácsonyra Dumbledore-tól?', t: 'Mit kérnél karácsonyra Pitontól?', a: ['citromos cukrot', 'egy főnixtollat', 'egy mesét', 'a merengőjét'], ta: ['jó jegyet', 'egy mosolyt', 'bájitalreceptet', 'hogy békén hagyjon'] },
    { q: 'Melyik mézesfalási édességet ennéd meg most?', t: 'Melyik mézesfalási édességet nem ennéd meg soha?', a: ['csokibékát', 'mindenízű drazsét', 'nyalókát', 'karamellát'], ta: ['csótánycsokrot', 'vérízű nyalókát', 'borsmentás varangyot'] },
    { q: 'Hány órát aludtál tegnap éjjel?', t: 'Hány órát töltöttél tegnap a könyvtárban?', a: ['7', '8', '6', '5'], ta: ['2', '1', '3', '0'] },
    { q: 'Hová bújnál el, ha Hóborc keresne?', t: 'Hová bújnál el, ha Frics keresne?', a: ['a könyvtárba', 'a konyhába', 'a hálóterembe', 'a Szükség Szobájába'], ta: ['a seprűskamrába', 'a páncél mögé', 'Hagridhoz', 'a pincébe'] },
    { q: 'Mi jut eszedbe először a hóról?', t: 'Mi jut eszedbe először a jégről?', a: ['hógolyó', 'karácsony', 'hóember', 'szánkó'], ta: ['korcsolya', 'hideg', 'csúszás', 'jégcsap'] }
  ];

  // R3: personal goals. check(g, p) returns true/false, or null if it can only be judged later.
  CE.GOALS = [
    { id: 'kard', t: 'A finálé végén legyen nálad Griffendél kardja.', sus: true, check: () => null },
    { id: 'ment', t: 'Ments meg legalább egy haldoklót vagy dermedtet.', check: (g, p) => p.stats.saves > 0 },
    { id: 'kimarad', t: 'Legalább egyszer maradj ki a közös éneklésből vagy vacsorából.', sus: true, check: (g, p) => p.stats.skippedTogether > 0 },
    { id: 'targy', t: 'Tarts meg egy tárgyat a végéig, és ne add oda senkinek.', sus: true, check: (g, p) => p.items.length > 0 && p.stats.giftsGiven === 0 },
    { id: 'iroda', t: 'Juss be Dumbledore irodájába.', sus: true, check: () => null },
    { id: 'patr2', t: 'Idézz sikeres patrónust legalább kétszer.', check: (g, p) => p.stats.patronusOk >= 2 },
    { id: 'nemdermed', t: 'Soha ne dermedj meg.', check: (g, p) => p.stats.frozen === 0 },
    { id: 'terkep3', t: 'A III. felvonásban legyen nálad a Tekergők Térképe.', sus: true, check: () => null },
    { id: 'maganyos', t: 'Egy gyanú-szavazáson szavazz arra, akire senki más.', sus: true, check: (g, p) => p.stats.loneVote > 0 },
    { id: 'ajandek2', t: 'Adj ajándékot legalább két embernek.', check: (g, p) => p.stats.giftsGiven >= 2 },
    { id: 'onkentes', t: 'Legalább egyszer vállalj önként veszélyt.', check: (g, p) => p.stats.volunteered > 0 },
    { id: 'prefekt', t: 'Soha ne szavazz ugyanarra, mint a prefektus.', sus: true, check: (g, p) => (g.byRole('prefektus') && g.byRole('prefektus') !== p) ? p.stats.prefectSame === 0 : null },
    { id: 'sebtelen', t: 'Élj túl mindent egyetlen seb nélkül.', check: (g, p) => p.stats.wounds === 0 && p.status !== 'szellem' },
    { id: 'tavol', t: 'Juss el a Szárnyas Vadkanba vagy a Szellemszállásba.', check: () => null }
  ];
  CE.HEIR_GOALS = [
    { id: 'muglik', t: 'Tudd meg, ki az összes mugliszületésű.', check: (g, p) => g.players.filter((x) => x.mugli).every((x) => p.knownMugli.includes(x.id)) },
    { id: 'kardH', t: 'Legyen nálad a kard a III. felvonás bármely pontján.', check: () => null }
  ];

  // R4: crossroads. trigger(g, p, ev) is checked after each scene; ev holds the scene's events.
  CE.CROSSROADS = [
    {
      id: 'U2', t: 'Csak egy csokibékád van. Lehet, hogy neked is kell még.',
      trigger: (g, p, ev) => p.items.includes('csoki') && ev.frozen.some((x) => x !== p),
      options: [
        { k: 'A', t: 'Odaadom neki', res(g, p, ev) { const x = ev.frozen.find((y) => y !== p && y.status === 'dermedt'); if (x) { g.takeItem(p, 'csoki'); g.revive(x, p); g.say(`${p.name} odaadta a csokibékáját. ${x.name} felenged.`); } } },
        { k: 'B', t: 'Megtartom', res() {} }
      ]
    },
    {
      id: 'U6', t: 'Az ágyad szélén egy ezüstös alak ül. Ő az.',
      trigger: (g, p, ev) => p.sawDeath && g.players.some((x) => x.status === 'szellem'),
      options: [
        { k: 'A', t: 'Beszélek vele', res(g, p) { g.secret(p, g.trueClue(p), 'igaz'); g.wound(p, 'seb'); } },
        { k: 'B', t: 'Elküldöm', res() {} }
      ]
    },
    {
      id: 'U9', t: 'Az ezüst köd nem akar alakot ölteni.',
      trigger: (g, p) => p.stats.patronusFail >= 2,
      options: [
        { k: 'A', t: 'Elmondom valakinek a boldog emlékem, itt, élőben', res(g, p) { p.patronusBonus += 15; const other = g.rng.pick(g.present().filter((x) => x !== p)); if (other) { other.patronusBonus += 15; g.secret(other, `${p.name} elmondta neked a boldog emlékét. A következő patrónusod erősebb lesz.`, 'hangulat'); } } },
        { k: 'B', t: 'Új emléket keresek', res(g, p) { p.patronusBonus += 25; p.memory = true; } }
      ]
    },
    {
      id: 'U10', t: 'Megfagy melletted valaki. Te melegben vagy.',
      trigger: (g, p, ev) => p.items.includes('pulover') && ev.wounded.some((x) => x !== p),
      options: [
        { k: 'A', t: 'Ráterítem a pulóvert', res(g, p, ev) { const x = ev.wounded.find((y) => y !== p); g.takeItem(p, 'pulover'); g.heal(x, 1); if (x.traitor || x.traitor2) g.resist(x, 1); g.say(`${p.name} ráterítette a pulóverét ${x.name} vállára.`); } },
        { k: 'B', t: 'Megtartom', res() {} }
      ]
    },
    {
      id: 'U1', t: 'Mrs. Norris egyedül talál rád. Leül eléd, és néz.',
      trigger: (g, p) => (g.s.lastAlone || []).includes(p.id),
      options: [
        { k: 'A', t: 'Megsimogatom', res(g) { g.add('frics_gyanakszik', -1); } },
        { k: 'B', t: 'Elhessegetem', res(g) { g.add('frics_gyanakszik', 1); } }
      ]
    },
    {
      id: 'U3', t: 'A párnádon egy cetli: „Tudom, ki vagy.”',
      trigger: (g, p) => p.mugli && g.s.act === 2 && g.f.tamadas_volt && !(g.s.lastAlone || []).includes(p.id),
      options: [
        { k: 'A', t: 'Megmutatom a csapatnak', res(g, p) { p.mugliPublic = true; g.say(`${p.name} megmutatja a cetlit: mugliszületésű.`); } },
        { k: 'B', t: 'Eltitkolom', res() {} }
      ]
    },
    {
      id: 'U4', t: 'A kard nehéz. Mintha suttogna.',
      trigger: (g, p) => g.f.kard_orzo === p.id,
      options: [
        { k: 'A', t: 'Átadom valakinek', res(g, p) { const to = g.rng.pick(g.present().filter((x) => x !== p)); if (to) { g.f.kard_orzo = to.id; g.say(`${p.name} átadta a kardot: ${to.name} őrzi.`); if (to.traitor || to.traitor2) g.resist(to, 1); } } },
        { k: 'B', t: 'Megtartom', res(g, p) { p.patronusBonus += 10; } }
      ]
    },
    {
      id: 'U7', t: 'A klubhelyiségben valaki odasúgja: mondd meg, ki a sárvérű, és békén hagyunk.',
      trigger: (g, p) => p.role === 'mardekar' && g.s.act === 2,
      options: [
        { k: 'A', t: 'Hazudok egy nevet', res() {} },
        { k: 'B', t: 'Hangosan elutasítom', res(g, p) { g.add('dumbledore_hu', 1); p.target = true; g.say(`${p.name} hangosan elutasította a mardekárosokat.`); } }
      ]
    },
    {
      id: 'U8', t: 'A csomagod alján egy második, kisebb csomag. Nincs rajta név.',
      trigger: (g) => g.s.scene === 'II-0' && g.rng.chance(35),
      options: [
        { k: 'A', t: 'Kibontom', res(g, p) { if (g.rng.chance(50)) { g.giveItem(p, 'gyanuszkop'); g.secret(p, 'Egy gyanuszkóp volt benne.', 'hangulat'); } else g.wound(p, 'atok'); } },
        { k: 'B', t: 'Elviszem Pitonhoz', res(g) { g.add('piton_gyanu', 1); } }
      ]
    },
    {
      id: 'U5', t: 'A pálca a táskádban rezeg. Mintha haza akarna menni.',
      trigger: (g, p) => g.f.palca_orzo === p.id,
      options: [
        { k: 'A', t: 'Visszaadom McGonagallnek', res(g) { g.f.palca_orzo = 'mcgonagall'; } },
        { k: 'B', t: 'Megtartom', res(g, p) { p.patronusBonus += 10; } }
      ]
    }
  ];

  // R7: visions. when(g) picks the applicable ones from the already drawn future.
  CE.VISIONS = [
    { kind: 'Veszély', when: (g) => g.cmdNow('K1'), text: () => 'Egy púpos kőszobor. Mögötte valaki suttogja: Dissendium.' },
    { kind: 'Veszély', when: (g) => g.cmdNow('K3'), text: () => 'Egy betört ablak. Mögötte rongyos alakok a hóban.' },
    { kind: 'Veszély', when: (g) => g.cmdNow('K2'), text: () => 'Egy összehajtott pergamen ég a kandallóban. Tintapöttyök futnak rajta szét.' },
    { kind: 'Útmutatás', when: (g) => g.f.dumbledore_hu === 1, text: () => 'Egy főnixtoll, amely majdnem lángra kap. Még egy kis hűség.' },
    { kind: 'Szerencse', when: (g) => !g.f.boszorkany_lezarva, text: () => 'Egy alagút, amely beomlik. Por és csend. Ezen az úton senki nem jön.' },
    { kind: 'Halál', when: (g) => g.present().some((p) => p.hp === 1), text: (g) => { const p = g.present().find((x) => x.hp === 1); return `Egy gyertya kialszik egy üres szék előtt. A széken ${CE.ROLES[p.role].name.toLowerCase()} sálja.`; } },
    { kind: 'Veszély', when: (g) => g.cmdNow('K5'), text: () => 'Egy felborult kehely. Aranyló ital a karácsonyi terítőn.' },
    { kind: 'Veszély', when: (g) => g.cmdNow('K6'), text: () => 'Egy kőszobor, amely félreugrik. Valaki a lépcső aljáról figyel.' },
    { kind: 'Veszély', when: (g) => g.cmdNow('K4'), text: () => 'Két lámpás a hóban, egyre távolabb egymástól.' },
    { kind: 'Útmutatás', when: (g) => g.s.act === 2 && !(g.s.history || []).includes('II-V1'), text: () => 'Egy kecske egy poros kocsmaablakban. Egy öregember, akinek ismerős a szeme.' },
    { kind: 'Szerencse', when: (g) => g.s.act >= 2 && !g.f.fuz_lezarva, text: () => 'A Fúriafűz gyökerei között egy alagút, amely beomlik. Por és csend.' },
    { kind: 'Árulás', when: (g) => g.players.some((p) => p.traitor2) || g.f.masodik_erintes_jon, text: () => 'Két váll, két érintés. Nem csak egy.' },
    { kind: 'Halál', when: (g) => g.s.act === 3 && g.f.tusz != null, text: (g) => `${CE.ROLES[g.players[g.f.tusz].role].name} egy lángoló karácsonyfa alatt áll. Valaki a torkához emeli a pálcáját.` },
    { kind: 'Veszély', when: (g) => g.cmdNow('K7'), text: () => 'Egy ajtó, amely belülről nyílik. A kilincsen dér.' },
    { kind: 'Veszély', when: (g) => g.cmdNow('K9'), text: () => 'Egy páncél, amely nem mozdul, pedig hívják.' }
  ];

  // R8: powers unlocked by defense points, in order.
  CE.POWERS = ['terkep', 'veritaszerum', 'merengo', 'prefektusi', 'vedelem'];
  CE.POWER_NAMES = { terkep: 'Pillantás a térképre', veritaszerum: 'Veritaszérum', merengo: 'Merengő', prefektusi: 'Prefektusi parancs', vedelem: 'Kastélyvédelem' };

  // Scene mood → soundtrack file in assets/music (film score, for private home use only).
  CE.MUSIC = {
    lobby: 'zene-10.mp3', // Hedwig's Theme
    piano: 'zene-1.mp3', // Prologue
    silver: 'zene-22.mp3', // The Patronus Light
    bells: 'zene-7.mp3', // Christmas at Hogwarts
    train: 'zene-4.mp3', // Platform Nine-and-Three-Quarters
    murmur: 'zene-5.mp3', // Entry into the Great Hall and the Banquet
    carol: 'zene-30.mp3', // Potter Waltz
    clock: 'zene-19.mp3', // A Window to the Past
    organ: 'zene-38.mp3', // Of Love & War
    bronze: 'zene-35.mp3', // The Story Begins
    storm: 'zene-13.mp3', // The Chamber of Secrets
    wind: 'zene-27.mp3', // Golden Egg
    drip: 'zene-8.mp3', // In the Devil's Snare and the Flying Keys
    cold: 'zene-29.mp3', // Harry in Winter
    breath: 'zene-36.mp3', // Living Death
    omen: 'zene-39.mp3', // Slughorn's Confession
    chains: 'zene-26.mp3', // Rita Skeeter
    drawer: 'zene-14.mp3', // Gilderoy Lockhart
    ink: 'zene-33.mp3', // Another Story
    dark: 'zene-42.mp3', // A New Headmaster
    fire: 'zene-43.mp3', // Statues
    phoenix: 'zene-12.mp3', // Fawkes the Phoenix
    dawn: 'zene-9.mp3' // Leaving Hogwarts
  };

  // Public consequences: flag changes everyone may see on the TV and in the chronicle.
  // Passage "open" flags are left out on purpose: a sneaking traitor opens them in secret.
  CE.PUBLIC_FLAGS = {
    boszorkany_lezarva: { on: 'A púpos boszorkány átjárója lezárva', good: true },
    ablak_lezarva: { on: 'A torony ablaka lezárva', good: true },
    fuz_lezarva: { on: 'A Fúriafűz alagútja beomlott', good: true },
    vadkan_lezarva: { on: 'A Szárnyas Vadkan felé vezető út lezárva', good: true },
    bellatrix_ismert: { on: 'Tudjátok: Bellatrix Lestrange van odakint', good: true },
    belso_arulo: { on: 'Bizonyíték: valaki belülről segíti őket', good: true },
    hagrid_figyel: { on: 'Hagrid figyeli a parkot', good: true },
    jelolt_ismert: { on: 'Kiderült: megjelölték a mugliszületésűeket', good: true },
    fenrir_terv: { on: 'Tudjátok, mikor és honnan jönnek', good: true },
    fenrir_sebesult: { on: 'Szürkehátú Fenrir megsebesült', good: true },
    edzes: { on: 'Gyakoroltátok a patrónust', good: true },
    dumbledore_uzenet: { on: 'Üzenet ment Dumbledore-nak', good: true },
    piton_segitett: { on: 'Piton közbelépett', good: true },
    pancelok: { on: 'A páncélok harcba indultak', good: true },
    fawkes: { on: 'Megérkezett Fawkes', good: true },
    szetvaltak: { on: 'A csapat szétvált', good: false },
    tamadas_volt: { on: 'A dementor támadott', good: false },
    dumbledore_hu: { counter: 'Hűség Dumbledore-hoz', good: true },
    ostrom: { counter: 'Az ostrom ereje (dér)', good: false },
    frics_gyanakszik: { counter: 'Frics gyanakvása', good: false }
  };

  CE.FILLERS = ['Megmelegíted a kezed a fáklyánál', 'Megigazítod a sáladat', 'Lerázod a havat a talárodról', 'Hallgatod a szelet', 'Megkötöd a cipőfűződet', 'Számolod a lépcsőfokokat'];
  CE.WHISPERS = ['Bízz', 'Ne bízz', 'Vigyázz', 'Menj', 'Maradj', 'Siess'];

  CE.FAKE_PAGES = ['Jól csinálod, kicsim. Ma éjjel a harmadik emeleten.', 'Ne felejtsd el, kié vagy.', 'Már csak egy ajtó, és vége.'];
})(window.CE = window.CE || {});
