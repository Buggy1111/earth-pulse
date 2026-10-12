/** Info panel for Moon mode — you're orbiting the real Moon in the main
 * scene; this shows live facts and the landing site you tapped. */

import { APOLLO_SITES, LUNAR_SITES, type LunarSite, type MoonState } from '../lib/moon'
import { HudCard } from './hud/HudCard'
import { locale, t } from '../lib/i18n'

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
          🌙 {t('Orbiting the Moon')}
        </h2>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
        >
          ← {t('back to Earth')}
        </button>
      </div>
      <p className="num mt-1 text-xs text-slate-400">
        {t('{km} km from Earth', { km: Math.round(moon.distanceKm).toLocaleString(locale()) })} ·{' '}
        {t('{pct} % lit', { pct: Math.round(moon.illumination * 100) })}
      </p>
      {picked ? (
        <div className="mt-1.5 space-y-0.5 text-xs">
          <p className="text-emerald-300">
            🚩 <b>{picked.mission}</b> ({picked.year}) · {picked.operator}
            {picked.side === 'far' && (
              <span className="ml-1.5 rounded bg-rose-500/20 px-1 py-px text-[10px] text-rose-200">
                {t('far side')}
              </span>
            )}
          </p>
          <p className="text-slate-400">{t(picked.note)}</p>
          {picked.crew && (
            <p className="text-slate-400">
              {t('crew')} · {picked.crew}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">
          {t(
            'the flags mark {n} landing sites — the {apollo} crewed Apollo missions plus milestone robotic landers, including the two Chinese far-side firsts on the hemisphere that never faces Earth (orbit around to find them). Tap a flag.',
            { n: LUNAR_SITES.length, apollo: APOLLO_SITES.length },
          )}
        </p>
      )}
    </HudCard>
  )
}
