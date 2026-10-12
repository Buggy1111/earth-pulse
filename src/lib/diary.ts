/** 📓 Planet diary: everything the live feeds saw in the last 24 hours, boiled
 * down to one glanceable digest. Pure aggregation over data the app already
 * holds (USGS quakes, NASA EONET events, NOAA Kp) — no extra requests. */

import { eventMeta, type EarthEvent } from './events'
import type { Quake } from './quakes'
import { kpLabel } from './spaceWeather'
import { regionOf } from './quakeMatch.mjs'
import { plural, t } from './i18n'

export { regionOf }

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

export function buildDiary({ quakes, events, kp, windKms, now }: DiaryInput): Diary {
  const since = now - DIARY_HOURS * HOUR
  // `now` may lag the real clock by up to a minute (callers bucket it), so a
  // quake that just landed can be a few seconds "in the future" — keep it
  const recent = quakes.filter((q) => q.time >= since && q.time <= now + HOUR)

  const hourly = new Array<number>(DIARY_HOURS).fill(0)
  for (const q of recent) {
    const age = Math.max(0, Math.floor((now - q.time) / HOUR)) // 0 = this hour
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

  const dayEvents = events.filter((e) => e.date >= since && e.date <= now + HOUR)
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
  const storm = kp !== null && kp >= 5
  const stormLine = () => t('Geomagnetic storm (Kp {kp}) — auroras reach lower latitudes.', { kp: kp?.toFixed(0) ?? '' })
  if (count === 0) return storm ? stormLine() : t('A quiet planet — nothing logged yet.')
  const where = strongest ? regionOf(strongest.place) : ''
  const mag = strongest?.mag.toFixed(1) ?? ''
  if (strongest && strongest.mag >= 7) return t('A major day: M {mag} near {where}.', { mag, where })
  if (strongest && strongest.mag >= 6) return t('A strong shake: M {mag} near {where}.', { mag, where })
  if (storm) return stormLine()
  if (strongCount > 0)
    return t('{n} {quakes} of M 5+; the biggest was M {mag} near {where}.', {
      n: strongCount,
      quakes: plural(strongCount, ['quake', 'quakes'], ['otřes', 'otřesy', 'otřesů']),
      mag,
      where,
    })
  return t('An ordinary day: {n} quakes, the biggest M {mag} near {where}.', { n: count, mag, where })
}

/** Shareable plain-text version of the diary. */
export function diaryText(d: Diary, now: number): string {
  const day = new Date(now).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const lines = [`📓 Earth Pulse — ${t('planet diary, last 24 h')} (${day})`, d.headline, '']
  lines.push(`🌐 ${t('{n} earthquakes, {m} of M 5+', { n: d.quakeCount, m: d.strongCount })}`)
  if (d.strongest) lines.push(`   ${t('strongest')} M ${d.strongest.mag.toFixed(1)} — ${d.strongest.place}`)
  if (d.deepest && d.deepest.depthKm >= 300) lines.push(`   ${t('deepest')} ${Math.round(d.deepest.depthKm)} km — ${d.deepest.place}`)
  if (d.busiest) lines.push(`   ${t('busiest')}: ${d.busiest.region} (${d.busiest.count})`)
  if (d.eventGroups.length)
    lines.push(`🔥 ${d.eventGroups.map((g) => `${g.count} ${t(g.label).toLowerCase()}`).join(' · ')}`)
  if (d.kp !== null)
    lines.push(`☀️ Kp ${d.kp.toFixed(1)} (${kpLabel(d.kp)})${d.windKms ? ` · ${t('solar wind')} ${Math.round(d.windKms)} km/s` : ''}`)
  return lines.join('\n')
}

