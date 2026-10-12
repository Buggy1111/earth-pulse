// @vitest-environment node
/** Runs the real alert script end-to-end with a mocked network (no secrets, no internet). */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(telegram: string) {
  const dir = mkdtempSync(join(tmpdir(), 'quake-'))
  const config = join(dir, 'config.json')
  const state = join(dir, 'state.json')
  writeFileSync(config, JSON.stringify({ worldwideMinMagnitude: 6.5, regions: [] }))
  writeFileSync(state, JSON.stringify({ sent: [] }))
  let code = 0
  let out: string
  try {
    out = execFileSync(
      process.execPath,
      ['--import', join(root, 'scripts/test-fixtures/mock-fetch.mjs'), join(root, 'scripts/quake-alert.mjs'),
        '--config', config, '--state', state],
      { env: { ...process.env, TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c', MOCK_TELEGRAM: telegram }, encoding: 'utf8', stdio: 'pipe' },
    )
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string }
    code = err.status
    out = err.stdout + err.stderr
  }
  const saved = JSON.parse(readFileSync(state, 'utf8')) as { sent: { id: string }[]; undeliverable?: { quake: { id: string } }[] }
  const sent = saved.sent.map((s) => s.id)
  const undeliverable = saved.undeliverable?.map((a) => a.quake.id) ?? []
  return { code, out, sent, undeliverable }
}

describe('quake-alert script', () => {
  it('delivers every alert and records them', () => {
    const r = run('200')
    expect(r.code).toBe(0)
    expect(r.sent.sort()).toEqual(['usgs:a', 'usgs:b'])
  })

  it('a permanently rejected alert does not block the newer one', () => {
    const r = run('400,200')
    expect(r.out).toContain('skipping undeliverable alert usgs:a')
    expect(r.sent.sort()).toEqual(['usgs:a', 'usgs:b']) // a is recorded so it can't block forever, b delivered
    expect(r.undeliverable).toEqual(['usgs:a'])
    expect(r.code).toBe(1) // but the run still shows up as failed
  })

  it('a network error keeps what was delivered and retries the rest next run', () => {
    const r = run('200,net')
    expect(r.sent).toEqual(['usgs:a'])
    expect(r.undeliverable).toEqual([])
    expect(r.code).toBe(1)
    expect(r.out).not.toContain('api.telegram.org') // the token-bearing URL is never logged
  })
})
