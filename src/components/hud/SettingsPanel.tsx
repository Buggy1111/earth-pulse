/** The ⚙ customize panel: layers, satellite search, orbits, location, link. */

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { HudCard } from './HudCard'
import { formatCoords } from '../../lib/format'
import { LAYER_LABELS, type LayerState, type OrbitEntry } from './types'

/** Console section heading — a cyan tick echoes the viewport corner brackets so
 * the panel reads as one instrument, not a stack of unrelated controls. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.2em] text-cyan-300/55 uppercase">
      <span aria-hidden className="text-cyan-400/40">
        ▍
      </span>
      {children}
    </h3>
  )
}

export function SettingsPanel({
  layers,
  onToggleLayer,
  orbits,
  onRemoveOrbit,
  onClearOrbits,
  satList,
  onPickSat,
  quality,
  onSetQuality,
  mobile,
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
  quality: '2k' | '4k' | '8k'
  onSetQuality: (q: '2k' | '4k' | '8k') => void
  mobile: boolean
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

      {open &&
        createPortal(
          // Portal to <body>: on mobile this panel lives inside a slide-out drawer
          // whose `transform` would otherwise trap a fixed child in its own
          // containing block (the panel could never cover the screen). At body
          // level it's a true top-level overlay on every layout.
          <aside className="hud slide-in pointer-events-auto fixed top-3 bottom-3 left-3 z-40 flex w-72 flex-col px-4 py-3 safe-pt safe-pb safe-pl sm:top-6 sm:bottom-6 sm:left-6">
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
          <div className="mt-3 flex flex-1 flex-col gap-3.5 overflow-y-auto pr-1">
            {/* search — its placeholder is its label */}
            <div className="relative">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔭 find a satellite…"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
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
                        className="w-full cursor-pointer truncate rounded px-1.5 py-0.5 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-cyan-300"
                      >
                        {m.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* LAYERS — what's drawn on the globe */}
            <section className="flex flex-col gap-1.5">
              <SectionLabel>layers</SectionLabel>
              <div className="flex flex-col gap-1">
                {LAYER_LABELS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 hover:text-slate-100"
                  >
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() => onToggleLayer(key)}
                      className="accent-cyan-400"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            {/* RENDER & VIEW — how it draws and behaves */}
            <section className="flex flex-col gap-2 border-t border-cyan-400/15 pt-3">
              <SectionLabel>render &amp; view</SectionLabel>
              <div>
                <span className="mb-1.5 block text-xs text-slate-300">🌍 texture quality</span>
                <div
                  className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5"
                  role="group"
                  aria-label="Texture quality"
                >
                  {(['2k', '4k', '8k'] as const).map((q) => {
                    const disabled = mobile && q === '8k'
                    const active = quality === q
                    return (
                      <button
                        key={q}
                        type="button"
                        disabled={disabled}
                        aria-pressed={active}
                        onClick={() => onSetQuality(q)}
                        title={
                          q === '2k'
                            ? 'Fast: 2K textures + simpler satellites + half-rate propagation — for weak GPUs'
                            : q === '4k'
                              ? 'Balanced: crisp 4K textures at full detail'
                              : disabled
                                ? '8K is desktop-only — too much GPU memory for a phone'
                                : 'Ultra: full 8K detail (~0.5 GB of GPU memory)'
                        }
                        className={`flex-1 rounded-md py-1 text-[11px] font-semibold tracking-wider uppercase transition-all ${
                          active
                            ? 'bg-cyan-400/20 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(94,234,255,0.45)]'
                            : 'text-slate-400 hover:text-slate-200'
                        } ${disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer'}`}
                      >
                        {q.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
                {mobile && (
                  <p className="mt-1 text-[10px] text-slate-500">8K is desktop-only — too heavy for a phone</p>
                )}
              </div>
              <label
                className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 hover:text-slate-100"
                title="Earth spins on its axis while the Sun stays put (the textbook view). Off = the Sun travels around a fixed Earth. Most visible when you speed up time."
              >
                <input
                  type="checkbox"
                  checked={earthSpin}
                  onChange={onToggleEarthSpin}
                  className="accent-cyan-400"
                />
                🌍 Earth spins (Sun fixed)
              </label>
              <label
                className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 hover:text-slate-100"
                title="After ~75 s without interaction, hide the HUD and run a looping cinematic tour. Move the mouse or tap to resume."
              >
                <input
                  type="checkbox"
                  checked={kioskEnabled}
                  onChange={onToggleKiosk}
                  className="accent-cyan-400"
                />
                📺 auto tour when idle
              </label>
            </section>

            {/* ORBITS — the satellites you're tracking */}
            <section className="border-t border-cyan-400/15 pt-3">
              <div className="flex items-baseline justify-between">
                <SectionLabel>orbits shown ({orbits.length})</SectionLabel>
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
                <p className="mt-1.5 text-[11px] text-slate-500">click a satellite to draw its orbit</p>
              ) : (
                <ul className="mt-1.5 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
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
            </section>

            {/* LOCATE & SHARE */}
            <section className="flex flex-col gap-1.5 border-t border-cyan-400/15 pt-3">
              <SectionLabel>locate &amp; share</SectionLabel>
              <button
                type="button"
                onClick={onLocate}
                disabled={locating}
                className="cursor-pointer text-left text-xs text-cyan-300 hover:text-cyan-200 disabled:text-slate-500"
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
                className="cursor-pointer text-left text-xs text-cyan-300 hover:text-cyan-200"
              >
                🔗 {copied ? 'link copied!' : 'copy view link'}
              </button>
            </section>
          </div>
        </aside>,
          document.body,
        )}
    </>
  )
}
