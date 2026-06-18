/** Live/detail HUD panels: mission card, EONET events, ISS, Wikipedia, quake
 * detail. Split out of panels.tsx to keep each file under the 400-line ADR. */

import { memo } from 'react'
import { formatCoords, formatCountdown, formatKm, formatKmh, formatMag, timeAgo } from '../../lib/format'
import type { IssPass } from '../../lib/satellites'
import type { IssState } from '../../lib/iss'
import type { Quake } from '../../lib/quakes'
import { eventCounts, eventMeta, type EarthEvent } from '../../lib/events'
import { SAT_MISSIONS } from '../../lib/missions'
import type { WikiEdit } from '../../lib/wiki'

export function MissionCard({ name, onClose }: { name: string; onClose: () => void }) {
  const m = SAT_MISSIONS[name]
  if (!m) return null
  return (
    <div
      className="hud fade-up pointer-events-auto w-72 px-4 py-3"
      style={{ borderColor: `${m.color}66`, animationDelay: '60ms' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-100">🛰 {name}</h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-xs text-slate-500 hover:text-slate-200"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-xs font-medium" style={{ color: m.color }}>
        {m.measures}
      </p>
      <p className="mt-1.5 text-xs text-slate-400">🏛 {m.agency}</p>
      <p className="mt-0.5 text-xs text-slate-400">🚀 launched {m.launched}</p>
      <p className="mt-0.5 text-xs text-slate-400">🛰 {m.orbit}</p>
      <p className="mt-1.5 text-xs text-slate-300">✨ {m.fact}</p>
    </div>
  )
}

export function EventsPanel({
  events,
  onEventClick,
}: {
  events: EarthEvent[]
  onEventClick: (e: EarthEvent) => void
}) {
  if (events.length === 0) return null
  const counts = eventCounts(events)
  const latest = events[0]
  const lm = eventMeta(latest.category)
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3" style={{ animationDelay: '160ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Live on Earth · {events.length}
      </h2>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {counts.map(({ category, count }) => {
          const m = eventMeta(category)
          return (
            <span key={category} className="num text-xs text-slate-300" title={m.label}>
              {m.icon} {count}
            </span>
          )
        })}
      </div>
      <button
        type="button"
        onClick={() => onEventClick(latest)}
        title="fly there"
        className="mt-1 block max-w-60 cursor-pointer text-left text-xs text-slate-400 hover:text-slate-200"
      >
        latest: {lm.icon} <span className="text-slate-200">{latest.title}</span>
      </button>
      <p className="mt-2 text-[10px] text-slate-600">data: NASA EONET, live natural events</p>
    </div>
  )
}

export function IssPanel({
  iss,
  pass,
  now,
}: {
  iss: IssState | null
  pass: IssPass | null
  now: number
}) {
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3 sm:px-5 sm:py-4" style={{ animationDelay: '240ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        🛰 ISS right now
      </h2>
      {iss ? (
        <>
          <div className="num mt-1 text-xl font-bold text-sky-300">{formatKmh(iss.velocityKmh)}</div>
          <p className="num mt-0.5 text-xs text-slate-400">
            {formatKm(iss.altitudeKm)} above {formatCoords(iss.lat, iss.lng)} ·{' '}
            {iss.visibility === 'daylight' ? 'in sunlight' : 'in shadow'}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">acquiring signal…</p>
      )}
      {pass && (
        <p className="mt-1.5 text-xs text-emerald-300">
          {pass.startMs <= now ? (
            <>✨ over your location right now!</>
          ) : (
            <>
              over your location in{' '}
              <span className="num font-semibold">{formatCountdown(pass.startMs - now)}</span>
              <span className="num text-slate-400"> · max {Math.round(pass.maxElevationDeg)}°</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}

export const WikiPanel = memo(function WikiPanel({
  edits,
  totalSeen,
}: {
  edits: WikiEdit[]
  totalSeen: number
}) {
  return (
    <div
      className="hud fade-up pointer-events-auto hidden w-72 px-5 py-4 md:block"
      style={{ animationDelay: '360ms' }}
    >
      <h2 className="flex items-baseline justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Wikipedia, live
        <span className="num text-[10px] font-normal text-slate-500 normal-case">
          {totalSeen} edits while you watch
        </span>
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {edits.length === 0 && <li className="text-xs text-slate-500">listening…</li>}
        {edits.map((e, i) => (
          <li key={`${e.url}-${i}`} className={i === 0 ? 'slide-in' : ''}>
            <a
              // only follow https links — never let a javascript:/data: URL from
              // the live stream become a clickable href
              href={e.url.startsWith('https://') ? e.url : undefined}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-slate-300 hover:text-sky-300"
              style={{ opacity: 1 - i * 0.11 }}
            >
              <span className="mr-1.5 rounded bg-white/10 px-1 text-[10px] text-slate-400">
                {e.wiki}
              </span>
              {e.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
})

export function QuakeDetail({ quake, now, onClose }: { quake: Quake; now: number; onClose: () => void }) {
  return (
    <div className="hud pointer-events-auto w-72 px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="num text-2xl font-bold text-amber-300">{formatMag(quake.mag)}</div>
          <p className="mt-0.5 max-w-64 text-sm text-slate-200">{quake.place}</p>
          <p className="num mt-1 text-xs text-slate-400">
            depth {quake.depthKm.toFixed(0)} km · {timeAgo(quake.time, now)} ·{' '}
            {formatCoords(quake.lat, quake.lng)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="cursor-pointer rounded-lg px-2 py-1 text-slate-400 hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
