// Builds the continental-drift frames in public/planets/paleo/*.webp from the
// Scotese PALEOMAP "Rectilinear" (equirectangular) paleogeographic maps —
// public-domain-friendly CC-BY-4.0 on Zenodo. Run: npm run fetch-paleo
// (rarely — ~387 MB download, then it keeps every 10 Myr frame 0→340 Ma).
//
// Source (CC-BY-4.0, verified): Scotese, C.R., Vérard, C., Burgener, L.,
// Elling, R.P. & Kocsis, Á.T. (2024). PALEOMAP, Zenodo.
// https://doi.org/10.5281/zenodo.10659112  (file "4b1. Paleogeographic Maps (Rectilinear).zip")
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import sharp from 'sharp'

const ZIP_URL =
  'https://zenodo.org/api/records/10659112/files/4b1.%20Paleogeographic%20Maps%20(Rectilinear).zip/content'
const STEP = 10
const MAX_MA = 340
const out = new URL('../public/planets/paleo/', import.meta.url)
const zip = join(tmpdir(), 'scotese_rect.zip')
const raw = join(tmpdir(), 'paleo_raw')

console.log('↓ downloading Scotese rectilinear maps (~387 MB, once)…')
const resp = await fetch(ZIP_URL)
if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
await new Promise((res, rej) => {
  const f = createWriteStream(zip)
  Readable.fromWeb(resp.body).pipe(f).on('finish', res).on('error', rej)
})

await rm(raw, { recursive: true, force: true })
await mkdir(raw, { recursive: true })
await mkdir(out, { recursive: true })

// frames are named e.g. 000Ma.png / 240Ma.jpg — extract just our every-10 set
const names = []
for (let m = 0; m <= MAX_MA; m += STEP) {
  const p = String(m).padStart(3, '0')
  names.push(`${p}Ma.png`, `${p}Ma.jpg`)
}
spawnSync('unzip', ['-o', '-j', zip, ...names, '-d', raw], { stdio: 'ignore' })

let total = 0
for (let m = 0; m <= MAX_MA; m += STEP) {
  const p = String(m).padStart(3, '0')
  let src = join(raw, `${p}Ma.png`)
  try {
    await sharp(src).metadata()
  } catch {
    src = join(raw, `${p}Ma.jpg`)
  }
  const webp = await sharp(src).resize(1024, 512, { fit: 'fill' }).webp({ quality: 82 }).toBuffer()
  await writeFile(new URL(`paleo-${p}.webp`, out), webp)
  total += webp.length
}
console.log(`✓ wrote ${MAX_MA / STEP + 1} frames (${Math.round(total / 1024)} KB) to public/planets/paleo/`)
