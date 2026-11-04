# Csendes éj Roxfortban — a játék

Karácsonyi történetjáték 4–10 főre. A TV-re kötött laptop mesél, mindenki a telefonján dönt.
A történet a `../forgatokonyv/` mappában van.

## Mi működik most

- **A teljes történet** végigjátszható: prológus, I. Szenteste, II. Karácsony napja, III. Karácsony éjjele,
  finálé, epilógus és a 10 befejezés.
- **Játék telefonokkal:** a TV-n QR-kód, mindenki a saját telefonjával csatlakozik.
- **Játékismertető az elején:** 7 rövid dia a TV-n (mire számíthattok, a telefon, a döntések, az áruló, a minijátékok,
  az életek, ki nyer), utána mindenki a telefonján nyomja meg: **Készen állok**. A beállításoknál kikapcsolható.
- **Minijátékok a telefonon** (a TV-n is látszik, mi történik):
  - *Expecto Patronum*: ütemre koppintás, amikor az ezüst kör felvillan (dementoros jeleneteknél, az ezüsthullámnál).
  - *Pálcamozdulat*: a számozott pontokon végighúzott ujj (Bombarda az alagútban, Reparo a toronyablakon,
    Immobilus a Fúriafűznél, ott az egész csapat átlaga számít).
  - *Lopakodás*: csak akkor lehet lépni, ha Frics háttal van (az elkobzott holmik fiókja).
  - *Párbaj*: ki kell várni a jelet, és gyorsabbnak lenni Bellatrixnál (a lefegyverzés).
  - *Tekergők Térképe*: a TV pár másodpercig mutatja, ki hol van, aztán telefonon kell megmondani, ki volt a harmadik emeleten.
  - *Ellenméreg*: ha valaki mérgezéstől haldoklik, és nincs bezoár, a csapat közösen főz; mindenkinél más hozzávaló van,
    a TV adja a nyomot, és csak az tegye be, akinél van. Három hiba, és a főzet elromlik.
- **Krónika:** a TV-n és a telefonokon is visszanézhető, mi döntött a csapat, és mi lett a következménye.
- **Felolvasás:** a beállításoknál választható hang és tempó (Edge-ben a „Noémi” vagy „Tamás” természetes hang a legjobb).
- **Zene:** a jelenetek hangulatához illő filmzene, áttűnéssel, felolvasás közben elhalkul.
- **Tesztmód:** egyetlen gépen, gépi játékosokkal. Te egy játékos helyén döntesz, a többit a gép vezeti,
  de bármelyik telefonon kattinthatsz helyettük.
- **Sok gépi menet:** egy gombnyomásra akár 200 menet fut le, a végén statisztikával.
- A laptop böngészője megjegyzi, melyik befejezést és jelenetet láttátok már (döntési fa az epilógus végén).

## Elindítás a laptopon

**Legegyszerűbb:** kattints duplán az `index.html` fájlra.

**Ajánlott** (így biztosan minden betöltődik, a zene is): indíts egy helyi szervert ebben a mappában,

```
python -m http.server 8801
```

aztán nyisd meg: http://localhost:8801

## Játék telefonokkal (a karácsonyi estén)

1. A laptopot kösd a TV-re, és indítsd el a játékot a laptopon (lásd fent). Kell internet.
2. **Szoba megnyitása.** A TV-n megjelenik a QR-kód és a szoba négybetűs kódja.
3. Mindenki beolvassa a QR-kódot, beírja a nevét, és **Belépek**. A nevek megjelennek a TV-n.
4. Ha kevesebben vagytok 4-nél, a **+ gépi játékos** gombbal kiegészítheted.
5. **Játék indítása.** A TV-n ettől kezdve csak a közös kép látszik, a titkok soha. A **Teljes képernyő** gombbal
   eltűnik a böngésző kerete.
6. A telefonon a lapokat és a titkos üzeneteket **nyomva tartva** lehet megnézni, felengedve eltűnnek.
   Ha valakinek lezár a telefonja, újra beolvassa a kódot (vagy frissíti az oldalt), és ott folytatja, ahol tartott.

**Fontos: a telefonoknak el kell érniük a telefonoldalt.** A QR-kód a „telefonoldal címére” mutat (a lobby alján
átírható):
- Ha a telefonok és a laptop egy wifin vannak, és a laptopon a helyi szerver fut: indítsd így:
  `python -m http.server 8801 --bind 0.0.0.0`, a laptop IP-címét a `ipconfig` parancs mutatja (pl. 192.168.1.23),
  és a telefonoldal címe legyen `http://192.168.1.23:8801/telefon.html`.
