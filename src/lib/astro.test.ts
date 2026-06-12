import { describe, expect, it } from 'vitest'
import { APOLLO_SITES, moonPhaseLabel, nextMoonPhases, subLunarPoint } from './moon'
import { moonAngle, PLANET_MOONS, planetPositions, PLANETS, planetSpin, sceneDistance } from './planets'
import { nightPolygon, sphericalCircle, subsolarPoint } from './sun'
import { auroraColatitude, auroraOpacity, auroraOvals, auroraWidth } from './aurora'

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

describe('Měsíc', () => {
  it('sublunární bod v rozsahu, fáze 0–1', () => {
    const m = subLunarPoint(new Date(Date.UTC(2026, 5, 12, 12)))
    expect(Math.abs(m.lat)).toBeLessThan(29) // deklinace max ~28.6°
    expect(Math.abs(m.lng)).toBeLessThanOrEqual(180)
    expect(m.illumination).toBeGreaterThanOrEqual(0)
    expect(m.illumination).toBeLessThanOrEqual(1)
  })

  it('za půl lunace se fáze obrátí', () => {
    const a = subLunarPoint(new Date(Date.UTC(2026, 5, 12)))
    const b = subLunarPoint(new Date(Date.UTC(2026, 5, 12 + 14, 18))) // +14.77 dne
    expect(Math.abs(a.illumination - b.illumination)).toBeGreaterThan(0.6)
  })

  it('moonPhaseLabel formátuje', () => {
    const base = { lat: 0, lng: 0, distanceKm: 384_000, elongationRad: 0 }
    expect(moonPhaseLabel({ ...base, illumination: 0.62, waxing: true })).toBe('waxing 62 %')
    expect(moonPhaseLabel({ ...base, illumination: 0.01, waxing: true })).toBe('new moon')
  })

  it('vzdálenost v reálném rozsahu perigeum–apogeum', () => {
    const m = subLunarPoint(new Date(Date.UTC(2026, 5, 12)))
    expect(m.distanceKm).toBeGreaterThan(356_000)
    expect(m.distanceKm).toBeLessThan(407_000)
  })

  it('nextMoonPhases: nov před úplňkem (12.6.2026, nov je 14.6.)', () => {
    const from = new Date(Date.UTC(2026, 5, 12))
    const { nextFullMs, nextNewMs } = nextMoonPhases(from)
    expect(nextNewMs).toBeGreaterThan(from.getTime())
    expect(nextFullMs).toBeGreaterThan(nextNewMs) // nejdřív nov, pak úplněk
    const newInDays = (nextNewMs - from.getTime()) / 86_400_000
    expect(newInDays).toBeGreaterThan(1)
    expect(newInDays).toBeLessThan(5) // realita: 14.6.2026
  })

  it('Apollo: 6 misí, selenografické souřadnice v rozsahu', () => {
    expect(APOLLO_SITES).toHaveLength(6)
    expect(APOLLO_SITES[0]).toMatchObject({ mission: 'Apollo 11', year: 1969 })
    for (const s of APOLLO_SITES) {
      expect(Math.abs(s.lat)).toBeLessThan(45)
      expect(Math.abs(s.lng)).toBeLessThan(90) // všechna přistání na přivrácené straně
    }
  })
})

describe('planety (JPL approximace)', () => {
  const t = new Date(Date.UTC(2026, 5, 12, 12))
  const pos = planetPositions(t)
  const get = (id: string) => pos.find((p) => p.id === id)!

  it('vzdálenosti od Slunce v reálných mezích oběžných drah', () => {
    const ranges: Record<string, [number, number]> = {
      mercury: [0.30, 0.47], venus: [0.71, 0.73], mars: [1.38, 1.67],
      jupiter: [4.9, 5.5], saturn: [9.0, 10.1], uranus: [18.2, 20.1], neptune: [29.7, 30.4],
    }
    for (const [id, [lo, hi]] of Object.entries(ranges)) {
      const p = get(id)
      expect(p.distSunAu, id).toBeGreaterThan(lo)
      expect(p.distSunAu, id).toBeLessThan(hi)
    }
  })

  it('vzdálenosti od Země geometricky konzistentní (|sun±planet| meze)', () => {
    for (const p of pos) {
      expect(p.distEarthAu).toBeGreaterThan(Math.abs(p.distSunAu - 1.03))
      expect(p.distEarthAu).toBeLessThan(p.distSunAu + 1.03)
    }
  })

  it('vnitřní planety drží maximální elongaci od Slunce', () => {
    // sun RA from the same frame: use a fictitious planet at earth->sun vector? jednodušší:
    // elongace = úhel Slunce–Země–planeta z kosinové věty (vše v AU)
    const elong = (id: string) => {
      const p = get(id)
      const cosE = (1 ** 2 + p.distEarthAu ** 2 - p.distSunAu ** 2) / (2 * 1 * p.distEarthAu)
      return Math.acos(Math.min(Math.max(cosE, -1), 1)) * (180 / Math.PI)
    }
    expect(elong('mercury')).toBeLessThan(29)
    expect(elong('venus')).toBeLessThan(48.5)
  })

  it('deklinace v pásu ±30° (planety se drží ekliptiky)', () => {
    for (const p of pos) expect(Math.abs(p.decDeg), p.id).toBeLessThan(30)
  })

  it('sceneDistance: 1 AU = 900 jednotek, monotónně roste, Neptun se vejde', () => {
    expect(sceneDistance(1)).toBeCloseTo(900)
    expect(sceneDistance(30)).toBeLessThan(7000)
    expect(sceneDistance(30)).toBeGreaterThan(sceneDistance(9.5))
    expect(PLANETS).toHaveLength(7)
  })

  it('měsíce: reálné periody, Triton retrográdní, řazení dle vzdálenosti', () => {
    expect(PLANET_MOONS.jupiter.map((m) => m.name)).toEqual(['Io', 'Europa', 'Ganymede', 'Callisto'])
    expect(PLANET_MOONS.neptune[0].retrograde).toBe(true)
    for (const moons of Object.values(PLANET_MOONS)) {
      for (let i = 1; i < moons.length; i++) expect(moons[i].aKkm).toBeGreaterThan(moons[i - 1].aKkm)
      for (const m of moons) expect(m.periodD).toBeGreaterThan(0)
    }
  })

  it('moonAngle: Io oběhne za 1.769 dne přesně 2π, Triton běží záporně', () => {
    const io = PLANET_MOONS.jupiter[0]
    const t0 = 1_000_000_000_000
    const dAngle = moonAngle(io, t0 + io.periodD * 86_400_000) - moonAngle(io, t0)
    expect(dAngle).toBeCloseTo(2 * Math.PI, 6)
    const triton = PLANET_MOONS.neptune[0]
    expect(moonAngle(triton, t0 + 1000) - moonAngle(triton, t0)).toBeLessThan(0)
  })

  it('planetSpin: Jupiter se otočí za 9.9 h, Venuše točí pozpátku', () => {
    expect(planetSpin(9.9, 9.9 * 3_600_000)).toBeCloseTo(2 * Math.PI)
    expect(planetSpin(-5832.5, 3_600_000)).toBeLessThan(0)
    const venus = PLANETS.find((p) => p.id === 'venus')!
    expect(venus.facts.rotationH).toBeLessThan(0)
    expect(PLANETS.find((p) => p.id === 'uranus')!.facts.tiltDeg).toBeCloseTo(97.8)
  })
})
