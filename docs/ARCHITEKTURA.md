# 🏗 Architektura

Earth Pulse je čistě klientská SPA — **žádný backend, žádné API klíče, žádný
tracking**. Vše běží v prohlížeči proti veřejným feedům (mnohé s
`Access-Control-Allow-Origin: *`, takže je čte browser přímo).

## Princip: čistá logika dole, React jen drát, scéna z modulů

```
src/
├── lib/            ČISTÁ, OTESTOVANÁ logika (žádný DOM, žádný THREE)
│   ├── sun.ts          sub-solární bod, sférické kružnice
│   ├── moon.ts         sub-lunární bod, fáze, Apollo místa
│   ├── planets.ts      Keplerovy elementy → polohy planet + měsíce
│   ├── satellites.ts   parser TLE + SGP4 wrappery
│   ├── spacecraft.ts   cenzus aktivních robotických sond (mid-2026)
│   ├── probes.ts       trajektorie sond z baked HORIZONS snapshotu
│   ├── stars.ts        HYG katalog hvězd (J2000 unit směry, mag, B–V)
│   ├── starLook.ts     fyzika hvězdy → vzhled 3D koule (barva, velikost, korona)
│   ├── lod.ts          LOD výběr pro Starlink roj (model jen u kamery)
│   ├── clock.ts        jediné warpované simulační hodiny celé scény
│   ├── arMath.ts       AR matematika (azimut/elevace → obrazovka)
│   ├── arBodies.ts     Měsíc + planety jako look-angles pro Sky AR
│   ├── quakes.ts       USGS parser, barevné/velikostní škály, statistiky
│   ├── emsc.ts         EMSC WebSocket parser + de-duplikace vůči USGS
│   ├── spaceWeather.ts NOAA Kp + sluneční vítr parser
│   ├── aurora.ts       ovály polární záře dle Kp
│   ├── iss.ts          parser ISS API
│   ├── wiki.ts         parser Wikimedia EventStreams
│   ├── missions.ts     mission karty satelitů (agentura, rok, co měří)
│   ├── events.ts       parser NASA EONET (přírodní události)
│   ├── gibs.ts         NASA GIBS vrstvy (WMS GetMap URL, legendy, date)
│   ├── share.ts        kodek pohledu do/z URL hashe
│   ├── labels.ts, format.ts, ping.ts
│   └── *.test.ts       testy po doménách (astro/satellites/feeds/probes/ar/…)
│
├── hooks.ts        React hooky pro jednotlivé feedy (useQuakes, useEmsc, useIss, …)
├── useLiveData.ts  agregace všech živých feedů do jednoho hooku pro App
├── useWorldView.ts stavový automat světů (Earth/Moon/solar/drift) + navigace
├── useProbes.ts    baked trajektorie sond pro React (nav list, živá vzdálenost)
├── uiHooks.ts      useQuality(2K/4K/8K)/useTimeline/useSolarTime/useGeolocate
│                   /useMediaQuery/useIdleKiosk/useKioskShow/useQuakePing/useShareHash
├── workers/
│   └── starlinkWorker.ts  SGP4 celého Starlink roje (10k+) mimo hlavní vlákno
├── App.tsx         kompoziční kořen UI: stav, režimy, drát feedy → glóbus
│
└── components/
    ├── GlobeView.tsx       kompoziční kořen 3D scény: props → refs → effects
    ├── PangeaView.tsx      režim Drift (paleomapy, morph, scrub)
    ├── ArSky.tsx           režim Sky AR (kamera + senzory + overlay)
    ├── arScene.ts          3D vrstva AR: průhledný canvas nad kamerou
    ├── useArCalibration.ts perzistovaný ruční offset kompasu/sklonu
    ├── ArCalibrate / ArMarkers / ArLaunchButton  AR UI kusy
    ├── StarPanel.tsx       info karta hvězdy
    ├── dayNightMaterial.ts shader Země (terminátor + světla měst + mraky)
    ├── spaceObjects.ts     modely satelitů/ISS
    ├── perf.ts             detekce slabé GPU + FPS sampling
    ├── MoonPanel / PlanetPanel  info panely režimů
    ├── globe/              FEATURE MODULY scény (každý setupX → dispose)
    │   ├── helpers.ts      sdílené textury, konstanty, typy
    │   ├── sceneSetup.ts   one-time stavba globe.gl scény + resize + cleanup
    │   ├── sky.ts          Slunce (uniform+sprite) + Měsíc + Apollo vlajky
    │   ├── moonMaterial.ts shader Měsíce (fáze dle Slunce + earthshine)
    │   ├── surface.ts      day/night textury, mraky, tile engine, hranice, sopky
    │   ├── gibsLayer.ts    NASA GIBS obrázek paintnutý na materiál glóbu
    │   ├── quakesLayer.ts  glow sprity + recyklované ringy zemětřesení
    │   ├── eventsLayer.ts  piny přírodních událostí (NASA EONET)
    │   ├── orbitEngine.ts  objects layer, per-frame smyčka, traily + šipky
    │   ├── orbitRender.ts  trail/orbit-line rendering (barvy, ground-track)
    │   ├── satObject.ts    3D node satelitu: NASA glb / ruční primitiv
    │   ├── spaceModels.ts  lazy-load + cache reálných .glb modelů
    │   ├── starlinkLayer.ts Starlink roj: InstancedMesh + model LOD
    │   ├── solar.ts        stavba soustavy (Slunce, Země+Měsíc), frame loop
    │   ├── solarPlanets.ts planety: prstence, pásy, bouře, aurory, měsíce, elipsy
    │   ├── solarTextures.ts texture kit (mobile cap, lit Phong, ring UVs)
    │   ├── planetEffects.ts ring-shadow, atmosféry, pásy, spokes, sodíkový ohon
    │   ├── planetStorms.ts podpisové počasí (GRS, hexagon, čepičky) + aurory
    │   ├── moonModels.ts   reálné NASA shape modely (Phobos/Deimos GLB swap)
    │   ├── solarMode.ts    vstup/výstup heliocentrického pohledu
    │   ├── solarFocus.ts   glide let kamery na těleso v soustavě
    │   ├── solarTrails.ts  kometové ocasy orbit (per-frame vertex barvy)
    │   ├── trailOcclusion.ts ocásky/orbity neprochází tělesy (occluder koule)
    │   ├── coronaMaterial.ts živá koróna + protuberance Slunce (fbm billboard)
    │   ├── probesLayer.ts  sondy: HORIZONS trajektorie → ocas + model + karta
    │   ├── starsLayer.ts   noční obloha: 8,9k hvězd HYG + souhvězdí + jmenovky
    │   ├── starFocus.ts    let ke hvězdě → procedurální close-up
    │   ├── starMaterial.ts procedurální shader hvězdy (zobecněné Slunce)
    │   ├── sunMaterial.ts  procedurální shader Slunce
    │   ├── cameraFlight.ts jediný sdílený camera-flight engine (eased rAF)
    │   ├── pointer.ts      raycast kliky, pin target, pov reporting
    │   └── cameraModes.ts  tour playlist, kamera Měsíce
    └── hud/               Hud.tsx (layout: desktop rohy / mobil+tablet šuplíky),
                           types, panels + panelsLive, controls (switcher, dock,
                           SideDrawer, loader), SettingsPanel, SolarNavTree,
                           TimeWarp, HudCard, ViewportFrame
```

