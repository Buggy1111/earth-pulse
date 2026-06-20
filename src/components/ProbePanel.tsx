/** Info card for a clicked deep-space probe — operator, launch, what it does,
 * and its true (unclamped) live distance from the Sun. */

import type { ProbePick } from '../lib/probes'

export function ProbePanel({ pick, onClose }: { pick: ProbePick; onClose: () => void }) {
  return (
    <div className="hud pointer-events-auto w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">🛰 {pick.name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
        >
          ✕ close
        </button>
      </div>
      <p className="num mt-1 text-xs text-slate-400">
        {pick.operator} · launched {pick.launched}
      </p>
      <p className="mt-1.5 text-xs text-slate-300">{pick.blurb}</p>
      <p className="num mt-1.5 text-xs text-emerald-300">
        {pick.sunAu.toFixed(2)} AU from the Sun ·{' '}
        {Math.round(pick.sunKm).toLocaleString('en-US')} km
      </p>
    </div>
  )
}
