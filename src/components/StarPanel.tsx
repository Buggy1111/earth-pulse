/** Info card for a clicked star — how far (and so how old its light is), what
 * kind of star it is, and a claim to fame for the famous ones. */

import { spectralDesc, STAR_FACTS, type StarPick } from '../lib/stars'

export function StarPanel({ star, onClose }: { star: StarPick; onClose: () => void }) {
  const left = star.distLy > 0 ? new Date().getUTCFullYear() - Math.round(star.distLy) : 0
  return (
    <div className="hud pointer-events-auto w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">⭐ {star.name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
        >
          ✕ close
        </button>
      </div>
      {star.distLy > 0 && (
        <p className="num mt-1 text-xs text-emerald-300">
          {star.distLy} light-years away · the light you see left it in {left}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-300">
        {spectralDesc(star.spect)}
        {star.spect.trim() ? ` (${star.spect.trim()})` : ''}
        {star.mag ? ` · magnitude ${star.mag}` : ''}
      </p>
      {STAR_FACTS[star.name] && <p className="mt-1 text-xs text-slate-400">✨ {STAR_FACTS[star.name]}</p>}
    </div>
  )
}
