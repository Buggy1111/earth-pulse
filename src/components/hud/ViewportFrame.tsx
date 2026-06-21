/** The viewport frame — Earth Pulse's signature chrome. Four glowing brackets
 * pin the screen corners so the live globe sits inside a spacecraft viewport,
 * a faint scanline veil falls over the edges, and a mission-control status
 * read-out runs along the bottom. Pure decoration: it never eats a click and
 * unmounts with the rest of the HUD in clean view. */

import { formatLocalClock } from '../../lib/format'

const MODE_LABEL: Record<'earth' | 'moon' | 'solar' | 'drift', string> = {
  earth: 'earth orbit',
  moon: 'lunar approach',
  solar: 'heliocentric',
  drift: 'deep time',
}

export function ViewportFrame({
  mode,
  now,
  satCount,
}: {
  mode: 'earth' | 'moon' | 'solar' | 'drift'
  now: number
  /** Tracked-object count, shown as the telemetry payload. */
  satCount: number
}) {
  return (
    <div className="vf" aria-hidden>
      <div className="vf-scan" />
      <span className="vf-corner vf-tl" />
      <span className="vf-corner vf-tr" />
      <span className="vf-corner vf-bl" />
      <span className="vf-corner vf-br" />

      {/* mission-control status line — visibility is owned by the .vf-status CSS
          (display:none below 1024px), NOT a Tailwind `hidden` class: that rule
          loads after the utilities and would lose the cascade, so `hidden` never
          actually hid it. Shown only on the ≥1024px desktop layout. */}
      <div className="vf-status">
        <span className="vf-online" />
        <b>systems nominal</b>
        <span className="sep">/</span>
        <span>{MODE_LABEL[mode]}</span>
        <span className="sep">/</span>
        <span>
          tracking <b>{satCount > 0 ? satCount : '—'}</b> objects
        </span>
        <span className="sep">/</span>
        <span className="num" style={{ letterSpacing: '0.18em' }}>
          {formatLocalClock(now)}
        </span>
      </div>
    </div>
  )
}
