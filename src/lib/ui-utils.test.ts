import { describe, expect, it } from 'vitest'
import { formatCoords, formatCountdown, formatKmh, formatUtcClock, timeAgo } from './format'
import { parseIss } from './iss'
import { geometryLabelPoint, ringCentroid } from './labels'
import { pingDuration, pingFrequency, pingGain } from './ping'
import { diffNewQuakes, parseQuakes } from './quakes'
import { encodeView, parseView } from './share'

describe('diffNewQuakes + ping', () => {
  it('vrátí jen quaky mimo seen set', () => {
    const quakes = parseQuakes({
      features: [
        { id: 'x', properties: { mag: 3, place: 'A', time: 1 }, geometry: { coordinates: [0, 0, 0] } },
        { id: 'y', properties: { mag: 5, place: 'B', time: 2 }, geometry: { coordinates: [1, 1, 1] } },
      ],
    })
    expect(diffNewQuakes(new Set(['x']), quakes).map((q) => q.id)).toEqual(['y'])
    expect(diffNewQuakes(new Set(['x', 'y']), quakes)).toEqual([])
  })

  it('větší magnituda = nižší tón, větší hlasitost, delší dozvuk', () => {
    expect(pingFrequency(7)).toBeLessThan(pingFrequency(2))
    expect(pingGain(7)).toBeGreaterThan(pingGain(2))
    expect(pingDuration(7)).toBeGreaterThan(pingDuration(2))
    // extrémy se oříznou
    expect(pingFrequency(-5)).toBe(pingFrequency(0))
    expect(pingGain(99)).toBe(pingGain(8))
  })
})

describe('country label points', () => {
  const square: [number, number][] = [[10, 40], [20, 40], [20, 50], [10, 50], [10, 40]]

  it('ringCentroid: střed čtverce, uzavírací bod se nepočítá dvakrát', () => {
    expect(ringCentroid(square)).toEqual({ lat: 45, lng: 15 })
  })

  it('geometryLabelPoint: MultiPolygon kotví na největší prstenec (pevninu)', () => {
    const tiny: [number, number][] = [[-53, 4], [-52, 4], [-52, 5], [-53, 4]]
    const point = geometryLabelPoint({
      type: 'MultiPolygon',
      coordinates: [[tiny], [square]],
    })
    expect(point).toEqual({ lat: 45, lng: 15 })
    expect(geometryLabelPoint({ type: 'Polygon', coordinates: [square] })).toEqual({
      lat: 45,
      lng: 15,
    })
  })
})

describe('share URL (view state v hashi)', () => {
  it('round-trip: kamera + orbity + vypnuté vrstvy', () => {
    const view = {
      camera: { lat: 49.834, lng: 18.282, altitude: 1.204 },
      orbitIds: ['25544', '20580'],
      layersOff: ['quakes', 'aurora'],
    }
    const encoded = encodeView(view)
    expect(encoded).toBe('c=49.83,18.28,1.20&o=25544.20580&off=quakes.aurora')
    const parsed = parseView(`#${encoded}`)
    expect(parsed?.camera?.lat).toBeCloseTo(49.83)
    expect(parsed?.orbitIds).toEqual(['25544', '20580'])
    expect(parsed?.layersOff).toEqual(['quakes', 'aurora'])
  })

  it('odmítne nesmysly: špatné souřadnice, cizí vrstvy, ne-číselné orbity', () => {
    expect(parseView('#c=999,0,1')).toBeNull()
    expect(parseView('')).toBeNull()
    expect(parseView('#off=hacks')).toBeNull()
    const p = parseView('#o=25544.DROP_TABLE.99')
    expect(p?.orbitIds).toEqual(['25544', '99'])
  })

  it('prázdné části se vynechají', () => {
    expect(encodeView({ orbitIds: [], layersOff: [] })).toBe('')
    expect(encodeView({ orbitIds: ['1'], layersOff: [] })).toBe('o=1')
  })
})

describe('format + iss', () => {
  it('timeAgo, souřadnice, rychlost', () => {
    expect(timeAgo(0, 30_000)).toBe('30s ago')
    expect(timeAgo(0, 90_000)).toBe('1m ago')
    expect(timeAgo(0, 3_700_000)).toBe('1h 1m ago')
    expect(formatCoords(50.1, -14.3)).toBe('50.1°N 14.3°W')
    expect(formatKmh(27585.6)).toBe('27,586 km/h')
    expect(formatUtcClock(Date.UTC(2026, 5, 12, 7, 4, 9))).toBe('07:04:09 UTC')
    expect(formatCountdown(8 * 60_000)).toBe('8 min')
    expect(formatCountdown(134 * 60_000)).toBe('2 h 14 min')
  })

  it('parseIss mapuje pole', () => {
    expect(
      parseIss({ latitude: 1, longitude: 2, altitude: 425.4, velocity: 27586, visibility: 'daylight' }),
    ).toEqual({ lat: 1, lng: 2, altitudeKm: 425.4, velocityKmh: 27586, visibility: 'daylight' })
  })
})