### Proč feature moduly (ADR-001)
`GlobeView.tsx` narostl na 1344 řádků (God komponenta). Rozdělen na moduly podle
vzoru `setupX(globe, deps) → dispose`, kde každý modul 1:1 odpovídá původnímu
`useEffect` bloku. **Limit ~400 řádků je vodítko, ne tvrdé pravidlo** — hrstka
kompozičních kořenů / soudržných modulů (`GlobeView.tsx`, `App.tsx`,
`ArSky.tsx`, `orbitEngine.ts`) běží vědomě na ~400–470 řádcích;
dělit je dál by soudržnost zhoršilo. Detaily a zvažované varianty viz
[ADR-001](adr-001-globe-feature-modules.md).

**Klíčová pravidla:**
- Sdílený mutable stav mezi moduly jde **výhradně přes refy** vytvořené v
  `GlobeView` (pin target, trails, solar anim) — jediný vlastník životního cyklu.
- Callbacky do ne-React světa jdou přes `cb.current.*` (jeden efekt synchronizuje
  props místo deseti ručních ref-syncs).
- Každý modul vrací `dispose()` a uklízí své geometrie/materiály/listenery.

## Datový tok (režim Země)

```
veřejné feedy ──► hooky (hooks.ts) ──► React stav (App.tsx) ──► props ──► GlobeView
                                                                              │
                          cb.current = {...props}  (jeden sync efekt)         │
                                                                              ▼
                                                              feature moduly (setupX)
                                                                              │
                                                       per-frame smyčka (mimo React)
                                                                              ▼
                                                                    globe.gl / three.js
```

- **Feedy** se obnovují každý ve svém intervalu (viz [DATOVE-ZDROJE](DATOVE-ZDROJE.md)).
- **Satelity** se propagují **per animation frame mimo React** (SGP4) — React
  by 60× za sekundu nestíhal a ani nemá.
- **Orbit pivot** se umí přišpendlit na Měsíc, Slunce nebo libovolnou planetu.
  globe.gl resetuje `controls.target` na (0,0,0) ve vlastním 'change' listeneru
  každý frame — náš listener je registrovaný později, takže má **poslední slovo**
  a re-pinne target zpět (`pointer.ts → keepPinnedTarget`).

