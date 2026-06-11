import { formatCoords, formatKm, formatKmh, formatMag, timeAgo } from '../lib/format'
import type { IssState } from '../lib/iss'
import { quakeStats, type Quake } from '../lib/quakes'
import type { WikiEdit } from '../lib/wiki'

export function TitleCard() {
  return (
    <div className="hud fade-up pointer-events-auto px-5 py-4">
      <h1 className="text-lg font-bold tracking-tight">
        🌍 Earth Pulse
      </h1>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
        the planet, live — earthquakes · ISS · day &amp; night · Wikipedia
      </p>
    </div>
  )
}

export function QuakePanel({ quakes, now }: { quakes: Quake[]; now: number }) {
  const stats = quakeStats(quakes)
  return (
    <div className="hud fade-up pointer-events-auto px-5 py-4" style={{ animationDelay: '120ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Earthquakes · last 24 h
      </h2>
      <div className="num mt-1 text-3xl font-bold text-amber-300">{stats.count}</div>
      {stats.latest && (
        <p className="mt-1 max-w-56 text-xs text-slate-400">
          latest: <span className="text-slate-200">{formatMag(stats.latest.mag)}</span>{' '}
          {stats.latest.place}
          <span className="num text-slate-500"> · {timeAgo(stats.latest.time, now)}</span>
        </p>
      )}
      {stats.strongest && (
        <p className="mt-0.5 max-w-56 text-xs text-slate-400">
          strongest: <span className="text-rose-300">{formatMag(stats.strongest.mag)}</span>{' '}
          {stats.strongest.place}
        </p>
      )}
      <p className="mt-2 text-[10px] text-slate-600">data: USGS, refreshed every minute</p>
    </div>
  )
}

export function IssPanel({ iss }: { iss: IssState | null }) {
  return (
    <div className="hud fade-up pointer-events-auto px-5 py-4" style={{ animationDelay: '240ms' }}>
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
    </div>
  )
}

export function WikiPanel({ edits, totalSeen }: { edits: WikiEdit[]; totalSeen: number }) {
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-5 py-4" style={{ animationDelay: '360ms' }}>
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
              href={e.url}
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
}

export function QuakeDetail({ quake, now, onClose }: { quake: Quake; now: number; onClose: () => void }) {
  return (
    <div className="hud pointer-events-auto px-5 py-4">
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
