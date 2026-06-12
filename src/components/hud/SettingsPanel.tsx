/** The ⚙ customize panel: layers, satellite search, orbits, location, link. */

import { useState } from 'react'
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
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3" style={{ animationDelay: '240ms' }}>
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
      )}
    </div>
  )
}
