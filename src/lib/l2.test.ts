import { describe, expect, it } from 'vitest'
import { L2_MISSIONS, l2Pos, l2Traj, withL2Probes } from './l2'
import { earthHelio } from './planets'
import { AU_KM, isValidTraj, probePosAu } from './probes'

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const SOON = new Date(Date.UTC(2026, 9, 3))

describe('L2 telescopes', () => {
  it('Webb orbits ~1–2 million km from Earth, on the night side', () => {
    for (let d = 0; d < 400; d += 13) {
      const date = new Date(SOON.getTime() + d * 86_400_000)
      const e = earthHelio(date)
      const w = l2Pos(L2_MISSIONS.webb, date)
      const km = dist(w, e) * AU_KM
      expect(km).toBeGreaterThan(0.6e6)
      expect(km).toBeLessThan(2.4e6)
      // farther from the Sun than Earth is
      expect(Math.hypot(...w)).toBeGreaterThan(Math.hypot(...e))
    }
  })

  it('completes a halo loop in about six months', () => {
    const m = L2_MISSIONS.webb
    const t0 = new Date(Date.UTC(2024, 0, 1))
    const t1 = new Date(t0.getTime() + m.periodDays * 86_400_000)
    // identical in the co-rotating frame, i.e. identical offset from Earth
    const off = (d: Date) => {
      const e = earthHelio(d)
      const p = l2Pos(m, d)
      return Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2])
    }
    expect(off(t1)).toBeCloseTo(off(t0), 2)
  })

  it('sits on Earth before launch and eases out over the transfer', () => {
    const m = L2_MISSIONS.roman
    const before = new Date(m.launchMs - 5 * 86_400_000)
    expect(dist(l2Pos(m, before), earthHelio(before))).toBeLessThan(1e-9)
    const mid = new Date(m.launchMs + (m.transferDays / 2) * 86_400_000)
    const dMid = dist(l2Pos(m, mid), earthHelio(mid)) * AU_KM
    const done = new Date(m.launchMs + (m.transferDays + 2) * 86_400_000)
    const dDone = dist(l2Pos(m, done), earthHelio(done)) * AU_KM
    expect(dMid).toBeGreaterThan(0)
    expect(dMid).toBeLessThan(dDone)
  })

  it('builds a valid evenly stepped trajectory that interpolates to l2Pos', () => {
    const t = l2Traj(L2_MISSIONS.webb, 'JWST', SOON)
    expect(isValidTraj(t)).toBe(true)
    const p = probePosAu(t, SOON)
    expect(dist(p, l2Pos(L2_MISSIONS.webb, SOON)) * AU_KM).toBeLessThan(2_000)
  })

  it('lets a baked HORIZONS entry win and fills in the rest', () => {
    const baked = { id: 'webb', name: 'JWST', jd0: 1, stepDays: 1, pos: [0, 0, 0, 1, 0, 0] }
    const all = withL2Probes([baked], SOON)
    expect(all.filter((t) => t.id === 'webb')).toHaveLength(1)
    expect(all.find((t) => t.id === 'webb')).toBe(baked)
    expect(all.some((t) => t.id === 'roman')).toBe(true)
  })

  it('builds the trajectories once per UTC day and shares them', () => {
    const a = withL2Probes([], new Date(Date.UTC(2026, 9, 3, 1)))
    const b = withL2Probes([], new Date(Date.UTC(2026, 9, 3, 23)))
    expect(b.find((t) => t.id === 'webb')).toBe(a.find((t) => t.id === 'webb'))
    expect(b.find((t) => t.id === 'roman')).toBe(a.find((t) => t.id === 'roman'))
  })
})
