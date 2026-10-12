// Finds freely licensed photo CANDIDATES for stars that don't have a card photo
// yet, so a human (or reviewer) picks real images instead of guessing archive IDs.
// Output: docs/star-photo-candidates.json — title, licence, author, size, URL.
// Run: node scripts/find-star-photo-candidates.mjs   (needs network; runs in CI)
import { writeFile } from 'node:fs/promises'

const UA = 'earth-pulse-star-photos/1.0 (educational; github.com/Buggy1111/earth-pulse)'
// catalogue name → search query (the catalogue uses IAU proper names)
const STARS = {
  Mira: 'Mira omicron Ceti star',
  Arcturus: 'Arcturus star',
  Aldebaran: 'Aldebaran star',
  Achernar: 'Achernar star',
  Deneb: 'Deneb star',
  Capella: 'Capella star',
  Procyon: 'Procyon star',
  Spica: 'Spica star',
  Regulus: 'Regulus star',
  Castor: 'Castor star',
  Pollux: 'Pollux star',
  Algol: 'Algol star',
  Mizar: 'Mizar Alcor',
  Albireo: 'Albireo double star',
  Alnitak: 'Alnitak star',
  Alnilam: 'Alnilam star',
  Mintaka: 'Mintaka star',
  Bellatrix: 'Bellatrix star',
  Rasalhague: 'Rasalhague star',
  Alderamin: 'Alderamin star',
  Sadr: 'Sadr star',
  Acrux: 'Acrux star',
  Alcyone: 'Pleiades star cluster',
  Ran: 'Epsilon Eridani',
  "Kapteyn's Star": "Kapteyn's Star",
  'Wolf 359': 'Wolf 359',
  'Gl 581': 'Gliese 581',
}
const FREE = /^(public domain|pd|cc0|cc by(-sa)? \d)/i

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function search(query, attempt = 0) {
  const p = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6',
    gsrsearch: `${query} filetype:bitmap`, gsrlimit: '10', prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata', iiurlwidth: '480',
  })
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`, { headers: { 'User-Agent': UA } })
  if (r.status === 429 && attempt < 4) {
    await sleep(5000 * 2 ** attempt) // Commons rate-limits bursts — back off and retry
    return search(query, attempt + 1)
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const pages = Object.values((await r.json()).query?.pages ?? {}).sort((a, b) => a.index - b.index)
  return pages
    .map((pg) => {
      const ii = pg.imageinfo?.[0]
      const meta = ii?.extmetadata ?? {}
      const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return {
        title: pg.title.replace(/^File:/, ''),
        licence: strip(meta.LicenseShortName?.value),
        artist: strip(meta.Artist?.value).slice(0, 120),
        credit: strip(meta.Credit?.value).slice(0, 120),
        description: strip(meta.ImageDescription?.value).slice(0, 240),
        width: ii?.width, height: ii?.height, mime: ii?.mime,
        thumb: ii?.thumburl, page: ii?.descriptionurl,
      }
    })
    .filter((c) => FREE.test(c.licence) && /jpeg|png/.test(c.mime ?? '') && (c.width ?? 0) >= 400)
    .slice(0, 6)
}

const out = {}
for (const [star, q] of Object.entries(STARS)) {
  try {
    out[star] = await search(q)
    await sleep(1500) // stay well under Commons' anonymous rate limit
    console.log(`${star}: ${out[star].length} candidates`)
  } catch (err) {
    out[star] = []
    console.error(`${star}: ${err.message}`)
  }
}
await writeFile(new URL('../docs/star-photo-candidates.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
