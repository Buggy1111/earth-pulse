# 🌍 Funkce — co Earth Pulse umí

Aplikace má **tři režimy pohledu**, mezi kterými se přepíná za běhu. HUD
(overlay panely) je _mode-aware_ — na Měsíci a ve sluneční soustavě zmizí
pozemské dashboardy a objeví se relevantní ovládání.

```
Země  ──klik na Měsíc / „explore ▸"──▶  Měsíc
  │                                        │  ← back to Earth
  └──tlačítko 🪐 „solar system"──▶  Sluneční soustava ──exit──▶ Země
```

---

## 🌍 Režim Země

Výchozí pohled: živá Země na 3D glóbu, kolem ní celé „sousedství".

### Zemětřesení 🌋
- **Dva zdroje současně:** USGS 24h katalog (poll každou minutu) **+ EMSC
  SeismicPortal přes WebSocket** — událost se rozsvítí do ~minuty od skutečného
  otřesu, dávno před tím, než se objeví v USGS pollu.
- **De-duplikace:** stejná událost hlášená oběma agenturami se spojí (shoda
  času ±2 min, polohy <2°, magnituda ±1.2).
- **Vizuál:** aditivní glow sprite na teplé energetické rampě (bledě zlatá →
  jantarová → oranžová → červená dle magnitudy), velikost roste kvadraticky
  (velké otřesy dominují), průhlednost slábne s **věkem události** (čerstvé hoří
  jasně, den staré doutnají). Flash ring + odznak **NEW** u nové události.
- **Zvuk:** volitelný „ping" laděný podle magnitudy.
- **⏪ Timeline:** posuvník přehraje posledních 24 h jako film (scrub i auto-play).

