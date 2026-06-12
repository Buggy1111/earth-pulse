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

await mkdir(new URL('../public/planets/moons', import.meta.url), { recursive: true })
let failed = 0
for (const m of MAPS) {
  const out = new URL(m.out ?? `../public/planets/moons/${m.id}.webp`, import.meta.url)
  try {
    const resp = await fetch(m.url)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const w = m.width ?? 1024
    const webp = await sharp(buf)
      .resize(w, w / 2, { fit: 'fill' })
      .webp({ quality: 80 })
      .toBuffer()
    await writeFile(out, webp)
    console.log(`✓ ${m.id} (${(webp.length / 1024).toFixed(0)} KB)`)
  } catch (err) {
    failed++
    console.error(`✗ ${m.id}: ${err.message}`)
  }
}
if (failed > 0) process.exit(1)
console.log(`Done — ${MAPS.length} maps.`)
