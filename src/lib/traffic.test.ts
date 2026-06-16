import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAircraft } from './aircraft'
import { fetchShips } from './ships'

function mockFetch(json: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status, json: async () => json })),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchAircraft', () => {
  it('parses fields, converts units, skips rows without a position, handles ground', async () => {
    mockFetch({
      ac: [
        { hex: 'abc', lat: 50, lon: 14, alt_baro: 36000, gs: 450, track: 90, flight: 'ABC123 ', t: 'A320' },
        { hex: 'gnd', lat: 51, lon: 15, alt_baro: 'ground', alt_geom: 0, gs: 0 },
        { hex: 'nopos' }, // no lat/lon → skipped
      ],
    })
    const out = await fetchAircraft({ lat: 50, lng: 14 })
    expect(out).toHaveLength(2)
    expect(out[0].callsign).toBe('ABC123') // trimmed
    expect(out[0].type).toBe('A320')
    expect(out[0].altKm).toBeCloseTo(36000 * 0.0003048, 3)
    expect(out[0].speedKmh).toBeCloseTo(450 * 1.852, 1)
    expect(out[1].onGround).toBe(true)
    expect(out[1].altKm).toBe(0)
  })

  it('throws when rate-limited / non-ok', async () => {
    mockFetch({}, false, 429)
    await expect(fetchAircraft({ lat: 0, lng: 0 })).rejects.toThrow()
  })
})

describe('fetchShips', () => {
  it('parses GeoJSON, converts knots, downsamples, falls back on heading 511', async () => {
    const features = Array.from({ length: 10 }, (_, i) => ({
      geometry: { coordinates: [20 + i, 59] },
      properties: { mmsi: 1000 + i, sog: i === 0 ? 0.1 : 12, cog: 100, heading: i === 0 ? 511 : 80 },
    }))
    mockFetch({ features })
    const out = await fetchShips(undefined, 5)
    expect(out.length).toBeLessThanOrEqual(5)
    expect(out[0].mmsi).toBe(1000)
    expect(out[0].moving).toBe(false) // sog 0.1 ≤ 0.5
    expect(out[0].headingDeg).toBe(100) // 511 sentinel → course fallback
    expect(out[1].speedKmh).toBeCloseTo(12 * 1.852, 1)
    expect(out[1].headingDeg).toBe(80)
  })

  it('skips features missing coordinates or mmsi', async () => {
    mockFetch({
      features: [
        { geometry: { coordinates: [20, 59] }, properties: { mmsi: 1 } },
        { geometry: {}, properties: { mmsi: 2 } }, // no coords
        { geometry: { coordinates: [21, 60] }, properties: {} }, // no mmsi
      ],
    })
    const out = await fetchShips()
    expect(out).toHaveLength(1)
    expect(out[0].mmsi).toBe(1)
  })
})
