import { describe, expect, it } from 'vitest'
import { buildDiary, diaryText, regionOf, DIARY_HOURS } from './diary'
import type { Quake } from './quakes'
import type { EarthEvent } from './events'

const NOW = Date.UTC(2026, 9, 3, 12, 30)
const H = 3_600_000
const q = (o: Partial<Quake> & { agoH: number }): Quake => ({
  id: String(Math.random()), lat: 0, lng: 0, mag: 3, depthKm: 10, place: '5 km N of Somewhere, Chile', time: NOW - o.agoH * H, ...o,
})
const ev = (o: Partial<EarthEvent> & { agoH: number }): EarthEvent => ({
  id: String(Math.random()), title: 'x', category: 'wildfires', lat: 0, lng: 0, date: NOW - o.agoH * H, ...o,
})

describe('planet diary', () => {
  it('extracts a region from a USGS place string', () => {
    expect(regionOf('12 km SSW of Ridgecrest, CA')).toBe('CA')
    expect(regionOf('Fiji region')).toBe('Fiji region')
    expect(regionOf('45 km NE of Tokyo')).toBe('Tokyo')
  })

  it('only counts the last 24 h and buckets them by hour', () => {
    const d = buildDiary({
      quakes: [q({ agoH: 0.2 }), q({ agoH: 1.5 }), q({ agoH: 1.9 }), q({ agoH: 23.5 }), q({ agoH: 30 })],
      events: [], kp: null, windKms: null, now: NOW,
    })
    expect(d.quakeCount).toBe(4)
    expect(d.hourly).toHaveLength(DIARY_HOURS)
    expect(d.hourly[DIARY_HOURS - 1]).toBe(1) // this hour
    expect(d.hourly[DIARY_HOURS - 2]).toBe(2)
    expect(d.hourly[0]).toBe(1)
    expect(d.hourly.reduce((a, b) => a + b, 0)).toBe(4)
  })

  it('finds strongest, deepest and a hotspot (needs 3+ in one region)', () => {
    const d = buildDiary({
      quakes: [
        q({ agoH: 1, mag: 6.2, place: '10 km S of Hualien, Taiwan', depthKm: 20 }),
        q({ agoH: 2, mag: 4, place: 'A, Chile', depthKm: 600 }),
        q({ agoH: 3, mag: 3, place: 'B, Chile' }),
        q({ agoH: 4, mag: 3, place: 'C, Chile' }),
      ],
      events: [], kp: 2, windKms: 400, now: NOW,
    })
    expect(d.strongest?.mag).toBe(6.2)
    expect(d.deepest?.depthKm).toBe(600)
    expect(d.busiest).toEqual({ region: 'Chile', count: 3 })
    expect(d.strongCount).toBe(1)
    expect(d.headline).toMatch(/strong shake.*Taiwan/)
  })

  it('groups the last day\'s events by category', () => {
    const d = buildDiary({
      quakes: [],
      events: [ev({ agoH: 2 }), ev({ agoH: 3 }), ev({ agoH: 5, category: 'volcanoes' }), ev({ agoH: 80 })],
      kp: null, windKms: null, now: NOW,
    })
    expect(d.eventGroups.map((g) => [g.category, g.count])).toEqual([['wildfires', 2], ['volcanoes', 1]])
    expect(d.freshEvents).toHaveLength(3)
    expect(d.headline).toMatch(/quiet planet/)
  })

  it('keeps a quake that landed a few seconds after the bucketed clock', () => {
    const d = buildDiary({ quakes: [q({ agoH: -0.005 })], events: [], kp: null, windKms: null, now: NOW })
    expect(d.quakeCount).toBe(1)
    expect(d.hourly[DIARY_HOURS - 1]).toBe(1)
  })

  it('still reports a geomagnetic storm when the quake feed is empty', () => {
    const d = buildDiary({ quakes: [], events: [], kp: 7, windKms: null, now: NOW })
    expect(d.headline).toMatch(/Geomagnetic storm/)
  })

  it('writes a shareable text digest', () => {
    const d = buildDiary({ quakes: [q({ agoH: 1, mag: 5.4 })], events: [ev({ agoH: 1 })], kp: 5.2, windKms: 520, now: NOW })
    const t = diaryText(d, NOW)
    expect(t).toContain('planet diary')
    expect(t).toContain('1 earthquakes, 1 of M 5+')
    expect(t).toContain('Kp 5.2 (minor storm)')
    expect(t).toContain('solar wind 520 km/s')
  })
})
