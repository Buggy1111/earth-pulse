import { afterEach, describe, expect, it } from 'vitest'
import { CS } from './i18n.cs'
import { getLang, plural, setLang, t } from './i18n'

describe('i18n', () => {
  afterEach(() => setLang('en'))

  it('falls back to English for a missing key and fills placeholders', () => {
    setLang('cs')
    expect(t('a string nobody translated')).toBe('a string nobody translated')
    setLang('en')
    expect(t('peaks in {d} d', { d: 9 })).toBe('peaks in 9 d')
  })

  it('switches language and remembers it', () => {
    setLang('cs')
    expect(getLang()).toBe('cs')
    expect(localStorage.getItem('earth-pulse-lang')).toBe('cs')
    expect(document.documentElement.lang).toBe('cs')
  })

  it('every Czech entry keeps exactly the placeholders of its English key', () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [en, cs] of Object.entries(CS)) {
      expect(vars(cs), en).toEqual(vars(en))
      expect(cs.trim().length, en).toBeGreaterThan(0)
    }
  })

  it('Czech plurals', () => {
    setLang('cs')
    expect([1, 3, 5].map((n) => plural(n, ['day', 'days'], ['den', 'dny', 'dní']))).toEqual(['den', 'dny', 'dní'])
    setLang('en')
    expect(plural(2, ['day', 'days'], ['den', 'dny', 'dní'])).toBe('days')
  })
})
