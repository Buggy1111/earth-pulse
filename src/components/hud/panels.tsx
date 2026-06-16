/** Read-only HUD panels: title, space weather, quakes, ISS, wiki, overhead. */

import { memo } from 'react'
import {
  formatCoords,
  formatCountdown,
  formatKm,
  formatKmh,
  formatLocalClock,
  formatMag,
  timeAgo,
} from '../../lib/format'
import type { IssPass, OverheadSat } from '../../lib/satellites'
import type { IssState } from '../../lib/iss'
import { quakeStats, type Quake } from '../../lib/quakes'
import { eventCounts, eventMeta, type EarthEvent } from '../../lib/events'
import { SAT_MISSIONS } from '../../lib/missions'
import { GIBS_LAYERS, type GibsLayer } from '../../lib/gibs'
import { kpColor, kpLabel } from '../../lib/spaceWeather'
import type { WikiEdit } from '../../lib/wiki'
import type { SpaceWeather } from '../../hooks'

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

export function TitleCard({
  now,
  satCount,
  subtitle,
}: {
  now: number
  satCount: number
  /** Mode-specific hint; defaults to the Earth overview line. */
  subtitle?: string
}) {
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3 sm:px-5 sm:py-4">
      <h1 className="flex items-baseline gap-3 text-lg font-bold tracking-tight">
        🌍 Earth Pulse
        <span className="num text-xs font-medium text-slate-400">{formatLocalClock(now)}</span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label="Toggle fullscreen"
          title="fullscreen"
          className="cursor-pointer text-sm text-slate-500 hover:text-slate-200"
        >
          ⛶
        </button>
      </h1>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {subtitle ??
          `the planet, live — earthquakes · ${satCount > 0 ? `${satCount} satellites` : 'ISS'} · space weather · Wikipedia`}
      </p>
    </div>
  )
}

export const SpaceWeatherPanel = memo(function SpaceWeatherPanel({
  weather,
  moonLabel,
  onOpenMoon,
}: {
  weather: SpaceWeather
  moonLabel: string
  onOpenMoon: () => void
}) {
  const { kp, wind } = weather
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3 sm:px-5 sm:py-4" style={{ animationDelay: '180ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        ☀️ Space weather
      </h2>
      {kp ? (
        <p className="mt-1 text-xs text-slate-400">
          Kp{' '}
          <span className="num text-xl font-bold" style={{ color: kpColor(kp.kp) }}>
            {kp.kp.toFixed(1)}
          </span>{' '}
          <span style={{ color: kpColor(kp.kp) }}>{kpLabel(kp.kp)}</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">reading magnetometers…</p>
      )}
      {wind && (
        <p className="num mt-0.5 text-xs text-slate-400">
          solar wind {Math.round(wind.speedKms)} km/s
          {Number.isFinite(wind.densityPerCm3) && <> · {wind.densityPerCm3.toFixed(1)} p/cm³</>}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenMoon}
        title="open the interactive Moon — Apollo landing sites & live phase"
        className="mt-0.5 block cursor-pointer text-left text-xs text-slate-400 hover:text-sky-300"
      >
        🌙 moon: {moonLabel} <span className="text-slate-600">· explore ▸</span>
      </button>
      <p className="mt-2 text-[10px] text-slate-600">
        data: NOAA SWPC, refreshed every minute · aurora ovals on the globe scale with Kp
      </p>
    </div>
  )
})

