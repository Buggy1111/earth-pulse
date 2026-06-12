import { describe, expect, it } from 'vitest'
import {
  elevationDeg,
  globeAltitude,
  isIss,
  nextPass,
  orbitalPeriodMin,
  orbitTrack,
  parseTle,
  propagateSats,
  satsAbove,
  toTrackedSats,
} from './satellites'

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

describe('ISS pass prediction', () => {
  const ISS_TLE = `ISS (ZARYA)
1 25544U 98067A   26162.50000000  .00016717  00000+0  30200-3 0  9990
2 25544  51.6400 208.9163 0006317  69.9862 290.2026 15.49815308 10000`

  it('elevationDeg: přímo nad hlavou 90°, na protinožcích −90°', () => {
    expect(elevationDeg({ lat: 50, lng: 15 }, { lat: 50, lng: 15, altKm: 420 })).toBeCloseTo(90, 3)
    expect(elevationDeg({ lat: 50, lng: 15 }, { lat: -50, lng: -165, altKm: 420 })).toBeLessThan(-80)
  })

  it('nextPass najde přelet ISS nad Moravou do 24 h (inklinace 51,6° pokrývá 49,8°N)', () => {
    const [sat] = toTrackedSats(parseTle(ISS_TLE))
    const pass = nextPass(sat, { lat: 49.75, lng: 18.1 }, new Date(Date.UTC(2026, 5, 12, 6)))
    expect(pass).not.toBeNull()
    expect(pass!.maxElevationDeg).toBeGreaterThanOrEqual(10)
    const hoursAway = (pass!.startMs - Date.UTC(2026, 5, 12, 6)) / 3_600_000
    expect(hoursAway).toBeGreaterThanOrEqual(0)
    expect(hoursAway).toBeLessThan(24)
  })
})

describe('satsAbove (co letí nade mnou)', () => {
  const TLE = `ISS (ZARYA)
1 25544U 98067A   26162.50000000  .00016717  00000+0  30200-3 0  9990
2 25544  51.6400 208.9163 0006317  69.9862 290.2026 15.49815308 10000`

  it('pozorovatel přímo pod satelitem ho vidí v ~90°, protinožec ne', () => {
    const sats = toTrackedSats(parseTle(TLE))
    const t = new Date(Date.UTC(2026, 5, 12, 6))
    const pos = propagateSats(sats, t)[0]
    const above = satsAbove(sats, { lat: pos.lat, lng: pos.lng }, t)
    expect(above).toHaveLength(1)
    expect(above[0].elevationDeg).toBeGreaterThan(85)
    expect(satsAbove(sats, { lat: -pos.lat, lng: pos.lng + 180 }, t)).toHaveLength(0)
  })
})