- Vagy töltsd fel a játékot a GitHub Pages-re (pl. `puxi63.github.io/roxfortkaracsony/`) **zene nélkül**, és a telefonoldal
  címe legyen `https://puxi63.github.io/roxfortkaracsony/telefon.html`. Ez az alapértelmezés, ha a játékot fájlból nyitod meg.

**Egyedül próbálnád ki?** **Próba egy gépen**: a lobbyban a **Telefon megnyitása itt** gombbal annyi „telefont”
nyithatsz új böngészőlapon, amennyit akarsz. Ehhez internet sem kell.

## Zene

A zenék az `assets/music` mappában vannak: a Harry Potter-filmek eredeti filmzenéi, a
`game/pages/assets/music` mappából átmásolva. Melyik jelenethez melyik szól, az a `js/data.js` `CE.MUSIC`
táblájában van (pl. ajándékok: Christmas at Hogwarts, patrónus: The Patronus Light, Fawkes: Fawkes the Phoenix,
ostrom: Statues).

**A filmzene jogvédett.** Otthoni, baráti estére rendben van, de **ne töltsd fel nyilvános helyre**, a GitHub Pages-re
se: ott a játékot az `assets/music` mappa nélkül töltsd fel. A zene csak a laptopon kell, a telefonok nem játszanak zenét.

## Egy tesztmenet

1. Válaszd ki a létszámot, és hogy te ki vagy („Senki, csak nézem” = minden gépi).
2. Ha a saját áruló-telefonodat akarod kipróbálni, a „Ki legyen az áruló?” mezőben válaszd magadat.
3. Tempó: a 4× vagy a 10× gyors teszteléshez jó, a „valós idő” a próbaesthez.
4. **Teszt indítása.**

A képernyő:
- **Bal oldalt a TV.** Fent az óra, a főnixtoll (hűség Dumbledore-hoz), a dér (az ostrom ereje) és a gyertyák (az élők).
- **Jobb oldalt a telefonok**, fülenként. A pötty azt jelzi, hogy az a játékos épp dönt. A „gép játssza” pipával bármelyik
  játékost átveheted.
- **Tovább ▸** (vagy a jobbra nyíl): átugorja a várakozást.
- **Mesélő nézet:** minden titok látszik (ki az áruló, a parancsa, a jelzők), és az eseménynapló.
- **Ugrás**, **Vissza egy jelenetet**, **Pillanatkép**, **Betöltés:** bármelyik jelenetre ugorhatsz, vagy egy mentett
  jelenet elejéről újrapróbálhatod.
- **Seed:** ugyanazzal a számmal ugyanazok a sorsolások jönnek ki.

## A nehézség (gépi menetek alapján, 400 menet)

- Bellatrix oldala a menetek kb. **33%-ában** nyer (4 főnél 40%, 10 főnél 28%).
- Menetenként átlag **0,56 halál**.
- A legjobb befejezés („Csendes éj”) a menetek kb. felében jön ki. A gépi játékosok mindig mentenek, ha tudnak,
  élő társaságnál ez valószínűleg ritkább lesz.

## Fájlok

| Fájl | Mi van benne |
|---|---|
| `index.html`, `css/style.css` | a TV-oldal: beállítások, lobby, TV-kép, tesztmód |
| `telefon.html`, `js/phone.js` | a telefonoldal |
| `js/net.js` | a szoba, a QR-kód és a kapcsolat a telefonokkal (PeerJS, illetve egy gépen BroadcastChannel) |
| `js/engine.js` | a játékmotor |
| `js/story-act1.js`, `story-act2.js`, `story-act3.js` | a jelenetek |
| `js/data.js` | szerepek, tárgyak, parancsok, kérdések, célok, útkereszteződések, víziók, zenék |
| `js/minigames.js` | a minijátékok (telefon, TV-kép, gépi játékosok) |
| `js/art.js`, `css/art.css` | a jelenetképek, alakok, patrónusok és effektek |
| `js/bots.js`, `js/batch.js` | a gépi játékosok és a statisztika |
| `js/ui.js` | a TV-kép, a tesztmód telefonjai, a zene és a felolvasás |
| `assets/music/` | a filmzene (csak helyben!) |

## Ami még jön

1. Próbajáték élő emberekkel, utána a nehézség finomhangolása (a minijátékok nehézsége is).
2. Hangeffektek.
