/** Tiny i18n: Czech + English. The ENGLISH text is the key — `t('Meteor showers')`
 * — so a missing Czech entry simply shows English instead of a blank or a crash,
 * and the source still reads naturally. `{name}` placeholders are filled from
 * `vars`. The language lives in a module store (plain functions can call `t()`
 * too); React components subscribe with `useLang()` so a switch re-renders them.
 * Default: Czech for cs/sk browsers, English otherwise; the choice is remembered. */

import { useSyncExternalStore } from 'react'
import { CS } from './i18n.cs'

export type Lang = 'cs' | 'en'
const KEY = 'earth-pulse-lang'

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'cs' || saved === 'en') return saved
  } catch {
    // private mode — fall through to the browser language
  }
  const nav = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : ''
  return /^(cs|sk)\b/i.test(nav) ? 'cs' : 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    // not persisted in private mode — fine for this visit
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  for (const l of listeners) l()
}

if (typeof document !== 'undefined') document.documentElement.lang = current

/** BCP-47 locale for dates and numbers in the current language. */
export function locale(): string {
  return current === 'cs' ? 'cs-CZ' : 'en-GB'
}

/** Translate an English UI string (the key) into the current language. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const s = current === 'cs' ? (CS[en] ?? en) : en
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** Czech plural form: 1 → one, 2–4 → few, else many ("1 den / 2 dny / 5 dní"). */
export function plural(n: number, en: [string, string], cs: [string, string, string]): string {
  if (current !== 'cs') return n === 1 ? en[0] : en[1]
  const a = Math.abs(n)
  return a === 1 ? cs[0] : a >= 2 && a <= 4 ? cs[1] : cs[2]
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** Subscribe a component to language switches; returns the current language. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}
