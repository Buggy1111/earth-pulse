/** Info panel for Moon mode — you're orbiting the real Moon in the main
 * scene; this shows live facts and the Apollo site you tapped. */

import { APOLLO_SITES, type ApolloSite, type MoonState } from '../lib/moon'

export function MoonPanel({
  moon,
  picked,
  onBack,
}: {
  moon: MoonState
  picked: ApolloSite | null
  onBack: () => void
}) {
  return (
    <div className="hud pointer-events-auto w-72 px-4 py-3">
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
        <p className="mt-1.5 text-xs text-emerald-300">
          🚩 <b>{picked.mission}</b> ({picked.year}) — {picked.crew}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-500">
          green flags = the {APOLLO_SITES.length} Apollo landings, every place humans have ever
          stood beyond Earth — tap one. Drag to orbit, scroll to zoom; Earth hangs in the sky
          behind you.
        </p>
      )}
    </div>
  )
}
