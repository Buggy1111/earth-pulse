// @vitest-environment node
/** Every star photo the app shows must point at a real catalogue star and a baked card. */
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STAR_PHOTOS } from '../src/lib/starLook'

describe('STAR_PHOTOS assets', () => {
  it('every photo names a real catalogue star and has its card file', () => {
    const cat = JSON.parse(readFileSync('public/stars/stars.json', 'utf8')) as {
      named: { n: string }[]
      nearest: { n: string }[]
    }
    const names = new Set([...cat.named, ...cat.nearest].map((s) => s.n))
    for (const [name, p] of Object.entries(STAR_PHOTOS)) {
      expect(names.has(name), `${name} in stars.json`).toBe(true)
      expect(existsSync(`public/stars/cards/${p.slug}.webp`), `${p.slug}.webp`).toBe(true)
    }
  })

  it('no orphan card files', () => {
    const slugs = new Set(Object.values(STAR_PHOTOS).map((p) => p.slug))
    for (const f of readFileSync('scripts/fetch-star-photos.mjs', 'utf8').matchAll(/slug: '([a-z0-9-]+)'/g)) {
      expect(slugs.has(f[1]), `${f[1]} baked but not shown`).toBe(true)
    }
  })
})
