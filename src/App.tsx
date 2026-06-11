import { useState } from 'react'
import { GlobeView } from './components/GlobeView'
import { IssPanel, QuakeDetail, QuakePanel, TitleCard, WikiPanel } from './components/Hud'
import { useIss, useNow, useQuakes, useWikiFeed } from './hooks'
import type { Quake } from './lib/quakes'

export default function App() {
  const quakes = useQuakes()
  const iss = useIss()
  const { edits, totalSeen } = useWikiFeed()
  const now = useNow()
  const [selected, setSelected] = useState<Quake | null>(null)

  return (
    <>
      <GlobeView quakes={quakes} iss={iss} onQuakeClick={setSelected} />

      {/* HUD overlay — pointer-events only on the panels, globe stays draggable */}
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <TitleCard />
          <WikiPanel edits={edits} totalSeen={totalSeen} />
        </div>

        <div className="flex items-end justify-between gap-4">
          <QuakePanel quakes={quakes} now={now} />
          <div className="flex flex-col items-end gap-3">
            {selected && <QuakeDetail quake={selected} now={now} onClose={() => setSelected(null)} />}
            <IssPanel iss={iss} />
          </div>
        </div>
      </div>

      <p className="pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-600">
        Earth Pulse · open source · no API keys, everything runs in your browser
      </p>
    </>
  )
}
