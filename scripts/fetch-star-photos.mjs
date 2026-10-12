// Snapshots real telescope portraits of the famous stars into
// public/stars/cards/<slug>.webp — shown in the star info card next to the
// live procedural 3D star. Most stars are unresolved points of light, so only
// the best-known ones have a real image; the rest stay a point in the sky.
// Run: npm run fetch-star-photos   (rarely — these are archival images)
//
// Sources (verified 20.6.2026, all public-domain or CC BY 4.0 — see
// docs/DATOVE-ZDROJE.md for attribution):
//   - ESO  cdn.eso.org/images/screen/<id>.jpg              (CC BY 4.0)
//   - NASA images-assets.nasa.gov/image/<id>/<id>~orig.jpg (public domain)
//   - Wikimedia Commons (NASA/ESA Hubble + CHARA images)   (PD / CC BY 4.0)
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const UA = 'earth-pulse-star-photos/1.0 (educational; michalbugy12@gmail.com)'
const eso = (id) => `https://cdn.eso.org/images/screen/${id}.jpg`
const nasa = (id) => `https://images-assets.nasa.gov/image/${id}/${id}~orig.jpg`

// slug → source. type 'copy' reuses an already-downloaded sibling (Alpha Cen
// A and B share the one Hubble frame of the pair).
const PHOTOS = [
  { slug: 'betelgeuse', type: 'eso', id: 'eso2003a' }, // SPHERE — resolved surface
  { slug: 'antares', type: 'eso', id: 'eso1726a' }, // VLTI — resolved surface
  { slug: 'proxima-centauri', type: 'commons', file: 'New_shot_of_Proxima_Centauri,_our_nearest_neighbour.jpg' },
  { slug: 'sirius', type: 'commons', file: 'Sirius_A_and_B_Hubble_photo.jpg' },
  { slug: 'rigil-kentaurus', type: 'nasa', id: 'GSFC_20171208_Archive_e000214' }, // Hubble α Cen A&B
  { slug: 'toliman', type: 'copy', from: 'rigil-kentaurus' },
  { slug: 'polaris', type: 'commons', file: 'Polaris_system.jpg' },
  { slug: 'barnards-star', type: 'commons', file: 'Barnardstar2006.jpg' },
  { slug: 'canopus', type: 'commons', file: 'Canopus.jpg' },
  { slug: 'altair', type: 'commons', file: 'Altair PR image6 (white).jpg' }, // CHARA — resolved, oblate
  { slug: 'fomalhaut', type: 'nasa', id: 'PIA04942' }, // Hubble — debris disk
  { slug: 'vega', type: 'nasa', id: 'PIA16610' }, // Spitzer — debris-ring concept
  { slug: 'rigel', type: 'nasa', id: 'PIA17553' }, // Witch Head Nebula, lit by Rigel
  // ── added 12.10.2026 — picked by hand from docs/star-photo-candidates.json
  //    (real observations only; size diagrams and drawings left out). Achernar,
  //    Deneb (science plots), Albireo, Capella (near-black at card size) and
  //    Wolf 359 (lost in the field) were tried and rejected on a visual check.
  { slug: 'mira', type: 'commons', file: 'Mira 1997.jpg' }, // Hubble — resolved, asymmetric
  { slug: 'procyon', type: 'commons', file: 'Procyon A and Procyon B (29468251154).jpg' },
  { slug: 'mizar', type: 'commons', file: 'Mizar and Alcor.png' },
  { slug: 'alnitak', type: 'commons', file: "Alnitak & Orion's Sword (53514488047).jpg" },
  { slug: 'alnilam', type: 'commons', file: 'Orion Belt.jpg' }, // DSS — the whole belt
  { slug: 'mintaka', type: 'copy', from: 'alnilam' },
  { slug: 'alcyone', type: 'commons', file: 'Pleiades large.jpg' }, // Palomar — the Pleiades
  { slug: 'sadr', type: 'commons', file: 'Sadr JeffJohnson.jpg' }, // in IC 1318
  { slug: 'ran', type: 'commons', file: 'Epsilon Eridani ALMA Image.png' }, // ALMA — debris ring
  { slug: 'aldebaran', type: 'commons', file: 'Aldebaran.jpg' }, // Hubble Hyades frame
  { slug: 'spica', type: 'commons', file: 'Spica DSS.png' },
  { slug: 'castor', type: 'commons', file: 'Castor DSS.png' },
  { slug: 'bellatrix', type: 'commons', file: 'Bellatrix DSS.png' },
  { slug: 'regulus', type: 'commons', file: 'Regulus DSS.png' },
  { slug: 'gl-581', type: 'commons', file: "Gliese 581 Artist's impression.jpg" }, // ESO artist concept
]

/** Resolve a Wikimedia Commons file title to its direct upload URL. */
async function commonsUrl(file) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&format=json&titles=${encodeURIComponent('File:' + file)}`
  const r = await fetch(api, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`commons api HTTP ${r.status}`)
  const j = await r.json()
  const page = Object.values(j.query.pages)[0]
  if (page.missing !== undefined) throw new Error('commons file missing')
  return page.imageinfo[0].url
}

await mkdir(new URL('../public/stars/cards', import.meta.url), { recursive: true })

const done = new Map()
let failed = 0
for (const p of PHOTOS) {
  const out = new URL(`../public/stars/cards/${p.slug}.webp`, import.meta.url)
  try {
    let buf
    if (p.type === 'copy') {
      buf = done.get(p.from)
      if (!buf) throw new Error(`nothing to copy from ${p.from}`)
    } else {
      const url = p.type === 'eso' ? eso(p.id) : p.type === 'nasa' ? nasa(p.id) : await commonsUrl(p.file)
      const resp = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const src = Buffer.from(await resp.arrayBuffer())
      // square-ish card, centred crop, 480 px wide — matches the moon cards
      buf = await sharp(src).resize({ width: 480 }).webp({ quality: 80 }).toBuffer()
    }
    if (p.type === 'commons') await new Promise((r) => setTimeout(r, 1200)) // Commons rate limit
    await writeFile(out, buf)
    done.set(p.slug, buf)
    console.log(`✓ ${p.slug} (${(buf.length / 1024).toFixed(0)} KB)`)
  } catch (err) {
    failed++
    console.error(`✗ ${p.slug}: ${err.message}`)
  }
}
console.log(`Done — ${done.size}/${PHOTOS.length} star photos${failed ? `, ${failed} failed` : ''}.`)
if (failed > 0) process.exit(1)
