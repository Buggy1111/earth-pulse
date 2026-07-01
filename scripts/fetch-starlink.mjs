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
// validate the TLE structure instead of writing the body verbatim — this file
// is served from our own origin, so a compromised/erroring upstream must not
// be able to park arbitrary content there. Only clean name/1/2 triplets with
// a printable-ASCII name survive; anything else is dropped and counted.
const lines = text.split('\n').map((l) => l.replace(/\r$/, '').trimEnd())
const out = []
let dropped = 0
for (let i = 0; i + 2 < lines.length; ) {
  const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]]
  const nameOk = /^[\x20-\x7E]{1,69}$/.test(name) && !name.startsWith('1 ') && !name.startsWith('2 ')
  const linesOk = /^1 [\x20-\x7E]{50,74}$/.test(l1) && /^2 [\x20-\x7E]{50,74}$/.test(l2)
  if (nameOk && linesOk) {
    out.push(name, l1, l2)
    i += 3
  } else {
    dropped++
    i += 1 // resync one line at a time
  }
}
const sets = out.length / 3
// Starlink is thousands of sats; anything under 1000 means a truncated/HTML body
if (sets < 1000) {
  console.error(`Suspiciously few valid TLE sets (${sets}) — not overwriting`)
  process.exit(1)
}
await writeFile(OUT, out.join('\n') + '\n')
console.log(`Saved ${sets} Starlink TLE sets to public/tle/starlink.txt`)
if (dropped) console.warn(`Dropped ${dropped} malformed line(s) from the upstream body`)
