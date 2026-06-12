import { useCallback, useEffect, useRef, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import {
  FollowIssButton,
  IssPanel,
  LoadingOverlay,
  QuakeDetail,
  QuakePanel,
  SoundToggle,
  SpaceWeatherPanel,
  TitleCard,
  WikiPanel,
} from './components/Hud'
import { useIss, useNow, useQuakes, useSatellites, useSpaceWeather, useWikiFeed } from './hooks'
import { playPing } from './lib/ping'
import type { Quake } from './lib/quakes'

export default function App() {
  const { quakes, newQuakes, flashes } = useQuakes()
  const iss = useIss()
  const satellites = useSatellites()
  const weather = useSpaceWeather()
  const { edits, totalSeen } = useWikiFeed()
  const now = useNow()
  const [selected, setSelected] = useState<Quake | null>(null)
  const [ready, setReady] = useState(false)
  const [followIss, setFollowIss] = useState(false)
  const [soundOn, setSoundOn] = useState(false)

  // audible ping for just-detected quakes (opt-in via the 🔔 toggle)
  const soundOnRef = useRef(soundOn)
  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])
  const audioRef = useRef<AudioContext | null>(null)
  useEffect(() => {
    if (newQuakes.length === 0 || !soundOnRef.current) return
    audioRef.current ??= new AudioContext()
    for (const q of newQuakes) playPing(audioRef.current, q.mag)
  }, [newQuakes])

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      // create/resume the context on the user gesture — autoplay policy
      if (!on) {
        audioRef.current ??= new AudioContext()
        void audioRef.current.resume()
      }
      return !on
    })
  }, [])

  const onReady = useCallback(() => setReady(true), [])
  const onFollowBroken = useCallback(() => setFollowIss(false), [])

  return (
    <>
      <GlobeView
        quakes={quakes}
        flashes={flashes}
        iss={iss}
        satellites={satellites}
        followIss={followIss}
        onFollowBroken={onFollowBroken}
        onQuakeClick={setSelected}
        onReady={onReady}
      />
      {!ready && <LoadingOverlay />}

      {/* HUD overlay — pointer-events only on the panels, globe stays draggable */}
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-3">
            <TitleCard now={now} satCount={satellites.length} />
            <SpaceWeatherPanel weather={weather} />
          </div>
          <WikiPanel edits={edits} totalSeen={totalSeen} />
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <SoundToggle on={soundOn} onToggle={toggleSound} />
            <QuakePanel quakes={quakes} flashes={flashes} now={now} />
          </div>
          <div className="flex flex-col items-end gap-3">
            {selected && <QuakeDetail quake={selected} now={now} onClose={() => setSelected(null)} />}
            <FollowIssButton active={followIss} onToggle={() => setFollowIss((f) => !f)} />
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
