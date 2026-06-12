/** Right-side navigator for Solar System mode: the Sun and every planet as a
 * tree, planets expand to their moons — one click glides the camera there. */

import { useState } from 'react'
import { PLANET_MOONS, PLANETS } from '../../lib/planets'

const BODY_COLORS: Record<string, string> = {
  sun: '#ffd27a',
  mercury: '#9aa3ae',
  venus: '#e8c47a',
  earth: '#38bdf8',
  mars: '#e07a5f',
  jupiter: '#d9b38c',
  saturn: '#d8c9a3',
  uranus: '#9fd3dd',
  neptune: '#6f8fd8',
  pluto: '#c9b29b',
}

/** Tree rows: the Sun, then each planet (Earth included, in true order). */
const TREE: { id: string; name: string }[] = [
  { id: 'sun', name: 'Sun' },
  { id: 'mercury', name: 'Mercury' },
  { id: 'venus', name: 'Venus' },
  { id: 'earth', name: 'Earth' },
  ...PLANETS.filter((p) => !['mercury', 'venus'].includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
  })),
]

export function SolarNavTree({
  focus,
  onNavigate,
  onOverview,
}: {
  focus: string | null
  onNavigate: (id: string) => void
  onOverview: () => void
}) {
  const [opened, setOpened] = useState<Set<string>>(new Set())
  // the focused body's system stays expanded even without a manual toggle
  const focusParent =
    focus &&
    (TREE.some((t) => t.id === focus)
      ? focus
      : Object.entries(PLANET_MOONS).find(([, ms]) => ms.some((m) => m.id === focus))?.[0])
  const isOpen = (id: string) => opened.has(id) || id === focusParent

  const toggle = (id: string) =>
    setOpened((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3">
      <h2 className="flex items-center justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase">
        🧭 Navigator
        <button
          type="button"
          onClick={onOverview}
          className="cursor-pointer text-xs text-violet-300 normal-case hover:text-violet-200"
        >
          ⊙ overview
        </button>
      </h2>
      <ul className="mt-1.5 max-h-[56vh] overflow-y-auto pr-1">
        {TREE.map((body) => {
          const moons = PLANET_MOONS[body.id] ?? []
          const open = isOpen(body.id)
          return (
            <li key={body.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onNavigate(body.id)}
                  title={`fly to ${body.name}`}
                  className={`flex flex-1 cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs ${
                    focus === body.id
                      ? 'bg-white/15 text-slate-100'
                      : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: BODY_COLORS[body.id] }}
                  />
                  {body.name}
                </button>
                {moons.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggle(body.id)}
                    aria-expanded={open}
                    title={`${moons.length} moons`}
                    className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-slate-500 hover:bg-white/10 hover:text-slate-300"
                  >
                    {moons.length} {open ? '▾' : '▸'}
                  </button>
                )}
              </div>
              {open &&
                moons.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onNavigate(m.id)}
                    title={`fly to ${m.name}`}
                    className={`ml-4 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] ${
                      focus === m.id
                        ? 'bg-white/15 text-slate-100'
                        : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                    }`}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: m.color }}
                    />
                    {m.name}
                  </button>
                ))}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
