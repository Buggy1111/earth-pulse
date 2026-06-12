/** Interactive HUD controls: toggles, mode buttons, the quake timeline. */

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        on ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {on ? '🔔 quake ping on' : '🔕 quake ping off'}
    </button>
  )
}

export function FollowIssButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        active ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {active ? '🛰 following ISS — drag to stop' : '🛰 follow ISS'}
    </button>
  )
}


export function SolarButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        active ? 'text-violet-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {active ? '🪐 solar system — back to Earth' : '🪐 solar system'}
    </button>
  )
}

export function TourButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        active ? 'text-amber-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {active ? '🎬 touring — drag to stop' : '🎬 cinematic tour'}
    </button>
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
    <div className="hud pointer-events-auto flex items-center gap-3 px-4 py-2">
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
        className="h-1 w-40 cursor-pointer accent-amber-400 sm:w-56"
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
