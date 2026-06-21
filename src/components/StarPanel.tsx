/** Info card for a clicked star — how far (and so how old its light is), what
 * kind of star it is, and a claim to fame for the famous ones. */

import { spectralDesc, STAR_FACTS, type StarPick } from '../lib/stars'
import { STAR_PHOTOS } from '../lib/starLook'
import { HudCard } from './hud/HudCard'

export function StarPanel({ star, onClose }: { star: StarPick; onClose: () => void }) {
  const left = star.distLy > 0 ? new Date().getUTCFullYear() - Math.round(star.distLy) : 0
  const photo = STAR_PHOTOS[star.name]
  return (
    <HudCard className="w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">⭐ {star.name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
        >
          ✕ back to sky
        </button>
      </div>
      {photo && (
        <figure className="mt-2">
          <img
            src={`stars/cards/${photo.slug}.webp`}
            alt={`${star.name} — real telescope image`}
            loading="lazy"
            className="max-h-40 w-full rounded-lg object-cover"
            onError={(e) => {
              ;(e.currentTarget.parentElement as HTMLElement).style.display = 'none'
            }}
          />
          <figcaption className="mt-0.5 text-[10px] text-slate-400">📷 {photo.credit}</figcaption>
        </figure>
      )}
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
    </HudCard>
  )
}
