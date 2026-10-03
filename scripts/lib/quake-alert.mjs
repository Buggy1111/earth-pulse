// Pure logic for the earthquake → Telegram alerter (scripts/quake-alert.mjs).
// No I/O here, so it is unit-tested in src/lib/quakeAlert.test.ts.

const RAD = Math.PI / 180

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * RAD
  const dLng = (lng2 - lng1) * RAD
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** USGS summary GeoJSON → [{ id, lat, lng, mag, depthKm, place, time, url, src }]. */
export function parseUsgs(json) {
  const out = []
  for (const f of json?.features ?? []) {
    const c = f?.geometry?.coordinates
    const p = f?.properties
    if (!c || !p || p.mag == null || !Number.isFinite(Number(p.mag))) continue
    out.push({
      id: `usgs:${f.id}`,
      lat: c[1],
      lng: c[0],
      mag: Number(p.mag),
      depthKm: Number(c[2]) || 0,
      place: p.place || 'unknown location',
      time: p.time,
      url: p.url || null,
      src: 'USGS',
    })
  }
  return out
}

/** EMSC FDSN event GeoJSON → same shape. */
export function parseEmsc(json) {
  const out = []
  for (const f of json?.features ?? []) {
    const c = f?.geometry?.coordinates
    const p = f?.properties
    const time = Date.parse(p?.time ?? '')
    if (!c || !p?.unid || !Number.isFinite(Number(p.mag)) || !Number.isFinite(time)) continue
    out.push({
      id: `emsc:${p.unid}`,
      lat: c[1],
      lng: c[0],
      mag: Number(p.mag),
      depthKm: Math.abs(Number(p.depth ?? c[2] ?? 0)) || 0,
      place: p.flynn_region || 'unknown region',
      time,
      url: `https://www.emsc-csem.org/Earthquake_information/earthquake.php?id=${encodeURIComponent(p.unid)}`,
      src: 'EMSC',
    })
  }
  return out
}

/** Same physical event reported by two agencies (time, place and magnitude agree). */
export function isSameEvent(a, b) {
  if (Math.abs(a.time - b.time) > 120_000) return false
  if (Math.abs(a.mag - b.mag) > 1.2) return false
  return haversineKm(a.lat, a.lng, b.lat, b.lng) < 250
}

/**
 * Config shape:
 *   { worldwideMinMagnitude: 6.5 | null,
 *     regions: [{ name, minMagnitude, bbox?: [south, west, north, east],
 *                 circle?: { lat, lng, radiusKm } }] }
 * Returns the names of every rule the quake satisfies ([] = no alert).
 */
export function matchingRules(q, config) {
  const hits = []
  const world = config.worldwideMinMagnitude
  if (typeof world === 'number' && q.mag >= world) hits.push('Worldwide')
  for (const r of config.regions ?? []) {
    if (!(q.mag >= r.minMagnitude)) continue
    let inside = false
    if (r.bbox) {
      const [s, w, n, e] = r.bbox
      const lngIn = w <= e ? q.lng >= w && q.lng <= e : q.lng >= w || q.lng <= e // wraps the antimeridian
      inside = q.lat >= s && q.lat <= n && lngIn
    } else if (r.circle) {
      inside = haversineKm(q.lat, q.lng, r.circle.lat, r.circle.lng) <= r.circle.radiusKm
    }
    if (inside) hits.push(r.name)
  }
  return hits
}

/**
 * Pick the quakes worth a message.
 * `state` = { sent: [{ id, time, lat, lng, mag }] } of already-alerted events.
 * Skips too-old events (so a first run / long outage doesn't replay history),
 * ids already sent, and the same event already sent via the other agency.
 */
export function selectAlerts(quakes, config, state, nowMs, maxAgeMin = 180) {
  const sent = state?.sent ?? []
  const picked = []
  // newest first; when two agencies report one event, the first seen in this order wins
  const ordered = [...quakes].sort((a, b) => b.time - a.time)
  for (const q of ordered) {
    if (!Number.isFinite(q.time) || nowMs - q.time > maxAgeMin * 60_000 || q.time > nowMs + 60_000) continue
    if (sent.some((s) => s.id === q.id || isSameEvent(s, q))) continue
    if (picked.some((p) => isSameEvent(p.quake, q))) continue
    const rules = matchingRules(q, config)
    if (rules.length) picked.push({ quake: q, rules })
  }
  return picked.sort((a, b) => a.quake.time - b.quake.time) // oldest first, like a timeline
}

