import { describe, expect, it } from 'vitest'
import { isSameEvent, mergeQuakes, parseEmscEvent } from './emsc'
import { parseEvents } from './events'
import {
  glowOpacity,
  glowScale,
  magColor,
  magRadius,
  parseQuakes,
  quakeStats,
  type UsgsFeed,
} from './quakes'
import { kpColor, kpLabel, parseKp, parseSolarWind } from './spaceWeather'
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

  it('rejects malformed USGS positions, magnitude and timestamps', () => {
    const malformed: UsgsFeed = {
      features: [
        { id: 'nan', properties: { mag: Number.NaN, place: 'bad', time: 2000 }, geometry: { coordinates: [0, 0, 5] } },
        { id: 'latitude', properties: { mag: 2, place: 'bad', time: 2000 }, geometry: { coordinates: [0, 95, 5] } },
        { id: 'longitude', properties: { mag: 2, place: 'bad', time: 2000 }, geometry: { coordinates: [181, 0, 5] } },
        { id: 'depth', properties: { mag: 2, place: 'bad', time: 2000 }, geometry: { coordinates: [0, 0, Infinity] } },
        { id: 'timestamp', properties: { mag: 2, place: 'bad', time: 0 }, geometry: { coordinates: [0, 0, 5] } },
        { id: 'valid', properties: { mag: 3, place: 'okay', time: 2000 }, geometry: { coordinates: [0, 0, 5] } },
      ],
    }
    expect(parseQuakes(malformed).map((q) => q.id)).toEqual(['valid'])
  })

  it('stats: počet, nejsilnější, nejnovější', () => {
    const s = quakeStats(parseQuakes(feed))
    expect(s.count).toBe(2)
    expect(s.strongest?.id).toBe('a')
    expect(s.latest?.id).toBe('c')
    expect(quakeStats([])).toEqual({ count: 0, strongest: null, latest: null })
  })

  it('barvy a poloměry rostou s magnitudou (teplá škála)', () => {
    expect(magColor(1)).toBe('#fde68a')
    expect(magColor(3)).toBe('#fbbf24')
    expect(magColor(6.5)).toBe('#ef4444')
    expect(magRadius(6)).toBeGreaterThan(magRadius(3))
    expect(magRadius(0)).toBeGreaterThan(0)
  })

  it('glow: velikost roste s magnitudou, jas klesá se stářím', () => {
    expect(glowScale(6)).toBeGreaterThan(glowScale(2) * 2)
    expect(glowScale(-1)).toBe(glowScale(0))
    const now = 1_000_000_000
    expect(glowOpacity(now, now)).toBe(1)
    expect(glowOpacity(now - 86_400_000, now)).toBeCloseTo(0.38)
    expect(glowOpacity(now - 2 * 86_400_000, now)).toBeCloseTo(0.38) // clamp za 24 h
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

describe('space weather (NOAA SWPC)', () => {
  it('parseKp bere poslední platný řádek', () => {
    const rows = [
      { time_tag: '2026-06-12T00:00:00', estimated_kp: 2.33 },
      { time_tag: '2026-06-12T00:01:00', estimated_kp: 3.67 },
    ]
    expect(parseKp(rows)).toEqual({ kp: 3.67, time: '2026-06-12T00:01:00' })
    expect(parseKp([])).toBeNull()
  })

  it('parseSolarWind čte products formát a přeskočí null buňky', () => {
    const rows: (string | null)[][] = [
      ['time_tag', 'density', 'speed', 'temperature'],
      ['2026-06-12 00:00:00', '4.5', '412.3', '100000'],
      ['2026-06-12 00:05:00', null, null, null],
    ]
    const r = parseSolarWind(rows)
    expect(r?.speedKms).toBeCloseTo(412.3)
    expect(r?.densityPerCm3).toBeCloseTo(4.5)
    expect(parseSolarWind([['time_tag', 'speed']])).toBeNull()
  })

  it('parseSolarWind bere i číselné buňky geospace feedu (propagated-solar-wind)', () => {
    const rows: (string | number | null)[][] = [
      ['time_tag', 'speed', 'density', 'temperature', 'bz', 'propagated_time_tag'],
      ['2026-07-05T05:13:00Z', 532.7, 3.58, 91286, 0.87, '2026-07-05T05:50:58Z'],
      ['2026-07-05T06:08:00Z', 519.1, 4.09, 51324, -1.14, '2026-07-05T06:46:58Z'],
    ]
    const r = parseSolarWind(rows)
    expect(r?.speedKms).toBeCloseTo(519.1)
    expect(r?.densityPerCm3).toBeCloseTo(4.09)
    expect(r?.time).toBe('2026-07-05T06:08:00Z')
  })

  it('rejects malformed NOAA rows instead of returning invalid space-weather values', () => {
    expect(parseKp(null as unknown as Parameters<typeof parseKp>[0])).toBeNull()
    expect(parseKp([{ time_tag: 'invalid', estimated_kp: 4 }])).toBeNull()
    expect(parseKp([{ time_tag: '2026-10-13T00:00:00Z', estimated_kp: 99 }])).toBeNull()
    expect(parseSolarWind([null as unknown as string[]])).toBeNull()
    expect(parseSolarWind([['time_tag', 'speed'], ['not a date', '450']])).toBeNull()
    expect(parseSolarWind([['time_tag', 'speed'], ['2026-10-13T00:00:00Z', '0']])).toBeNull()
  })

  it('kpColor/kpLabel: zelená klid, žlutá aktivní, červená bouře', () => {
    expect(kpColor(2)).toBe('#34d399')
    expect(kpColor(4.5)).toBe('#fbbf24')
    expect(kpColor(6.1)).toBe('#ef4444')
    expect(kpLabel(1)).toBe('quiet')
    expect(kpLabel(5.2)).toBe('minor storm')
    expect(kpLabel(7.5)).toBe('strong storm')
  })
})

describe('EMSC live stream', () => {
  const event = JSON.stringify({
    action: 'create',
    data: {
      geometry: { coordinates: [142.3, 38.1, -25] },
      properties: { mag: 5.4, time: '2026-06-12T10:00:00.0Z', depth: 25, flynn_region: 'NEAR EAST COAST OF HONSHU', unid: '20260612_0001' },
    },
  })

  it('parseEmscEvent mapuje event, odmítá nesmysly', () => {
    const q = parseEmscEvent(event)
    expect(q).toMatchObject({ id: 'emsc:20260612_0001', lat: 38.1, lng: 142.3, mag: 5.4, depthKm: 25 })
    expect(q!.time).toBe(Date.parse('2026-06-12T10:00:00.0Z'))
    expect(parseEmscEvent('{nevalidni')).toBeNull()
    expect(parseEmscEvent(JSON.stringify({ action: 'heartbeat' }))).toBeNull()
  })

  it('isSameEvent: stejný otřes od dvou agentur, jiný otřes ne', () => {
    const usgs = { id: 'us1', lat: 38.2, lng: 142.5, mag: 5.6, depthKm: 30, place: 'x', time: Date.parse('2026-06-12T10:00:40Z') }
    const emsc = parseEmscEvent(event)!
    expect(isSameEvent(usgs, emsc)).toBe(true)
    expect(isSameEvent({ ...usgs, lat: 10 }, emsc)).toBe(false)
    expect(isSameEvent({ ...usgs, time: usgs.time + 600_000 }, emsc)).toBe(false)
  })

  it('mergeQuakes: EMSC navíc se přidá, duplikát ne, řazení dle času', () => {
    const usgs = [{ id: 'us1', lat: 38.2, lng: 142.5, mag: 5.6, depthKm: 30, place: 'x', time: Date.parse('2026-06-12T10:00:40Z') }]
    const dup = parseEmscEvent(event)!
    const fresh = { ...dup, id: 'emsc:fresh', lat: -20, lng: -70, time: Date.parse('2026-06-12T10:30:00Z') }
    const merged = mergeQuakes(usgs, [dup, fresh])
    expect(merged.map((q) => q.id)).toEqual(['emsc:fresh', 'us1'])
    expect(mergeQuakes(usgs, [dup])).toBe(usgs) // čistý duplikát = beze změny
  })
})


describe('external feed validation', () => {
  it('rejects EMSC updates without a real magnitude or valid coordinates', () => {
    const event = (mag: number | null, coordinates: number[]) => JSON.stringify({
      action: 'create', data: { properties: { unid: 'test', mag, time: '2026-10-12T12:00:00Z' }, geometry: { coordinates } },
    })
    expect(parseEmscEvent(event(null, [15, 50]))).toBeNull()
    expect(parseEmscEvent(event(4.2, [15, 95]))).toBeNull()
    expect(parseEmscEvent(event(4.2, [15, 50]))?.mag).toBe(4.2)
  })

  it('drops EONET events with invalid dates or impossible latitudes', () => {
    const item = (id: string, date: string, coordinates: number[]) => ({
      id, title: id, categories: [{ id: 'wildfires' }], geometry: [{ date, coordinates }],
    })
    const events = parseEvents({ events: [
      item('good', '2026-10-12T12:00:00Z', [15, 50]),
      item('bad-date', 'not-a-date', [15, 50]),
      item('bad-coordinates', '2026-10-12T12:00:00Z', [15, 95]),
    ] })
    expect(events.map((event) => event.id)).toEqual(['good'])
  })
})
