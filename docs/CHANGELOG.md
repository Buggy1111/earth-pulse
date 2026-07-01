# 📜 Changelog — cesta vývoje

Historie podle git commitů. Základ projektu vznikl ve dvou intenzivních dnech
(12.–13. června 2026) a od té doby roste v denních obloucích. Seskupeno podle
vývojových oblouků; v závorkách časy/hashe commitů.

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

## 🧭 v0.5 — Navigace, UX a první deploy (14. 6.)

**Navigace:**
- **Jednotný přepínač světů** 🌍/🌙/🪐 viditelný ve všech módech → přímý přechod
  Měsíc↔Soustava bez návratu přes Zemi. Klávesy `1`/`2`/`3`, `H` (skrýt HUD),
  `Esc` (domů). *(8b2d506)*
- **⌖ Reset kamery** — návrat na výchozí pohled Země. *(bc7bdf6)*

**Layout a responzivita:**
- Plně responzivní HUD — žádné překryvy na mobilu/tabletu/desktopu. *(a211218)*
- **Customizer jako vysouvací drawer** — opravený bug, kdy otevřené nastavení
  vytlačilo spodní pravá tlačítka mimo obrazovku. *(3329944)*
- **📱 Vysouvací šuplíky vlevo+vpravo** na telefonu/tabletu — glóbus je default
  čistý, panely se vytáhnou od okraje. Refaktor do `Hud.tsx` + nové hooky
  (`useMediaQuery`, `useQuakePing`, `useShareHash`, `useKioskShow`); App.tsx pod
  ADR limit 400 řádků. *(aa15034)*

**Vychytávky:**
- **📺 Kiosk/screensaver** — po ~75 s nečinnosti cinematická smyčka (tour →
  soustava → follow ISS); libovolná interakce vrací ovládání. *(9e3996c)*
- **☄️ Kometové orbity** — místo plného prstence jen mizející ocas ZA tělesem
  (hlava = aktuální poloha). Satelity i celá soustava (planety, Země, měsíce).
  *(9372cc2, 9cf1cc4)*
- **✨ Luxusní intro** — svítící Země s neonovými orbitami, třpytivý wordmark
  „EARTH PULSE" a hvězdné pozadí, plynule prolne do živého glóbu.
- **🌡 NASA „vital signs" vrstvy** — 5 full-globe datových vrstev (true-color +
  teplota vzduchu, teplota povrchu, vodní pára, aerosoly z NASA MERRA-2), každá
  s odstupňovanou colorbar legendou a černými obrysy kontinentů přes barevné
  pole. Patchy MODIS/GHRSST vrstvy (jen oceán/jen pevnina) nahrazeny full-globe
  modely. *(a3fb4bc, ff56cef, b00a8c0, 243d8b3, a37ae4e)*
- **🌌 Skutečná Mléčná dráha** jako vesmírné pozadí (Solar System Scope, CC BY)
  místo plochého starfieldu — 8K equirect, zjasněná galaxie (vesmír zůstává
  černý) + max anisotropní filtrování pro ostré hvězdy. *(9c16e8e, e2d3fcc)*

**Distribuce:**
- **🔎 SEO + GEO** — bohatá meta, Open Graph + OG obrázek, Twitter card,
  JSON-LD `WebApplication`, `robots.txt` vítající AI crawlery, `llms.txt`,
  `sitemap.xml`. *(f9d4cb2)*
- **🚀 Deploy** — živě na Vercelu: <https://earth-pulse-rosy.vercel.app/>,
  auto-deploy z `main` na každý push. *(c232409, 29dc7a7)*

> Stav: **59/59 testů**, `tsc` + `eslint` čisté, build OK. Soubory ≤ 400 řádků
> (kromě `GlobeView.tsx` — kandidát na rozdělení).

## 🛰 Sci-fi mission-control HUD (16. 6.)
- **Přístrojový HUD** — viewport rámeček s rohovými závorkami + telemetrická
  lišta, 3 fontové role (Space Grotesk / Inter / JetBrains Mono), každý panel
  jako konzolová buňka. Solar navigace = zaměřovací konzole s živou vzdáleností
  od Země v AU. Hodiny v **lokálním čase** uživatele.
- **Luxusní loader** — rotující drátěný (wireframe) glóbus na canvasu s
  hloubkovým fadem a obíhajícími družicemi + telemetrický boot-log.
- **🛡 Robustnost (audit)** — NaN guardy v `propagateSats` (lat/lng) a
  `parseIss`; eco „simple" model satelitů konečně zapojen; bezpečný `href` v
  Wikipedia tickeru.

> Stav: **64/64 testů**, `tsc` + `eslint` čisté, build OK.

---

## 🗺 Kontinentální drift + živé satelity (18. 6.)
- **Nový režim Drift** — glóbus přehraje kontinentální drift od **Pangey
  (340 Ma) po dnešek** (paleomapy Scotese/PALEOMAP, snímky po 5 My, plynulé
  přehrávání) + **projektovaná budoucnost do Pangaea Proxima (+250 My)** přes
  SDF-morph mezisnímky. Start v pauze, responzivní UI, fix mobilního crashe
  (dva WebGL kontexty najednou).
- **Klik na satelit = let s ním** — kamera se zamkne na satelit, obíháš s ním,
  další klik pustí.
- **Reálné barvy modelů** — per-satelit barvy těl (zlatá/stříbrná/bílá podle
  referenčních fotek), obarveny i texturované šedé modely (Hubble, ISS, Suomi
  NPP).
- Měsíc dostal kometový ocas jako satelity; přepínač **„Earth spins"**
  (default zapnuto — Slunce stojí, Země rotuje); `panels.tsx` rozdělen pod
  400řádkové ADR.

