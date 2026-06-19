/** The floating "sky AR" launch button + the pill-button styling it shares with
 * the AR overlay. Split out of ArSky.tsx so the overlay component stays lean. */

import type React from 'react'
import { BTN_BASE } from './arButtonStyle'

function arSupported(): boolean {
  if (typeof window === 'undefined') return false
  // phones/tablets only — a touch-primary device. Desktop (mouse) exposes the
  // DeviceOrientation API too but has no real sensors, so AR there is pointless.
  return window.matchMedia('(pointer: coarse)').matches
}
const SUPPORTED = arSupported()

/** Floating entry button — hidden on devices that can't do AR. */
export function ArLaunchButton({ onOpen }: { onOpen: () => void }): React.ReactElement | null {
  if (!SUPPORTED) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ ...BTN_BASE, position: 'fixed', right: 12, bottom: 88, padding: '8px 14px', zIndex: 40 }}
      aria-label="Open sky AR — point your phone at the sky"
    >
      📡 sky AR
    </button>
  )
}
