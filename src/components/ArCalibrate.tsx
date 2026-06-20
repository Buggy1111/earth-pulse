/** The Sky AR calibration control: a 🧭 toggle plus a pad to nudge the overlay
 * until a known object (the Moon, a bright planet) sits on its marker. Owns its
 * own open state; the persisted offset lives in useArCalibration. */

import { useState } from 'react'
import { BTN_BASE } from './arButtonStyle'
import type { Calib } from './useArCalibration'

const sign = (n: number) => `${n > 0 ? '+' : ''}${n}°`

export function ArCalibrate({
  calib,
  onNudge,
  onReset,
}: {
  calib: Calib
  onNudge: (dHeading: number, dPitch: number) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const pad: React.CSSProperties = { ...BTN_BASE, padding: '8px 13px', fontSize: 16, lineHeight: 1 }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...BTN_BASE, position: 'absolute', left: 12, bottom: 34, padding: '8px 12px', zIndex: 50 }}
        aria-label="Calibrate sky AR alignment"
      >
        🧭 align
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 76,
            transform: 'translateX(-50%)',
            zIndex: 70,
            background: 'rgba(2,6,16,0.88)',
            border: '1px solid #38bdf8',
            borderRadius: 14,
            padding: 14,
            textAlign: 'center',
            color: '#e4e7ec',
            font: '500 12px system-ui',
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ marginBottom: 9, opacity: 0.85 }}>point at the Moon, then line it up</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
            <button type="button" onClick={() => onNudge(-1, 0)} style={pad} aria-label="nudge left">◀</button>
            <span style={{ minWidth: 104, font: '600 12px ui-monospace, monospace', color: '#bae6fd' }}>
              az {sign(calib.heading)} · el {sign(calib.pitch)}
            </span>
            <button type="button" onClick={() => onNudge(1, 0)} style={pad} aria-label="nudge right">▶</button>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            <button type="button" onClick={() => onNudge(0, 1)} style={pad} aria-label="nudge up">▲</button>
            <button type="button" onClick={() => onNudge(0, -1)} style={pad} aria-label="nudge down">▼</button>
            <button type="button" onClick={onReset} style={{ ...BTN_BASE, padding: '8px 13px' }}>reset</button>
            <button type="button" onClick={() => setOpen(false)} style={{ ...BTN_BASE, padding: '8px 13px' }}>done</button>
          </div>
        </div>
      )}
    </>
  )
}
