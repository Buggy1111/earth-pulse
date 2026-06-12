import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GlobeView } from './components/GlobeView'
import {
  FollowIssButton,
  IssPanel,
  LoadingOverlay,
  QuakeDetail,
  QuakePanel,
  SettingsPanel,
  SoundToggle,
  SpaceWeatherPanel,
  TitleCard,
  WikiPanel,
  type LayerState,
  type OrbitEntry,
} from './components/Hud'
import { useIss, useNow, useQuakes, useSpaceWeather, useTleSats, useWikiFeed } from './hooks'
import { playPing } from './lib/ping'
import type { Quake } from './lib/quakes'

export default function App() {
  const { quakes, newQuakes, flashes } = useQuakes()
  const iss = useIss()
  const sats = useTleSats()
  const weather = useSpaceWeather()
  const { edits, totalSeen } = useWikiFeed()
  const now = useNow()
  const [selected, setSelected] = useState<Quake | null>(null)
  const [ready, setReady] = useState(false)
  const [followIss, setFollowIss] = useState(false)
  const [soundOn, setSoundOn] = useState(false)

  // user customization: visible layers, chosen orbits, own location
  const [layers, setLayers] = useState<LayerState>({
    sats: true,
    iss: true,
    quakes: true,
    aurora: true,
    clouds: true,
  })
  const [orbits, setOrbits] = useState<OrbitEntry[]>([])
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locVersion, setLocVersion] = useState(0)

  const orbitIds = useMemo(() => orbits.map((o) => o.id), [orbits])

  const onToggleLayer = useCallback((key: keyof LayerState) => {
    setLayers((l) => {
      const next = { ...l, [key]: !l[key] }
      if (key === 'iss' && !next.iss) setFollowIss(false)
      return next
    })
  }, [])

  const onSatClick = useCallback((id: string, name: string) => {
    setOrbits((list) =>
      list.some((o) => o.id === id) ? list.filter((o) => o.id !== id) : [...list, { id, name }],
    )
  }, [])
  const onRemoveOrbit = useCallback(
    (id: string) => setOrbits((list) => list.filter((o) => o.id !== id)),
    [],
  )
  const onClearOrbits = useCallback(() => setOrbits([]), [])

  const onLocate = useCallback(() => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocVersion((v) => v + 1) // re-fly even to the same place
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }, [])

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
  const onIssClick = useCallback(() => setFollowIss((f) => !f), [])

  return (
    <>
      <GlobeView
        quakes={quakes}
        flashes={flashes}
        iss={iss}
        sats={sats}
        kp={weather.kp?.kp ?? null}
        layers={layers}
        selectedOrbitIds={orbitIds}
        userLoc={userLoc}
        locVersion={locVersion}
        followIss={followIss}
        onFollowBroken={onFollowBroken}
        onIssClick={onIssClick}
        onSatClick={onSatClick}
        onQuakeClick={setSelected}
        onReady={onReady}
      />
      {!ready && <LoadingOverlay />}

      {/* HUD overlay — pointer-events only on the panels, globe stays draggable */}
      <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col items-start gap-3">
            <TitleCard now={now} satCount={sats.length} />
            <SpaceWeatherPanel weather={weather} />
            <SettingsPanel
              layers={layers}
              onToggleLayer={onToggleLayer}
              orbits={orbits}
              onRemoveOrbit={onRemoveOrbit}
              onClearOrbits={onClearOrbits}
              userLoc={userLoc}
              locating={locating}
              onLocate={onLocate}
            />
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
            {layers.iss && <FollowIssButton active={followIss} onToggle={() => setFollowIss((f) => !f)} />}
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
