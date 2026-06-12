/** Info panel for Solar System mode — overview facts or the picked body. */

import { PLANETS, planetPositions } from '../lib/planets'

const AU_KM = 149_597_870

export function PlanetPanel({
  focus,
  now,
  onOverview,
  onBack,
}: {
  /** Planet id, 'sun', or null for the system overview. */
  focus: string | null
  now: number
  onOverview: () => void
  onBack: () => void
}) {
  const positions = planetPositions(new Date(now))
  const p = focus && focus !== 'sun' ? positions.find((x) => x.id === focus) : null
  const def = p ? PLANETS.find((x) => x.id === p.id) : null
  return (
    <div className="hud pointer-events-auto max-w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
          🪐 {focus === 'sun' ? 'The Sun' : (p?.name ?? 'Solar system · live')}
        </h2>
        <div className="flex gap-2">
          {focus && (
            <button
              type="button"
              onClick={onOverview}
              className="cursor-pointer text-xs text-violet-300 hover:text-violet-200"
            >
              ⊙ overview
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
          >
            ← Earth
          </button>
        </div>
      </div>
      {p && def ? (
        <div className="num mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span>☀️ {p.distSunAu.toFixed(2)} AU from the Sun</span>
          <span>
            🌍 {p.distEarthAu.toFixed(2)} AU from Earth ·{' '}
            {Math.round(p.distEarthAu * AU_KM / 1e6).toLocaleString('en-US')} mil. km
          </span>
          <span>⌀ {def.diameterKm.toLocaleString('en-US')} km</span>
        </div>
      ) : focus === 'sun' ? (
        <p className="mt-1 text-xs text-slate-400">
          ⌀ 1,392,700 km · 99.86 % of the system's mass · light takes ~8 min to reach Earth
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          all 7 planets at their real positions for right now (Earth is the big one you came
          from). Click any body to orbit it; rings trace the orbits — distances compressed so
          Neptune fits on screen.
        </p>
      )}
    </div>
  )
}
