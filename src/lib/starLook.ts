/** Turns a star's catalogue facts (spectral type, magnitude, distance) into the
 * look of its procedural 3D sphere: colour from temperature, size from real
 * luminosity (a red supergiant dwarfs a red dwarf), granulation scale, corona.
 * Pure + deterministic so it can be unit-tested without a GL context. */

export type RGB = [number, number, number]

export interface StarLook {
  /** Presentation radius in scene units (supergiant ≫ dwarf). */
  radius: number
  /** Granule valley / granule-top colours for the surface ramp. */
  valley: RGB
  peak: RGB
  /** Hot limb-rim tint. */
  rim: RGB
  /** Convection-cell + fine-grain noise frequencies (cool giants = coarse). */
  cellScale: number
  granScale: number
  /** Halo colour + radius (× star radius). */
  coronaColor: RGB
  coronaScale: number
  /** Cosmetic spin (rad/s) and gentle radial pulse amplitude (0 = steady). */
  spin: number
  pulse: number
}

/** Photo card shown next to the live star, where a real telescope image exists.
 * Most stars are unresolved points and have none — they just stay a sphere. */
export interface StarPhoto {
  slug: string
  credit: string
}

export const STAR_PHOTOS: Record<string, StarPhoto> = {
  Betelgeuse: { slug: 'betelgeuse', credit: 'ESO/M. Montargès et al. · CC BY 4.0 · resolved surface' },
  Antares: { slug: 'antares', credit: 'ESO/K. Ohnaka · CC BY 4.0 · resolved surface' },
  Sirius: { slug: 'sirius', credit: 'NASA/ESA · H. Bond (STScI) · public domain' },
  'Proxima Centauri': { slug: 'proxima-centauri', credit: 'ESA/Hubble & NASA · CC BY 4.0' },
  'Rigil Kentaurus': { slug: 'rigil-kentaurus', credit: 'NASA/ESA Hubble · public domain · α Cen A & B' },
  Toliman: { slug: 'toliman', credit: 'NASA/ESA Hubble · public domain · α Cen A & B' },
  Polaris: { slug: 'polaris', credit: 'NASA/ESA · G. Bacon (STScI) · public domain' },
  "Barnard's Star": { slug: 'barnards-star', credit: 'Steve Quirk · public domain · proper motion' },
  Canopus: { slug: 'canopus', credit: 'public domain · Wikimedia Commons' },
  Altair: { slug: 'altair', credit: 'J. D. Monnier (U. Michigan)/CHARA · public domain · resolved' },
  Fomalhaut: { slug: 'fomalhaut', credit: 'NASA/ESA Hubble · public domain · debris disk' },
  Vega: { slug: 'vega', credit: 'NASA/JPL-Caltech · public domain · artist concept' },
  Rigel: { slug: 'rigel', credit: 'NASA/JPL-Caltech · public domain · Witch Head Nebula it lights' },
}

// Per spectral class (O…M): granule valley/peak/rim tints + noise coarseness.
// Hot stars are blue-white with fine granulation; cool stars are red with big,
// slow convection cells.
interface ClassLook {
  valley: RGB
  peak: RGB
  rim: RGB
  cell: number
  gran: number
  spin: number
}
const CLASS: Record<string, ClassLook> = {
  O: { valley: [0.55, 0.66, 1.0], peak: [0.82, 0.9, 1.0], rim: [0.7, 0.82, 1.0], cell: 5.5, gran: 22, spin: 0.11 },
  B: { valley: [0.6, 0.72, 1.0], peak: [0.86, 0.92, 1.0], rim: [0.76, 0.86, 1.0], cell: 5, gran: 20, spin: 0.1 },
  A: { valley: [0.82, 0.87, 1.0], peak: [1.0, 1.0, 1.0], rim: [0.9, 0.94, 1.0], cell: 4.6, gran: 18, spin: 0.12 },
  F: { valley: [0.96, 0.92, 0.78], peak: [1.0, 1.0, 0.95], rim: [1.0, 0.97, 0.85], cell: 4.2, gran: 16, spin: 0.07 },
  G: { valley: [0.98, 0.74, 0.34], peak: [1.0, 0.95, 0.7], rim: [1.0, 0.68, 0.32], cell: 4, gran: 16, spin: 0.05 },
  K: { valley: [0.95, 0.52, 0.2], peak: [1.0, 0.82, 0.5], rim: [1.0, 0.54, 0.24], cell: 3, gran: 11, spin: 0.035 },
  M: { valley: [0.82, 0.24, 0.11], peak: [1.0, 0.58, 0.34], rim: [1.0, 0.36, 0.18], cell: 2.4, gran: 9, spin: 0.025 },
}

/** Luminosity-class size weight (0…1) parsed from the spectral string, or null
 * when none is present (then we fall back to the absolute-magnitude estimate).
 * Longest roman tokens are tried first so III/IV aren't shadowed by I/II. */
export function luminosityWeight(spect: string): number | null {
  if (/\bsd|^sd|VI\b/.test(spect)) return 0.24 // subdwarf
  const m = spect.match(/(Ia0|Iab|Ia|Ib|III|II|IV|V)/)
  if (!m) return null
  switch (m[1]) {
    case 'Ia0':
    case 'Iab':
    case 'Ia':
    case 'Ib':
      return 1.0
    case 'II':
      return 0.78
    case 'III':
      return 0.6
    case 'IV':
      return 0.45
    default:
      return 0.32 // V — main sequence
  }
}

/** Absolute-magnitude size weight (0…1): brighter (more luminous) → bigger. */
function mabsWeight(mag: number, distLy: number): number | null {
  if (!mag || distLy <= 0) return null
  const pc = distLy / 3.2616
  const mAbs = mag - 5 * (Math.log10(pc) - 1)
  return Math.min(1, Math.max(0.18, (13 - mAbs) / 20))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Build the full look from a clicked star's facts. */
export function starAppearance(spect: string, mag: number, distLy: number): StarLook {
  const letter = (spect.trim().match(/[OBAFGKM]/)?.[0] ?? 'G') as keyof typeof CLASS
  const c = CLASS[letter] ?? CLASS.G
  const weight = luminosityWeight(spect) ?? mabsWeight(mag, distLy) ?? 0.4
  const radius = lerp(300, 1700, weight)
  const giant = weight >= 0.6
  const cool = letter === 'M' || letter === 'K'
  return {
    radius,
    valley: c.valley,
    peak: c.peak,
    rim: c.rim,
    // bigger stars show larger cells; cool giants the largest
    cellScale: c.cell / (giant ? 1.6 : 1),
    granScale: c.gran / (giant ? 1.5 : 1),
    coronaColor: c.rim,
    coronaScale: letter === 'O' || letter === 'B' || letter === 'A' ? 3.6 : 2.8,
    spin: c.spin,
    // red supergiants (Betelgeuse, Antares) visibly throb; others hold steady
    pulse: cool && giant ? 0.05 : 0,
  }
}
