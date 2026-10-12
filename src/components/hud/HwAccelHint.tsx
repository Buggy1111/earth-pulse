/** A one-time nudge shown only when WebGL is running on the CPU — the browser's
 * hardware acceleration is off, or this GPU is blocklisted. That's the gap
 * between a smooth globe and a slideshow, so we tell the user how to fix it.
 * Dismissible, and remembered so it never nags twice. */

import { useState } from 'react'
import { t } from '../../lib/i18n'

const KEY = 'earth-pulse-hwhint'

export function HwAccelHint() {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '1'
    } catch {
      return true
    }
  })
  if (!show) return null
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      // private mode — it'll just show again next visit
    }
    setShow(false)
  }
  // the positioning lives on a wrapper: `.hud` sets position: relative, which
  // overrode `fixed` on the same element and dropped the banner into the page
  // flow — on top of the corner panels
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[4.75rem] z-20 flex justify-center sm:top-24">
      <div className="hud pointer-events-auto flex max-w-md items-center gap-3 px-4 py-2 text-xs text-amber-200">
        <span>
          ⚠ {t('3D is running on the CPU — turn on')} <b>{t('hardware acceleration')}</b>{' '}
          {t('in your browser settings for a smooth globe.')}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('Dismiss')}
          className="ml-auto shrink-0 cursor-pointer rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-slate-200"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
