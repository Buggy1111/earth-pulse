// Earthquake → Telegram alerter. Runs from a GitHub Actions cron (see
// .github/workflows/quake-alert.yml); the web app itself stays client-only.
//
//   TELEGRAM_BOT_TOKEN  your OWN bot's token (from @BotFather) — never shared
//   TELEGRAM_CHAT_ID    chat / channel id to post into
//   node scripts/quake-alert.mjs [--dry] [--baseline] [--digest] [--config alerts.config.json] [--state path]
//
// --dry (or missing credentials) prints the messages instead of sending them
// and leaves the state file untouched. --baseline records everything currently
// matching as already sent WITHOUT messaging (first run: no replay of the last
// few hours). --digest sends ONE 24 h summary message instead of per-quake alerts
// (the daily workflow); it never touches the alert state.
import { readFile, writeFile } from 'node:fs/promises'
import {
  formatDigest,
  formatMessage,
  nextState,
  parseEmsc,
  parseUsgs,
  selectAlerts,
  validateConfig,
} from './lib/quake-alert.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)

const configPath = opt('--config', 'alerts.config.json')
const statePath = opt('--state', '.alert-state.json')
const token = process.env.TELEGRAM_BOT_TOKEN
const chatId = process.env.TELEGRAM_CHAT_ID
const baseline = flag('--baseline')
const digest = flag('--digest')
const dry = !baseline && (flag('--dry') || !token || !chatId)

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'earth-pulse-quake-alert' } })
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`)
  return r.json()
}

const config = await readJson(configPath, null)
const bad = validateConfig(config)
if (bad) {
  console.error(`Invalid ${configPath}: ${bad}`)
  process.exit(1)
}

const now = Date.now()
const quakes = []
// the two agencies are independent: one being down must not silence the other
const lowest = Math.min(config.worldwideMinMagnitude ?? Infinity, ...(config.regions ?? []).map((r) => r.minMagnitude))
const sources = [
  ['USGS', () => getJson('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson').then(parseUsgs)],
  [
    'EMSC',
    () =>
      getJson(
        `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=300&orderby=time&minmag=${Math.max(0, lowest - 0.5)}&start=${new Date(now - 86_400_000).toISOString().slice(0, 19)}`,
      ).then(parseEmsc),
  ],
]
let okSources = 0
for (const [name, load] of sources) {
  try {
    quakes.push(...(await load()))
    okSources++
  } catch (e) {
    console.warn(`${name} unavailable: ${e.message}`)
  }
}
if (okSources === 0) {
  console.error('No earthquake source reachable.')
  process.exit(1)
}

if (digest) {
  const text = formatDigest(quakes, now)
  if (!token || !chatId || flag('--dry')) {
    console.log(`${text}\n(dry run — nothing sent)`)
    process.exit(0)
  }
  let r
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error(`Telegram sendMessage failed: ${err?.name ?? 'error'}`) // never the URL — it embeds the token
    process.exit(1)
  }
  if (!r.ok) {
    console.error(`Telegram sendMessage failed: ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
    process.exit(1)
  }
  console.log('digest sent')
  process.exit(0)
}

const state = await readJson(statePath, { sent: [] })
const alerts = selectAlerts(quakes, config, state, now)
console.log(`${quakes.length} events checked, ${alerts.length} to alert${dry ? ' (dry run)' : ''}`)

const delivered = []
if (baseline) delivered.push(...alerts)
for (const alert of baseline ? [] : alerts) {
  const text = formatMessage(alert)
  if (dry) {
    console.log(`\n${text}\n`)
    continue
  }
  let r
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    // a network error must not skip writing the state of what WAS delivered (it would be re-sent)
    console.error(`Telegram sendMessage failed: ${err?.name ?? 'error'}`) // never the URL — it embeds the token
    break // the rest retries on the next run
  }
  if (!r.ok) {
    // never echo the URL (it embeds the token) — only the status and Telegram's reason
    const body = await r.text().catch(() => '')
    console.error(`Telegram sendMessage failed: ${r.status} ${body.slice(0, 200)}`)
    break // keep what was delivered; the rest retries on the next run
  }
  delivered.push(alert)
}

if (baseline) console.log('baseline recorded — no messages sent')
if (!dry) await writeFile(statePath, JSON.stringify(nextState(state, delivered, now)))
if (!dry && delivered.length < alerts.length) process.exit(1)