export function AbovePanel({
  overhead,
  onPickSat,
}: {
  overhead: OverheadSat[]
  onPickSat: (id: string, name: string) => void
}) {
  return (
    <div className="hud fade-up pointer-events-auto hidden w-72 px-4 py-3 sm:block">
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        📡 Above you now
      </h2>
      {overhead.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">nothing above 10° right now</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {overhead.slice(0, 5).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPickSat(s.id, s.name)}
                title="show orbit & fly to it"
                className="flex w-full cursor-pointer items-baseline justify-between gap-2 text-left text-xs text-slate-300 hover:text-sky-300"
              >
                <span className="truncate">{s.name}</span>
                <span className="num text-slate-500">{Math.round(s.elevationDeg)}°</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function QuakePanel({
  quakes,
  flashes,
  now,
  onFocusQuake,
  soundOn,
  onToggleSound,
}: {
  quakes: Quake[]
  flashes: Quake[]
  now: number
  onFocusQuake: (quake: Quake) => void
  soundOn: boolean
  onToggleSound: () => void
}) {
  const stats = quakeStats(quakes)
  const fresh = flashes[flashes.length - 1]
  const row = (label: string, q: Quake, accent: string, extra?: string) => (
    <button
      type="button"
      onClick={() => onFocusQuake(q)}
      title="fly there"
      className="block max-w-56 cursor-pointer text-left text-xs text-slate-400 hover:text-slate-200"
    >
      {label}: <span className={accent}>{formatMag(q.mag)}</span> {q.place}
      {extra && <span className="num text-slate-500"> · {extra}</span>}
    </button>
  )
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3 sm:px-5 sm:py-4" style={{ animationDelay: '120ms' }}>
      <h2 className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Earthquakes · last 24 h
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundOn}
          title={soundOn ? 'new-quake sound ping: on' : 'new-quake sound ping: off'}
          className={`cursor-pointer rounded px-1 text-sm normal-case ${
            soundOn ? 'text-emerald-300' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {soundOn ? '🔔' : '🔕'}
        </button>
      </h2>
      <div className="num mt-1 text-3xl font-bold text-amber-300">{stats.count}</div>
      {fresh && (
        <button
          type="button"
          onClick={() => onFocusQuake(fresh)}
          className="slide-in mt-1 block max-w-56 cursor-pointer text-left text-xs"
        >
          <span className="mr-1.5 rounded bg-rose-500/20 px-1 font-bold text-rose-300">NEW</span>
          <span className="text-slate-200">{formatMag(fresh.mag)}</span>{' '}
          <span className="text-slate-400">{fresh.place}</span>
        </button>
      )}
      {stats.latest && (
        <div className="mt-1">{row('latest', stats.latest, 'text-slate-200', timeAgo(stats.latest.time, now))}</div>
      )}
      {stats.strongest && (
        <div className="mt-0.5">{row('strongest', stats.strongest, 'text-rose-300')}</div>
      )}
      <p className="mt-2 text-[10px] text-slate-600">data: USGS, refreshed every minute</p>
    </div>
  )
}

export function DataLayerPanel({
  active,
  onSelect,
  daysBack,
  onScrubDate,
  date,
}: {
  active: GibsLayer | null
  onSelect: (l: GibsLayer | null) => void
  daysBack: number
  onScrubDate: (d: number) => void
  date: string
}) {
  const chip = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded px-2 py-0.5 text-[11px] transition-colors ${
        on ? 'bg-sky-500/25 text-sky-100' : 'bg-white/5 text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3" style={{ animationDelay: '200ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        🛰 NASA data layers
      </h2>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {chip('live', 'live globe', active === null, () => onSelect(null))}
        {GIBS_LAYERS.map((l) => chip(l.id, l.label, active?.id === l.id, () => onSelect(l)))}
      </div>
      {active && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-400">{active.blurb}</p>
          {active.legend && (
            <div className="mt-1.5">
              <div
                className="h-2 w-full rounded"
                style={{ background: `linear-gradient(to right, ${active.legend.stops.join(',')})` }}
              />
              <div className="num mt-0.5 flex justify-between text-[10px] text-slate-400">
                {active.legend.ticks.map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {active.monthly ? (
            <p className="mt-1.5 text-[11px] text-slate-300">
              📅 monthly · <span className="num">{date.slice(0, 7)}</span>
            </p>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="range"
                min={2}
                max={30}
                value={daysBack}
                onChange={(e) => onScrubDate(Number(e.target.value))}
                aria-label="Imagery date, days before now"
                className="h-1 flex-1 cursor-pointer accent-sky-400"
              />
              <span className="num text-[10px] whitespace-nowrap text-slate-300">{date}</span>
            </div>
          )}
          <p className="mt-1 text-[10px] text-slate-600">
            data: NASA GIBS{active.monthly ? '' : ' · slide to replay past days'}
          </p>
        </div>
      )}
    </div>
  )
}

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

