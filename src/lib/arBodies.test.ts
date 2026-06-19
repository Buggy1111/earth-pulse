import { describe, expect, it } from 'vitest'
import { skyBodies } from './arBodies'

describe('skyBodies', () => {
  it('only returns above-horizon bodies, with sane angles + a distance label', () => {
    const bodies = skyBodies({ lat: 49.7, lng: 17.8 }, new Date('2026-06-19T22:00:00Z'))
    for (const b of bodies) {
      expect(b.elevationDeg).toBeGreaterThan(0)
      expect(b.elevationDeg).toBeLessThanOrEqual(90)
      expect(b.azimuthDeg).toBeGreaterThanOrEqual(0)
      expect(b.azimuthDeg).toBeLessThan(360)
      expect(b.rangeKm).toBeGreaterThan(0)
      expect(b.distanceLabel).toMatch(/km|AU/)
    }
  })

  it('reports the Moon at a lunar slant range when it is up', () => {
    // scan the day so we catch the Moon above the horizon somewhere
    let moon: ReturnType<typeof skyBodies>[number] | undefined
    for (let h = 0; h < 24 && !moon; h++) {
      moon = skyBodies({ lat: 0, lng: 0 }, new Date(Date.UTC(2026, 5, 19, h))).find((b) => b.name === 'Moon')
    }
    expect(moon).toBeTruthy()
    expect(moon!.rangeKm).toBeGreaterThan(300_000)
    expect(moon!.rangeKm).toBeLessThan(420_000)
    expect(moon!.distanceLabel).toMatch(/km/)
  })

  it('labels planets in AU', () => {
    // over a full day at least one planet should clear the horizon
    let planet: ReturnType<typeof skyBodies>[number] | undefined
    for (let h = 0; h < 24 && !planet; h++) {
      planet = skyBodies({ lat: 0, lng: 0 }, new Date(Date.UTC(2026, 5, 19, h))).find(
        (b) => b.name !== 'Moon',
      )
    }
    expect(planet).toBeTruthy()
    expect(planet!.distanceLabel).toMatch(/AU/)
  })
})
