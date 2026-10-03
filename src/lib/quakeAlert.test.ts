import { describe, expect, it } from 'vitest'
import {
  formatDigest,
  formatMessage,
  regionOf,
  haversineKm,
  matchingRules,
  nextState,
  parseEmsc,
  parseUsgs,
  selectAlerts,
  validateConfig,
  type AlertConfig,
  type AlertQuake,
} from '../../scripts/lib/quake-alert.mjs'
import config from '../../alerts.config.json'

const NOW = Date.UTC(2026, 9, 3, 12, 0)
const quake = (o: Partial<AlertQuake> = {}): AlertQuake => ({
  id: 'usgs:a', lat: 49.8, lng: 15.5, mag: 4, depthKm: 10, place: 'Prague', time: NOW - 5 * 60_000, url: null, src: 'USGS', ...o,
})
const cfg: AlertConfig = {
  worldwideMinMagnitude: 6.5,
  regions: [
    { name: 'CZ', minMagnitude: 3, circle: { lat: 49.8, lng: 15.5, radiusKm: 400 } },
    { name: 'Pacific', minMagnitude: 5, bbox: [-20, 170, 20, -170] }, // wraps the antimeridian
  ],
}

describe('quake alert rules', () => {
  it('measures great-circle distance', () => {
    expect(haversineKm(50.08, 14.44, 48.21, 16.37)).toBeGreaterThan(240) // Prague–Vienna ≈ 252 km
    expect(haversineKm(50.08, 14.44, 48.21, 16.37)).toBeLessThan(265)
  })

  it('matches circle, wrapping bbox and worldwide rules by magnitude', () => {
    expect(matchingRules(quake({ mag: 3.1 }), cfg)).toEqual(['CZ'])
    expect(matchingRules(quake({ mag: 2.9 }), cfg)).toEqual([])
    expect(matchingRules(quake({ lat: 0, lng: -175, mag: 5.2 }), cfg)).toEqual(['Pacific'])
    expect(matchingRules(quake({ lat: 0, lng: 175, mag: 5.2 }), cfg)).toEqual(['Pacific'])
    expect(matchingRules(quake({ lat: 0, lng: 100, mag: 5.2 }), cfg)).toEqual([])
    expect(matchingRules(quake({ lat: -40, lng: 100, mag: 7 }), cfg)).toEqual(['Worldwide'])
  })

  it('drops old events, repeats and the same event reported by the other agency', () => {
    const fresh = quake()
    const old = quake({ id: 'usgs:old', time: NOW - 5 * 3_600_000 })
    const future = quake({ id: 'usgs:future', time: NOW + 10 * 60_000 })
    const twin = quake({ id: 'emsc:1', src: 'EMSC', time: fresh.time + 30_000, mag: 4.2 })
    const picked = selectAlerts([fresh, old, future, twin], cfg, { sent: [] }, NOW)
    expect(picked.map((p) => p.quake.id)).toHaveLength(1)
    const again = selectAlerts([fresh], cfg, nextState({ sent: [] }, picked, NOW), NOW)
    expect(again).toEqual([])
    // already alerted via USGS → the EMSC twin stays quiet
    expect(selectAlerts([twin], cfg, nextState({ sent: [] }, selectAlerts([fresh], cfg, { sent: [] }, NOW), NOW), NOW)).toEqual([])
  })

  it('prunes old state entries', () => {
    const s = nextState({ sent: [{ id: 'x', time: NOW - 4 * 86_400_000, lat: 0, lng: 0, mag: 5 }] }, [], NOW)
    expect(s.sent).toEqual([])
  })

  it('escapes HTML in place names', () => {
    const text = formatMessage({ quake: quake({ place: '5 km <b>X</b> & Y' }), rules: ['CZ'] })
    expect(text).toContain('5 km &lt;b&gt;X&lt;/b&gt; &amp; Y')
    expect(text).toContain('M 4.0')
  })

  it('parses USGS and EMSC payloads, skipping malformed rows', () => {
    const usgs = parseUsgs({
      features: [
        { id: 'a', geometry: { coordinates: [10, 20, 5] }, properties: { mag: 5.1, place: 'X', time: 1, url: 'u' } },
        { id: 'b', geometry: { coordinates: [10, 20, 5] }, properties: { mag: null, time: 1 } },
        { id: 'c', geometry: null, properties: { mag: 4, time: 1 } },
      ],
    })
    expect(usgs).toHaveLength(1)
    expect(usgs[0]).toMatchObject({ id: 'usgs:a', lat: 20, lng: 10, mag: 5.1 })
    const emsc = parseEmsc({
      features: [
        { geometry: { coordinates: [10, 20, -12] }, properties: { unid: 'z', mag: 4.4, time: '2026-10-03T11:00:00Z', flynn_region: 'ITALY' } },
        { geometry: { coordinates: [10, 20] }, properties: { mag: 4.4, time: 'nope' } },
      ],
    })
    expect(emsc).toHaveLength(1)
    expect(emsc[0]).toMatchObject({ id: 'emsc:z', depthKm: 12, place: 'ITALY' })
  })

  it('ships a valid default config and rejects broken ones', () => {
    expect(validateConfig(config)).toBeNull()
    expect(validateConfig({ worldwideMinMagnitude: 6, regions: [{ name: 'x', minMagnitude: 3 }] })).toMatch(/bbox/)
    expect(validateConfig({ worldwideMinMagnitude: 'high' })).toMatch(/number/)
  })

  it('writes a daily digest of the last 24 h', () => {
    const qs = [
      quake({ id: 'a', mag: 6.1, place: '10 km S of Hualien, Taiwan', time: NOW - 2 * 3_600_000 }),
      quake({ id: 'b', mag: 3, place: 'A, Chile', time: NOW - 3 * 3_600_000 }),
      quake({ id: 'c', mag: 3, place: 'B, Chile', time: NOW - 4 * 3_600_000 }),
      quake({ id: 'd', mag: 3, place: 'C, Chile', time: NOW - 5 * 3_600_000 }),
      quake({ id: 'old', mag: 8, time: NOW - 30 * 3_600_000 }),
    ]
    const text = formatDigest(qs, NOW)
    expect(text).toContain('4 earthquakes, 1 of M 5+')
    expect(text).toContain('M 6.1')
    expect(text).toContain('busiest: Chile (3)')
    expect(text).not.toContain('M 8.0')
    expect(formatDigest([], NOW)).toContain('No earthquakes')
    expect(regionOf('12 km SSW of Ridgecrest, CA')).toBe('CA')
  })

  it('digest counts a quake reported by both agencies once', () => {
    const usgs = quake({ id: 'us1', time: NOW - 3_600_000, mag: 5.1, lat: 38, lng: 22, place: '10 km N of Athens, Greece' })
    const emsc = quake({ id: 'em1', time: NOW - 3_600_000 + 20_000, mag: 4.9, lat: 38.02, lng: 22.01, place: 'GREECE' })
    const text = formatDigest([usgs, emsc], NOW)
    expect(text).toContain('1 earthquakes')
    expect(text).toContain('M 5.1') // the stronger entry wins
  })
})
