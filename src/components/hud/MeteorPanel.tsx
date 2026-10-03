/** ☄️ Meteor showers: what's raining now and what's next, with a countdown to
 * each peak, how much moonlight will spoil it, and — when we know where you
 * are — how high the radiant is right now and roughly how many you'd see. */

import { useMemo, useState } from 'react'
import { HudCard } from './HudCard'
import { subLunarPoint } from '../../lib/moon'
import {
  expectedRate,
  outlook,
  peakLabel,
  radiantAt,
  radiantElevationDeg,
  skyQuality,
  type ShowerOutlook,
  type SkyQuality,
} from '../../lib/meteors'

const QUALITY: Record<SkyQuality, { text: string; cls: string }> = {
  dark: { text: 'dark sky', cls: 'text-emerald-300' },
  fair: { text: 'some moonlight', cls: 'text-amber-300' },
  'washed-out': { text: 'moon washes it out', cls: 'text-rose-300' },
}

function Row({
  o,
  now,
  userLoc,
  open,
  onToggle,
}: {
  o: ShowerOutlook
  now: number
  userLoc: { lat: number; lng: number } | null
  open: boolean
  onToggle: () => void
}) {
  const s = o.shower
  const q = QUALITY[skyQuality(subLunarPoint(o.peak).illumination)]
  const r = radiantAt(s, new Date(now))
  const elev = userLoc ? radiantElevationDeg(userLoc, new Date(now), r.raDeg, r.decDeg) : null
  const hot = o.status === 'peaking'
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-baseline justify-between gap-2 rounded px-1 py-0.5 text-left text-xs transition-colors hover:bg-white/10"
      >
        <span className={hot ? 'font-semibold text-cyan-200' : 'text-slate-200'}>
          {hot && <span className="live-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 align-middle" />}
          {s.name}
        </span>
        <span className={`num shrink-0 ${hot ? 'text-cyan-300' : 'text-slate-400'}`}>{peakLabel(o)}</span>
      </button>
      {open && (
        <div className="mt-0.5 mb-1 ml-1 border-l border-white/10 pl-2 text-[11px] leading-snug text-slate-400">
          <p className="text-slate-300">{s.blurb}</p>
          <p className="mt-0.5">
            ZHR <span className="num text-slate-200">{s.zhr}</span> · {s.speedKms} km/s · from {s.parent}
          </p>
          <p>
            peak ~{o.peak.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ·{' '}
            <span className={q.cls}>{q.text}</span>
          </p>
          <p>
            radiant RA {(r.raDeg / 15).toFixed(1)}h, Dec {r.decDeg >= 0 ? '+' : ''}
            {r.decDeg.toFixed(0)}°
            {elev !== null &&
              o.status !== 'upcoming' &&
              (elev > 0 ? (
                <>
                  {' '}
                  — <span className="num text-slate-200">{Math.round(elev)}°</span> up now, ≈
                  <span className="num text-slate-200"> {expectedRate(s.zhr, elev)}</span>/h
                </>
              ) : (
                <> — below your horizon now</>
              ))}
          </p>
        </div>
      )}
    </li>
  )
}

export function MeteorPanel({
  now,
  userLoc,
}: {
  now: number
  userLoc: { lat: number; lng: number } | null
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  // showers move on a scale of days — recompute per hour, not per frame
  const hour = Math.floor(now / 3_600_000)
  const list = useMemo(() => outlook(new Date(hour * 3_600_000)).slice(0, 4), [hour])
  return (
    <HudCard className="w-72 px-4 py-3 sm:px-5 sm:py-3.5" delay={240}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">☄️ Meteor showers</h2>
      <ul className="mt-1.5 space-y-0.5">
        {list.map((o) => (
          <Row
            key={o.shower.id}
            o={o}
            now={now}
            userLoc={userLoc}
            open={openId === o.shower.id}
            onToggle={() => setOpenId(openId === o.shower.id ? null : o.shower.id)}
          />
        ))}
      </ul>
    </HudCard>
  )
}
