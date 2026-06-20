/** The shared HUD panel shell: the glassmorphic `hud` chrome, a consistent
 * fade-up entrance and pointer events. Width / padding / responsive visibility
 * stay per-panel via `className`; `delay` staggers the entrance. One place to
 * evolve the panel chrome, so every card reads as one design language. */

import type { CSSProperties, ReactNode } from 'react'

export function HudCard({
  className = '',
  delay,
  style,
  children,
}: {
  className?: string
  /** Stagger the fade-up entrance, in ms. */
  delay?: number
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      className={`hud fade-up pointer-events-auto ${className}`}
      style={delay !== undefined ? { animationDelay: `${delay}ms`, ...style } : style}
    >
      {children}
    </div>
  )
}
