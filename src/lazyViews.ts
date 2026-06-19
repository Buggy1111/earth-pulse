/** Lazily-loaded views: the AR overlay and the continental-drift globe each
 * pull their own heavy code (camera/sensor plumbing, a second THREE scene) and
 * only mount on demand, so they stay out of the initial bundle. */

import { lazy } from 'react'

export const ArSky = lazy(() => import('./components/ArSky').then((m) => ({ default: m.ArSky })))
export const PangeaView = lazy(() =>
  import('./components/PangeaView').then((m) => ({ default: m.PangeaView })),
)