/** Record alerted events and drop entries older than `keepDays`. */
export function nextState(state, alerts, nowMs, keepDays = 3) {
  const keep = (state?.sent ?? []).filter((s) => nowMs - s.time < keepDays * 86_400_000)
  for (const { quake: q } of alerts) keep.push({ id: q.id, time: q.time, lat: q.lat, lng: q.lng, mag: q.mag })
  return { sent: keep.slice(-2000) }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function severity(mag) {
  if (mag >= 7) return '🔴'
  if (mag >= 6) return '🟠'
  if (mag >= 5) return '🟡'
  return '🟢'
}

/** Telegram HTML message for one alert. */
export function formatMessage({ quake: q, rules }) {
  const when = new Date(q.time).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const map = `https://www.openstreetmap.org/?mlat=${q.lat.toFixed(3)}&mlon=${q.lng.toFixed(3)}#map=6/${q.lat.toFixed(3)}/${q.lng.toFixed(3)}`
  const lines = [
    `${severity(q.mag)} <b>M ${q.mag.toFixed(1)}</b> — ${esc(q.place)}`,
    `🕒 ${when}`,
    `⬇️ depth ${Math.round(q.depthKm)} km · 📍 ${q.lat.toFixed(2)}, ${q.lng.toFixed(2)}`,
    `🔔 ${esc(rules.join(', '))} · via ${q.src}`,
    `<a href="${map}">map</a>${q.url ? ` · <a href="${esc(q.url)}">details</a>` : ''}`,
  ]
  return lines.join('\n')
}

/** Validate the user config; returns an error string or null. */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') return 'config must be an object'
  const w = config.worldwideMinMagnitude
  if (w != null && typeof w !== 'number') return 'worldwideMinMagnitude must be a number or null'
  for (const r of config.regions ?? []) {
    if (!r.name || typeof r.minMagnitude !== 'number') return `region needs name + numeric minMagnitude: ${JSON.stringify(r)}`
    const okBox = Array.isArray(r.bbox) && r.bbox.length === 4 && r.bbox.every(Number.isFinite)
    const c = r.circle
    const okCircle = c && [c.lat, c.lng, c.radiusKm].every(Number.isFinite)
    if (!okBox && !okCircle) return `region "${r.name}" needs a valid bbox [s,w,n,e] or circle {lat,lng,radiusKm}`
  }
  return null
}

/** "12 km SSW of Ridgecrest, CA" → "CA"; "Fiji region" → "Fiji region". */
export function regionOf(place) {
  const tail = String(place).split(',').pop().trim()
  return tail.replace(/^\d+\s*km\s+\S+\s+of\s+/i, '').trim() || String(place)
}

/** Plain digest of the last 24 h for the daily Telegram summary (HTML-safe). */
export function formatDigest(quakes, nowMs) {
  const since = nowMs - 86_400_000
  const inWindow = quakes
    .filter((q) => q.time >= since && q.time <= nowMs + 3_600_000)
    .sort((a, b) => b.mag - a.mag) // keep the better-measured/higher entry when two agencies overlap
  // USGS and EMSC both report the big ones — count each physical event once
  const day = []
  for (const q of inWindow) if (!day.some((d) => isSameEvent(d, q))) day.push(q)
  if (day.length === 0) return '📓 <b>Earth Pulse — last 24 h</b>\nNo earthquakes logged.'
  const strong = day.filter((q) => q.mag >= 5).length
  const top = day.reduce((a, b) => (b.mag > a.mag ? b : a))
  const regions = new Map()
  for (const q of day) regions.set(regionOf(q.place), (regions.get(regionOf(q.place)) ?? 0) + 1)
  const [busyName, busyCount] = [...regions.entries()].sort((a, b) => b[1] - a[1])[0]
  const lines = [
    '📓 <b>Earth Pulse — last 24 h</b>',
    `🌐 ${day.length} earthquakes, ${strong} of M 5+`,
    `${severity(top.mag)} strongest <b>M ${top.mag.toFixed(1)}</b> — ${esc(top.place)}`,
  ]
  if (busyCount >= 3) lines.push(`📍 busiest: ${esc(busyName)} (${busyCount})`)
  return lines.join('\n')
}
