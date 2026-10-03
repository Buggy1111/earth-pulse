import { describe, expect, it } from 'vitest'
import {
  expectedRate,
  isActive,
  nextPeak,
  outlook,
  peakLabel,
  radiantAt,
  radiantElevationDeg,
  SHOWERS,
  showerStatus,
  skyQuality,
} from './meteors'

const S = (id: string) => SHOWERS.find((s) => s.id === id)!
const utc = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h))

describe('meteor showers', () => {
  it('has a sane table', () => {
    expect(new Set(SHOWERS.map((s) => s.id)).size).toBe(SHOWERS.length)
    for (const s of SHOWERS) {
      expect(s.raDeg).toBeGreaterThanOrEqual(0)
      expect(s.raDeg).toBeLessThan(360)
      expect(Math.abs(s.decDeg)).toBeLessThanOrEqual(90)
      expect(isActive(s, new Date(Date.UTC(2026, s.peakMonth - 1, s.peakDay)))).toBe(true) // peak is inside its window
    }
  })

  it('finds the next peak, rolling over the year', () => {
    expect(nextPeak(S('per'), utc(2026, 10, 3)).getUTCFullYear()).toBe(2027)
    expect(nextPeak(S('gem'), utc(2026, 10, 3)).getUTCMonth()).toBe(11)
    expect(nextPeak(S('qua'), utc(2026, 12, 30)).getUTCFullYear()).toBe(2027)
  })

  it('handles activity windows that wrap New Year', () => {
    expect(isActive(S('qua'), utc(2026, 12, 30))).toBe(true)
    expect(isActive(S('qua'), utc(2027, 1, 8))).toBe(true)
    expect(isActive(S('qua'), utc(2027, 3, 1))).toBe(false)
  })

  it('classifies peaking / active / upcoming', () => {
    expect(showerStatus(S('gem'), utc(2026, 12, 14, 6))).toBe('peaking')
    expect(showerStatus(S('gem'), utc(2026, 12, 8))).toBe('active')
    expect(showerStatus(S('gem'), utc(2026, 10, 3))).toBe('upcoming')
    // just after a peak still counts as the same shower's season, not "next year"
    expect(showerStatus(S('gem'), utc(2026, 12, 17))).toBe('active')
  })

  it('drifts the radiant along its path', () => {
    const peak = radiantAt(S('per'), utc(2026, 8, 12, 12))
    expect(peak.raDeg).toBeCloseTo(S('per').raDeg, 5)
    const later = radiantAt(S('per'), utc(2026, 8, 22, 12))
    expect(later.raDeg - peak.raDeg).toBeCloseTo(14, 0) // 10 d × 1.4°/d
    expect(radiantAt(S('qua'), utc(2027, 1, 1)).raDeg).toBeLessThan(230) // before the peak
  })

  it('computes radiant elevation: circumpolar radiant stays up, hidden one stays down', () => {
    // Ursids radiant (dec +76) is always above the horizon at 50°N
    for (let h = 0; h < 24; h += 3) {
      expect(radiantElevationDeg({ lat: 50, lng: 15 }, utc(2026, 12, 22, h), 217, 76)).toBeGreaterThan(20)
    }
    // dec +76 never rises at 50°S
    expect(radiantElevationDeg({ lat: -50, lng: 15 }, utc(2026, 12, 22, 12), 217, 76)).toBeLessThan(0)
  })

  it('scales the rate by radiant height and grades the moon', () => {
    expect(expectedRate(100, 90)).toBe(100)
    expect(expectedRate(100, 30)).toBe(50)
    expect(expectedRate(100, -5)).toBe(0)
    expect(skyQuality(0.05)).toBe('dark')
    expect(skyQuality(0.5)).toBe('fair')
    expect(skyQuality(0.95)).toBe('washed-out')
  })

  it('ranks the outlook with the current shower first and labels the countdown', () => {
    const list = outlook(utc(2026, 10, 21, 6))
    expect(list[0].shower.id).toBe('ori')
    expect(peakLabel(list[0])).toBe('peaking now')
    const later = outlook(utc(2026, 10, 3))
    expect(later[0].status).not.toBe('upcoming') // Southern Taurids are already active
    expect(later.map((o) => o.status)).toEqual([...later.map((o) => o.status)].sort((a, b) => ['peaking', 'active', 'upcoming'].indexOf(a) - ['peaking', 'active', 'upcoming'].indexOf(b)))
    expect(peakLabel({ ...later[0], status: 'upcoming', daysToPeak: 12 })).toBe('peaks in 12 d')
    expect(peakLabel({ ...later[0], status: 'active', daysToPeak: -3 })).toBe('peaked 3 d ago')
    // a real one: Perseids three days after their maximum are still active
    const perseids = outlook(utc(2026, 8, 15, 12)).find((o) => o.shower.id === 'per')!
    expect(perseids.status).toBe('active')
    expect(peakLabel(perseids)).toBe('peaked 3 d ago')
    // …but ten+ days later it flips to next year's countdown
    expect(peakLabel(outlook(utc(2026, 8, 24)).find((o) => o.shower.id === 'per')!)).toMatch(/^peaks /)
  })
})
