# 🛰 Datové zdroje

Earth Pulse nemá backend ani API klíče. Všechna živá data se čtou **přímo v
prohlížeči** z veřejných feedů (většina posílá `Access-Control-Allow-Origin: *`).
Dva zdroje jsou **build-time snapshoty** přibalené do buildu (satelity, sopky),
aby aplikace nezávisela na dostupnosti API za běhu.

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
| 1 215 sopek | Smithsonian GVP | `public/geo/volcanoes.json` | `npm run fetch-volcanoes` |
| Hranice + jména států | Natural Earth | `public/geo/countries-110m.json` | — |

> TLE se propaguje SGP4 v prohlížeči (`satellite.js`) — snapshot je „startovní
> efemerida", samotný pohyb se počítá lokálně každý frame. Pro čerstvé dráhy
> stačí spustit `fetch-tle` a rebuildnout.

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
- **Kontinentální drift (🗺 Drift režim)** — paleogeografické mapy `public/planets/paleo/paleo-*.webp` (Pangea 340 Ma → dnešek, po 10 Myr) © Scotese et al., PALEOMAP, Zenodo `10.5281/zenodo.10659112` — **CC-BY-4.0**, stahuje `npm run fetch-paleo` (rectilinear/equirektangulární set, downscale na 1024×512).
- **Budoucnost driftu** `paleo-fut*.webp` (today → +250 My) = **projektovaný koncept**. Endpoint `paleo-fut250.webp` (Pangaea Proxima) = reprojekce z Mollweide na equirektangulární z Wikimedia Commons „250 Million Years Future World (Pangaea Proxima)" — **CC-BY-SA 4.0**. Mezikroky `paleo-fut050…200.webp` = **SDF morph** (signed distance field) mezi dneškem a Proximou (`npm run gen-future`) → plynulé slévání kontinentů; jsou to deriváty → **CC-BY-SA 4.0**. Vědecky přesnější future (Scotese, GPlates) jsou copyright/NC. V appce jasně „projected".

## 3D modely satelitů (`public/models/sats/*.glb`, atribuce)
Reálné modely 20 z 26 satelitů; zbytek (Sentinel-1/2/3, TanDEM-X, GCOM-W1) =
ručně stavěný „zlatý" primitiv (žádný volně šiřitelný model neexistuje).
- **NASA 3D Resources** (public domain) — ISS, Hubble, Terra, Fermi, Aqua, Aura,
  Suomi NPP (i pro NOAA-20/21 = stejný JPSS bus), Landsat 8 (i 9), Sentinel-6,
  Jason-3, ICESat-2, GRACE-FO, OCO-2, GOES-16/18, Tiangong (model ISS).
- **SWOT** © NASA/JPL-Caltech (public domain) — [swot.jpl.nasa.gov](https://swot.jpl.nasa.gov/resources/86/swot-3d-model/)
- Draco-komprimované modely dekóduje self-hostovaný dekodér v `public/draco/`.

Žádný feed nevyžaduje klíč ani autentizaci; vše je veřejné a CORS-friendly nebo
přibalené jako statický snapshot.
