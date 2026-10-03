/** Deep-space telescopes parked at the Sun–Earth L2 point (JWST, Roman).
 *
 * They don't fly a closed-form path and aren't SGP4 objects, so — unlike the
 * baked HORIZONS probes — we propagate them ourselves: the L2 point rides
 * ~0.01 AU behind Earth on the anti-Sun side, and the craft loops around it on a
 * halo orbit (period ≈ 6 months). The halo is a REPRESENTATIVE model (right
 * size, period and geometry) rather than the mission ephemeris: it needs no
 * network, is valid for any date on the warp clock, and a baked HORIZONS entry
 * with the same id always wins (see withL2Probes).
 *
 * Output is a regular ProbeTraj in heliocentric ecliptic AU — the same frame as
 * lib/planets and lib/probes — so the existing probe layer, trails, nav tree and
 * panels handle it with no special cases. */

import { earthHelio } from './planets'
import type { ProbeTraj } from './probes'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5

/** L2 sits at R·(μ/3)^(1/3) beyond Earth, μ = M⊕/(M☉+M⊕). ≈ 0.01004 R. */
export const L2_FRACTION = 0.01004
/** In-plane linearised L2 motion: the along-track swing is ~3.2× the radial one. */
const Y_OVER_X = 3.2

export interface L2Mission {
  id: string
  /** Launch instant (UTC ms). Before it the craft sits on Earth. */
  launchMs: number
  /** Days from launch to settling on the halo (smooth blend, not a burn model). */
  transferDays: number
  /** Halo amplitude along Earth's orbit (AU) — the big in-plane swing. */
  ayAu: number
  /** Halo amplitude out of the ecliptic plane (AU). */
  azAu: number
  /** Halo period, days. */
  periodDays: number
  /** Halo phase (rad) at `epochMs`. */
  phase0: number
  epochMs: number
}

const km = (v: number) => v / 149_597_870.7

export const L2_MISSIONS: Record<string, L2Mission> = {
  // JWST: launched 2021-12-25, L2 insertion burn ~30 days later; halo ≈ 800k km
  // along-track, ≈ 520k km out of plane.
  webb: {
    id: 'webb',
    launchMs: Date.UTC(2021, 11, 25, 12, 20),
    transferDays: 30,
    ayAu: km(800_000),
    azAu: km(520_000),
    periodDays: 180,
    phase0: 0.6,
    epochMs: Date.UTC(2022, 0, 24),
  },
  // Roman: launched 2026-08-30 on a Falcon Heavy to a Sun–Earth L2 halo; a
  // larger-amplitude loop than Webb so the two read apart in the scene.
  roman: {
    id: 'roman',
    launchMs: Date.UTC(2026, 7, 30, 11, 26),
    transferDays: 45,
    ayAu: km(1_000_000),
    azAu: km(650_000),
    periodDays: 180,
    phase0: 2.4,
    epochMs: Date.UTC(2026, 9, 14),
  },
}

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}

/** Heliocentric ecliptic position (AU) of an L2 telescope at `date`. */
export function l2Pos(m: L2Mission, date: Date): [number, number, number] {
  const e = earthHelio(date)
  const r = Math.hypot(e[0], e[1], e[2]) || 1
  // rotating Sun–Earth frame: x̂ away from the Sun, ẑ ecliptic north, ŷ = ẑ × x̂
  const xh: [number, number, number] = [e[0] / r, e[1] / r, e[2] / r]
  const yh: [number, number, number] = [-xh[1], xh[0], 0]
  const yn = Math.hypot(yh[0], yh[1]) || 1
  yh[0] /= yn
  yh[1] /= yn

  const t = date.getTime()
  const theta = ((2 * Math.PI) / m.periodDays) * ((t - m.epochMs) / DAY_MS) + m.phase0
  const ax = m.ayAu / Y_OVER_X
  // halo offset from L2 in the rotating frame
  const hx = -ax * Math.cos(theta)
  const hy = m.ayAu * Math.sin(theta)
  const hz = m.azAu * Math.cos(theta)

  const s = smoothstep((t - m.launchMs) / (m.transferDays * DAY_MS))
  const dx = s * (L2_FRACTION * r + hx)
  const dy = s * hy
  const dz = s * hz
  return [
    e[0] + dx * xh[0] + dy * yh[0],
    e[1] + dx * xh[1] + dy * yh[1],
    e[2] + dx * xh[2] + dz,
  ]
}

/** Sample a mission into a ProbeTraj centred on `center`: 2 years back (comet
 * tail + backward warp) and 3 years ahead at one-day steps. */
export function l2Traj(m: L2Mission, name: string, center: Date): ProbeTraj {
  const start = Math.floor(center.getTime() / DAY_MS) * DAY_MS - 730 * DAY_MS
  const n = 730 + 1095 + 1
  const pos: number[] = []
  for (let i = 0; i < n; i++) {
    const p = l2Pos(m, new Date(start + i * DAY_MS))
    pos.push(Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6, Math.round(p[2] * 1e6) / 1e6)
  }
  return { id: m.id, name, jd0: start / DAY_MS + JD_UNIX, stepDays: 1, pos }
}

const NAMES: Record<string, string> = {
  webb: 'James Webb Space Telescope',
  roman: 'Nancy Grace Roman Space Telescope',
}

/** Baked HORIZONS trajectories plus our own L2 propagation for any telescope
 * HORIZONS didn't deliver — a baked entry for the same id always wins. */
export function withL2Probes(baked: ProbeTraj[], now: Date = new Date()): ProbeTraj[] {
  const have = new Set(baked.map((t) => t.id))
  const extra = Object.values(L2_MISSIONS)
    .filter((m) => !have.has(m.id))
    .map((m) => l2Traj(m, NAMES[m.id] ?? m.id, now))
  return [...baked, ...extra]
}
