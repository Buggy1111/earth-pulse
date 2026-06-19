import { describe, expect, it } from 'vitest'
import { angleDelta, lookAngles, projectToView } from './arMath'

describe('lookAngles', () => {
  it('a satellite straight overhead reads ~90° elevation, range ~= altitude', () => {
    const { elevationDeg, rangeKm } = lookAngles({ lat: 49.6, lng: 18 }, { lat: 49.6, lng: 18, altKm: 550 })
    expect(elevationDeg).toBeGreaterThan(89)
    // directly above → slant range is just the altitude
    expect(rangeKm).toBeCloseTo(550, 0)
  })

  it('a low satellite is farther away (slant) than one overhead', () => {
    const obs = { lat: 0, lng: 0 }
    const overhead = lookAngles(obs, { lat: 0, lng: 0, altKm: 550 })
    const low = lookAngles(obs, { lat: 0, lng: 20, altKm: 550 })
    expect(low.rangeKm).toBeGreaterThan(overhead.rangeKm)
  })

  it('a satellite due east on the horizon reads azimuth ~90°, low elevation', () => {
    const obs = { lat: 0, lng: 0 }
    // far east + low so it sits near the horizon to the east
    const { azimuthDeg, elevationDeg } = lookAngles(obs, { lat: 0, lng: 20, altKm: 550 })
    expect(azimuthDeg).toBeGreaterThan(80)
    expect(azimuthDeg).toBeLessThan(100)
    expect(elevationDeg).toBeLessThan(40)
  })

  it('a satellite due north reads azimuth ~0°/360°', () => {
    const { azimuthDeg } = lookAngles({ lat: 0, lng: 0 }, { lat: 20, lng: 0, altKm: 550 })
    expect(Math.min(azimuthDeg, 360 - azimuthDeg)).toBeLessThan(10)
  })
})

describe('angleDelta', () => {
  it('folds into (-180, 180]', () => {
    expect(angleDelta(10, 350)).toBe(20)
    expect(angleDelta(350, 10)).toBe(-20)
    expect(angleDelta(0, 0)).toBe(0)
    expect(angleDelta(180, 0)).toBe(180)
  })
})

describe('projectToView', () => {
  const view = { width: 400, height: 800, hFovDeg: 60, vFovDeg: 90 }

  it('a sat exactly where the phone points lands dead centre', () => {
    const p = projectToView(
      { azimuthDeg: 120, elevationDeg: 30 },
      { headingDeg: 120, pitchDeg: 30 },
      view,
    )
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(400)
    expect(p.visible).toBe(true)
  })

  it('a sat to the right of where the phone points moves x right', () => {
    const p = projectToView(
      { azimuthDeg: 140, elevationDeg: 30 },
      { headingDeg: 120, pitchDeg: 30 },
      view,
    )
    expect(p.x).toBeGreaterThan(200)
    expect(p.visible).toBe(true)
  })

  it('hides a sat outside the field of view', () => {
    const p = projectToView(
      { azimuthDeg: 250, elevationDeg: 30 },
      { headingDeg: 120, pitchDeg: 30 },
      view,
    )
    expect(p.visible).toBe(false)
  })

  it('hides a sat below the horizon', () => {
    const p = projectToView(
      { azimuthDeg: 120, elevationDeg: -5 },
      { headingDeg: 120, pitchDeg: 0 },
      view,
    )
    expect(p.visible).toBe(false)
  })
})
