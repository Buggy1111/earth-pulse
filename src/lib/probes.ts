/** Deep-space probes for the solar-system view. Unlike the planets (closed-form
 * Kepler) these fly engineered trajectories with no formula, so scripts/fetch-
 * probes bakes their real path from NASA JPL HORIZONS into public/probes and we
 * interpolate it here for a live-ish heliocentric position. Same frame/units as
 * lib/planets (heliocentric ecliptic AU), so they drop into the scene directly. */

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

/** What a probe click hands to the info panel: its metadata plus a live (true,
 * unclamped) distance snapshot at the moment of the click. */
export interface ProbePick extends ProbeInfo {
  sunAu: number
  sunKm: number
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
}

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
