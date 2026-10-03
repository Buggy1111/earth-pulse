/** Annual meteor showers: when they peak, where the radiant sits and how good
 * the sky will be. Pure functions over a small hand-curated table.
 *
 * Data: IMO Working List of Visual Meteor Showers (radiant at maximum, ZHR and
 * entry speed are the long-term IMO values; ZHR varies year to year). Peak
 * dates are the usual calendar dates (UTC) — the true maximum shifts by up to
 * a day between years, so the UI says "~". Radiants drift ~1°/day against the
 * stars; the per-day drift below is the approximate IMO value. */

export interface MeteorShower {
  id: string
  name: string
  /** Peak, UTC month (1–12) + day. */
  peakMonth: number
  peakDay: number
  /** Activity window, [month, day] inclusive. May wrap the new year. */
  start: [number, number]
  end: [number, number]
  /** Radiant at maximum, J2000 degrees. */
  raDeg: number
  decDeg: number
  /** Radiant drift, degrees per day. */
  driftRa: number
  driftDec: number
  /** Zenithal hourly rate at maximum under ideal skies. */
  zhr: number
  /** Atmospheric entry speed, km/s. */
  speedKms: number
  parent: string
  blurb: string
}

export const SHOWERS: MeteorShower[] = [
  { id: 'qua', name: 'Quadrantids', peakMonth: 1, peakDay: 3, start: [12, 28], end: [1, 12], raDeg: 230, decDeg: 49, driftRa: 0.6, driftDec: -0.3, zhr: 110, speedKms: 41, parent: '2003 EH1', blurb: 'a sharp, brief peak of bright meteors — blink and you miss it' },
  { id: 'lyr', name: 'Lyrids', peakMonth: 4, peakDay: 22, start: [4, 14], end: [4, 30], raDeg: 271, decDeg: 34, driftRa: 1.1, driftDec: 0, zhr: 18, speedKms: 49, parent: 'C/1861 G1 Thatcher', blurb: 'among the oldest recorded showers — watched for 2,700 years' },
  { id: 'eta', name: 'Eta Aquariids', peakMonth: 5, peakDay: 6, start: [4, 19], end: [5, 28], raDeg: 338, decDeg: -1, driftRa: 0.9, driftDec: 0.4, zhr: 50, speedKms: 66, parent: '1P/Halley', blurb: 'dust from Halley\'s Comet — fast, with long glowing trains' },
  { id: 'sda', name: 'Southern Delta Aquariids', peakMonth: 7, peakDay: 30, start: [7, 12], end: [8, 23], raDeg: 339, decDeg: -16, driftRa: 0.8, driftDec: 0.2, zhr: 25, speedKms: 41, parent: '96P/Machholz', blurb: 'a steady summer shower best seen from the southern hemisphere' },
  { id: 'per', name: 'Perseids', peakMonth: 8, peakDay: 12, start: [7, 17], end: [8, 24], raDeg: 48, decDeg: 58, driftRa: 1.4, driftDec: 0.2, zhr: 100, speedKms: 59, parent: '109P/Swift–Tuttle', blurb: 'the crowd-pleaser — warm August nights and plenty of fireballs' },
  { id: 'dra', name: 'Draconids', peakMonth: 10, peakDay: 8, start: [10, 6], end: [10, 10], raDeg: 262, decDeg: 54, driftRa: 0, driftDec: 0, zhr: 10, speedKms: 20, parent: '21P/Giacobini–Zinner', blurb: 'slow meteors, usually quiet — but it has erupted into storms' },
  { id: 'ori', name: 'Orionids', peakMonth: 10, peakDay: 21, start: [10, 2], end: [11, 7], raDeg: 95, decDeg: 16, driftRa: 1.2, driftDec: 0.1, zhr: 20, speedKms: 66, parent: '1P/Halley', blurb: 'Halley\'s Comet again — the second of its two yearly showers' },
  { id: 'sta', name: 'Southern Taurids', peakMonth: 11, peakDay: 5, start: [9, 20], end: [11, 20], raDeg: 52, decDeg: 13, driftRa: 0.8, driftDec: 0.2, zhr: 5, speedKms: 27, parent: '2P/Encke', blurb: 'slow, long-lasting and rich in bright fireballs' },
  { id: 'nta', name: 'Northern Taurids', peakMonth: 11, peakDay: 12, start: [10, 20], end: [12, 10], raDeg: 58, decDeg: 22, driftRa: 0.9, driftDec: 0.1, zhr: 5, speedKms: 29, parent: '2P/Encke', blurb: 'the Taurids\' northern branch — few meteors, many fireballs' },
  { id: 'leo', name: 'Leonids', peakMonth: 11, peakDay: 17, start: [11, 6], end: [11, 30], raDeg: 152, decDeg: 22, driftRa: 0.7, driftDec: -0.4, zhr: 15, speedKms: 71, parent: '55P/Tempel–Tuttle', blurb: 'the fastest shower — and every 33 years a full meteor storm' },
  { id: 'gem', name: 'Geminids', peakMonth: 12, peakDay: 14, start: [12, 4], end: [12, 20], raDeg: 112, decDeg: 33, driftRa: 1.0, driftDec: -0.1, zhr: 150, speedKms: 35, parent: '3200 Phaethon', blurb: 'the year\'s best — bright, colourful and born from an asteroid' },
  { id: 'urs', name: 'Ursids', peakMonth: 12, peakDay: 22, start: [12, 17], end: [12, 26], raDeg: 217, decDeg: 76, driftRa: 0, driftDec: 0, zhr: 10, speedKms: 33, parent: '8P/Tuttle', blurb: 'a quiet solstice shower circling near the Little Dipper' },
]

