// Preloaded with `node --import` by quakeAlertScript.test.ts: replaces fetch with
// canned USGS/EMSC/Telegram answers driven by MOCK_* env vars.
const now = Date.now()
const quake = (id, mag, minsAgo) => ({
  id, type: 'Feature', geometry: { coordinates: [139.7, 35.6, 10] },
  properties: { mag, place: `${id} km E of Tokyo, Japan`, time: now - minsAgo * 60_000, url: `https://x/${id}` },
})
const telegram = (process.env.MOCK_TELEGRAM ?? '200').split(',') // status per call, or 'net'
let call = 0
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('usgs.gov')) {
    return new Response(JSON.stringify({ features: [quake('a', 7.1, 30), quake('b', 7.3, 10)] }))
  }
  if (u.includes('seismicportal')) return new Response('{}', { status: 503 })
  if (u.includes('api.telegram.org')) {
    const s = telegram[Math.min(call++, telegram.length - 1)]
    if (s === 'net') throw new TypeError('fetch failed')
    return new Response(JSON.stringify({ ok: s === '200' }), { status: Number(s) })
  }
  throw new Error(`unexpected fetch ${u}`)
}
