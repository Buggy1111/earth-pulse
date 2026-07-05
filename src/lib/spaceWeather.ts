/** NOAA SWPC space weather: planetary Kp index + solar wind speed.
 *
 * Both endpoints send `Access-Control-Allow-Origin: *`, so the browser reads
 * them directly. Pure parsing here, no DOM.
 */

export const KP_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'
// SWPC removed /products/solar-wind/ (plasma-5-minute.json → 404 since ~July 2026);
// the geospace propagated feed keeps the same "products" table shape at ~6 kB.
export const SOLAR_WIND_URL =
  'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'

export interface KpReading {
  kp: number
  time: string
}

interface KpRow {
  time_tag: string
  estimated_kp: number
}

/** Latest estimated Kp from the 1-minute feed (array of rows, newest last). */
export function parseKp(rows: KpRow[]): KpReading | null {
  for (let i = (rows ?? []).length - 1; i >= 0; i--) {
    const r = rows[i]
    if (typeof r?.estimated_kp === 'number' && Number.isFinite(r.estimated_kp)) {
      return { kp: r.estimated_kp, time: r.time_tag }
    }
  }
  return null
}

export interface SolarWindReading {
  speedKms: number
  densityPerCm3: number
  time: string
}

/** SWPC "products" format: row 0 = column names, then string/number/null cells
 * (the geospace feed sends raw numbers where the old plasma feed sent strings). */
export function parseSolarWind(rows: (string | number | null)[][]): SolarWindReading | null {
  if (!Array.isArray(rows) || rows.length < 2) return null
  const header = rows[0]
  const iTime = header.indexOf('time_tag')
  const iSpeed = header.indexOf('speed')
  const iDensity = header.indexOf('density')
  if (iTime < 0 || iSpeed < 0) return null
  for (let i = rows.length - 1; i >= 1; i--) {
    const row = rows[i]
    const speed = Number(row[iSpeed])
    if (row[iSpeed] === null || !Number.isFinite(speed)) continue
    return {
      speedKms: speed,
      densityPerCm3: iDensity >= 0 ? Number(row[iDensity] ?? NaN) : NaN,
      time: String(row[iTime] ?? ''),
    }
  }
  return null
}

/** Storm-level color: calm green, active yellow, storming red. */
export function kpColor(kp: number): string {
  if (kp >= 6) return '#ef4444'
  if (kp >= 4) return '#fbbf24'
  return '#34d399'
}

export function kpLabel(kp: number): string {
  if (kp >= 7) return 'strong storm'
  if (kp >= 6) return 'storm'
  if (kp >= 5) return 'minor storm'
  if (kp >= 4) return 'active'
  return 'quiet'
}
