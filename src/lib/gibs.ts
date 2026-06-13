/** NASA GIBS — Global Imagery Browse Services. Free, no-key satellite data
 * layers (true colour, sea-surface temperature, aerosols…) as web-mercator
 * tiles that drop straight onto globe.gl's tile engine. EPSG:3857 / REST WMTS.
 *
 * Daily layers lag a day or two, so we default the date to two days back. */

export interface GibsLayer {
  id: string
  label: string
  /** GIBS layer identifier. */
  layer: string
  /** GoogleMapsCompatible_Level<N> matrix set — also bounds the zoom. */
  level: number
  ext: 'jpg' | 'png'
  /** True if the layer has a daily {Time} dimension (vs a static product). */
  daily: boolean
  blurb: string
  /** Colour-bar legend (low → high) matching the layer's baked-in palette. */
  legend?: { stops: string[]; min: string; max: string }
}

export const GIBS_LAYERS: GibsLayer[] = [
  { id: 'truecolor', label: '🌍 Today’s Earth', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', level: 9, ext: 'jpg', daily: true, blurb: 'true-colour daily mosaic (MODIS Terra)' },
  {
    id: 'sst', label: '🌡 Sea temperature', layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature', level: 7, ext: 'png', daily: true, blurb: 'sea-surface temperature (GHRSST MUR)',
    legend: { stops: ['#3b1f8f', '#2563eb', '#22d3ee', '#4ade80', '#fde047', '#fb923c', '#ef4444'], min: '−2 °C', max: '32 °C' },
  },
  {
    id: 'aod', label: '🌫 Aerosols', layer: 'MODIS_Combined_Value_Added_AOD', level: 6, ext: 'png', daily: true, blurb: 'aerosol optical depth — smoke, dust, haze',
    legend: { stops: ['#ffffcc', '#fed976', '#fd8d3c', '#e31a1c', '#800026'], min: 'clear', max: 'hazy' },
  },
  {
    id: 'snow', label: '❄️ Snow cover', layer: 'MODIS_Terra_NDSI_Snow_Cover', level: 8, ext: 'png', daily: true, blurb: 'snow & ice cover (MODIS Terra)',
    legend: { stops: ['#1e293b', '#64748b', '#bae6fd', '#e0f2fe', '#ffffff'], min: 'none', max: 'snow' },
  },
]

/** YYYY-MM-DD `daysBack` days before `now` (GIBS daily lag). */
export function gibsDate(now: number, daysBack = 2): string {
  return new Date(now - daysBack * 86_400_000).toISOString().slice(0, 10)
}

/** One equirectangular full-globe image (WMS GetMap) for a layer + date — drops
 * straight onto the globe as a texture. Reliable where the tile engine caches. */
export function gibsWmsUrl(layer: GibsLayer, date: string): string {
  const time = layer.daily ? `&TIME=${date}` : ''
  return (
    'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?' +
    'REQUEST=GetMap&SERVICE=WMS&VERSION=1.3.0&CRS=EPSG:4326&' +
    `BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024&FORMAT=image/jpeg&LAYERS=${layer.layer}${time}`
  )
}
