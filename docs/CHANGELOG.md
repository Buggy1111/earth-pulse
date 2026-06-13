# 📜 Changelog — cesta vývoje

Historie podle git commitů. Celý projekt vznikl ve dvou intenzivních dnech
(12.–13. června 2026). Seskupeno podle vývojových oblouků; v závorkách časy
commitů.

---

## 🌍 v0.1 — Živá Země (12. 6., 01:44)
První verze: živá Země na 3D glóbu jako „WOW app z výzkumu". Hned poté skutečné
README místo Vite boilerplate. *(60ffd8e, 2f38612)*

## 🛰 v0.2 — Opravdu live (12. 6., 02:40)
Satelity, kosmické počasí, detekce nových otřesů, follow ISS, mraky. Z glóbu se
stalo živé „sousedství" Země. *(5d94bf7)*

## ✨ v0.3 — Totál tuning (12. 6., 03:20–03:48)
Světla měst, živá polární záře, orbit trail, výkonové ladění. Glow vizuál
zemětřesení a neonová sci-fi orbita. *(5a1edfc, f41c5f0)*

## 🎯 Realita a věrnost (12. 6., 07:26–08:33)
- Uzavřené orbity, soumrak podle skutečnosti, plynulý pohyb po dráze. *(d692f2d)*
- Orbity **per satelit** (podle NORAD id) + animovaná šipka směru letu. *(70ae810)*
- Modely ISS a satelitů podle reálných předloh. *(63aaab1)*
- Uživatelské nastavení: přepínače vrstev, správa orbit, moje poloha. *(5453004)*

## 🧰 UX a robustnost (12. 6., 09:13–11:27)
- Hranice států, hledání satelitů, predikce přeletu ISS a další. *(6c8e5fe)*
- **Detail jako mapy**: 8K textury + Esri tile engine při zoomu. *(7d6c0da)*
- **Adaptivní výkon**: ⚡ smooth/eco mód pro slabší GPU (plynulost na ultrabooku). *(11e2b5c)*
- Stabilní kompozice průhledných vrstev + mobilní layout. *(87a8929, 63ee10d)*
- **FIX: WebGL context leak** — skutečná příčina blikání zeměkoule (probe
  kontexty se neuvolňovaly a vyčerpaly rozpočet prohlížeče). *(45b7573)*
- 🔗 **Sdílení pohledu v URL** — kamera, orbity i vrstvy cestují v odkazu. *(4b012d9)*

## 🌐 Velký balík unikátů (12. 6., 13:28–13:58)
- Jména států při zoomu, **24h timeline zemětřesení**, noční dlaždice. *(42e1024)*
- **EMSC live** (WebSocket, otřesy do minuty), panel „above you", kinematický
  tour, Slunce + Měsíc na obloze, 1 215 sopek. *(da4f2b9)*

## 🌙 Moon mode (12. 6., 14:51)
Klikni na Měsíc a obíhej ho jako Zemi, se Zemí na lunární obloze. Apollo místa
přistání jako klikací značky. *(ee0b269)*

## 🪐 v0.5 — Sluneční soustava (12. 6., 16:40–19:13)
- Celá soustava živě — všechny planety na skutečných polohách. *(032ea26)*
- **Věrné planety**: měsíce na reálných drahách, rotace, sklony os, prstence. *(32dcb76)*
- ⏩ **Time-warp** — zrychlení času, soustava „tančí". *(84b1ae0)*

## 🧱 Refaktoring (12. 6., 19:51–20:38)
- **Feature moduly**: žádný soubor přes 400 řádků (ADR-001) — `GlobeView`
  z 1344 řádků rozpadnut na `globe/*` moduly beze změny chování. *(80a960e)*
- Mode-aware HUD + jednotná šířka všech panelů (288 px). *(133c499)*
- Čerstvé screenshoty + dotažené README. *(9e050df)*

## 🪐 Season 2 — Realistická soustava (12. 6., 21:21–22:57)
- Přepis na realistickou sluneční soustavu. *(be2a16e)*
- FIX: inerciální rám, rozumné ovládání, chase kamera. *(37c36e6)*
- FIX UX: nekonečné hvězdné pozadí, třes při warpu, navigace planet s glide letem. *(47be8df)*

## 🪐 Season 3 — Detailní soustava (13. 6., 00:14–01:20)
Pět kroků:
1. **Osvětlení od Slunce** + procedurální Slunce (granulace, ztmavení k okraji). *(d4ac4fc)*
2. **Textury měsíců** (NASA/USGS) + reálné vzdálenosti a orbity. *(9c60ce2)*
3. **Navigační strom vpravo** + glide lety kamery na měsíce. *(4aedeb5)*
4. **Detailní karty měsíců** s NASA portréty a objeviteli. *(544758f)*
5. **Stíny měsíců** na planetách (tranzity, umbra+penumbra) + FIX orientace
   soustavy zděděné ze Season 2. *(52a9175)*

