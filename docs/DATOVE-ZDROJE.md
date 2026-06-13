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
| Mapový detail (zoom) | Esri World Imagery | tile server (LOD) | na vyžádání při zoomu | dlaždice |

### Detaily chování
- **EMSC WebSocket** (`hooks.ts → useEmsc`): ping každých 20 s, reconnect po 8 s
  při výpadku, prune starších než 1 h každou minutu. Události se de-duplikují
  vůči USGS (`emsc.ts → isSameEvent`/`mergeQuakes`): shoda času ±2 min, polohy
  <2°, magnitudy ±1,2.
- **USGS** (`useQuakes`): poll 60 s, nově viděné otřesy dostanou 15s flash.
- **ISS** (`useIss`): poll 3 s (API žádá ≥1 s mezi voláními).
- **Wikipedia** (`wiki.ts`): jen lidské editace článků (namespace 0, ne-bot,
  `*.wikipedia.org`).

## Build-time snapshoty (přibalené)

| Data | Zdroj | Soubor | Obnova příkazem |
| --- | --- | --- | --- |
| ~148 satelitů (TLE) | Celestrak | `public/tle/visual.txt` | `npm run fetch-tle` |
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
- **8K Země, 2K Měsíc, planety** © [Solar System Scope](https://www.solarsystemscope.com/textures/) — CC BY 4.0
- **Mapový detail při zoomu** © Esri & contributors
- **Portréty/textury měsíců** — NASA / USGS (public domain), stahuje `npm run fetch-moons`
- **Hvězdné pozadí** — `public/night-sky.png`

Žádný feed nevyžaduje klíč ani autentizaci; vše je veřejné a CORS-friendly nebo
přibalené jako statický snapshot.
