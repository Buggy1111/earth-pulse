// Quake helpers shared by the web app AND the Node alert scripts — one source of
// truth, so the in-app ping/diary and the Telegram alerter can never disagree on
// whether two reports are the same quake or which region was busiest.
// Plain JS (typed by quakeMatch.d.mts) because Node can't import extension-less TS.

const RAD = Math.PI / 180

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * RAD
  const dLng = (lng2 - lng1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Same physical event reported by two agencies? Time, place and magnitude all
 * roughly agree (early magnitude estimates differ by up to ~1). */
export function isSameEvent(a, b) {
  if (Math.abs(a.time - b.time) > 120_000) return false
  if (Math.abs(a.mag - b.mag) > 1.2) return false
  return haversineKm(a.lat, a.lng, b.lat, b.lng) < 250
}

/** "12 km SSW of Ridgecrest, CA" → "CA"; "Fiji region" → "Fiji region". */
export function regionOf(place) {
  const s = String(place)
  const tail = s.split(',').pop()?.trim() ?? s
  return tail.replace(/^\d+\s*km\s+\S+\s+of\s+/i, '').trim() || s
}
