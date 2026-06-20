/** Deep-space probes for the solar-system view. Unlike the planets (closed-form
 * Kepler) these fly engineered trajectories with no formula, so scripts/fetch-
 * probes bakes their real path from NASA JPL HORIZONS into public/probes and we
 * interpolate it here for a live-ish heliocentric position. Same frame/units as
 * lib/planets (heliocentric ecliptic AU), so they drop into the scene directly. */

import { earthHelio } from './planets'

/** One probe's baked trajectory: a uniform-step sample of heliocentric ecliptic
 * positions (flat x,y,z triples in AU), as written by scripts/fetch-probes. */
export interface ProbeTraj {
  id: string
  name: string
  /** Julian Date of the first sample. */
  jd0: number
  stepDays: number
  /** Flat [x0,y0,z0, x1,y1,z1, …] in AU. */
  pos: number[]
}

export interface ProbeInfo {
  id: string
  name: string
  operator: string
  launched: number
  /** Trail/body colour. */
  color: string
  /** One-line "what it does / why it's famous". */
  blurb: string
}

/** Display metadata, keyed by the trajectory id baked into probes.json. */
export const PROBE_INFO: Record<string, ProbeInfo> = {
  voyager1: { id: 'voyager1', name: 'Voyager 1', operator: 'NASA', launched: 1977, color: '#ffd27a', blurb: 'the most distant human-made object — now in interstellar space' },
  voyager2: { id: 'voyager2', name: 'Voyager 2', operator: 'NASA', launched: 1977, color: '#ffb86b', blurb: 'the only craft to visit Uranus and Neptune; also interstellar' },
  newhorizons: { id: 'newhorizons', name: 'New Horizons', operator: 'NASA', launched: 2006, color: '#a78bfa', blurb: 'flew past Pluto in 2015, now deep in the Kuiper belt' },
  juice: { id: 'juice', name: 'JUICE', operator: 'ESA', launched: 2023, color: '#6ad0c0', blurb: "ESA's cruise to Jupiter's icy ocean moons" },
  europaclipper: { id: 'europaclipper', name: 'Europa Clipper', operator: 'NASA', launched: 2024, color: '#8fb6ef', blurb: "will probe whether Europa's hidden ocean could host life" },
  psyche: { id: 'psyche', name: 'Psyche', operator: 'NASA', launched: 2023, color: '#e0a96d', blurb: 'en route to a metal-rich asteroid — a possible planetary core' },
  lucy: { id: 'lucy', name: 'Lucy', operator: 'NASA', launched: 2021, color: '#f4a3c0', blurb: "the first tour of Jupiter's Trojan asteroids" },
  // GOES weather sats orbit Earth (geostationary), but they're spacecraft too —
  // shown here beside the deep-space probes so the solar view lists every craft.
  goes16: { id: 'goes16', name: 'GOES-16', operator: 'NOAA', launched: 2016, color: '#7dd3fc', blurb: 'GOES-East — geostationary weather watch over the Americas' },
  goes18: { id: 'goes18', name: 'GOES-18', operator: 'NOAA', launched: 2022, color: '#93c5fd', blurb: 'GOES-West — geostationary weather watch over the eastern Pacific' },
}

/** Earth-orbiting craft (geostationary), shown in the solar view riding along
 * with Earth. Keyed by probe id. The display offset is a small artistic nudge so
 * each one sits just off the mini-Earth, visible — like the probes' clamped
 * distances, not to scale. The real altitude is surfaced in the panel. */
export const EARTH_SAT_OFFSET: Record<string, [number, number, number]> = {
  goes16: [0.013, 0.007, 0.001],
  goes18: [-0.013, -0.007, -0.001],
}
export const EARTH_SAT_IDS = new Set(Object.keys(EARTH_SAT_OFFSET))
/** Real geostationary facts for the panel (the scene offset above is artistic). */
export const EARTH_SAT_INFO: Record<string, { altKm: number; slot: string }> = {
  goes16: { altKm: 35_786, slot: '75.2°W · GOES-East' },
  goes18: { altKm: 35_786, slot: '137.0°W · GOES-West' },
}

/** Kilometres in one astronomical unit. */
export const AU_KM = 149_597_870.7

/** JD at the Unix epoch (1970-01-01 00:00 UTC). */
const JD_UNIX = 2440587.5

/** Heliocentric ecliptic position (AU) at `date`, linearly interpolated between
 * baked samples; clamps to the trajectory's ends outside its window. */
export function probePosAu(t: ProbeTraj, date: Date): [number, number, number] {
  const n = t.pos.length / 3
  const jd = date.getTime() / 86_400_000 + JD_UNIX
  const f = (jd - t.jd0) / t.stepDays
  const i = Math.max(0, Math.min(n - 1, Math.floor(f)))
  const j = Math.min(n - 1, i + 1)
  const a = Math.max(0, Math.min(1, f - i))
  const xi = i * 3
  const xj = j * 3
  return [
    t.pos[xi] + (t.pos[xj] - t.pos[xi]) * a,
    t.pos[xi + 1] + (t.pos[xj + 1] - t.pos[xi + 1]) * a,
    t.pos[xi + 2] + (t.pos[xj + 2] - t.pos[xi + 2]) * a,
  ]
}

/** Heliocentric speed (km/s) at `date`, from a one-day finite difference of the
 * trajectory — the local segment slope, i.e. how fast it's actually moving. */
export function probeSpeedKms(t: ProbeTraj, date: Date): number {
  const a = probePosAu(t, date)
  const b = probePosAu(t, new Date(date.getTime() + 86_400_000))
  const dAu = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  return (dAu * AU_KM) / 86_400
}

/** Synthetic "trajectories" for the Earth-orbiting craft (GOES): sample Earth's
 * heliocentric path over ~a year and add each craft's small fixed offset, so it
 * rides along with Earth and renders just off the mini-Earth in the solar view —
 * reusing the whole probe pipeline (nav, panel, focus, model) with no baked data
 * file. Same heliocentric ecliptic AU frame as the probes/planets. */
export function earthSatTrajectories(now: Date = new Date()): ProbeTraj[] {
  const stepDays = 5
  const samples = 75 // ~one year, so the warp clock stays inside the window
  const jd0 = now.getTime() / 86_400_000 + JD_UNIX
  return Object.entries(EARTH_SAT_OFFSET).map(([id, off]) => {
    const pos: number[] = []
    for (let i = 0; i < samples; i++) {
      const [ex, ey, ez] = earthHelio(new Date(now.getTime() + i * stepDays * 86_400_000))
      pos.push(ex + off[0], ey + off[1], ez + off[2])
    }
    return { id, name: PROBE_INFO[id]?.name ?? id, jd0, stepDays, pos }
  })
}
