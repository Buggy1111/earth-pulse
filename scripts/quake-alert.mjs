// Earthquake → Telegram alerter. Runs from a GitHub Actions cron (see
// .github/workflows/quake-alert.yml); the web app itself stays client-only.
//
//   TELEGRAM_BOT_TOKEN  your OWN bot's token (from @BotFather) — never shared
//   TELEGRAM_CHAT_ID    chat / channel id to post into
//   node scripts/quake-alert.mjs [--dry] [--baseline] [--digest] [--retry-undeliverable] [--config alerts.config.json] [--state path]
//
// --dry (or missing credentials) prints the messages instead of sending them
// and leaves the state file untouched. --baseline records everything currently
// matching as already sent WITHOUT messaging (first run: no replay of the last
// few hours). --digest sends ONE 24 h summary message instead of per-quake alerts
// (the daily workflow); it never touches the alert state.
// --retry-undeliverable manually replays the durable dead-letter queue. Review
// the saved state before doing so; successful Telegram delivery is not atomic
// with saving the state, so a crash during replay may create a duplicate.
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
const retryUndeliverable = flag('--retry-undeliverable')
if (retryUndeliverable && (baseline || digest)) {
  console.error('--retry-undeliverable cannot be combined with --baseline or --digest')
  process.exit(1)
}
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

/**
 * One Telegram sendMessage. Returns 'ok', 'retry' (network, 429, 5xx — try again
 * next run) or 'skip' (permanent 4xx such as a message Telegram can't parse: it
 * would fail forever and block every later alert). Never logs the URL — it
 * embeds the bot token.
 */
async function sendTelegram(text) {
  let r
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error(`Telegram sendMessage failed: ${err?.name ?? 'network error'}`)
    return 'retry'
  }
  if (r.ok) return 'ok'
  const body = (await r.text().catch(() => '')).slice(0, 200)
  console.error(`Telegram sendMessage failed: ${r.status} ${body}`)
  return r.status === 429 || r.status >= 500 ? 'retry' : 'skip'
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
        `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=300&orderby=time&minmag=${Number.isFinite(lowest) ? Math.max(0, lowest - 0.5) : 2.5}&start=${new Date(now - 86_400_000).toISOString().slice(0, 19)}`,
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
  if ((await sendTelegram(text)) !== 'ok') process.exit(1)
  console.log('digest sent')
  process.exit(0)
}

const state = await readJson(statePath, { sent: [] })
const pending = state.undeliverable ?? []
const alerts = retryUndeliverable ? pending : selectAlerts(quakes, config, state, now).filter((a) =>
  !pending.some((p) => p.quake.id === a.quake.id),
)
console.log(`${quakes.length} events checked, ${alerts.length} to alert${dry ? ' (dry run)' : ''}`)

const delivered = []
const skipped = []
const stillPending = []
if (baseline) delivered.push(...alerts)
for (const alert of baseline ? [] : alerts) {
  const text = formatMessage(alert)
  if (dry) {
    console.log(`\n${text}\n`)
    continue
  }
  const res = await sendTelegram(text)
  if (res === 'retry') break // keep what was delivered; the rest retries on the next run
  if (res === 'skip') {
    // a message Telegram rejects for good must not block the newer alerts behind it
    console.error(`skipping undeliverable alert ${alert.quake.id}`)
    skipped.push(alert)
    stillPending.push(alert)
    continue
  }
  delivered.push(alert)
}

if (baseline) console.log('baseline recorded — no messages sent')
if (!dry) {
  const next = nextState(state, [...delivered, ...skipped], now)
  // Permanent Telegram rejections are retained for inspection and explicit
  // replay; they are not automatically retried on the regular cron schedule.
  next.undeliverable = retryUndeliverable
    ? [...pending.filter((p) => !alerts.some((a) => a.quake.id === p.quake.id)), ...stillPending]
    : [...pending, ...stillPending.filter((a) => !pending.some((p) => p.quake.id === a.quake.id))]
  await writeFile(statePath, JSON.stringify(next))
}
if (!dry && delivered.length + skipped.length < alerts.length) process.exit(1) // the rest retries next run
if (skipped.length) process.exit(1) // surface permanent failures in the Actions run
