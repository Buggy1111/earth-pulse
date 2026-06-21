/** The ⚙ customize panel: layers, satellite search, orbits, location, link. */

import { useState } from 'react'
import { HudCard } from './HudCard'
import { formatCoords } from '../../lib/format'
import { LAYER_LABELS, type LayerState, type OrbitEntry } from './types'

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
  ecoLocked,
  earthSpin,
  onToggleEarthSpin,
  kioskEnabled,
  onToggleKiosk,
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
  ecoLocked: boolean
  earthSpin: boolean
  onToggleEarthSpin: () => void
  kioskEnabled: boolean
  onToggleKiosk: () => void
  userLoc: { lat: number; lng: number } | null
  locating: boolean
  onLocate: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1_600)
    })
  }
  const matches =
    query.trim().length >= 2
      ? satList.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
      : []
  return (
    <>
      {/* Compact toggle lives in the corner column; the panel itself opens as a
          full-height left drawer so it never collides with the other panels. */}
      <HudCard className="w-72 px-4 py-3" delay={240}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center justify-between gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase hover:text-slate-200"
        >
          ⚙ customize
          <span className="text-slate-500">{open ? '▾' : '▸'}</span>
        </button>
      </HudCard>

      {open && (
        <aside className="hud slide-in pointer-events-auto fixed top-3 bottom-3 left-3 z-30 flex w-72 flex-col px-4 py-3 safe-pt safe-pb safe-pl sm:top-6 sm:bottom-6 sm:left-6">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
            ⚙ customize
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close customize panel"
              className="cursor-pointer px-1 text-slate-500 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
              className={`mt-1 flex items-center gap-2 border-t border-white/10 pt-2 text-xs ${
                ecoLocked ? 'cursor-not-allowed text-slate-500' : 'cursor-pointer text-slate-300'
              }`}
              title={
                ecoLocked
                  ? 'Phones & tablets run a balanced 4K stack automatically — sharp, but light enough to stay under a mobile browser’s memory limit. The full 8K detail needs more GPU memory than mobile allows and would crash the app.'
                  : 'Fast version: 2K textures, simpler satellites, lighter clouds, half-rate propagation — for laptops and integrated GPUs. Off = full 8K detail.'
              }
            >
              <input
                type="checkbox"
                checked={eco}
                onChange={onToggleEco}
                disabled={ecoLocked}
                className="accent-emerald-400 disabled:opacity-60"
              />
              {ecoLocked ? '⚡ balanced 4K · auto on mobile' : '⚡ fast mode (2K)'}
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-slate-300"
              title="Earth spins on its axis while the Sun stays put (the textbook view). Off = the Sun travels around a fixed Earth. Most visible when you speed up time."
            >
              <input
                type="checkbox"
                checked={earthSpin}
                onChange={onToggleEarthSpin}
                className="accent-sky-400"
              />
              🌍 Earth spins (Sun fixed)
            </label>
            <label
              className="flex cursor-pointer items-center gap-2 text-xs text-slate-300"
              title="After ~75 s without interaction, hide the HUD and run a looping cinematic tour. Move the mouse or tap to resume."
            >
              <input type="checkbox" checked={kioskEnabled} onChange={onToggleKiosk} className="accent-sky-400" />
              📺 auto tour when idle
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

          <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={onLocate}
              disabled={locating}
              className="cursor-pointer text-left text-xs text-sky-300 hover:text-sky-200 disabled:text-slate-500"
            >
              📍 {locating ? 'locating…' : userLoc ? 'fly to my location' : 'where am I?'}
            </button>
            {userLoc && (
              <p className="num text-[11px] text-slate-400">{formatCoords(userLoc.lat, userLoc.lng)}</p>
            )}
            <button
              type="button"
              onClick={copyLink}
              title="share this exact view — camera, orbits and layers travel in the link"
              className="cursor-pointer text-left text-xs text-sky-300 hover:text-sky-200"
            >
              🔗 {copied ? 'link copied!' : 'copy view link'}
            </button>
          </div>
          </div>
        </aside>
      )}
    </>
  )
}