## 🛰 Starlink roj + Sky AR (19. 6.)
- **Starlink roj** — **10,6k skutečných satelitů** jako jeden InstancedMesh,
  SGP4 celého roje ve **web workeru**, zoom-aware LOD (přiblížíš se a plachetky
  se mění v reálný GLB model — Sketchfab „Starlink" od Malacodart).
- **Nový režim Sky AR** (jen telefon) — namíříš telefon na oblohu přes kameru
  a overlay ukáže, který satelit právě letí nad tebou: jmenovky nejbližších,
  vzdálenost (slant range, km), jas modelů podle den/noc, iOS motion permission
  správně uvnitř gesta, živý senzorový debug strip.
- **Playwright e2e suite** — glóbus, Starlink roj, Sky AR.
- Audit + refaktoring: rozděleno 6 přerostlých souborů, security a perf
  zpřísnění; Měsíc dostal místa přistání i na odvrácené straně (čínská +
  robotická), solar ukazuje živý počet aktivních sond.

## 🚀 Sondy, hvězdy a PWA (20. 6.)
- **Sondy hlubokého vesmíru v solar view** — skutečné trajektorie z **NASA JPL
  HORIZONS** (baked snapshot, týdenní auto-refresh), kometové ocasy, reálný 3D
  model pro každou sondu, fly-to + orbit jako u planet, karta s živou rychlostí
  a vzdáleností od Země, navigační seznam; vesmír se zvětšil, sondy jsou na
  reálné vzdálenosti.
- **Skutečná noční obloha** — **8 921 hvězd** (HYG) na pravých pozicích, čáry
  a jména souhvězdí, nejbližší systémy; **klik na hvězdu** = karta + let ke
  hvězdě (procedurální 3D koule ze skutečné fyziky + reálné fotky z teleskopů
  u 13 slavných hvězd).
- **PWA** — instalovatelná appka s luxusní sadou ikon a **offline service
  workerem**; iOS safe-area insets pod notchem.
- Texturované modely ISS/Hubble/Terra/Landsat 8, GOES-16/18; jednotný design
  (HudCard) + jeden sdílený camera-flight engine; interaction-aware rozlišení;
  MIT licence deklarovaná v `package.json`; ruční kalibrace kompasu pro Sky AR.

## 💎 Luxe redesign + mobilní stabilita (21. 6.)
- **Luxe sci-fi vizuál** — zlatě rámovaná konzole, zlatý world-switcher, motion,
  svítící readouty; dotažený customize panel (na mobilu už není uvězněný za
  šuplíkem).
- **Selektor kvality 2K/4K/8K** místo binárního fast-mode; **mobil zamčený na
  eco** (8K textury shazovaly iPhony — crash/reload loop vyřešen), desktop drží
  8K všude; solar mód ušetřil ~490 MB GPU paměti.
- **Živé události s vizuálem** — pulzující ringy podle kategorie + detailní
  karta.
- **Totální audit** — fix AR kamery, texture/rAF leaky, strict mode, draco
  komprese 5 GLB; UX fixy (šipka směru letu, kamera v solar módu, HUD pod
  notchem).

## 🔍 Velký audit + CI (1. 7.)
Kompletní auditní a opravná dávka — výkon, paměť, síť, bezpečnost i
infrastruktura:

**Výkon & paměť:**
- **Quake ringy** — konec bourání a stavění všech ripple efektů 1× za sekundu;
  ringy se recyklují.
- **GPU lifecycle** — uvolňování textur jmenovek + tvrdé uvolnění WebGL
  kontextů (`WEBGL_lose_context`), frame-loop dieta a guardy pro slabý
  hardware; Pangea drží na telefonech v paměti jen okno ±5 snímků.

**Síť & feedy:**
- **Wikipedia SSE batchovaná na 1 Hz** + živé polly se pozastaví na skryté
  kartě; watchdogy respektují ruční volbu kvality a přežijí polootevřené
  sockety.
- Guardy: `localStorage` crash, race při scrubování GIBS, NaN trajektorie sond.

**Bezpečnost & infrastruktura:**
- **Explicitní CSP allowlist**, `sw.js` no-cache, validace TLE při ingestu.
- **CI pipeline** (`.github/workflows/ci.yml`) — lint + typed build + unit +
  **Playwright e2e** na každý push (do teď na push neběželo nic).
- **Týdenní refresh snapshotů** (`refresh-probes.yml`) — každé pondělí re-bake
  trajektorií sond z HORIZONS + Starlink/famous TLE z Celestraku; akce pinované
  na commit SHA; unit test jako kanárek na zvětralá TLE (pálí na rot, ne na
  deorbit — CALIPSO a Envisat z katalogu legálně zmizely).

**Opravy:**
- **HORIZONS parser** — záporné exponenty ve vědecké notaci se parsovaly jako
  NaN → 5 sond tiše mizelo a Europa Clipper/Psyche/Lucy měly nulové Z. Po fixu
  je v solar view **všech 11 sond**.
- **AR kamera** — kamera se korektně vypne, i když AR zavřeš uprostřed
  permission dialogu.
- e2e: nový test klik-na-zemětřesení (kamera letí + otevře se karta) +
  tolerance výpadků third-party feedů.

> Stav: **108 unit testů (15 souborů) + 5 Playwright e2e**, `tsc` + `eslint`
> čisté, build OK — a nově to samé hlídá CI na každý push.

---

## Verzování
`package.json` drží `version: 0.3.0`. Vývojové „Seasony" a kroky výše jsou
neformální oblouky práce, ne semver tagy — projekt je zatím v aktivním vývoji na
větvi `auto/earth-pulse`.
