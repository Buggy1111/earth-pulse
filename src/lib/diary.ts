/** 📓 Planet diary: everything the live feeds saw in the last 24 hours, boiled
 * down to one glanceable digest. Pure aggregation over data the app already
 * holds (USGS quakes, NASA EONET events, NOAA Kp) — no extra requests. */

import { eventMeta, type EarthEvent } from './events'
import type { Quake } from './quakes'
import { kpLabel } from './spaceWeather'

const HOUR = 3_600_000
export const DIARY_HOURS = 24

export interface DiaryInput {
  quakes: Quake[]
  events: EarthEvent[]
  kp: number | null
  windKms: number | null
  now: number
}

export interface DiaryEventGroup {
  category: string
  icon: string
  label: string
  count: number
}

export interface Diary {
  quakeCount: number
  /** M5.0+ count — the ones that matter to people. */
  strongCount: number
  strongest: Quake | null
  deepest: Quake | null
  /** Quakes per hour, oldest → newest (24 buckets, last = the current hour). */
  hourly: number[]
  busiest: { region: string; count: number } | null
  eventGroups: DiaryEventGroup[]
  /** New events first seen in the last 24 h, newest first (max 4). */
  freshEvents: EarthEvent[]
  kp: number | null
  windKms: number | null
  headline: string
}

/** "12 km SSW of Ridgecrest, CA" → "CA"; "Fiji region" → "Fiji region". */
export function regionOf(place: string): string {
  const tail = place.split(',').pop()?.trim() ?? place
  return tail.replace(/^\d+\s*km\s+\S+\s+of\s+/i, '').trim() || place
}

export function buildDiary({ quakes, events, kp, windKms, now }: DiaryInput): Diary {
  const since = now - DIARY_HOURS * HOUR
  const recent = quakes.filter((q) => q.time >= since && q.time <= now + HOUR)

  const hourly = new Array<number>(DIARY_HOURS).fill(0)
  for (const q of recent) {
    const age = Math.floor((now - q.time) / HOUR) // 0 = this hour
    if (age >= 0 && age < DIARY_HOURS) hourly[DIARY_HOURS - 1 - age]++
  }

  let strongest: Quake | null = null
  let deepest: Quake | null = null
  const regions = new Map<string, number>()
  for (const q of recent) {
    if (!strongest || q.mag > strongest.mag) strongest = q
    if (!deepest || q.depthKm > deepest.depthKm) deepest = q
    const r = regionOf(q.place)
    regions.set(r, (regions.get(r) ?? 0) + 1)
  }
  let busiest: Diary['busiest'] = null
  for (const [region, count] of regions) if (!busiest || count > busiest.count) busiest = { region, count }
  if (busiest && busiest.count < 3) busiest = null // two quakes is not a "hotspot"

  const dayEvents = events.filter((e) => e.date >= since)
  const groups = new Map<string, number>()
  for (const e of dayEvents) groups.set(e.category, (groups.get(e.category) ?? 0) + 1)
  const eventGroups: DiaryEventGroup[] = [...groups.entries()]
    .map(([category, count]) => ({ category, count, icon: eventMeta(category).icon, label: eventMeta(category).label }))
    .sort((a, b) => b.count - a.count)
  const freshEvents = [...dayEvents].sort((a, b) => b.date - a.date).slice(0, 4)

  const strongCount = recent.filter((q) => q.mag >= 5).length
  return {
    quakeCount: recent.length,
    strongCount,
    strongest,
    deepest,
    hourly,
    busiest,
    eventGroups,
    freshEvents,
    kp,
    windKms,
    headline: headline(recent.length, strongest, strongCount, kp),
  }
}

function headline(count: number, strongest: Quake | null, strongCount: number, kp: number | null): string {
  if (count === 0) return 'A quiet planet — nothing logged yet.'
  const where = strongest ? regionOf(strongest.place) : ''
  if (strongest && strongest.mag >= 7) return `A major day: M ${strongest.mag.toFixed(1)} near ${where}.`
  if (strongest && strongest.mag >= 6) return `A strong shake: M ${strongest.mag.toFixed(1)} near ${where}.`
  if (kp !== null && kp >= 5) return `Geomagnetic storm (Kp ${kp.toFixed(0)}) — auroras reach lower latitudes.`
  if (strongCount > 0) return `${strongCount} quake${strongCount > 1 ? 's' : ''} of M 5+; the biggest was M ${strongest?.mag.toFixed(1)} near ${where}.`
  return `An ordinary day: ${count} quakes, the biggest M ${strongest?.mag.toFixed(1)} near ${where}.`
}

/** Shareable plain-text version of the diary. */
export function diaryText(d: Diary, now: number): string {
  const day = new Date(now).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const lines = [`📓 Earth Pulse — planet diary, last 24 h (${day})`, d.headline, '']
  lines.push(`🌐 ${d.quakeCount} earthquakes, ${d.strongCount} of M 5+`)
  if (d.strongest) lines.push(`   strongest M ${d.strongest.mag.toFixed(1)} — ${d.strongest.place}`)
  if (d.deepest && d.deepest.depthKm >= 300) lines.push(`   deepest ${Math.round(d.deepest.depthKm)} km — ${d.deepest.place}`)
  if (d.busiest) lines.push(`   busiest: ${d.busiest.region} (${d.busiest.count})`)
  if (d.eventGroups.length)
    lines.push(`🔥 ${d.eventGroups.map((g) => `${g.count} ${g.label.toLowerCase()}`).join(' · ')}`)
  if (d.kp !== null) lines.push(`☀️ Kp ${d.kp.toFixed(1)} (${kpLabel(d.kp)})${d.windKms ? ` · solar wind ${Math.round(d.windKms)} km/s` : ''}`)
  return lines.join('\n')
}

