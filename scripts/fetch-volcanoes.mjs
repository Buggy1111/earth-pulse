// Snapshots the Smithsonian GVP Holocene volcano catalog into
// public/geo/volcanoes.json (the WFS has no CORS, so we bundle it like the
// TLEs — the catalog itself changes a few times a year at most).
// Run: npm run fetch-volcanoes
import { writeFile } from 'node:fs/promises'

const WFS_URL =
  'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application/json'
const OUT = new URL('../public/geo/volcanoes.json', import.meta.url)

const resp = await fetch(WFS_URL)
if (!resp.ok) {
  console.error(`GVP responded ${resp.status}`)
  process.exit(1)
}
const data = await resp.json()
const slim = (data.features ?? [])
  .filter((f) => f.geometry?.type === 'Point')
  .map((f) => ({
    n: f.properties?.Volcano_Name ?? '?',
    la: +f.geometry.coordinates[1].toFixed(2),
    lo: +f.geometry.coordinates[0].toFixed(2),
  }))
if (slim.length < 500) {
  console.error(`Suspiciously few volcanoes (${slim.length}) — not overwriting`)
  process.exit(1)
}
await writeFile(OUT, JSON.stringify(slim))
console.log(`Saved ${slim.length} volcanoes to public/geo/volcanoes.json`)
