/** English formatting for the HUD. */

export function timeAgo(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

export function formatMag(mag: number): string {
  return `M ${mag.toFixed(1)}`
}

export function formatKm(km: number): string {
  return `${Math.round(km).toLocaleString('en-US')} km`
}

export function formatKmh(kmh: number): string {
  return `${Math.round(kmh).toLocaleString('en-US')} km/h`
}

export function formatUtcClock(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lng).toFixed(1)}°${ew}`
}
