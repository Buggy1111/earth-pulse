// Fetches the full Celestrak "starlink" group TLEs into public/tle/starlink.txt.
// Celestrak has no CORS for browsers, so the app ships a build-time snapshot and
// propagates locally (SGP4) — TLEs stay accurate for days. ~7-8k+ satellites.
// Run: npm run fetch-starlink
import { writeFile } from 'node:fs/promises'

const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle'
const OUT = new URL('../public/tle/starlink.txt', import.meta.url)

const resp = await fetch(TLE_URL)
if (!resp.ok) {
  console.error(`Celestrak responded ${resp.status} ${resp.statusText}`)
  process.exit(1)
}
const text = await resp.text()
const sets = Math.floor(text.trim().split('\n').length / 3)
// Starlink is thousands of sats; anything under 1000 means a truncated/HTML body
if (sets < 1000) {
  console.error(`Suspiciously few TLE sets (${sets}) — not overwriting`)
  process.exit(1)
}
await writeFile(OUT, text)
console.log(`Saved ${sets} Starlink TLE sets to public/tle/starlink.txt`)
