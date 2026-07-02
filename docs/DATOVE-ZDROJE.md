# 🛰 Datové zdroje

Earth Pulse nemá backend ani API klíče. Všechna živá data se čtou **přímo v
prohlížeči** z veřejných feedů (většina posílá `Access-Control-Allow-Origin: *`).
Část zdrojů jsou **build-time snapshoty** přibalené do buildu (satelity, sondy,
sopky, hvězdy, paleomapy), aby aplikace nezávisela na dostupnosti API za běhu.
Snapshoty, které stárnou (TLE satelitů, trajektorie sond), obnovuje každé
pondělí GitHub Action **„Refresh live-data snapshots"**
(`.github/workflows/refresh-probes.yml`) — push do `main` je rovnou nasadí.

## Živé feedy (runtime)

| Vrstva | Zdroj | URL | Obnova | Formát |
| --- | --- | --- | --- | --- |
| Zemětřesení (katalog) | USGS | `earthquake.usgs.gov/.../all_day.geojson` | 60 s poll | GeoJSON |
| Zemětřesení (live) | EMSC SeismicPortal | `wss://www.seismicportal.eu/standing_order/websocket` | WebSocket (push) | JSON events |
| ISS poloha | Where The ISS At | `api.wheretheiss.at/v1/satellites/25544` | 3 s poll | JSON |
| Kosmické počasí — Kp | NOAA SWPC | `services.swpc.noaa.gov/json/planetary_k_index_1m.json` | 60 s poll | JSON |
| Kosmické počasí — sluneční vítr | NOAA SWPC | `services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json` | 60 s poll | JSON (products) |
| Editace Wikipedie | Wikimedia EventStreams | `stream.wikimedia.org/v2/stream/recentchange` | SSE (push) | JSON events |
| Přírodní události | NASA EONET v3 | `eonet.gsfc.nasa.gov/api/v3/events` | 10 min poll | JSON |
| Datové vrstvy (vital signs) | NASA GIBS | `gibs.earthdata.nasa.gov` (WMS GetMap, EPSG:4326) | na vyžádání / date slider | obrázek (equirektangulární) |
| Mapový detail (zoom) | Esri World Imagery | tile server (LOD) | na vyžádání při zoomu | dlaždice |

### Detaily chování
- **EMSC WebSocket** (`hooks.ts → useEmsc`): ping každých 20 s, reconnect po 8 s
  při výpadku, prune starších než 1 h každou minutu. Události se de-duplikují
  vůči USGS (`emsc.ts → isSameEvent`/`mergeQuakes`): shoda času ±2 min, polohy
  <2°, magnitudy ±1,2.
- **USGS** (`useQuakes`): poll 60 s, nově viděné otřesy dostanou 15s flash.
- **ISS** (`useIss`): poll 3 s (API žádá ≥1 s mezi voláními). Payload se
  validuje (`parseIss`) — nevalidní odpověď → `null`, nikdy NaN do kamery.
- **Wikipedia** (`wiki.ts`): jen lidské editace článků (namespace 0, ne-bot,
  `*.wikipedia.org`). V tickeru se jako `href` použije jen `https://` URL.
- **NASA EONET** (`events.ts`, hook `useEvents`): přírodní události (požáry,
  bouře, sopky, led) → barevné piny + panel „Live on Earth" s počty dle
  kategorie, refresh á 10 min.
- **NASA GIBS** (`gibs.ts`): 5 vrstev, všechny **full-globe**: dnešní Země
  (true-color MODIS, denní) + 4 měsíční MERRA-2 modely — 🌡 teplota vzduchu
  (`MERRA2_2m_Air_Temperature`), 🌡 teplota povrchu pevnin+moří
  (`MERRA2_Surface_Skin_Temperature`), 💧 vodní pára
  (`MERRA2_Total_Precipitable_Water_Vapor`), 🌫 aerosoly
  (`MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction`). Jeden
  equirektangulární obrázek přes WMS GetMap se paintuje na materiál glóbu
  (obejde cachování dlaždic v globe.gl); přes datovou vrstvu zčernají obrysy
  kontinentů. Denní vrstvy mají date slider (30 dní zpět), měsíční ukazují
  nejnovější dostupný měsíc (~5 měs. zpoždění). Pozn.: dřívější GHRSST/MODIS
  vrstvy (teplota moří, MODIS aerosoly, sníh) byly jen-oceán/jen-pevnina (černá
  no-data) → nahrazeny full-globe MERRA-2.

## Build-time snapshoty (přibalené)