## Render a souřadnice
- **Sdílený Sun uniform** (`sky.ts`) — jeden `THREE.Vector3` směru ke Slunci,
  který sdílí shader Země, shader Měsíce i mraky. Aktualizuje se jednou za minutu
  (`SUN_REFRESH_MS`) ze sub-solárního bodu.
- **Umísťování těles** používá `globe.getCoords(lat,lng,0)` — Slunce, Měsíc i
  planety se promítají přes geocentrické RA/Dec → sub-X bod stejnou konvencí.
- **Fáze Měsíce/osvětlení** = `dot(worldNormal, sunDirection)` ve fragment
  shaderu → fyzikálně správný terminátor (stejný princip jako den/noc Země).
- **Sluneční soustava** používá uniformní měřítko `AU_SCENE = 2200` jednotek na
  AU (geometrie drah zůstává věrná); kamera má rozšířený `far` (Pluto ~49 AU).

## Sdílení pohledu v URL
`share.ts` kóduje stav pohledu do hash fragmentu — pošleš odkaz a druhý dostane
přesně tvou kameru, rozsvícené orbity a nastavení vrstev.

```
#c=49.83,18.28,1.20&o=25544.20580&off=quakes.aurora
 c   = kamera lat,lng,altitude
 o   = NORAD id zobrazených orbit, oddělené tečkou (max 30)
 off = klíče vrstev VYPNUTÝCH (default = vše zapnuto)
       povolené: sats, iss, quakes, aurora, clouds, borders, detail
```
Parser validuje rozsahy (lat ≤90, lng ≤180, altitude 0.005–20) a zahazuje
neznámé klíče — odkaz nejde „rozbít" ručně.

## Výkon — eco mód (`perf.ts`)
- **Detekce slabé GPU**: regex přes `WEBGL_debug_renderer_info` renderer string
  (Intel UHD/HD, llvmpipe, SwiftShader, ANGLE/Intel, Mali, Adreno, VideoCore).
- Výsledek se **cachuje** a probe WebGL kontext se explicitně uvolní
  (`WEBGL_lose_context`) — každý kontext se počítá do ~16-kontextového rozpočtu
  prohlížeče; jeho překročení zabíjí kontext glóbu (projeví se blikáním).
- **FPS watchdog**: `sampleFps()` změří průměr za 4 s; respektuje ruční volbu
  kvality uživatele.
- **Úrovně kvality 2K/4K/8K** (`useQuality`): desktop default 8K, slabá GPU →
  2K, telefon default 4K a 8K na něm nejde zapnout (VRAM → iOS reload loop).
  „Eco" větev (pixelRatio 1×, propagace 30 Hz, jednoduché modely) = 2K úroveň
  nebo mobil. Preference v `localStorage` (`earth-pulse-quality`).

## Build, test, skripty
```bash
npm install
npm run dev             # vite dev server (http://localhost:5173)
npm test                # vitest — 108 unit testů v 15 souborech
npm run e2e             # Playwright — 5 e2e testů (WebGL glóbus v Chromiu)
npm run lint            # eslint
npm run build           # tsc -b && vite build
npm run preview         # náhled produkčního buildu

# data snapshoty (build-time, ne runtime):
npm run fetch-famous      # 26 slavných satelitů (Celestrak „active" dle NORAD id) → public/tle/famous.txt
npm run fetch-starlink    # Starlink TLE roj (~10,7k) → public/tle/starlink.txt
npm run fetch-probes      # trajektorie 11 sond z NASA JPL HORIZONS → public/probes/probes.json
npm run fetch-stars       # HYG katalog hvězd → public/stars/stars.json
npm run fetch-star-photos # fotky slavných hvězd → public/stars/cards/
npm run fetch-volcanoes   # Smithsonian GVP → public/geo/volcanoes.json
npm run fetch-moons       # textury + portréty měsíců → public/planets/
npm run fetch-paleo       # paleomapy PALEOMAP → public/planets/paleo/
npm run gen-future        # SDF morph snímky budoucího driftu
```

### CI a automatická obnova dat
- **`.github/workflows/ci.yml`** — na každý push/PR: lint → typed build →
  unit testy → Playwright e2e. Akce pinované na commit SHA.
- **`.github/workflows/refresh-probes.yml`** („Refresh live-data snapshots")
  — každé pondělí 04:00 UTC re-bake `probes.json` (HORIZONS) + Starlink/famous
  TLE (Celestrak) a commit do `main` → Vercel auto-deploy.

### Stack
React 19 · TypeScript · Vite 8 · Tailwind v4 · globe.gl 2 (three.js 0.184) ·
satellite.js 6 · topojson-client 3. Testy: vitest 4 + Testing Library + jsdom;
e2e Playwright 1.61 (Chromium). Obrázkové skripty: sharp.