## 🌙 Detailní Měsíc (13. 6., 07:20)
- Nový shader (`moonMaterial.ts`): **terminátor řízený směrem ke Slunci** →
  osvětlená část odpovídá skutečné fázi; jemný **earthshine** na temné straně;
  **limb darkening**. Jemnější geometrie (64×48).
- Apollo místa: ošklivé **zelené tečky** nahrazeny **stříbrnými vlajkami se
  zlatým praporkem**; picking přes skupiny (neviditelná pick-koule = pohodlný
  klik), funkčnost zachována. *(5459f9c)*

## 🛰 „v0.4" — NASA Eyes on the Earth (13. 6., večer) — nejnovější
Velký balík nadstaveb nad volnými NASA/Celestrak API (bez klíčů, CORS-friendly).

**Slavné satelity + dráhy:**
- Anonymní roj 148 nahrazeno **26 vybranými slavnými satelity** (ISS, Tiangong,
  Hubble, Fermi, Terra/Aqua/Aura, Suomi NPP, NOAA-20/21, GOES-16/18,
  Landsat 8/9, Sentinely, Jason-3, SWOT, ICESat-2, GRACE-FO, OCO-2, TanDEM-X,
  GCOM-W1). Nový `scripts/fetch-famous.mjs` (`npm run fetch-famous`) stahuje TLE
  dle NORAD id ze skupiny Celestrak „active" → `public/tle/famous.txt`. Každý má
  detailní 3D model a jmenovku.
- **Orbitální dráhy** (vrstva „orbit lines") — ground-track prstenec, barva
  podle **typu mise** (stanice cyan, observatoře fialová, počasí oranžová,
  oceán modrá, snímkování zelená, atmosféra zlatá) + aditivní glow.
- **🛰 Mission karty** (`src/lib/missions.ts`) — agentura, rok vypuštění, co
  satelit měří, zajímavý fakt; barva dle kategorie.

**Live na Zemi:**
- **🔥 Latest Events** (`src/lib/events.ts`, `globe/eventsLayer.ts`) — NASA
  **EONET** API → živé požáry/bouře/sopky/led jako barevné piny + panel
  „Live on Earth" s počty dle kategorie. Hook `useEvents` (refresh 10 min).
- **🌍 Vital Signs datové vrstvy + ⏮ time playback** (`src/lib/gibs.ts`) — NASA
  **GIBS** přes WMS GetMap: dnešní Země (MODIS), teplota moří (GHRSST),
  aerosoly (MODIS AOD), sníh; paint na materiál glóbu. `DataLayerPanel` =
  výběr vrstvy + **date slider** (až 30 dní zpět) + **legenda (colorbar)**.

**Výkon (slabé GPU jako Intel UHD 620):**
- Přepínač **„fast mode (2K)"** — rychlé 2K textury (`earth-day-2k.jpg`,
  `earth-night-2k.jpg`, ~247 KB místo 4,5 MB) vs plný 8K detail, auto-detekce.
- Solar plynulost — těžká SGP4 propagace se v solar módu přeskočí; pohyb planet
  /měsíců + terminátor běží každý frame.

**Realita a dotažení:**
- **Den/noc se přetáčí s 24h replayem** zemětřesení (terminátor + Měsíc sledují
  posuvník času, ne jen filtr otřesů).
- **Pluto/Charon** — dopočítaná černá jižní čepička (New Horizons nasnímal jen
  sever) → hladký terén.
- **Zemin Měsíc** přidán do sluneční soustavy (byl jedinou planetou bez měsíce)
  + karta + textura; **tidal lock** (přivrácená strana vždy k Zemi).
- **📍 „you are here" špendlík** sedí přesně na povrchu (byl ve výšce →
  paralaxa při zoomu).
- **Barevné dráhy v solar systému** — planetární i měsíční dráhy dle barvy
  planety + glow (byly šedé).

> Stav: **58/58 testů**, `tsc` + `eslint` čisté, build OK. Verze v
> `package.json` zůstává `0.3.0` — „v0.4" je neformální milník dnešní NASA Eyes
> nadstavby.

---

## Verzování
`package.json` drží `version: 0.3.0`. Vývojové „Seasony" a kroky výše jsou
neformální oblouky práce, ne semver tagy — projekt je zatím v aktivním vývoji na
větvi `auto/earth-pulse`.