### Satelity 🛰
- **26 vybraných slavných satelitů** (NASA „Eyes on the Earth" výběr) z
  Celestrak skupiny „active" — anonymní roj 148 nahradila kurátorská sestava:
  ISS, Tiangong, Hubble, Fermi, Terra, Aqua, Aura, Suomi NPP, NOAA-20/21,
  GOES-16/18, Landsat 8/9, Sentinel-1A/2A/2B/3A/6, Jason-3, SWOT, ICESat-2,
  GRACE-FO, OCO-2, TanDEM-X, GCOM-W1. Snapshot `public/tle/famous.txt` (obnova
  `npm run fetch-famous`, stahuje TLE podle NORAD id) — žádné runtime API volání.
- **Propagace SGP4 každý frame** (`satellite.js`) → opravdu plynulý pohyb po
  dráze, ne skoková interpolace.
- Každý satelit má **detailní 3D model** a jmenovku (v eco módu jeden low-poly
  mesh). **Vlastní barva pro každý satelit** (golden-angle rozprostření, ISS
  cyan) — sdílená orbitou, kliknutým trailem i jmenovkou.
- **Orbitální dráhy** (vrstva „orbit lines") — kometový ocas ZA satelitem
  (hlava = aktuální poloha), barva satelitu, aditivní glow. Přepočítává se z
  **warpnutého času**, takže ocas drží i při time-warpu (ne jen po 30 s).
- **🛰 Mission karta** (`src/lib/missions.ts`) — klik na satelit ukáže kartu:
  agentura, rok vypuštění, co měří, zajímavý fakt; barva dle kategorie.
- **Vyhledávání podle jména.**

### ISS 🛰
- Letí plynule po své SGP4 dráze, **živá telemetrie** z Where The ISS At API
  (poll á 3 s) v HUD.
- **Follow chase-camera** — kamera drží ISS.
- Po sdílení polohy: **predikce přeletu** („ISS nad tebou za 2 h 14 min") +
  živý seznam **„above you now"** (satelity aktuálně nad tvým obzorem).

### Živá doprava ✈🚢
- **✈ Letadla** (`src/lib/aircraft.ts`) — živý ADS-B z airplanes.live, dotaz
  bod + rádius 250 NM kolem **tvojí polohy** (nebo defaultně střední Evropa).
  Body obarvené dle výšky (nízko jantarová → výška cyan/bílá). Poll 8 s.
- **🚢 Lodě** (`src/lib/ships.ts`) — živé AIS z Fintraffic digitraffic,
  **Baltské moře** (~18k lodí, podvzorkováno). Modrá = v pohybu, šedá = stojící.
  Poll 45 s.
- Obě jako **vlastní point-cloud vrstvy** (`trafficLayer.ts`), reálná data bez
  klíče a backendu. **Default vypnuté** (šetří free API) — zapínají se v
  nastavení a pollují jen když jsou ON a záložka je viditelná.
- Pozn.: rozsah je poctivý — letadla regionálně (bod+rádius), lodě Baltik;
  globální keyless free feed bez backendu pro ani jedno neexistuje.

### Latest Events 🔥
- **NASA EONET** (Earth Observatory Natural Event Tracker, `src/lib/events.ts`,
  `src/components/globe/eventsLayer.ts`) — živé přírodní události: požáry,
  bouře, sopky, ledovce jako barevné piny (globe.gl points layer).
- Panel **„Live on Earth"** s počty událostí podle kategorie.
- Hook `useEvents` (refresh á 10 min). Vrstva „natural events" v nastavení.

### Datové vrstvy a time playback 🌍
- **NASA GIBS** (Global Imagery Browse Services, `src/lib/gibs.ts`) — 5
  „vital signs" vrstev, všechny **full-globe** („vzor air"): 🌍 dnešní Země
  (true-color MODIS), 🌡 teplota vzduchu, 🌡 teplota povrchu (pevnina+moře),
  💧 vodní pára, 🌫 aerosoly (poslední čtyři = měsíční modely NASA MERRA-2).
- Načte se jeden equirektangulární obrázek přes **WMS GetMap** a paintuje se
  přímo na materiál glóbu (obejde cachování dlaždic v globe.gl); nad datovou
  vrstvou se obrysy kontinentů přebarví na černé (`surface.setDataMode`).
- **`DataLayerPanel`** = výběr vrstvy + **legenda (colorbar)** s odstupňovanými
  značkami (teploty −40/−20/0/20/40 °C, vodní pára dry→humid, aerosoly
  clear→hazy) + **date slider** u denních vrstev (30 dní zpět = time playback);
  měsíční vrstvy ukazují „📅 monthly · RRRR-MM".

### Den a noc 🌃
- Custom shader (`dayNightMaterial.ts`) prolíná denní texturu se světly měst
  podél **skutečného terminátoru** (počítaného ze sub-solárního bodu).
- Teplý pruh **civilního soumraku** na hranici den/noc.
- Mraky sdílí stejné Slunce — na noční straně se ztmaví, aby nepřeexponovaly
  světla měst.
- **24h replay:** terminátor i Měsíc sledují posuvník času (⏪ timeline), ne
  jen filtr otřesů — den/noc se přetáčí spolu se zemětřeseními.
- **Dvě úrovně textur:** přepínač **„fast mode (2K)"** (rychlé 2K textury
  `public/earth-day-2k.jpg` / `earth-night-2k.jpg`, ~247 KB místo 4,5 MB) vs
  plný 8K detail; na slabé GPU se zapne automaticky.

### Mapový zoom 🔎
- Pod ~1500 km se streamuje **Esri World Imagery** (LOD až do úrovně ulic,
  noční strana ztlumená). Při oddálení se vrátí živý glóbus.

### Další pozemské vrstvy
- 🗺 **Hranice a jména států** (Natural Earth, jména se objeví při zoomu).
- 🌌 **Polární záře** — ovály kolem geomagnetických pólů, jejichž dosah, šířka i
  jas rostou s **živým Kp indexem** (klid = slabé halo u pólů, bouře tlačí jasné
  ovály ke středním šířkám).
- ☀️ **Kosmické počasí** (NOAA SWPC) — planetární Kp index + rychlost slunečního
  větru, barevně dle úrovně bouře.
- 🌋 **1 215 holocénních sopek** (Smithsonian GVP snapshot) jako jeden Points cloud.
- 📝 **Živé editace Wikipedie** (Wikimedia EventStreams) — ticker lidských úprav
  článků.
- 🎬 **Kinematický auto-tour** — kamera klouže mezi živými body zájmu.
- 🔗 **Sdílení pohledu v URL** (viz [ARCHITEKTURA → Sdílení](ARCHITEKTURA.md#sdílení-pohledu-v-url)).
- 📍 **Moje poloha** (volitelná geolokace) — odemkne predikci přeletu a „above
  you". Špendlík **„you are here"** sedí přesně na povrchu (dřív byl ve výšce →
  paralaxa při zoomu).

---

## 🌙 Režim Měsíc

Klikni na Měsíc na obloze (sedí na své **skutečné poloze**) — kamera tam
přeletí a začneš **obíhat Měsíc stejně jako Zemi**, se Zemí visící na lunární
obloze.

- **Realistické osvětlení (`moonMaterial.ts`):** vlastní shader stínuje povrch
  podle **skutečného směru ke Slunci** → osvětlený srpek odpovídá aktuální
  **fázi Měsíce**. Temná strana má jemný **earthshine** (zemský svit), není to
  mrtvá čerň. **Limb darkening** pro kulatější, „vyfocený" vzhled.
- **Apollo místa = vlajky:** šest stříbrných **vlajek se zlatým praporkem** na
  povrchu — Apollo 11, 12, 14, 15, 16, 17, každé místo, kde stál člověk mimo
  Zemi. (Dřív to byly zelené tečky — nahrazeny pro lepší vzhled.) **Klik na
  vlajku** ukáže misi, rok a posádku.
- **Geometrie:** jemná koule (64×48 segmentů), textura Měsíce 2K.

---

## 🪐 Režim Sluneční soustava

Jedno tlačítko (🪐) a jsi nad ekliptikou. Zem se zmenší na malou kuličku a
otevře se celá soustava.

- **Skutečné polohy pro „teď"** — planety počítané z JPL aproximativních
  Keplerových elementů (platné 1800–2050, přesnost na obloukové minuty).
- **8 planet** (Merkur → Pluto) se **skutečnými sklony os** (Uran leží na boku),
  **skutečnými rychlostmi rotace** (i retrográdní — Venuše se točí pozpátku) a
  **prstencovými systémy** (Saturn).
- **20 hlavních měsíců** obíhajících na **skutečných drahách a periodách** — Io
  za 1,77 dne, Triton pozpátku. Každý má skutečnou velikost, vzdálenost a (kde
  existuje) texturu z NASA/USGS. Nově i **Zemin Měsíc** (dřív jediná planeta bez
  měsíce ve scéně) — s kartou a texturou, **tidal lock**: přivrácená strana
  vždy k Zemi, odvrácenou je vidět až po obeplutí.
- **Barevné dráhy** — planetární i měsíční orbity mají barvu podle planety
  (+ glow), dřív byly jednotně šedé.
- **Pluto/Charon** — dopočítaná černá jižní čepička (New Horizons nasnímal jen
  sever) → hladký terén bez díry.
- **Procedurální Slunce** — vlastní shader (granulace + ztmavení k okraji).
- **Stíny měsíců** — per-frame projekce umbry + penumbry na planetu (tranzity).
- **Navigační strom vpravo** (`SolarNavTree`) — Slunce → planety → rozbalitelné
  měsíce; klik = **glide let** kamery k tělesu. Klik přímo ve scéně funguje taky.
- **Detailní karty** — klik na těleso ukáže fakta (rotace, rok, sklon, teplota,
  počet měsíců, atmosféra, zajímavost); měsíce mají **NASA portrétní fotku** a
  objevitele.
- **⏩ Time-warp** — až týden za sekundu: planety kloužou po drahách, měsíce
  víří, zrychlí se i terminátor Země a satelity.

### Planety v datech
| Planeta | Měsíců (real) | Sklon osy | Rotace | Pozn. |
| --- | --- | --- | --- | --- |
| Merkur | 0 | 0,03° | 1408 h | sluneční den delší než rok |
| Venuše | 0 | 177,4° | −5833 h | točí se pozpátku |
| Mars | 2 | 25,2° | 24,6 h | Phobos, Deimos |
| Jupiter | 95 | 3,1° | 9,9 h | 4 Galileovy měsíce |
| Saturn | 146 | 26,7° | 10,7 h | prstence + 7 měsíců |
| Uran | 28 | 97,8° | −17,2 h | leží na boku |
| Neptun | 16 | 28,3° | 16,1 h | Triton retrográdně |
| Pluto | 5 | 122,5° | −153 h | Charon (dvojplaneta) |

> Pozn.: „Měsíců (real)" je skutečný počet měsíců planety zobrazený ve faktech;
> ve scéně se vykresluje 20 hlavních měsíců (viz `PLANET_MOONS` v `lib/planets.ts`).

---

## ⚡ Výkon a přístupnost
- **Eco mód** — automatická detekce slabé GPU (Intel UHD/HD, mobilní čipy,
  software renderer). Pak: 4K textury místo 8K, pixel ratio 1×, propagace 30 Hz
  + FPS watchdog. Preference se ukládá do `localStorage`.
- **„fast mode (2K)"** — samostatný přepínač lehkých 2K textur Země
  (~247 KB místo 4,5 MB), auto-detekce slabé GPU.
- **Plynulost ve sluneční soustavě** — těžká SGP4 propagace satelitů se v solar
  módu přeskočí; pohyb planet/měsíců + terminátor běží **každý frame** (eco
  půlí jen drahou SGP4, ne zbytek scény).
- **Mobilní layout** — kompaktní HUD, Wiki ticker skrytý na telefonech.
- HUD tlačítka mají `aria-pressed` / `aria-label`; ovládání je myš/dotyk +
  panely (žádné povinné klávesové zkratky).

## Ovládání (souhrn)
| Akce | Jak |
| --- | --- |
| Otáčení / zoom | táhnutí myší / kolečko (dotyk: tah / pinch) |
| Otevřít Měsíc | klik na Měsíc na obloze nebo „🌙 moon … explore ▸" v panelu |
| Sluneční soustava | tlačítko 🪐 v doku |
| Kinematický tour | tlačítko 🎬 (jakýkoliv tah ho zastaví) |
| Sledovat ISS | tlačítko 🛰 (po načtení ISS) |
| Orbit satelitu | klik na satelit |
| Timeline zemětřesení | ▶/⏸ + posuvník v panelu |
| Vrstvy / nastavení | panel nastavení (přepínače vrstev, správa orbit, poloha) |