const DAY = 86_400_000

/** Peak instant (UTC, midday) in a calendar year. */
export function peakDate(s: MeteorShower, year: number): Date {
  return new Date(Date.UTC(year, s.peakMonth - 1, s.peakDay, 12))
}

/** The peak nearest to `from` that is still relevant: today's (or yesterday's)
 * if we are in it, otherwise the next one. */
export function nextPeak(s: MeteorShower, from: Date): Date {
  const y = from.getUTCFullYear()
  for (const yr of [y, y + 1]) {
    const p = peakDate(s, yr)
    if (p.getTime() > from.getTime() - DAY) return p
  }
  return peakDate(s, y + 2)
}

const md = (m: number, d: number) => m * 100 + d

/** Is the shower inside its activity window? Handles windows that wrap New Year. */
export function isActive(s: MeteorShower, date: Date): boolean {
  const now = md(date.getUTCMonth() + 1, date.getUTCDate())
  const a = md(...s.start)
  const b = md(...s.end)
  return a <= b ? now >= a && now <= b : now >= a || now <= b
}

export type ShowerStatus = 'peaking' | 'active' | 'upcoming'

export function showerStatus(s: MeteorShower, date: Date): ShowerStatus {
  const peak = nextPeak(s, date)
  if (Math.abs(peak.getTime() - date.getTime()) <= DAY) return 'peaking'
  return isActive(s, date) ? 'active' : 'upcoming'
}

/** Radiant position on `date`, with the daily drift applied from the peak. */
export function radiantAt(s: MeteorShower, date: Date): { raDeg: number; decDeg: number } {
  const peak = nextPeak(s, date)
  // days since the nearest peak, signed (negative = before it). nextPeak() is the
  // upcoming one, so a date well after this year's peak is ~a year BEFORE the next
  let d = (date.getTime() - peak.getTime()) / DAY
  if (d < -183) d += 365.25
  const days = Math.max(-25, Math.min(25, d))
  return {
    raDeg: (((s.raDeg + s.driftRa * days) % 360) + 360) % 360,
    decDeg: Math.max(-90, Math.min(90, s.decDeg + s.driftDec * days)),
  }
}

/** Elevation (degrees) of a radiant for an observer — standard hour-angle math. */
export function radiantElevationDeg(
  observer: { lat: number; lng: number },
  date: Date,
  raDeg: number,
  decDeg: number,
): number {
  const RAD = Math.PI / 180
  const d = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / DAY
  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  const ha = (gmst + observer.lng - raDeg) * RAD
  const lat = observer.lat * RAD
  const dec = decDeg * RAD
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / RAD
}

/** Rough meteors-per-hour you'd see: ZHR scaled by the radiant's height. */
export function expectedRate(zhr: number, elevationDeg: number): number {
  return elevationDeg <= 0 ? 0 : Math.round(zhr * Math.sin((elevationDeg * Math.PI) / 180))
}

export type SkyQuality = 'dark' | 'fair' | 'washed-out'

/** Moonlight at peak (0 = new, 1 = full) → how much of the show survives. */
export function skyQuality(moonIllumination: number): SkyQuality {
  if (moonIllumination < 0.3) return 'dark'
  if (moonIllumination < 0.65) return 'fair'
  return 'washed-out'
}

export interface ShowerOutlook {
  shower: MeteorShower
  status: ShowerStatus
  peak: Date
  daysToPeak: number
}

/** Every shower with status + countdown; peaking / active first, then soonest peak. */
export function outlook(from: Date): ShowerOutlook[] {
  const rank: Record<ShowerStatus, number> = { peaking: 0, active: 1, upcoming: 2 }
  return SHOWERS.map((shower) => {
    const peak = nextPeak(shower, from)
    return {
      shower,
      status: showerStatus(shower, from),
      peak,
      daysToPeak: (peak.getTime() - from.getTime()) / DAY,
    }
  }).sort((a, b) => rank[a.status] - rank[b.status] || a.daysToPeak - b.daysToPeak)
}

/** "peaks in 12 d" / "peaking now" / "peaked 2 d ago". */
export function peakLabel(o: ShowerOutlook): string {
  if (o.status === 'peaking') return 'peaking now'
  const d = Math.round(o.daysToPeak)
  if (d < 0) return `peaked ${-d} d ago`
  if (d === 0) return 'peaks today'
  if (d === 1) return 'peaks tomorrow'
  if (d < 60) return `peaks in ${d} d`
  return `peaks ${o.peak.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
}
