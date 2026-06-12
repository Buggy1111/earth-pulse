import { memo, useState } from 'react'
import {
  formatCoords,
  formatCountdown,
  formatKm,
  formatKmh,
  formatMag,
  formatUtcClock,
  timeAgo,
} from '../lib/format'
import type { IssPass } from '../lib/satellites'
import type { IssState } from '../lib/iss'
import { quakeStats, type Quake } from '../lib/quakes'
import { kpColor, kpLabel } from '../lib/spaceWeather'
import type { WikiEdit } from '../lib/wiki'
import type { SpaceWeather } from '../hooks'

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

export function TitleCard({ now, satCount }: { now: number; satCount: number }) {
  return (
    <div className="hud fade-up pointer-events-auto px-5 py-4">
      <h1 className="flex items-baseline gap-3 text-lg font-bold tracking-tight">
        🌍 Earth Pulse
        <span className="num text-xs font-medium text-slate-400">{formatUtcClock(now)}</span>
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
        the planet, live — earthquakes · {satCount > 0 ? `${satCount} satellites` : 'ISS'} · space
        weather · Wikipedia
      </p>
    </div>
  )
}

export const SpaceWeatherPanel = memo(function SpaceWeatherPanel({
  weather,
}: {
  weather: SpaceWeather
}) {
  const { kp, wind } = weather
  return (
    <div className="hud fade-up pointer-events-auto px-5 py-4" style={{ animationDelay: '180ms' }}>
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
      <p className="mt-2 text-[10px] text-slate-600">
        data: NOAA SWPC, refreshed every minute · aurora ovals on the globe scale with Kp
      </p>
    </div>
  )
})

export interface LayerState {
  sats: boolean
  iss: boolean
  quakes: boolean
  aurora: boolean
  clouds: boolean
  borders: boolean
  detail: boolean
}

export interface OrbitEntry {
  id: string
  name: string
}

const LAYER_LABELS: { key: keyof LayerState; label: string }[] = [
  { key: 'sats', label: '🛰 satellites' },
  { key: 'iss', label: '🛰 ISS' },
  { key: 'quakes', label: '🌋 earthquakes' },
  { key: 'aurora', label: '🌌 aurora' },
  { key: 'clouds', label: '☁️ clouds' },
  { key: 'borders', label: '🗺 country borders' },
  { key: 'detail', label: '🔎 hi-res zoom imagery' },
]

export function SettingsPanel({
  layers,
  onToggleLayer,
  orbits,
  onRemoveOrbit,
  onClearOrbits,
  satList,
  onPickSat,
  eco,
  onToggleEco,
  userLoc,
  locating,
  onLocate,
}: {
  layers: LayerState
  onToggleLayer: (key: keyof LayerState) => void
  orbits: OrbitEntry[]
  onRemoveOrbit: (id: string) => void
  onClearOrbits: () => void
  satList: OrbitEntry[]
  onPickSat: (id: string, name: string) => void
  eco: boolean
  onToggleEco: () => void
  userLoc: { lat: number; lng: number } | null
  locating: boolean
  onLocate: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches =
    query.trim().length >= 2
      ? satList.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
      : []
  return (
    <div className="hud fade-up pointer-events-auto max-w-64 px-4 py-3" style={{ animationDelay: '240ms' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase hover:text-slate-200"
      >
        ⚙ customize
        <span className="text-slate-500">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔭 find a satellite…"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none"
            />
            {matches.length > 0 && (
              <ul className="mt-1 flex flex-col">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPickSat(m.id, m.name)
                        setQuery('')
                      }}
                      className="w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-sky-300"
                    >
                      {m.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1">
            {LAYER_LABELS.map(({ key, label }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => onToggleLayer(key)}
                  className="accent-sky-400"
                />
                {label}
              </label>
            ))}
            <label
              className="mt-1 flex cursor-pointer items-center gap-2 border-t border-white/10 pt-2 text-xs text-slate-300"
              title="4K textures, lower render resolution, half-rate propagation — for laptops and integrated GPUs"
            >
              <input type="checkbox" checked={eco} onChange={onToggleEco} className="accent-emerald-400" />
              ⚡ smooth performance mode
            </label>
          </div>

          <div className="border-t border-white/10 pt-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                Orbits shown ({orbits.length})
              </h3>
              {orbits.length > 1 && (
                <button
                  type="button"
                  onClick={onClearOrbits}
                  className="cursor-pointer text-[10px] text-slate-500 hover:text-rose-300"
                >
                  clear all
                </button>
              )}
            </div>
            {orbits.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-500">click a satellite to draw its orbit</p>
            ) : (
              <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                {orbits.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                    <span className="truncate">{o.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveOrbit(o.id)}
                      aria-label={`Remove orbit of ${o.name}`}
                      className="cursor-pointer px-1 text-slate-500 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={onLocate}
              disabled={locating}
              className="cursor-pointer text-xs text-sky-300 hover:text-sky-200 disabled:text-slate-500"
            >
              📍 {locating ? 'locating…' : userLoc ? 'fly to my location' : 'where am I?'}
            </button>
            {userLoc && (
              <p className="num mt-0.5 text-[11px] text-slate-400">{formatCoords(userLoc.lat, userLoc.lng)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        on ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {on ? '🔔 quake ping on' : '🔕 quake ping off'}
    </button>
  )
}

export function FollowIssButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`hud pointer-events-auto cursor-pointer px-4 py-2 text-xs transition-colors ${
        active ? 'text-sky-300' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {active ? '🛰 following ISS — drag to stop' : '🛰 follow ISS'}
    </button>
  )
}

export function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#02030a]">
      <span className="text-3xl">🌍</span>
      <p className="live-dot text-sm text-slate-400">waking up the planet…</p>
    </div>
  )
}

export function QuakePanel({
  quakes,
  flashes,
  now,
  onFocusQuake,
}: {
  quakes: Quake[]
  flashes: Quake[]
  now: number
  onFocusQuake: (quake: Quake) => void
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
    <div className="hud fade-up pointer-events-auto px-5 py-4" style={{ animationDelay: '120ms' }}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        Earthquakes · last 24 h
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
})

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
