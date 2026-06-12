import { describe, expect, it } from 'vitest'
import { formatCoords, formatKmh, formatUtcClock, timeAgo } from './format'
import { parseIss } from './iss'
import { pingDuration, pingFrequency, pingGain } from './ping'
import {
  diffNewQuakes,
  glowOpacity,
  glowScale,
  magColor,
  magRadius,
  parseQuakes,
  quakeStats,
  type UsgsFeed,
} from './quakes'
import { auroraColatitude, auroraOpacity, auroraOvals, auroraWidth } from './aurora'
import {
  globeAltitude,
  isIss,
  orbitalPeriodMin,
  orbitTrack,
  parseTle,
  propagateSats,
  toTrackedSats,
} from './satellites'
import { kpColor, kpLabel, parseKp, parseSolarWind } from './spaceWeather'
import { nightPolygon, sphericalCircle, subsolarPoint } from './sun'
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

  it('realita: Praha 12.6.2026 — ve 3:30 UTC po východu (osvětlená), v 1:00 UTC noc', () => {
    // východ slunce v Praze 12.6.2026 ≈ 2:49 UTC (timeanddate)
    const cos = (d: Date) => {
      const s = subsolarPoint(d)
      const RAD = Math.PI / 180
      return (
        Math.sin(s.lat * RAD) * Math.sin(50.08 * RAD) +
        Math.cos(s.lat * RAD) * Math.cos(50.08 * RAD) * Math.cos((14.43 - s.lng) * RAD)
      )
    }
    expect(cos(new Date(Date.UTC(2026, 5, 12, 3, 30)))).toBeGreaterThan(0) // slunce nad obzorem
    expect(cos(new Date(Date.UTC(2026, 5, 12, 1, 0)))).toBeLessThan(-0.1) // hluboká noc
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

describe('satellites (TLE + SGP4)', () => {
  // real ISS TLE (epoch June 2026) — propagation must land in LEO
  const TLE = `ISS (ZARYA)
1 25544U 98067A   26162.50000000  .00016717  00000+0  30200-3 0  9990
2 25544  51.6400 208.9163 0006317  69.9862 290.2026 15.49815308 10000
HST
1 20580U 90037B   26162.50000000  .00001000  00000+0  50000-4 0  9991
2 20580  28.4690  80.0000 0002500 100.0000 260.0000 15.09700000 10002`

  it('parseTle čte 3řádkové sety a přeskočí rozbité', () => {
    const sets = parseTle(TLE)
    expect(sets).toHaveLength(2)
    expect(sets[0].name).toBe('ISS (ZARYA)')
    expect(sets[1].name).toBe('HST')
    expect(parseTle('jen jeden řádek')).toHaveLength(0)
  })

  it('toTrackedSats drží i ISS (vizuál jede z SGP4) a isIss ji pozná', () => {
    const sats = toTrackedSats(parseTle(TLE))
    expect(sats.map((s) => s.name)).toEqual(['ISS (ZARYA)', 'HST'])
    expect(isIss('ISS (ZARYA)')).toBe(true)
    expect(isIss('HST')).toBe(false)
  })

  it('id = NORAD číslo (jména se v TLE opakují, id nikdy)', () => {
    const sats = toTrackedSats(parseTle(TLE))
    expect(sats.map((s) => s.id)).toEqual(['25544', '20580'])
    const pos = propagateSats(sats, new Date(Date.UTC(2026, 5, 12, 6)))
    expect(pos.map((p) => p.id)).toEqual(['25544', '20580'])
  })

  it('propagace dá platné pozice v LEO', () => {
    const sats = toTrackedSats(parseTle(TLE))
    const pos = propagateSats(sats, new Date(Date.UTC(2026, 5, 12, 6)))
    expect(pos).toHaveLength(2)
    for (const p of pos) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90)
      expect(p.altKm).toBeGreaterThan(200)
      expect(p.altKm).toBeLessThan(2000)
    }
  })

  it('pozice se za minutu posune (živý pohyb)', () => {
    const sats = toTrackedSats(parseTle(TLE))
    const t0 = new Date(Date.UTC(2026, 5, 12, 6))
    const a = propagateSats(sats, t0)[0]
    const b = propagateSats(sats, new Date(t0.getTime() + 60_000))[0]
    expect(Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)).toBeGreaterThan(0.5)
  })

  it('orbitalPeriodMin čte periodu z mean motion (HST ~95,5 min)', () => {
    const hst = toTrackedSats(parseTle(TLE))[1]
    expect(orbitalPeriodMin(hst)).toBeGreaterThan(94)
    expect(orbitalPeriodMin(hst)).toBeLessThan(97)
  })

  it('globeAltitude převádí km na poloměry Země', () => {
    expect(globeAltitude(6371)).toBe(1)
    expect(globeAltitude(420)).toBeCloseTo(0.0659, 3)
  })
})

