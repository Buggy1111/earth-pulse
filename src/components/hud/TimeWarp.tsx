/** Shared time-warp control — speeds the simulated clock so the Moon, the
 * day/night terminator and the satellites visibly move. At live (×1) the Moon
 * drifts only ~14°/h (real lunar rate), so it looks frozen; warp lets you watch
 * it orbit. Used in both the Earth and Solar views. */

const WARPS: { label: string; factor: number }[] = [
  { label: 'live', factor: 1 },
  { label: '1 h/s', factor: 3_600 },
  { label: '1 d/s', factor: 86_400 },
  { label: '1 w/s', factor: 604_800 },
]

export function TimeWarp({
  now,
  realNow,
  warp,
  onWarp,
  onWarpReset,
}: {
  /** Simulated time (warped). */
  now: number
  /** Real wall-clock time, for the "are we off the live moment" check. */
  realNow: number
  warp: number
  onWarp: (factor: number) => void
  onWarpReset: () => void
}) {
  const warped = warp !== 1 || Math.abs(now - realNow) > 120_000
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[10px] tracking-wide text-slate-400 uppercase">⏩ time</span>
        {WARPS.map((w) => (
          <button
            key={w.factor}
            type="button"
            onClick={() => (w.factor === 1 && warped ? onWarpReset() : onWarp(w.factor))}
            className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] ${
              warp === w.factor
                ? 'bg-violet-500/25 text-violet-200'
                : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {warped && (
        <p className="num text-xs text-amber-300">
          ⏱{' '}
          {new Date(now).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          <button
            type="button"
            onClick={onWarpReset}
            className="cursor-pointer text-slate-400 underline hover:text-slate-300"
          >
            back to now
          </button>
        </p>
      )}
    </div>
  )
}
