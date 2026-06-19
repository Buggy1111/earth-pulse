import { describe, expect, it } from 'vitest'
import { subsolarPoint, sunElevationDeg } from './sun'

describe('sunElevationDeg', () => {
  const date = new Date('2026-06-21T12:00:00Z') // arbitrary fixed instant

  it('is ~90° at the subsolar point and ~-90° at its antipode', () => {
    const sun = subsolarPoint(date)
    expect(sunElevationDeg(sun, date)).toBeCloseTo(90, 1)
    const antipode = { lat: -sun.lat, lng: ((sun.lng + 360) % 360) - 180 }
    expect(sunElevationDeg(antipode, date)).toBeCloseTo(-90, 1)
  })

  it('is positive on the day side and negative on the night side', () => {
    const sun = subsolarPoint(date)
    // 30° east of the subsolar meridian is still daytime; 150° away is night
    const day = { lat: sun.lat, lng: ((sun.lng + 30 + 540) % 360) - 180 }
    const night = { lat: sun.lat, lng: ((sun.lng + 150 + 540) % 360) - 180 }
    expect(sunElevationDeg(day, date)).toBeGreaterThan(0)
    expect(sunElevationDeg(night, date)).toBeLessThan(0)
  })
})
