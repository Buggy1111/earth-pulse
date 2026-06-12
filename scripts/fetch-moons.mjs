// Snapshots NASA/USGS global equirectangular maps of the major moons (and
// Pluto) into public/planets/moons/*.webp — all public-domain NASA/USGS
// products, downscaled to 1024×512 webp so the repo stays light.
// Run: npm run fetch-moons   (rarely — these maps change once a decade)
//
// Sources (verified 13.6.2026):
// - JPL Photojournal moved to assets.science.nasa.gov (old /jpeg/ URLs are dead)
// - Galilean moons: USGS planetarymaps WMS renders the official mosaics as JPEG
// - Uranian moons: only maps in existence are the JPL Solar System Simulator
//   textures preserved in NASA's official 3D Resources repo (public domain;
//   Voyager 2 saw only ~the southern halves — the rest is blurred fill)
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const usgsWms = (map, layers) =>
  `https://planetarymaps.usgs.gov/cgi-bin/mapserv?map=/maps/jupiter/${map}&service=WMS&version=1.1.1&request=GetMap&layers=${layers}&styles=&srs=EPSG:4326&bbox=-180,-90,180,90&width=4096&height=2048&format=image/jpeg`
const pia = (n) =>
  `https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia${String(n).slice(0, 2)}/pia${n}/PIA${n}.jpg`
const nasa3d = (name) =>
  `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures/Uranus%20-%20${name}/Uranus%20-%20${name}.jpg`

const MAPS = [
  // Jupiter — Voyager/Galileo SSI global mosaics (USGS)
  { id: 'io', url: usgsWms('io_simp_cyl.map', 'SSI_VGR_color') },
  { id: 'europa', url: usgsWms('europa_simp_cyl.map', 'GALILEO_VOYAGER') },
  { id: 'ganymede', url: usgsWms('ganymede_simp_cyl.map', 'GALILEO_VOYAGER') },
  { id: 'callisto', url: usgsWms('callisto_simp_cyl.map', 'GALILEO_VOYAGER') },
  // Saturn — Cassini ISS color map series (Schenk 2014) + Titan albedo map
  { id: 'mimas', url: pia(18437) },
  { id: 'enceladus', url: pia(18435) },
  { id: 'tethys', url: pia(18439) },
  { id: 'dione', url: pia(18434) },
  { id: 'rhea', url: pia(18438) },
  { id: 'titan', url: pia(22770) },
  { id: 'iapetus', url: pia(18436) },
  // Uranus — JPL Solar System Simulator maps (NASA 3D Resources)
  { id: 'miranda', url: nasa3d('Miranda') },
  { id: 'ariel', url: nasa3d('Ariel') },
  { id: 'umbriel', url: nasa3d('Umbriel') },
  { id: 'titania', url: nasa3d('Titania') },
  { id: 'oberon', url: nasa3d('Oberon') },
  // Neptune & Pluto system — Voyager 2 / New Horizons
  { id: 'triton', url: pia(18668) },
  { id: 'charon', url: pia(19866) },
  // Pluto itself (the planet texture was missing entirely)
  { id: 'pluto', url: pia(19858), out: '../public/planets/pluto.webp', width: 2048 },
]

// Iconic spacecraft portraits for the detail cards (PIA = Photojournal;
// ARC-* = Voyager press scans on images-assets.nasa.gov, the ~ is literal)
const img = (id) => `https://images-assets.nasa.gov/image/${id}/${id}~orig.jpg`
const PHOTOS = [
  { id: 'phobos', url: pia(10368) },
  { id: 'deimos', url: img('PIA11826') },
  { id: 'io', url: pia('02308') },
  { id: 'europa', url: pia(19048) },
  { id: 'ganymede', url: pia(24681) },
  { id: 'callisto', url: pia('03456') },
  { id: 'mimas', url: pia(12570) },
  { id: 'enceladus', url: pia('07800') },
  { id: 'tethys', url: pia('07738') },
  { id: 'dione', url: pia('07744') },
  { id: 'rhea', url: pia('07763') },
  { id: 'titan', url: img('ARC-1981-AC81-7065') },
  { id: 'iapetus', url: pia('08384') },
  { id: 'miranda', url: pia(18185) },
  { id: 'ariel', url: pia('01534') },
  { id: 'umbriel', url: img('ARC-1986-AC86-7018') },
  { id: 'titania', url: img('ARC-1986-AC86-7025') },
  { id: 'oberon', url: img('ARC-1986-AC86-7012') },
  { id: 'triton', url: pia('00317') },
  { id: 'charon', url: pia(19968) },
]

await mkdir(new URL('../public/planets/moons', import.meta.url), { recursive: true })
await mkdir(new URL('../public/planets/cards', import.meta.url), { recursive: true })
let failed = 0
const grab = async (id, url, transform, out) => {
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const webp = await transform(Buffer.from(await resp.arrayBuffer()))
    await writeFile(out, webp)
    console.log(`✓ ${id} (${(webp.length / 1024).toFixed(0)} KB)`)
  } catch (err) {
    failed++
    console.error(`✗ ${id}: ${err.message}`)
  }
}
for (const m of MAPS) {
  const w = m.width ?? 1024
  await grab(
    m.id,
    m.url,
    (buf) => sharp(buf).resize(w, w / 2, { fit: 'fill' }).webp({ quality: 80 }).toBuffer(),
    new URL(m.out ?? `../public/planets/moons/${m.id}.webp`, import.meta.url),
  )
}
for (const p of PHOTOS) {
  await grab(
    `card:${p.id}`,
    p.url,
    (buf) => sharp(buf).resize({ width: 480 }).webp({ quality: 78 }).toBuffer(),
    new URL(`../public/planets/cards/${p.id}.webp`, import.meta.url),
  )
}
if (failed > 0) process.exit(1)
console.log(`Done — ${MAPS.length} maps + ${PHOTOS.length} card photos.`)