describe('sphericalCircle + aurora', () => {
  it('kružnice kolem pólu drží konstantní vzdálenost', () => {
    const ring = sphericalCircle({ lat: 90, lng: 0 }, 20, 24)
    expect(ring).toHaveLength(25)
    for (const [, lat] of ring) expect(lat).toBeCloseTo(70, 5)
  })

  it('ovály rostou a jasní s Kp', () => {
    expect(auroraColatitude(7)).toBeGreaterThan(auroraColatitude(1))
    expect(auroraWidth(7)).toBeGreaterThan(auroraWidth(1))
    expect(auroraOpacity(7)).toBeGreaterThan(auroraOpacity(1))
    expect(auroraColatitude(99)).toBe(auroraColatitude(9)) // clamp
  })

  it('auroraOvals: severní + jižní annulus s dírou', () => {
    const ovals = auroraOvals(3, 24)
    expect(ovals.map((o) => o.pole)).toEqual(['north', 'south'])
    for (const o of ovals) {
      expect(o.rings).toHaveLength(2) // outer + inner hole
      expect(o.rings[0]).toHaveLength(25)
      expect(o.opacity).toBeGreaterThan(0)
      expect(o.opacity).toBeLessThan(1)
    }
    // severní ovál leží na severu, jižní na jihu
    expect(ovals[0].rings[0].every(([, lat]) => lat > 30)).toBe(true)
    expect(ovals[1].rings[0].every(([, lat]) => lat < -30)).toBe(true)
  })
})

describe('orbitTrack', () => {
  const TLE = `HST
1 20580U 90037B   26162.50000000  .00001000  00000+0  50000-4 0  9991
2 20580  28.4690  80.0000 0002500 100.0000 260.0000 15.09700000 10002`

  it('vrátí UZAVŘENOU orbitu v LEO (konec = začátek)', () => {
    const [sat] = toTrackedSats(parseTle(TLE))
    const track = orbitTrack(sat, new Date(Date.UTC(2026, 5, 12, 6)), 128)
    expect(track.length).toBe(129) // 128 vzorků + uzavírací bod
    for (const p of track) {
      expect(p.altKm).toBeGreaterThan(200)
      expect(p.altKm).toBeLessThan(2000)
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90)
    }
    // HST inklinace 28.5° — dráha nikdy nad ~29° šířky
    expect(Math.max(...track.map((p) => Math.abs(p.lat)))).toBeLessThan(29.5)
    // uzavřenost: poslední bod je přesně první
    const [first, last] = [track[0], track[track.length - 1]]
    expect(last).toEqual(first)
    // a předposlední (skutečný konec periody) je blízko startu — žádný 23° skok
    const prev = track[track.length - 2]
    expect(Math.abs(prev.lat - first.lat)).toBeLessThan(2)
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

  it('kpColor/kpLabel: zelená klid, žlutá aktivní, červená bouře', () => {
    expect(kpColor(2)).toBe('#34d399')
    expect(kpColor(4.5)).toBe('#fbbf24')
    expect(kpColor(6.1)).toBe('#ef4444')
    expect(kpLabel(1)).toBe('quiet')
    expect(kpLabel(5.2)).toBe('minor storm')
    expect(kpLabel(7.5)).toBe('strong storm')
  })
})

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

describe('format + iss', () => {
  it('timeAgo, souřadnice, rychlost', () => {
    expect(timeAgo(0, 30_000)).toBe('30s ago')
    expect(timeAgo(0, 90_000)).toBe('1m ago')
    expect(timeAgo(0, 3_700_000)).toBe('1h 1m ago')
    expect(formatCoords(50.1, -14.3)).toBe('50.1°N 14.3°W')
    expect(formatKmh(27585.6)).toBe('27,586 km/h')
    expect(formatUtcClock(Date.UTC(2026, 5, 12, 7, 4, 9))).toBe('07:04:09 UTC')
  })

  it('parseIss mapuje pole', () => {
    expect(
      parseIss({ latitude: 1, longitude: 2, altitude: 425.4, velocity: 27586, visibility: 'daylight' }),
    ).toEqual({ lat: 1, lng: 2, altitudeKm: 425.4, velocityKmh: 27586, visibility: 'daylight' })
  })
})