| Data | Zdroj | Soubor | Obnova příkazem |
| --- | --- | --- | --- |
| 26 slavných satelitů (TLE) | Celestrak (skupina „active", dle NORAD id) | `public/tle/famous.txt` | `npm run fetch-famous` |
| Starlink roj — 10 713 TLE | Celestrak (skupina „starlink") | `public/tle/starlink.txt` | `npm run fetch-starlink` |
| 11 sond hlubokého vesmíru | NASA JPL HORIZONS API | `public/probes/probes.json` | `npm run fetch-probes` |
| 8 921 hvězd (mag ≤ 6,5) | HYG databáze (astronexus) + d3-celestial | `public/stars/stars.json` | `npm run fetch-stars` |
| 1 215 sopek | Smithsonian GVP | `public/geo/volcanoes.json` | `npm run fetch-volcanoes` |
| Hranice + jména států | Natural Earth | `public/geo/countries-110m.json` | — |

> TLE se propaguje SGP4 v prohlížeči (`satellite.js`) — snapshot je „startovní
> efemerida", samotný pohyb se počítá lokálně každý frame. Čerstvé dráhy
> zajišťuje týdenní GitHub Action (viz výše); ručně stačí `npm run fetch-famous`
> / `fetch-starlink` a rebuild. Pozn.: **CALIPSO a Envisat** z katalogu
> Celestrak zmizely (zaniklá dráha) — kurátorský seznam má proto 26 kusů.

> **Sondy** (`public/probes/probes.json`): heliocentrické ekliptikální vektory
> polohy + rychlosti z **NASA JPL HORIZONS API** (public domain) pro 11 sond —
> Voyager 1/2, New Horizons, Parker Solar Probe, Solar Orbiter, BepiColombo,
> JUICE, Europa Clipper, Psyche, Lucy, Hayabusa2. Aktivní mise publikují
> efemeridy jen měsíc–dva dopředu, proto týdenní re-bake. (Hera zatím nemá
> v HORIZONS dotazovatelný oblouk, proto v seznamu chybí.)

## Astronomické výpočty (žádné API)
Polohy a fáze se počítají čistou matematikou v `src/lib/` — bez sítě:

| Co | Modul | Metoda |
| --- | --- | --- |
| Sub-solární bod (terminátor) | `sun.ts` | nízkopřesná efemerida Slunce |
| Měsíc — poloha, fáze, vzdálenost | `moon.ts` | Meeus-style, přesnost ~1° |
| Planety — polohy | `planets.ts` | JPL aproximativní Keplerovy elementy (1800–2050) |
| Měsíce planet — dráhy | `planets.ts` | skutečné periody + fázový offset |
| Satelity/ISS — dráhy | `satellites.ts` | SGP4 nad TLE |
| Polární záře | `aurora.ts` | empirický model dle Kp + IGRF-13 póly |

## Textury a obrázky (atribuce)
- **8K Země, 2K Měsíc, planety, Mléčná dráha** © [Solar System Scope](https://www.solarsystemscope.com/textures/) — CC BY 4.0
- **Mapový detail při zoomu** © Esri & contributors
- **Portréty/textury měsíců** — NASA / USGS (public domain), stahuje `npm run fetch-moons`
- **Vesmírné pozadí** — skutečná Mléčná dráha `public/stars-milky-way.webp` (8K equirect, SSS CC BY; zjasněná multiplikativně, max anisotropy)
- **Hvězdný katalog (🌟 noční obloha v solar view)** — `public/stars/stars.json` z **HYG databáze** (astronexus) — **CC-BY-SA 4.0**; čáry souhvězdí z **d3-celestial** (BSD). Peče `npm run fetch-stars`.
- **Fotky hvězd v kartě** `public/stars/cards/<slug>.webp` (13 slavných hvězd; zbytek jsou nerozlišené body bez reálné „podobenky"), stahuje `npm run fetch-star-photos`:
  - **ESO** (CC BY 4.0) — Betelgeuse (eso2003a, SPHERE rozlišený povrch), Antares (eso1726a, VLTI rozlišený povrch)
  - **NASA** (public domain) — Fomalhaut (PIA04942, Hubble disk), Vega (PIA16610, Spitzer koncept), Rigel (PIA17553, Čarodějova hlava), Rigil Kentaurus/Toliman (Hubble α Cen A&B)
  - **Wikimedia Commons** (PD / CC BY 4.0, NASA/ESA Hubble + CHARA) — Sirius, Proxima Centauri, Polaris, Barnardova hvězda, Canopus, Altair (CHARA rozlišený zploštělý disk)
  - Klikatelné hvězdy se zobrazí jako **procedurální 3D koule** (`starMaterial.ts` shader: barva z teploty, granulace, limb darkening, korona — žádná textura; velikost/barva z reálné fyziky v `lib/starLook.ts`).
- **Kontinentální drift (🗺 Drift režim)** — paleogeografické mapy `public/planets/paleo/paleo-*.webp` (Pangea 340 Ma → dnešek, po 5 Myr) © Scotese et al., PALEOMAP, Zenodo `10.5281/zenodo.10659112` — **CC-BY-4.0**, stahuje `npm run fetch-paleo` (rectilinear/equirektangulární set, downscale na 1024×512).
- **Budoucnost driftu** `paleo-fut*.webp` (today → +250 My) = **projektovaný koncept**. Endpoint `paleo-fut250.webp` (Pangaea Proxima) = reprojekce z Mollweide na equirektangulární z Wikimedia Commons „250 Million Years Future World (Pangaea Proxima)" — **CC-BY-SA 4.0**. Mezikroky `paleo-fut050…200.webp` = **SDF morph** (signed distance field) mezi dneškem a Proximou (`npm run gen-future`) → plynulé slévání kontinentů; jsou to deriváty → **CC-BY-SA 4.0**. Vědecky přesnější future (Scotese, GPlates) jsou copyright/NC. V appce jasně „projected".

## 3D modely satelitů (`public/models/sats/*.glb`, atribuce)
Reálné modely 21 z 26 satelitů; zbytek (Sentinel-2A/2B/3A, TanDEM-X, GCOM-W1) =
ručně stavěný „zlatý" primitiv (žádný volně šiřitelný model neexistuje).
- **NASA 3D Resources** (public domain) — ISS, Hubble, Terra, Fermi, Aqua, Aura,
  Suomi NPP (i pro NOAA-20/21 = stejný JPSS bus), Landsat 8 (i 9), Sentinel-6,
  Jason-3, ICESat-2, GRACE-FO, OCO-2, GOES-16/18.
- **SWOT** © NASA/JPL-Caltech (public domain) — [swot.jpl.nasa.gov](https://swot.jpl.nasa.gov/resources/86/swot-3d-model/)
- **Tiangong** (`tiangong.glb`) — „tianGong" od **w29572227**
  ([Sketchfab](https://sketchfab.com/3d-models/tiangong-aca22b1dd6d242c1ae7b88de2f483b77)) —
  **CC-BY-4.0**; atribuce je vložená i v glTF metadatech souboru.
- **Sentinel-1A** (`sentinel-1a.glb`) — „Sentinel 1A" od **Absideon**
  ([sketchfab.com/Ankit8900](https://sketchfab.com/Ankit8900)) — **CC-BY-4.0**
  ([licence](https://creativecommons.org/licenses/by/4.0/)). Původní stránka
  modelu ([sketchfab.com/3d-models/sentinel-1a-0b44ab92dc714999a3d0df2f4c572895](https://sketchfab.com/3d-models/sentinel-1a-0b44ab92dc714999a3d0df2f4c572895))
  byla mezitím smazána — doloženo archivem
  ([web.archive.org, 25. 12. 2025](https://web.archive.org/web/20251225050411/https://sketchfab.com/3d-models/sentinel-1a-0b44ab92dc714999a3d0df2f4c572895));
  CC-BY je neodvolatelná, licence pro staženou kopii (20. 6. 2026, archiv
  47,9 MB — velikost sedí s archivním záznamem) trvá.
- Draco-komprimované modely dekóduje self-hostovaný dekodér v `public/draco/`.

### Starlink (`starlink.glb`) — roj 10,6k satelitů
- `public/models/sats/starlink.glb` (~370 KB, 4 meshe / ~13k trojúhelníků) je
  vykreslen přes **InstancedMesh s LOD** — celý roj = levné plachetky, reálný
  GLB model jen na ~400 nejbližších satelitů ke kameře (10k× plný model =
  ~140M tris/frame, mimo možnosti i mobilního GPU).
- **Model**: „Starlink (SpaceX satellite)" od **Malacodart** —
  [Sketchfab](https://sketchfab.com/3d-models/starlink-spacex-satellite-0a60f6720c5141c9a1c6d71aac108b31),
  zdarma pro komerční i osobní použití s creditem (CC-BY). GLB s 1k texturami
  (~3 MB, 3 meshe / ~20k trojúhelníků / 3 textury).

## 3D modely sond (`public/models/probes/*.glb`, atribuce)
Sondy hlubokého vesmíru v solar view (vykresluje `globe/probesLayer.ts`):
- **NASA 3D Resources** (public domain, draco-komprimované) — `voyager.glb`
  (Voyager 1 i 2), `new-horizons.glb`, `europa-clipper.glb`.
- **`psyche.glb`** — NASA / ASU (studentský model mise Psyche, volně šiřitelný).
- **`juno.glb`** — NASA (public domain); použit jako **zástupný model pro
  JUICE** (volný model JUICE neexistuje).
- **`generic.glb`** — NASA **Deep Space 1** (public domain); zástupný model pro
  Parker Solar Probe, Solar Orbiter, BepiColombo a Hayabusu2.
- **`lucy.glb`** — „LUCY | NASA Space Probe | Free Download" od
  **murilo.kleine**
  ([Sketchfab](https://sketchfab.com/3d-models/lucy-nasa-space-probe-free-download-bc3dc59eceb74b43a02cc2d51b5a0be5)) —
  **CC-BY-4.0**; atribuce je vložená i v glTF metadatech souboru.

Žádný feed nevyžaduje klíč ani autentizaci; vše je veřejné a CORS-friendly nebo
přibalené jako statický snapshot.
