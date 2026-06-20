/** Info panel for Moon mode — you're orbiting the real Moon in the main
 * scene; this shows live facts and the landing site you tapped. */

import { APOLLO_SITES, LUNAR_SITES, type LunarSite, type MoonState } from '../lib/moon'
import { HudCard } from './hud/HudCard'

export function MoonPanel({
  moon,
  picked,
  onBack,
}: {
  moon: MoonState
  picked: LunarSite | null
  onBack: () => void
}) {
  return (
    <HudCard className="w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
          🌙 Orbiting the Moon
        </h2>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
        >
          ← back to Earth
        </button>
      </div>
      <p className="num mt-1 text-xs text-slate-400">
        {Math.round(moon.distanceKm).toLocaleString('en-US')} km from Earth ·{' '}
        {Math.round(moon.illumination * 100)} % lit
      </p>
      {picked ? (
        <div className="mt-1.5 space-y-0.5 text-xs">
          <p className="text-emerald-300">
            🚩 <b>{picked.mission}</b> ({picked.year}) · {picked.operator}
            {picked.side === 'far' && (
              <span className="ml-1.5 rounded bg-rose-500/20 px-1 py-px text-[10px] text-rose-200">
                far side
              </span>
            )}
          </p>
          <p className="text-slate-400">{picked.note}</p>
          {picked.crew && <p className="text-slate-500">crew · {picked.crew}</p>}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          the flags mark {LUNAR_SITES.length} landing sites — the {APOLLO_SITES.length} crewed
          Apollo missions plus milestone robotic landers, including the two Chinese far-side
          firsts on the hemisphere that never faces Earth (orbit around to find them). Tap a flag.
        </p>
      )}
    </HudCard>
  )
}
