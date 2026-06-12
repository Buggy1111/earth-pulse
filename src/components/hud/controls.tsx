/** Interactive HUD controls: the mode dock, the quake timeline, loading. */

interface DockAction {
  icon: string
  label: string
  activeLabel: string
  active: boolean
  activeColor: string
  onToggle: () => void
}

/** The Earth-mode dock: solar system, cinematic tour, follow ISS. */
export function EarthDock({
  solarMode,
  tourOn,
  followIss,
  showFollow,
  onSolar,
  onTour,
  onFollow,
}: {
  solarMode: boolean
  tourOn: boolean
  followIss: boolean
  showFollow: boolean
  onSolar: () => void
  onTour: () => void
  onFollow: () => void
}) {
  const actions: DockAction[] = [
    { icon: '🪐', label: 'solar system', activeLabel: 'solar system — exit', active: solarMode, activeColor: 'text-violet-300', onToggle: onSolar },
    { icon: '🎬', label: 'cinematic tour', activeLabel: 'touring — drag to stop', active: tourOn, activeColor: 'text-amber-300', onToggle: onTour },
  ]
  if (showFollow)
    actions.push({ icon: '🛰', label: 'follow ISS', activeLabel: 'following — drag to stop', active: followIss, activeColor: 'text-sky-300', onToggle: onFollow })
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
