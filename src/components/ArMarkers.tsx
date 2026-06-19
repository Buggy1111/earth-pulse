/** The Sky AR DOM marker layer: Starlink dots, named-satellite dots, and the
 * Moon/planet discs. Pure rendering — the projected screen positions come from
 * the ArSky component's per-frame tick. */

import type { Marker } from './arTypes'

export function ArMarkers({ markers, model3D }: { markers: Marker[]; model3D: boolean }) {
  return (
    <>
      {markers.map((m) =>
        m.kind === 'starlink' ? (
          <div
            key={m.id}
            style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}
          >
            {/* the dot is the visual only until the 3D models load */}
            {!model3D && <div style={{ width: 6, height: 6, margin: '0 auto', borderRadius: '50%', background: '#9fb8d4', boxShadow: '0 0 6px #8fb6ef' }} />}
            {m.label && (
              <div style={{ marginTop: model3D ? 0 : 3, font: '600 10px system-ui', color: '#cbd5e1', textShadow: '0 0 5px #000', whiteSpace: 'nowrap' }}>
                {m.name}
              </div>
            )}
          </div>
        ) : m.kind === 'body' ? (
          <div
            key={m.id}
            style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}
          >
            {/* the Moon + planets: a bright body-coloured disc + its name */}
            <div style={{ width: 18, height: 18, margin: '0 auto', borderRadius: '50%', background: m.color, boxShadow: `0 0 16px ${m.color}`, border: '1px solid rgba(255,255,255,0.55)' }} />
            <div style={{ marginTop: 4, font: '700 12px system-ui', color: '#fff', textShadow: '0 0 6px #000', whiteSpace: 'nowrap' }}>
              {m.name}
            </div>
          </div>
        ) : (
          <div
            key={m.id}
            style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', pointerEvents: 'none', textAlign: 'center' }}
          >
            <div style={{ width: 14, height: 14, margin: '0 auto', borderRadius: '50%', background: m.iss ? '#22d3ee' : '#fbbf24', boxShadow: `0 0 10px ${m.iss ? '#22d3ee' : '#fbbf24'}` }} />
            <div style={{ marginTop: 3, font: '600 11px system-ui', color: '#e4e7ec', textShadow: '0 0 5px #000', whiteSpace: 'nowrap' }}>
              {m.name} · {Math.round(m.elevationDeg)}°
            </div>
          </div>
        ),
      )}
    </>
  )
}
