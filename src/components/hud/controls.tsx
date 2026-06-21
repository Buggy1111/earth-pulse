/** Interactive HUD controls: the mode dock, the quake timeline, loading. */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { LoaderGlobe } from './LoaderGlobe'

/** Persistent world switcher — always visible in every mode, so you never get
 * stranded: jump straight Earth ↔ Moon ↔ Solar without backing out first. */
export function ModeSwitcher({
  mode,
  onEarth,
  onMoon,
  onSolar,
  onDrift,
}: {
  mode: 'earth' | 'moon' | 'solar' | 'drift'
  onEarth: () => void
  onMoon: () => void
  onSolar: () => void
  onDrift: () => void
}) {
  const worlds: {
    id: 'earth' | 'moon' | 'solar' | 'drift'
    icon: string
    label: string
    go: () => void
  }[] = [
    { id: 'earth', icon: '🌍', label: 'Earth', go: onEarth },
    { id: 'moon', icon: '🌙', label: 'Moon', go: onMoon },
    { id: 'solar', icon: '🪐', label: 'Solar', go: onSolar },
    { id: 'drift', icon: '🗺', label: 'Drift', go: onDrift },
  ]
  return (
    <div className="mode-switch pointer-events-auto text-xs font-medium tracking-wide">
      {worlds.map((w, i) => {
        const active = mode === w.id
        return (
          <button
            key={w.id}
            type="button"
            onClick={w.go}
            aria-pressed={active}
            title={`${w.label} (${i + 1})`}
            className={`mode-seg cursor-pointer ${active ? 'mode-seg-active' : ''}`}
          >
            <span>{w.icon}</span>
            <span className="hidden sm:inline">{w.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Slide-out side panel for phones & tablets: the globe stays clear, an edge
 * tab pulls the panel in from the left or right. */
export function SideDrawer({
  side,
  open,
  onToggle,
  icon,
  title,
  children,
}: {
  side: 'left' | 'right'
  open: boolean
  onToggle: () => void
  icon: string
  title: string
  children: ReactNode
}) {
  const isLeft = side === 'left'
  // data drawer reads sky-cyan, the live/controls drawer reads amber — a glowing
  // edge tab + an accent-lit panel, so the mobile menu matches the sci-fi HUD.
  const accent = isLeft ? '#7dd3fc' : '#fbbf24'
  const scanline =
    'repeating-linear-gradient(0deg, rgba(94,234,255,0.022) 0, rgba(94,234,255,0.022) 1px, transparent 1px, transparent 3px), linear-gradient(158deg, rgba(8,14,28,0.96), rgba(5,9,20,0.9))'
  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Open ${title}`}
          style={{
            background: scanline,
            borderColor: `${accent}66`,
            boxShadow: `0 0 22px -6px ${accent}80, inset 0 1px 0 rgba(125,211,252,0.08)`,
          }}
          className={`pointer-events-auto fixed top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 border py-4 backdrop-blur-md transition-all duration-200 active:scale-95 ${
            isLeft ? 'left-0 rounded-r-xl border-l-0 pr-2 pl-1.5' : 'right-0 rounded-l-xl border-r-0 pr-1.5 pl-2'
          }`}
        >
          <span className="text-lg drop-shadow">{icon}</span>
          <span
            className="text-[9px] font-semibold tracking-[0.25em] uppercase"
            style={{ writingMode: 'vertical-rl', color: accent }}
          >
            {title}
          </span>
          <span className="text-[10px]" style={{ color: accent }}>
            {isLeft ? '▸' : '◂'}
          </span>
        </button>
      )}
      <aside
        style={{
          background: scanline,
          boxShadow: `${isLeft ? '' : '-'}1px 0 0 ${accent}80, 0 0 60px -10px ${accent}40, 0 24px 60px -20px rgba(0,0,0,0.9)`,
          [isLeft ? 'borderRight' : 'borderLeft']: `2px solid ${accent}aa`,
        }}
        className={`pointer-events-auto fixed top-0 bottom-0 z-30 flex w-[min(21rem,90vw)] flex-col gap-3 overflow-y-auto p-3 safe-pt safe-pb backdrop-blur-xl transition-transform duration-300 ease-out ${
          isLeft ? 'left-0 safe-pl' : 'right-0 safe-pr'
        } ${open ? 'translate-x-0' : isLeft ? '-translate-x-full' : 'translate-x-full'}`}
        aria-hidden={!open}
      >
        {/* corner brackets — the HUD signature */}
        <span
          className="pointer-events-none absolute top-1.5 h-2.5 w-2.5 border-t"
          style={{ [isLeft ? 'left' : 'right']: 6, [isLeft ? 'borderLeft' : 'borderRight']: `1px solid ${accent}`, borderTopColor: accent }}
        />
        <div
          className="sticky top-0 -mx-3 -mt-3 mb-1 flex items-center justify-between border-b px-4 py-2.5"
          style={{ borderColor: `${accent}33`, background: 'linear-gradient(180deg, rgba(6,10,22,0.95), rgba(6,10,22,0.4))' }}
        >
          <span
            className="flex items-center gap-1.5 font-[var(--font-mono)] text-[11px] font-semibold tracking-[0.18em] uppercase"
            style={{ color: accent }}
          >
            <span className="text-sm">{icon}</span> {title}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Close ${title}`}
            className="cursor-pointer rounded px-1.5 text-rose-400/80 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
          >
            ✕
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}

/** Tiny floating button to bring the HUD back after a clean (HUD-hidden) view. */
export function ShowHudButton({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      title="show interface (H)"
      aria-label="Show interface"
      className="hud pointer-events-auto fixed top-4 right-4 z-20 cursor-pointer px-3 py-1.5 safe-pt safe-pr text-sm text-slate-300 hover:text-slate-100"
    >
      👁
    </button>
  )
}

interface DockAction {
  icon: string
  label: string
  activeLabel: string
  active: boolean
  activeColor: string
  onToggle: () => void
}

/** The Earth-mode dock: cinematic tour, follow ISS, clean view. */
export function EarthDock({
  tourOn,
  followIss,
  showFollow,
  onTour,
  onFollow,
  onResetView,
  onHideHud,
}: {
  tourOn: boolean
  followIss: boolean
  showFollow: boolean
  onTour: () => void
  onFollow: () => void
  onResetView: () => void
  onHideHud: () => void
}) {
  const actions: DockAction[] = [
    { icon: '🎬', label: 'cinematic tour', activeLabel: 'touring — drag to stop', active: tourOn, activeColor: 'text-amber-300', onToggle: onTour },
  ]
  if (showFollow)
    actions.push({ icon: '🛰', label: 'follow ISS', activeLabel: 'following — drag to stop', active: followIss, activeColor: 'text-sky-300', onToggle: onFollow })
  actions.push({ icon: '⌖', label: 'reset view', activeLabel: 'reset view', active: false, activeColor: '', onToggle: onResetView })
  actions.push({ icon: '👁', label: 'clean view (H)', activeLabel: 'clean view (H)', active: false, activeColor: '', onToggle: onHideHud })
  return <ModeDock actions={actions} />
}

/** Unified vertical dock for the view modes — equal-width, calm, scannable. */
export function ModeDock({ actions }: { actions: DockAction[] }) {
  return (
    <div className="hud pointer-events-auto flex w-72 flex-col overflow-hidden">
      {actions.map((a, i) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onToggle}
          aria-pressed={a.active}
          className={`flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-amber-400/[0.07] ${
            i > 0 ? 'border-t border-white/8' : ''
          } ${a.active ? a.activeColor : 'text-slate-300 hover:text-amber-200'}`}
        >
          <span className="w-5 text-center">{a.icon}</span>
          <span className="truncate">{a.active ? a.activeLabel : a.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 24h earthquake timeline: scrub or replay the day as a film. */
export function TimelinePanel({
  offsetH,
  playing,
  onScrub,
  onTogglePlay,
}: {
  /** Hours relative to now, −24…0 (0 = live). */
  offsetH: number
  playing: boolean
  onScrub: (offsetH: number) => void
  onTogglePlay: () => void
}) {
  const live = offsetH >= 0
  return (
    <div className="hud pointer-events-auto flex w-72 items-center gap-3 px-4 py-2">
      <button
        type="button"
        onClick={onTogglePlay}
        aria-label={playing ? 'Pause replay' : 'Replay last 24 h'}
        title="replay the last 24 h of earthquakes"
        className="cursor-pointer text-sm text-sky-300 hover:text-sky-200"
      >
        {playing ? '⏸' : '▶'}
      </button>
      <input
        type="range"
        min={-24}
        max={0}
        step={0.25}
        value={offsetH}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Earthquake timeline, hours before now"
        className="h-1 flex-1 cursor-pointer accent-amber-400"
      />
      <span className={`num w-14 text-xs ${live ? 'text-emerald-300' : 'text-amber-300'}`}>
        {live ? '● LIVE' : `−${Math.abs(offsetH).toFixed(1)} h`}
      </span>
    </div>
  )
}

/** Cinematic intro: a glowing Earth orbited by neon satellites, a shimmering
 * wordmark and a starfield. When `done`, it fades out and unmounts itself,
 * revealing the live globe. */
export function LoadingOverlay({ done = false }: { done?: boolean }) {
  const [gone, setGone] = useState(false)
  // keep the intro on screen long enough to be seen, even when the globe is
  // ready almost instantly (cached assets) — then fade out
  const [minDone, setMinDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 1700)
    return () => clearTimeout(t)
  }, [])
  const fade = done && minDone
  useEffect(() => {
    if (!fade) return
    const t = setTimeout(() => setGone(true), 850)
    return () => clearTimeout(t)
  }, [fade])
  if (gone) return null
  // a short boot log that types itself in, line by line — the staggered delay
  // is set per row so it reads like a console coming online
  const boot: [string, string][] = [
    ['satellite catalogue · linked', 'ok'],
    ['USGS seismic feed · live', 'ok'],
    ['NOAA space weather · online', 'ok'],
    ['NASA imagery layers · ready', 'ok'],
  ]
  return (
    <div
      className={`ep-loader fixed inset-0 z-50 flex flex-col items-center justify-center gap-9 bg-[#02030a] ${
        fade ? 'ep-loader-done' : ''
      }`}
    >
      <div className="ep-stars" />
      <span className="ep-frame ep-frame-tl" />
      <span className="ep-frame ep-frame-tr" />
      <span className="ep-frame ep-frame-bl" />
      <span className="ep-frame ep-frame-br" />

      <LoaderGlobe />

      <div className="relative flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="ep-wordmark text-2xl font-semibold tracking-[0.38em] sm:text-3xl">EARTH PULSE</h1>
          <p className="ep-subtitle">orbital telemetry console</p>
        </div>

        <div className="ep-boot">
          {boot.map(([label, tag], i) => (
            <p key={label} style={{ '--d': `${0.2 + i * 0.22}s` } as CSSProperties}>
              <span className="arrow">▸</span> {label} <b>{tag}</b>
            </p>
          ))}
          <p style={{ '--d': `${0.2 + boot.length * 0.22}s` } as CSSProperties}>
            <span className="arrow">▸</span> rendering globe<span className="ep-dots" />
          </p>
        </div>

        <div className="ep-progress">
          <i />
        </div>
      </div>
    </div>
  )
}
