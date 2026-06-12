// Fetches the Celestrak "visual" group TLEs (the ~160 brightest satellites)
// into public/tle/visual.txt. Celestrak has no CORS for browsers, so the app
// ships a build-time snapshot; SGP4 propagation keeps it accurate for days.
// Run: npm run fetch-tle
import { writeFile } from 'node:fs/promises'

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle'
const OUT = new URL('../public/tle/visual.txt', import.meta.url)

const resp = await fetch(TLE_URL)
if (!resp.ok) {
  console.error(`Celestrak responded ${resp.status} ${resp.statusText}`)
  process.exit(1)
}
const text = await resp.text()
const sets = Math.floor(text.trim().split('\n').length / 3)
if (sets < 10) {
  console.error(`Suspiciously few TLE sets (${sets}) — not overwriting`)
  process.exit(1)
}
await writeFile(OUT, text)
console.log(`Saved ${sets} TLE sets to public/tle/visual.txt`)
