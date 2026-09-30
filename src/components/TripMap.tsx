import { useEffect, useMemo, useRef, useState } from 'react'
import { AttributionControl, Layer, Map, Marker, Source, type MapLayerMouseEvent, type MapRef, type MapStyleDataEvent } from '@vis.gl/react-maplibre'
import type { ExpressionSpecification, GeoJSONSource, Map as MLMap } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LEGS, ROUTES, STOPS, TRIP_BBOX, TRIP_LINE, pickLegId } from '../lib/legs'
import { mapPadding, reducedMotion } from '../lib/layout'

const STYLE = 'https://tiles.openfreemap.org/styles/dark'
const NAVY = '#0b1426'
const FROST = '#e6eefc'
const GOLD = '#fcd34d'
const CLEAR = 'rgba(0,0,0,0)'

// Positive line-offset = right of travel direction, so outbound and return on the same road split into two lanes.
const LANE_OFFSET: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 4, 1.5, 9, 4]
const LEG_COLOR: ExpressionSpecification = ['match', ['get', 'id'], ...LEGS.flatMap(l => [l.id, l.color]), FROST] as unknown as ExpressionSpecification
const EN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
const HOVER: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false]
const draw = (color: string, p: number): ExpressionSpecification => ['step', ['line-progress'], color, Math.min(p, 1) * 1.01, CLEAR]

// Winter-night recolour of OpenFreeMap "dark". Layer ids verified against the live style.
const PAINT: [string, Parameters<MLMap['setPaintProperty']>[1], string][] = [
  ['background', 'background-color', NAVY],
  ['water', 'fill-color', '#050d1c'],
  ['waterway', 'line-color', '#0a1830'],
  ['landcover_ice_shelf', 'fill-color', '#0d1830'],
  ['landcover_glacier', 'fill-color', '#0d1830'],
  ['landuse_residential', 'fill-color', '#0f1b33'],
  ['landuse_park', 'fill-color', '#0d1a2f'],
  ['building', 'fill-color', '#0c1628'],
  ['building', 'fill-outline-color', '#15233e'],
  ['highway_path', 'line-color', '#101c33'],
  ['highway_minor', 'line-color', '#111e36'],
  ['highway_major_subtle', 'line-color', '#16253f'],
  ['highway_major_casing', 'line-color', 'rgba(52,78,122,0.55)'],
  ['highway_major_inner', 'line-color', '#0e1a31'],
  ['highway_motorway_subtle', 'line-color', '#172742'],
  ['highway_motorway_casing', 'line-color', 'rgba(52,78,122,0.6)'],
  ['highway_motorway_inner', 'line-color', '#0e1a31'],
  ['railway', 'line-color', '#16233d'],
  ['boundary_state', 'line-color', '#1d3052'],
  ['boundary_country_z0-4', 'line-color', '#3a5a8c'],
  ['boundary_country_z5-', 'line-color', '#3a5a8c'],
  ['water_name', 'text-color', '#3d5a8a'],
  ['water_name', 'text-halo-color', '#050d1c'],
]

const OUR_CITIES: ExpressionSpecification = ['literal', STOPS.map(s => s.name)]
const restyled = new WeakSet<MLMap>()
function restyle(map: MLMap) {
  for (const l of map.getStyle().layers) {
    if (l.type !== 'symbol' || l.source !== 'openmaptiles') continue
    if (JSON.stringify(l.layout?.['text-field'] ?? '').includes('name')) map.setLayoutProperty(l.id, 'text-field', EN_NAME)
    if (l.id.startsWith('highway_name') || l.id === 'place_state') map.setLayoutProperty(l.id, 'visibility', 'none') // keep the map quiet
    if (l.id.startsWith('place_')) {
      map.setPaintProperty(l.id, 'text-color', l.id.startsWith('place_country') ? '#5f79a6' : '#8ea3c7')
      map.setPaintProperty(l.id, 'text-halo-color', NAVY)
      // Our own city-labels layer names the trip cities; drop the basemap's copies so the two never fight for space.
      const notOurs: ExpressionSpecification = ['!', ['in', ['get', 'name:en'], OUR_CITIES]]
      const f = map.getFilter(l.id)
      map.setFilter(l.id, f ? ['all', f, notOurs] as ExpressionSpecification : notOurs)
    }
  }
  if (map.getLayer('landcover_wood')) map.setLayoutProperty('landcover_wood', 'visibility', 'none') // its pattern isn't in the sprite
  for (const [id, prop, value] of PAINT) if (map.getLayer(id)) map.setPaintProperty(id, prop, value)
}

