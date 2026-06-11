import { describe, expect, it } from 'vitest'
import { formatCoords, formatKmh, timeAgo } from './format'
import { parseIss } from './iss'
import { magColor, magRadius, parseQuakes, quakeStats, type UsgsFeed } from './quakes'
import { nightPolygon, subsolarPoint } from './sun'
import { parseWikiEvent, pushEdit } from './wiki'

describe('parseQuakes', () => {
  const feed: UsgsFeed = {
    features: [
      { id: 'a', properties: { mag: 4.5, place: 'near Tokyo', time: 2000 },
        geometry: { coordinates: [139.7, 35.7, 10] } },
      { id: 'b', properties: { mag: null, place: 'bad', time: 1000 }, geometry: { coordinates: [0, 0, 0] } },
      { id: 'c', properties: { mag: 2.1, place: null, time: 3000 }, geometry: { coordinates: [-120, 36, 5] } },
      { id: 'd', properties: { mag: 1, place: 'no geom', time: 500 }, geometry: null },
    ],
  }

  it('vyhodí záznamy bez magnitudy/geometrie, seřadí od nejnovějšího', () => {
    const quakes = parseQuakes(feed)
    expect(quakes.map((q) => q.id)).toEqual(['c', 'a'])
    expect(quakes[1]).toMatchObject({ lat: 35.7, lng: 139.7, depthKm: 10, mag: 4.5 })
    expect(quakes[0].place).toBe('unknown location')
  })

  it('stats: počet, nejsilnější, nejnovější', () => {
    const s = quakeStats(parseQuakes(feed))
    expect(s.count).toBe(2)
    expect(s.strongest?.id).toBe('a')
    expect(s.latest?.id).toBe('c')
    expect(quakeStats([])).toEqual({ count: 0, strongest: null, latest: null })
  })

  it('barvy a poloměry rostou s magnitudou', () => {
    expect(magColor(1)).toBe('#2dd4bf')
    expect(magColor(6.5)).toBe('#ef4444')
    expect(magRadius(6)).toBeGreaterThan(magRadius(3))
    expect(magRadius(0)).toBeGreaterThan(0)
  })
})

describe('subsolarPoint', () => {
  it('letní slunovrat 2026: deklinace ~ +23,4°', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12)))
    expect(lat).toBeGreaterThan(23.2)
    expect(lat).toBeLessThan(23.6)
  })

  it('rovnodennost 2026: deklinace ~ 0°', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12)))
    expect(Math.abs(lat)).toBeLessThan(1)
  })

  it('ve 12:00 UTC je subsolární délka blízko 0° (± rovnice času)', () => {
    const { lng } = subsolarPoint(new Date(Date.UTC(2026, 5, 12, 12)))
    expect(Math.abs(lng)).toBeLessThan(5)
  })

  it('o půlnoci UTC je subsolární délka blízko ±180°', () => {
    const { lng } = subsolarPoint(new Date(Date.UTC(2026, 5, 12, 0)))
    expect(Math.abs(lng)).toBeGreaterThan(175)
  })
})

describe('nightPolygon', () => {
  it('uzavřený prstenec s platnými souřadnicemi', () => {
    const ring = nightPolygon(new Date(Date.UTC(2026, 5, 12, 3)), 48)
    expect(ring).toHaveLength(49)
    for (const [lng, lat] of ring) {
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
    }
  })
})

describe('parseWikiEvent', () => {
  const base = {
    type: 'edit', title: 'Praha', server_name: 'cs.wikipedia.org',
    user: 'Honza', bot: false, namespace: 0, meta: { uri: 'https://cs.wikipedia.org/wiki/Praha' },
  }

  it('lidská editace článku projde', () => {
    const e = parseWikiEvent(JSON.stringify(base))
    expect(e).toMatchObject({ title: 'Praha', wiki: 'cs', user: 'Honza' })
  })

  it('boti, diskuse, jiné weby a nevalidní JSON neprojdou', () => {
    expect(parseWikiEvent(JSON.stringify({ ...base, bot: true }))).toBeNull()
    expect(parseWikiEvent(JSON.stringify({ ...base, namespace: 1 }))).toBeNull()
    expect(parseWikiEvent(JSON.stringify({ ...base, server_name: 'wikidata.org' }))).toBeNull()
    expect(parseWikiEvent(JSON.stringify({ ...base, type: 'log' }))).toBeNull()
    expect(parseWikiEvent('{rozbité')).toBeNull()
  })

  it('pushEdit drží maximum a řadí nejnovější první', () => {
    let list = [] as ReturnType<typeof pushEdit>
    for (let i = 0; i < 10; i++) {
      list = pushEdit(list, { title: `T${i}`, wiki: 'en', user: 'u', isBot: false, url: '' }, 7)
    }
    expect(list).toHaveLength(7)
    expect(list[0].title).toBe('T9')
  })
})

describe('format + iss', () => {
  it('timeAgo, souřadnice, rychlost', () => {
    expect(timeAgo(0, 30_000)).toBe('30s ago')
    expect(timeAgo(0, 90_000)).toBe('1m ago')
    expect(timeAgo(0, 3_700_000)).toBe('1h 1m ago')
    expect(formatCoords(50.1, -14.3)).toBe('50.1°N 14.3°W')
    expect(formatKmh(27585.6)).toBe('27,586 km/h')
  })

  it('parseIss mapuje pole', () => {
    expect(
      parseIss({ latitude: 1, longitude: 2, altitude: 425.4, velocity: 27586, visibility: 'daylight' }),
    ).toEqual({ lat: 1, lng: 2, altitudeKm: 425.4, velocityKmh: 27586, visibility: 'daylight' })
  })
})
