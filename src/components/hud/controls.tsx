/** Interactive HUD controls: the mode dock, the quake timeline, loading. */

/** Persistent world switcher — always visible in every mode, so you never get
 * stranded: jump straight Earth ↔ Moon ↔ Solar without backing out first. */
export function ModeSwitcher({
  mode,
  onEarth,
  onMoon,
  onSolar,
}: {
  mode: 'earth' | 'moon' | 'solar'
  onEarth: () => void
  onMoon: () => void
  onSolar: () => void
}) {
  const worlds: { id: 'earth' | 'moon' | 'solar'; icon: string; label: string; color: string; go: () => void }[] = [
    { id: 'earth', icon: '🌍', label: 'Earth', color: 'text-sky-300', go: onEarth },
    { id: 'moon', icon: '🌙', label: 'Moon', color: 'text-slate-200', go: onMoon },
    { id: 'solar', icon: '🪐', label: 'Solar', color: 'text-violet-300', go: onSolar },
  ]
  return (
    <div className="hud pointer-events-auto flex overflow-hidden text-xs">
      {worlds.map((w, i) => {
        const active = mode === w.id
        return (
          <button
            key={w.id}
            type="button"
            onClick={w.go}
            aria-pressed={active}
            title={`${w.label} (${i + 1})`}
            className={`flex cursor-pointer items-center gap-1.5 px-3 py-1.5 transition-colors ${
              i > 0 ? 'border-l border-white/8' : ''
            } ${active ? `bg-white/10 ${w.color}` : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
          >
            <span>{w.icon}</span>
            <span className="hidden sm:inline">{w.label}</span>
          </button>
        )
      })}
    </div>
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
      className="hud pointer-events-auto fixed top-4 right-4 z-20 cursor-pointer px-3 py-1.5 text-sm text-slate-300 hover:text-slate-100"
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
  onHideHud,
}: {
  tourOn: boolean
  followIss: boolean
  showFollow: boolean
  onTour: () => void
  onFollow: () => void
  onHideHud: () => void
}) {
  const actions: DockAction[] = [
    { icon: '🎬', label: 'cinematic tour', activeLabel: 'touring — drag to stop', active: tourOn, activeColor: 'text-amber-300', onToggle: onTour },
  ]
  if (showFollow)
    actions.push({ icon: '🛰', label: 'follow ISS', activeLabel: 'following — drag to stop', active: followIss, activeColor: 'text-sky-300', onToggle: onFollow })
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
          className={`flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left text-xs transition-colors hover:bg-white/5 ${
            i > 0 ? 'border-t border-white/8' : ''
          } ${a.active ? a.activeColor : 'text-slate-400 hover:text-slate-200'}`}
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

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#02030a]">
      <span className="text-3xl">🌍</span>
      <p className="live-dot text-sm text-slate-400">waking up the planet…</p>
    </div>
  )
}
