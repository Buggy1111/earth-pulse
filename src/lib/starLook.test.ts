import { describe, expect, it } from 'vitest'
import { luminosityWeight, starAppearance, STAR_PHOTOS } from './starLook'

describe('luminosityWeight', () => {
  it('reads the luminosity class, longest roman token first', () => {
    expect(luminosityWeight('M2Ib')).toBe(1.0) // supergiant
    expect(luminosityWeight('B8Ia')).toBe(1.0)
    expect(luminosityWeight('K1.5III')).toBe(0.6) // giant, not "II"
    expect(luminosityWeight('A7IV-V')).toBe(0.45) // subgiant, not "V"
    expect(luminosityWeight('G2V')).toBe(0.32) // dwarf
    expect(luminosityWeight('sdM4')).toBe(0.24) // subdwarf
  })
  it('returns null when no class is present', () => {
    expect(luminosityWeight('A0m...')).toBeNull()
  })
})

describe('starAppearance', () => {
  it('sizes a supergiant far larger than a main-sequence star', () => {
    const betelgeuse = starAppearance('M2Ib', 0.45, 498)
    const sirius = starAppearance('A0m...', -1.44, 9)
    expect(betelgeuse.radius).toBeGreaterThan(sirius.radius)
    expect(betelgeuse.radius).toBeLessThanOrEqual(1700)
    expect(sirius.radius).toBeGreaterThanOrEqual(300)
  })

  it('colours by temperature: M red, B blue', () => {
    const m = starAppearance('M2Ib', 0.45, 498)
    expect(m.valley[0]).toBeGreaterThan(m.valley[2]) // red > blue
    const b = starAppearance('B8Ia', 0.18, 863)
    expect(b.rim[2]).toBeGreaterThan(b.rim[0]) // blue > red
  })

  it('only cool supergiants pulse', () => {
    expect(starAppearance('M2Ib', 0.45, 498).pulse).toBeGreaterThan(0)
    expect(starAppearance('B8Ia', 0.18, 863).pulse).toBe(0)
    expect(starAppearance('G2V', -0.01, 4).pulse).toBe(0)
  })

  it('falls back to absolute magnitude when no class, and stays in range', () => {
    const a = starAppearance('A0m...', -1.44, 9)
    expect(a.radius).toBeGreaterThanOrEqual(300)
    expect(a.radius).toBeLessThanOrEqual(1700)
  })
})

describe('STAR_PHOTOS', () => {
  it('every entry has a slug and a credit with a licence', () => {
    for (const [name, p] of Object.entries(STAR_PHOTOS)) {
      expect(p.slug, name).toMatch(/^[a-z-]+$/)
      expect(p.credit.length, name).toBeGreaterThan(8)
    }
  })
})