const CITY_POINTS = {
  type: 'FeatureCollection' as const,
  features: STOPS.map(s => ({ type: 'Feature' as const, properties: { name: s.name, twice: s.twice }, geometry: { type: 'Point' as const, coordinates: s.lngLat } })),
}
const INTRO = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: TRIP_LINE } }
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

/** Runs fn(progress 0→1) every frame for `ms`; returns a cancel function. */
function animate(ms: number, fn: (p: number) => void, done?: () => void) {
  let raf = 0
  const t0 = performance.now()
  const tick = (t: number) => {
    const p = Math.min(1, (t - t0) / ms)
    fn(p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) // ease-in-out
    if (p < 1) raf = requestAnimationFrame(tick)
    else done?.()
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

// Flying arrows: the whole loop as Web-Mercator segments. Mercator length × 512·2^zoom = screen px at any latitude,
// so spacing and speed are in real pixels. Inline maths, not MercatorCoordinate: maplibre-gl stays in its lazy chunk.
const mercX = (lng: number) => (lng + 180) / 360
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
const unmerc = (x: number, y: number) => [x * 360 - 180, (360 / Math.PI) * Math.atan(Math.exp(Math.PI * (1 - 2 * y))) - 90]
const SEGS = LEGS.flatMap(l => l.coords.slice(1).map(([lng, lat], i) => {
  const ax = mercX(l.coords[i][0]), ay = mercY(l.coords[i][1]), bx = mercX(lng), by = mercY(lat)
  return { id: l.id, ax, ay, bx, by, d0: 0, len: Math.hypot(bx - ax, by - ay), rot: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI }
}))
let LOOP = 0
for (const s of SEGS) { s.d0 = LOOP; LOOP += s.len }
const ARROW_GAP = 110 // px apart at an integer zoom
const ARROW_SPEED = 45 // px/s
// N doubles per zoom level and divides the loop exactly: zooming in adds arrows between the old ones, and Kyiv → Kyiv wraps seamlessly.
const ARROWS_Z0 = Math.max(1, Math.round((LOOP * 512) / ARROW_GAP))

function arrowFeatures(map: MLMap, phase: number) {
  const gap = LOOP / (ARROWS_Z0 * 2 ** Math.floor(map.getZoom()))
  const b = map.getBounds()
  const [x0, x1, y0, y1] = [mercX(b.getWest()), mercX(b.getEast()), mercY(b.getNorth()), mercY(b.getSouth())]
  const features = []
  for (const s of SEGS) {
    if (Math.max(s.ax, s.bx) < x0 || Math.min(s.ax, s.bx) > x1 || Math.max(s.ay, s.by) < y0 || Math.min(s.ay, s.by) > y1) continue
    for (let d = phase + Math.ceil((s.d0 - phase) / gap) * gap; d < s.d0 + s.len; d += gap) {
      const t = (d - s.d0) / s.len
      features.push({ type: 'Feature' as const, properties: { id: s.id, rot: s.rot }, geometry: { type: 'Point' as const, coordinates: unmerc(s.ax + t * (s.bx - s.ax), s.ay + t * (s.by - s.ay)) } })
    }
  }
  return { type: 'FeatureCollection' as const, features }
}

const WEBGL2 = typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2')

type Props = {
  hoveredId: number | null
  selectedId: number | null
  still: boolean
  onHover: (id: number | null) => void
  onSelect: (id: number | null) => void
}

export default function TripMap({ hoveredId, selectedId, still, onHover, onSelect }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [before, setBefore] = useState<string | undefined | null>(null) // null = basemap not restyled yet
  const [loaded, setLoaded] = useState(false)
  const [introDone, setIntroDone] = useState(still)
  const first = useRef(true)
  // Any interaction ends the intro for good (latched during render, React's "adjust state on prop change" pattern).
  if (!introDone && (hoveredId !== null || selectedId !== null || still)) setIntroDone(true)
  const selected = LEGS.find(l => l.id === selectedId)
  const selData = useMemo(() => (selected ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: selected.coords } } : EMPTY), [selected])

  function onStyleData(e: MapStyleDataEvent) {
    const map = e.target
    if (restyled.has(map)) return
    restyled.add(map)
    restyle(map)
    // Routes go above roads/boundaries but under place names.
    setBefore(map.getStyle().layers.find(l => l.id.startsWith('place_'))?.id)
  }

  function ids(e: MapLayerMouseEvent) {
    return [...new Set((e.features ?? []).map(f => Number(f.properties.id)))].sort((a, b) => a - b)
  }

  // Hover highlight via feature-state: no worker relayout.
  useEffect(() => {
    const map = mapRef.current
    if (hoveredId === null || !map?.getSource('legs')) return
    map.setFeatureState({ source: 'legs', id: hoveredId }, { hover: true })
    return () => { if (map.getSource('legs')) map.setFeatureState({ source: 'legs', id: hoveredId }, { hover: false }) }
  }, [hoveredId, before])

  // Intro: the whole loop "drives" itself in, then hands over to the per-leg colours.
  useEffect(() => {
    if (!loaded || introDone) return
    const map = mapRef.current!.getMap()
    const finish = () => setIntroDone(true)
    const ctrl = new AbortController()
    for (const ev of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(ev, finish, { capture: true, signal: ctrl.signal })
    const cancel = animate(3000, p => map.getLayer('intro-draw') && map.setPaintProperty('intro-draw', 'line-gradient', draw(FROST, p)), finish)
    return () => { ctrl.abort(); cancel() }
  }, [loaded, introDone])

  // Arrows fly round the whole loop, leg after leg. `still` freezes them and only re-lays them out when the camera moves.
  useEffect(() => {
    if (!loaded || !introDone) return
    const map = mapRef.current!.getMap()
    let phase = 0, raf = 0, last = performance.now()
    const place = () => (map.getSource('arrows') as GeoJSONSource | undefined)?.setData(arrowFeatures(map, phase))
    if (still) {
      place()
      map.on('move', place)
      return () => { map.off('move', place) }
    }
    const tick = (t: number) => {
      phase = (phase + (ARROW_SPEED * (t - last)) / 1000 / (512 * 2 ** map.getZoom())) % LOOP
      last = t
      place()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [loaded, introDone, still, before])

  // Select: fly to the leg (or back to the whole trip) and draw the leg in.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return // maplibre is lazy-loaded; a pick made before that is applied once it is ready
    if (first.current) { first.current = false; if (selectedId === null) return }
    const duration = reducedMotion() ? 0 : 1400
    // maxZoom must be omitted, not undefined: MapLibre copies the undefined over its default and the camera becomes NaN.
    map.fitBounds(selected?.bbox ?? TRIP_BBOX, { padding: mapPadding(), duration, ...(selected && { maxZoom: 9 }) })
    if (!selected) return
    const m = map.getMap()
    return animate(duration ? 1200 : 1, p => {
      if (!m.getLayer('sel-draw')) return
      m.setPaintProperty('sel-draw', 'line-gradient', draw(selected.color, p))
      m.setPaintProperty('sel-glow', 'line-gradient', draw(selected.color, p))
    })
  }, [selected, selectedId, loaded])

  // Crossing the 768px breakpoint (phone rotation) swaps sidebar ↔ sheet, so the camera padding changes: re-frame.
  useEffect(() => {
    const mq = matchMedia('(min-width: 768px)')
    const refit = () => {
      const m = mapRef.current
      if (!m) return
      m.resize() // the media query fires before MapLibre's own ResizeObserver
      m.fitBounds(selected?.bbox ?? TRIP_BBOX, { padding: mapPadding(), duration: 0, ...(selected && { maxZoom: 9 }) })
    }
    mq.addEventListener('change', refit)
    return () => mq.removeEventListener('change', refit)
  }, [selected])

  // An empty-map click deselects, but only if it wasn't the first half of a double-tap/double-click zoom.
  const pendingDeselect = useRef(0)
  function onMapClick(e: MapLayerMouseEvent) {
    clearTimeout(pendingDeselect.current)
    const id = pickLegId(ids(e), hoveredId, selectedId)
    if (id !== null) onSelect(id)
    else pendingDeselect.current = window.setTimeout(() => onSelect(null), 500) // ponytail: 500 ms = MapLibre's double-tap window
  }

  if (!WEBGL2) {
    return <div className="grid h-full place-items-center p-8 text-center text-muted">This browser can't draw the map (WebGL2 is off). The leg list still works.</div>
  }

  const dim = hoveredId !== null || selectedId !== null
  const legsOpacity = introDone ? (dim ? 0.35 : 0.95) : 0
  const fade = { duration: 500, delay: 0 }

  return (
    <Map
      ref={mapRef}
      mapStyle={STYLE}
      workerUrl={workerUrl}
      initialViewState={{ bounds: TRIP_BBOX, fitBoundsOptions: { padding: mapPadding() } }}
      style={{ position: 'absolute', inset: 0 }}
      attributionControl={false}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      interactiveLayerIds={before === null ? [] : ['legs-hit']}
      cursor={hoveredId !== null ? 'pointer' : undefined}
      onStyleData={onStyleData}
      onLoad={() => setLoaded(true)}
      onMouseMove={e => onHover(pickLegId(ids(e), hoveredId))}
      onMouseLeave={() => onHover(null)}
      onMouseOut={() => onHover(null)}
      onClick={onMapClick}
      onMoveStart={() => clearTimeout(pendingDeselect.current)}
    >
      <AttributionControl position="top-right" customAttribution="Routes: OSRM" />

      {before !== null && (
        <>
          <Source id="legs" type="geojson" data={ROUTES} promoteId="id">
            <Layer id="legs-glow" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 12], 'line-blur': 6, 'line-offset': LANE_OFFSET, 'line-opacity': legsOpacity * 0.35, 'line-opacity-transition': fade }} />
            <Layer id="legs-core" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2, 9, 3.5], 'line-offset': LANE_OFFSET, 'line-opacity': legsOpacity, 'line-opacity-transition': fade }} />
            <Layer id="legs-hover" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': LEG_COLOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 4, 9, 6], 'line-offset': LANE_OFFSET, 'line-opacity': ['case', HOVER, 1, 0] }} />
            <Layer id="legs-hit" type="line" beforeId={before}
              paint={{ 'line-color': FROST, 'line-width': 12, 'line-offset': LANE_OFFSET, 'line-opacity': 0 }} />
          </Source>
          <Source id="arrows" type="geojson" data={EMPTY}>
            {/* text-offset turns with text-rotate, so +y puts each arrow on its leg's right-hand lane. ignore-placement: moving arrows must not bump labels. */}
            <Layer id="legs-arrows" type="symbol" beforeId={before} minzoom={5}
              layout={{ 'text-field': '›', 'text-font': ['Noto Sans Bold'], 'text-size': 16, 'text-rotate': ['get', 'rot'], 'text-rotation-alignment': 'map', 'text-allow-overlap': true, 'text-ignore-placement': true, 'text-offset': ['interpolate', ['linear'], ['zoom'], 5, ['literal', [0, 0.12]], 9, ['literal', [0, 0.25]]] }}
              paint={{ 'text-color': LEG_COLOR, 'text-halo-color': NAVY, 'text-halo-width': 1, 'text-opacity': introDone ? (dim ? 0.3 : 0.9) : 0 }} />
          </Source>
          <Source id="sel" type="geojson" lineMetrics data={selData}>
            <Layer id="sel-glow" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(FROST, 0), 'line-width': 14, 'line-blur': 8, 'line-offset': LANE_OFFSET, 'line-opacity': 0.55 }} />
            <Layer id="sel-draw" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(FROST, 0), 'line-width': 5, 'line-offset': LANE_OFFSET }} />
          </Source>
          <Source id="intro" type="geojson" lineMetrics data={INTRO}>
            <Layer id="intro-draw" type="line" beforeId={before} layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-gradient': draw(FROST, 0), 'line-width': 3, 'line-blur': 0.5, 'line-offset': LANE_OFFSET, 'line-opacity': introDone ? 0 : 1, 'line-opacity-transition': fade }} />
          </Source>
          {/* On top of everything (no beforeId): collision then hides the basemap's duplicate city names. */}
          <Source id="cities" type="geojson" data={CITY_POINTS}>
            <Layer id="city-labels" type="symbol"
              layout={{ 'text-field': ['case', ['get', 'twice'], ['format', ['get', 'name'], {}, ' ×2', { 'text-color': GOLD, 'font-scale': 0.8 }], ['get', 'name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 9, 15], 'text-variable-anchor': ['left', 'top', 'bottom', 'right'], 'text-radial-offset': 0.9, 'text-letter-spacing': 0.02 }}
              paint={{ 'text-color': FROST, 'text-halo-color': NAVY, 'text-halo-width': 1.6 }} />
          </Source>
        </>
      )}

      {STOPS.map(s => (
        <Marker key={s.id} longitude={s.lngLat[0]} latitude={s.lngLat[1]} anchor="center" style={{ pointerEvents: 'none' }}>
          <span className="relative block size-2.5" aria-hidden="true">
            <span className="ping absolute inset-0 rounded-full bg-ice/70 motion-safe:animate-ping" />
            <span className="absolute inset-0 rounded-full bg-frost shadow-[0_0_10px_3px_rgba(125,211,252,0.65)]" />
          </span>
        </Marker>
      ))}
    </Map>
  )
}
