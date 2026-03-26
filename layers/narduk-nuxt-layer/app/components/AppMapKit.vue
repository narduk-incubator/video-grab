<script lang="ts">
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapkit is a global injected by Apple's CDN script, no type definitions available
declare const mapkit: any
</script>

<script setup lang="ts" generic="T extends { id: string; lat: number; lng: number }">
/**
 * AppMapKit — Reusable Apple MapKit JS map component.
 *
 * Supports two rendering modes (can be combined):
 *   1. Pin annotations — pass `items` + `createPinElement`
 *   2. GeoJSON polygon/line overlays — pass `geojson` + optional `overlayStyleFn`
 *
 * Handles MapKit loading, map initialization, bounding region calculation,
 * pin annotations with selection, GeoJSON overlays, zoom behavior, dark mode
 * sync, and cleanup.
 */

export interface GeoJSONGeometry {
  type: string
  coordinates: unknown
}

export interface GeoJSONFeatureProperties {
  name?: string
  slug?: string
  region?: string
  city?: string
  centerLat?: number | null
  centerLng?: number | null
  source?: string
  [key: string]: unknown
}

export interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: GeoJSONFeatureProperties
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export interface OverlayStyle {
  strokeColor: string
  strokeOpacity?: number
  fillColor: string
  fillOpacity?: number
  lineWidth: number
}

const props = withDefaults(
  defineProps<{
    /** Pin annotation items (optional when using geojson-only mode). */
    items?: T[]
    /** Factory to create pin DOM elements. Required when items are provided. */
    createPinElement?: (
      item: T,
      isSelected: boolean,
    ) => { element: HTMLElement; cleanup?: () => void }
    /** GeoJSON FeatureCollection with Polygon/MultiPolygon/LineString features. */
    geojson?: GeoJSONFeatureCollection | null
    /** Custom style function for each GeoJSON overlay polygon/line feature. */
    overlayStyleFn?: (properties: GeoJSONFeatureProperties) => OverlayStyle
    /** Lightweight circle overlays for rendering large point clouds. */
    circles?: Array<{ lat: number; lng: number; radius: number; color: string; opacity?: number }>
    /** When true, circle radii scale dynamically with zoom level. */
    dynamicCircleRadius?: boolean
    /** Minimum circle radius in meters (only when dynamicCircleRadius is true). */
    minCircleRadius?: number
    /** Maximum circle radius in meters (only when dynamicCircleRadius is true). */
    maxCircleRadius?: number
    /** Scale factor for dynamic radius (fraction of visible latitude span). */
    circleScaleFactor?: number
    /** When set, nearby annotations merge into cluster bubbles at low zoom. */
    clusteringIdentifier?: string
    /** Custom factory for cluster annotation elements. Receives the cluster and its member count. */
    createClusterElement?: (
      cluster: { memberAnnotations: unknown[]; coordinate: unknown },
      count: number,
    ) => HTMLElement
    annotationSize?: { width: number; height: number }
    zoomSpan?: { lat: number; lng: number }
    boundingPadding?: number
    /** Minimum span in degrees for the bounding region (ensures small areas still show context). */
    minSpanDelta?: number
    fallbackCenter?: { lat: number; lng: number }
    /** When false, disables map scroll (pan) interaction — for static/display-only maps. */
    isScrollEnabled?: boolean
    /** When false, disables map zoom interaction — for static/display-only maps. */
    isZoomEnabled?: boolean
    /** When false, disables map rotation interaction. */
    isRotationEnabled?: boolean
    /** When true, keeps the current map region when items change instead of auto-zooming to fit. */
    preserveRegion?: boolean
    /** When true, selection changes only refresh pins; parent controls camera updates. */
    suppressSelectionZoom?: boolean
    /** When false, hides all point-of-interest labels (road names, city names, etc). */
    showsPointsOfInterest?: boolean
    /** Text label to display at the center of the GeoJSON features. */
    centerLabel?: string
  }>(),
  {
    items: () => [] as unknown as T[],
    createPinElement: undefined,
    geojson: null,
    overlayStyleFn: undefined,
    circles: () => [],
    dynamicCircleRadius: false,
    minCircleRadius: 200,
    maxCircleRadius: 6000,
    circleScaleFactor: 0.004,
    clusteringIdentifier: undefined,
    createClusterElement: undefined,
    annotationSize: () => ({ width: 100, height: 56 }),
    zoomSpan: () => ({ lat: 0.002, lng: 0.0025 }),
    boundingPadding: 0.05,
    minSpanDelta: 0,
    fallbackCenter: () => ({ lat: 30.2672, lng: -97.7431 }),
    isScrollEnabled: true,
    isZoomEnabled: true,
    isRotationEnabled: false,
    preserveRegion: false,
    suppressSelectionZoom: false,
    showsPointsOfInterest: true,
    centerLabel: undefined,
  },
)

const emit = defineEmits<{
  /** Emitted when a GeoJSON polygon overlay is clicked. */
  'feature-select': [feature: GeoJSONFeature]
  /** Emitted when the map background is clicked (not a pin or overlay). */
  'map-click': [coords: { lat: number; lng: number }]
  /** Emitted when the visible map region changes (zoom/pan). */
  'region-change': [
    span: { latDelta: number; lngDelta: number; centerLat: number; centerLng: number },
  ]
  /** Emitted once the internal `mapkit.Map` instance is ready for imperative camera control. */
  'map-ready': []
}>()

const selectedId = defineModel<string | null>('selectedId', { default: null })

const { mapkitReady, mapkitError } = useMapKit()
const mapContainer = ref<HTMLElement | null>(null)

const pinCleanups: Array<() => void> = []
let map: InstanceType<typeof mapkit.Map> | null = null
let overviewRegion: InstanceType<typeof mapkit.CoordinateRegion> | null = null
const overlayFeatureMap = new WeakMap<object, GeoJSONFeature>()

// ── Bounding region ──────────────────────────────────────────

function computeBoundingRegion(): InstanceType<typeof mapkit.CoordinateRegion> | undefined {
  let minLat = Infinity,
    maxLat = -Infinity
  let minLng = Infinity,
    maxLng = -Infinity
  let hasPoints = false

  // From pin items
  for (const s of props.items) {
    if (s.lat < minLat) minLat = s.lat
    if (s.lat > maxLat) maxLat = s.lat
    if (s.lng < minLng) minLng = s.lng
    if (s.lng > maxLng) maxLng = s.lng
    hasPoints = true
  }

  // From GeoJSON features
  if (props.geojson?.features) {
    for (const feat of props.geojson.features) {
      const points = extractAllPoints(feat.geometry)
      for (const [lng, lat] of points) {
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        hasPoints = true
      }
    }
  }

  // From circle overlays
  for (const c of props.circles) {
    if (c.lat < minLat) minLat = c.lat
    if (c.lat > maxLat) maxLat = c.lat
    if (c.lng < minLng) minLng = c.lng
    if (c.lng > maxLng) maxLng = c.lng
    hasPoints = true
  }

  if (hasPoints) {
    const pad = props.boundingPadding
    const minSpan = props.minSpanDelta
    const latDelta = Math.max((maxLat - minLat) * (1 + pad), minSpan, 0.005)
    const lngDelta = Math.max((maxLng - minLng) * (1 + pad), minSpan, 0.006)
    const center = new mapkit.Coordinate((minLat + maxLat) / 2, (minLng + maxLng) / 2)
    return new mapkit.CoordinateRegion(center, new mapkit.CoordinateSpan(latDelta, lngDelta))
  }

  const { lat, lng } = props.fallbackCenter
  return new mapkit.CoordinateRegion(
    new mapkit.Coordinate(lat, lng),
    new mapkit.CoordinateSpan(0.08, 0.1),
  )
}

// ── GeoJSON helpers ──────────────────────────────────────────

function extractAllPoints(geometry: GeoJSONGeometry): Array<[number, number]> {
  const coords = geometry.coordinates
  if (!Array.isArray(coords)) return []

  const points: Array<[number, number]> = []

  if (geometry.type === 'Polygon') {
    const outer = coords[0]
    if (Array.isArray(outer)) {
      for (const pt of outer) {
        if (Array.isArray(pt) && pt.length >= 2) {
          points.push([pt[0] as number, pt[1] as number])
        }
      }
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of coords) {
      if (!Array.isArray(polygon)) continue
      const outer = polygon[0]
      if (!Array.isArray(outer)) continue
      for (const pt of outer) {
        if (Array.isArray(pt) && pt.length >= 2) {
          points.push([pt[0] as number, pt[1] as number])
        }
      }
    }
  } else if (geometry.type === 'LineString') {
    for (const pt of coords) {
      if (Array.isArray(pt) && pt.length >= 2) {
        points.push([pt[0] as number, pt[1] as number])
      }
    }
  }

  return points
}

function defaultOverlayStyle(): OverlayStyle {
  return {
    strokeColor: '#065f46', // eslint-disable-line narduk/no-inline-hex -- MapKit Style API requires raw hex values; Tailwind utilities cannot be used in JS objects
    strokeOpacity: 1,
    fillColor: '#10b981', // eslint-disable-line narduk/no-inline-hex -- MapKit Style API requires raw hex values; Tailwind utilities cannot be used in JS objects
    fillOpacity: 0.2,
    lineWidth: 1.5,
  }
}

function defaultLineOverlayStyle(): OverlayStyle {
  return {
    // eslint-disable-next-line narduk/no-inline-hex -- MapKit Style API requires raw hex values; Tailwind utilities cannot be used in JS objects
    strokeColor: '#0284c7',
    strokeOpacity: 0.92,
    // eslint-disable-next-line narduk/no-inline-hex -- MapKit Style API requires raw hex values; Tailwind utilities cannot be used in JS objects
    fillColor: '#000000',
    fillOpacity: 0,
    lineWidth: 3,
  }
}

function buildPolygonRings(
  geometry: GeoJSONGeometry,
): Array<InstanceType<typeof mapkit.Coordinate>[]> {
  const coords = geometry.coordinates
  if (!Array.isArray(coords)) return []

  const rings: Array<InstanceType<typeof mapkit.Coordinate>[]> = []

  if (geometry.type === 'LineString') {
    return rings
  }

  if (geometry.type === 'Polygon') {
    const outer = coords[0]
    if (Array.isArray(outer)) {
      const ring = outer
        .filter((pt: unknown) => Array.isArray(pt) && (pt as number[]).length >= 2)
        .map((pt: unknown) => new mapkit.Coordinate((pt as number[])[1], (pt as number[])[0]))
      if (ring.length >= 3) rings.push(ring)
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of coords) {
      if (!Array.isArray(polygon)) continue
      const outer = polygon[0]
      if (!Array.isArray(outer)) continue
      const ring = outer
        .filter((pt: unknown) => Array.isArray(pt) && (pt as number[]).length >= 2)
        .map((pt: unknown) => new mapkit.Coordinate((pt as number[])[1], (pt as number[])[0]))
      if (ring.length >= 3) rings.push(ring)
    }
  }

  return rings
}

function buildLineStringCoordinates(
  geometry: GeoJSONGeometry,
): InstanceType<typeof mapkit.Coordinate>[] {
  if (geometry.type !== 'LineString') return []

  const coords = geometry.coordinates
  if (!Array.isArray(coords)) return []

  return coords
    .filter((pt: unknown) => Array.isArray(pt) && (pt as number[]).length >= 2)
    .map((pt: unknown) => new mapkit.Coordinate((pt as number[])[1], (pt as number[])[0]))
}

// ── Map initialization ───────────────────────────────────────

function buildClusterElement(cluster: {
  coordinate: unknown
  memberAnnotations: unknown[]
}): HTMLElement {
  const count = cluster.memberAnnotations?.length ?? 0

  if (!import.meta.client) {
    // SSR mock
    return {
      className: 'mapkit-cluster',
      innerHTML: '',
      setAttribute: () => {},
      style: {},
      addEventListener: () => {},
    } as unknown as HTMLElement
  }

  let el: HTMLElement
  if (props.createClusterElement) {
    el = props.createClusterElement(cluster, count)
  } else {
    // eslint-disable-next-line narduk/no-ssr-dom-access -- guarded by `import.meta.client` check above; document access is safe here
    el = document.createElement('div')
    el.className = 'mapkit-cluster'
    el.innerHTML = `<div class="mapkit-cluster-bubble"><span class="mapkit-cluster-count">${count}</span></div>`
  }

  el.setAttribute('data-map-pin', '')
  el.style.cursor = 'pointer'
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    // Zoom in to reveal individual pins
    if (map && cluster.coordinate) {
      const span = new mapkit.CoordinateSpan(
        map.region.span.latitudeDelta / 3,
        map.region.span.longitudeDelta / 3,
      )
      map.setRegionAnimated(new mapkit.CoordinateRegion(cluster.coordinate, span), true)
    }
  })
  return el
}

function initMap() {
  if (!mapContainer.value) return

  overviewRegion = computeBoundingRegion()

  let isDark = false
  if (import.meta.client) {
    isDark = document.documentElement.classList.contains('dark')
  }

  const excludeAllPoi = !props.showsPointsOfInterest
    ? mapkit.PointOfInterestFilter?.excludingAllCategories
    : null

  // Keep constructor options narrow. Some constructor-time options route through
  // MapKit rotation handling on clients that do not support rotation.
  const mapOpts: Record<string, unknown> = {
    region: overviewRegion,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    showsMapTypeControl: false,
    showsZoomControl: props.isZoomEnabled,
    showsScale: mapkit.FeatureVisibility.Adaptive,
    colorScheme: isDark ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light,
    isZoomEnabled: props.isZoomEnabled,
    isScrollEnabled: props.isScrollEnabled,
    mapType: props.showsPointsOfInterest
      ? mapkit.Map.MapTypes.Standard
      : mapkit.Map.MapTypes.MutedStandard,
  }

  if (excludeAllPoi) {
    mapOpts.pointOfInterestFilter = excludeAllPoi
  } else {
    mapOpts.showsPointsOfInterest = props.showsPointsOfInterest
  }

  // Register cluster annotation factory when clustering is enabled
  if (props.clusteringIdentifier) {
    mapOpts.annotationForCluster = (cluster: {
      coordinate: unknown
      memberAnnotations: unknown[]
    }) => {
      return new mapkit.Annotation(cluster.coordinate, () => buildClusterElement(cluster), {
        anchorOffset: new DOMPoint(0, 0),
        size: { width: 44, height: 44 },
        calloutEnabled: false,
      })
    }
  }

  map = new mapkit.Map(mapContainer.value, mapOpts)

  if (excludeAllPoi && map.pointOfInterestFilter !== excludeAllPoi) {
    map.pointOfInterestFilter = excludeAllPoi
  }

  // Only enable rotation when the client actually supports it.
  if (props.isRotationEnabled && map.isRotationAvailable) {
    map.isRotationEnabled = true
  }

  // Click on map background (not a pin) clears selection + emits coordinates
  // Use a delay to avoid firing on double-click-to-zoom
  let clickTimer: ReturnType<typeof setTimeout> | null = null
  map.element.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('[data-map-pin]')) return

    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      if (selectedId.value) selectedId.value = null

      // Convert page coordinates to map coordinates
      try {
        const point = new DOMPoint(e.pageX, e.pageY)
        const coord = map.convertPointOnPageToCoordinate(point)
        if (coord) {
          emit('map-click', {
            lat: Math.round(coord.latitude * 1e6) / 1e6,
            lng: Math.round(coord.longitude * 1e6) / 1e6,
          })
        }
      } catch {
        // Silently ignore if conversion fails
      }
    }, 250)
  })

  map.element.addEventListener('dblclick', () => {
    if (clickTimer) clearTimeout(clickTimer)
  })

  addAnnotations()
  addOverlays()
  addCenterLabel()
  addCircles()
  resizeCirclesToRegion() // Apply dynamic radius for the initial zoom level

  // Emit region changes for zoom-responsive behavior + dynamic circle radius
  map.addEventListener('region-change-end', () => {
    const region = map.region
    if (region) {
      emit('region-change', {
        latDelta: region.span.latitudeDelta,
        lngDelta: region.span.longitudeDelta,
        centerLat: region.center.latitude,
        centerLng: region.center.longitude,
      })

      // Dynamically resize circles based on visible span
      resizeCirclesToRegion()
    }
  })

  emit('map-ready')
}

// ── Pin annotations ──────────────────────────────────────────

function clearPinCleanups() {
  for (const fn of pinCleanups) fn()
  pinCleanups.length = 0
}

function addAnnotations() {
  if (!map || !props.items.length || !props.createPinElement) return

  const annotations = props.items.map((item) => {
    const coord = new mapkit.Coordinate(item.lat, item.lng)
    const opts: Record<string, unknown> = {
      anchorOffset: new DOMPoint(0, -6),
      calloutEnabled: false,
      size: props.annotationSize,
      data: { id: item.id },
    }
    if (props.clusteringIdentifier) {
      opts.clusteringIdentifier = props.clusteringIdentifier
    }
    return new mapkit.Annotation(
      coord,
      () => {
        const isSelected = selectedId.value === item.id
        const { element, cleanup } = props.createPinElement!(item, isSelected)

        const wrapper = import.meta.client ? document.createElement('div') : ({} as HTMLElement)
        wrapper.setAttribute('data-map-pin', '')
        wrapper.style.cursor = 'pointer'
        wrapper.appendChild(element)
        wrapper.addEventListener('click', (e) => {
          e.stopPropagation()
          selectedId.value = selectedId.value === item.id ? null : item.id
        })

        if (cleanup) pinCleanups.push(cleanup)

        return wrapper
      },
      opts,
    )
  })
  map.addAnnotations(annotations)
}

function rebuildAnnotations() {
  if (!map) return
  clearPinCleanups()
  map.removeAnnotations(map.annotations)
  addAnnotations()
}

// ── Polygon overlays ─────────────────────────────────────────

function addOverlays() {
  if (!map || !props.geojson?.features?.length) return

  for (const feature of props.geojson.features) {
    const lineCoordinates = buildLineStringCoordinates(feature.geometry)
    if (lineCoordinates.length >= 2) {
      const styleCfg = props.overlayStyleFn
        ? props.overlayStyleFn(feature.properties)
        : defaultLineOverlayStyle()

      const style = new mapkit.Style({
        strokeColor: styleCfg.strokeColor,
        strokeOpacity: styleCfg.strokeOpacity ?? 1,
        fillColor: styleCfg.fillColor,
        fillOpacity: styleCfg.fillOpacity ?? 0,
        lineWidth: styleCfg.lineWidth ?? 3,
      })

      const overlay = new mapkit.PolylineOverlay(lineCoordinates, { style })
      overlay.enabled = true
      overlayFeatureMap.set(overlay, feature)
      map.addOverlay(overlay)
      continue
    }

    const rings = buildPolygonRings(feature.geometry)
    if (rings.length === 0) continue

    const styleCfg = props.overlayStyleFn
      ? props.overlayStyleFn(feature.properties)
      : defaultOverlayStyle()

    const style = new mapkit.Style({
      strokeColor: styleCfg.strokeColor,
      strokeOpacity: styleCfg.strokeOpacity ?? 1,
      fillColor: styleCfg.fillColor,
      fillOpacity: styleCfg.fillOpacity ?? 0.2,
      lineWidth: styleCfg.lineWidth,
    })

    for (const ring of rings) {
      const overlay = new mapkit.PolygonOverlay(ring, { style })
      overlay.enabled = true
      overlayFeatureMap.set(overlay, feature)
      map.addOverlay(overlay)
    }
  }

  // Listen for overlay selection
  map.addEventListener('select', (event: { overlay?: object }) => {
    const overlay = event.overlay
    if (!overlay) return
    const feature = overlayFeatureMap.get(overlay)
    if (feature) {
      emit('feature-select', feature)
    }
  })
}

function clearOverlays() {
  if (!map) return
  map.removeOverlays(map.overlays)
}

// ── Center label annotation ─────────────────────────────────────
let centerLabelAnnotation: InstanceType<typeof mapkit.Annotation> | null = null

function addCenterLabel() {
  if (!map || !props.centerLabel) return

  const region = computeBoundingRegion()
  const center = region.center

  let isDark = false
  if (import.meta.client) {
    isDark = document.documentElement.classList.contains('dark')
  }

  const el = import.meta.client ? document.createElement('div') : ({} as HTMLElement)
  el.style.cssText = `
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    pointer-events: none;
    text-shadow: ${
      isDark
        ? '0 1px 4px rgba(0,0,0,0.5), 0 0 12px rgba(0,0,0,0.3)'
        : '0 0 4px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.1)'
    };
    color: ${isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)'};
  `
  el.textContent = props.centerLabel

  centerLabelAnnotation = new mapkit.Annotation(center, () => el, {
    anchorOffset: new DOMPoint(0, 0),
    calloutEnabled: false,
    animates: false,
  })
  map.addAnnotation(centerLabelAnnotation)
}

// ── Circle overlays (lightweight dots) ──────────────────────────
const circleOverlayRefs: InstanceType<typeof mapkit.CircleOverlay>[] = []

function addCircles() {
  if (!map || !props.circles?.length) return
  for (const c of props.circles) {
    const center = new mapkit.Coordinate(c.lat, c.lng)
    const style = new mapkit.Style({
      fillColor: c.color,
      fillOpacity: c.opacity ?? 0.7,
      strokeColor: c.color,
      strokeOpacity: 0,
      lineWidth: 0,
    })
    const circle = new mapkit.CircleOverlay(center, c.radius, { style })
    circleOverlayRefs.push(circle)
    map.addOverlay(circle)
  }
}

function clearCircles() {
  if (!map) return
  for (const c of circleOverlayRefs) {
    map.removeOverlay(c)
  }
  circleOverlayRefs.length = 0
}

/** Resize all circle overlays proportionally to the current visible map region. */
function resizeCirclesToRegion() {
  if (!map || !props.dynamicCircleRadius || circleOverlayRefs.length === 0) return
  const region = map.region
  if (!region) return
  const latDelta = region.span.latitudeDelta
  // 1 degree latitude ≈ 111,320 meters
  const rawRadius = latDelta * 111_320 * props.circleScaleFactor
  const clampedRadius = Math.max(props.minCircleRadius, Math.min(props.maxCircleRadius, rawRadius))
  for (const c of circleOverlayRefs) {
    c.radius = clampedRadius
  }
}

// ── Zoom behavior ────────────────────────────────────────────

function zoomToItem(item: T) {
  if (!map) return
  const center = new mapkit.Coordinate(item.lat, item.lng)
  const span = new mapkit.CoordinateSpan(props.zoomSpan.lat, props.zoomSpan.lng)
  map.setRegionAnimated(new mapkit.CoordinateRegion(center, span), true)
}

function zoomOut() {
  if (!map || !overviewRegion) return
  map.setRegionAnimated(overviewRegion, true)
}

// ── Watchers ─────────────────────────────────────────────────

// Re-render annotations and handle zoom when selection changes
watch(selectedId, (newId) => {
  if (!map) return
  rebuildAnnotations()
  if (props.suppressSelectionZoom) return
  if (newId) {
    const item = props.items.find((i) => i.id === newId)
    if (item) zoomToItem(item)
  } else {
    zoomOut()
  }
})

// Re-render annotations and zoom to fit when items change
watch(
  () => props.items,
  () => {
    if (!map) return
    if (props.preserveRegion) {
      clearPinCleanups()
      map.removeAnnotations(map.annotations)
      addAnnotations()
      return
    }

    selectedId.value = null
    clearPinCleanups()
    map.removeAnnotations(map.annotations)
    overviewRegion = computeBoundingRegion()
    map.setRegionAnimated(overviewRegion, true)
    addAnnotations()
  },
  { deep: false },
)

// Re-render overlays when geojson changes (preserve zoom)
watch(
  () => props.geojson,
  () => {
    if (!map) return
    clearOverlays()
    addOverlays()
  },
  { deep: false },
)

// Re-render circles when circles change (preserve zoom)
watch(
  () => props.circles,
  () => {
    if (!map) return
    clearCircles()
    addCircles()
  },
  { deep: false },
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Color Mode types depend on build-time module resolution
const colorMode = useColorMode() as any
watch(
  () => colorMode.value,
  (mode) => {
    if (map) {
      map.colorScheme =
        mode === 'dark' ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light
    }
  },
)

watch(mapkitReady, (ready) => {
  if (ready) nextTick(initMap)
})

onMounted(() => {
  if (mapkitReady.value) initMap()
})

onBeforeUnmount(() => {
  clearPinCleanups()
  if (map) {
    map.destroy()
    map = null
  }
})

function scrollIntoView() {
  mapContainer.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setRegion(center: { lat: number; lng: number }, span?: { lat: number; lng: number }) {
  if (!map) return
  const coord = new mapkit.Coordinate(center.lat, center.lng)
  const s = new mapkit.CoordinateSpan(span?.lat ?? 0.01, span?.lng ?? 0.01)
  map.setRegionAnimated(new mapkit.CoordinateRegion(coord, s), true)
}
function zoomToFit(zoomOutLevels = 0) {
  if (!map) return
  const region = computeBoundingRegion()
  if (!region) return

  let latDelta = region.span.latitudeDelta
  let lngDelta = region.span.longitudeDelta
  for (let i = 0; i < zoomOutLevels; i++) {
    latDelta *= 2
    lngDelta *= 2
  }

  map.setRegionAnimated(
    new mapkit.CoordinateRegion(region.center, new mapkit.CoordinateSpan(latDelta, lngDelta)),
    true,
  )
}

defineExpose({ scrollIntoView, setRegion, zoomToFit })
</script>

<template>
  <div class="mapkit-wrapper relative isolate overflow-hidden">
    <div
      v-if="mapkitError"
      class="mapkit-status absolute inset-0 flex flex-col items-center justify-center z-10 bg-muted/20 backdrop-blur-sm"
    >
      <UIcon name="i-lucide-map-off" class="size-10 text-warning mb-3" />
      <h3 class="text-lg font-bold font-display mb-1">Map Unavailable</h3>
      <p class="text-sm text-muted">{{ mapkitError }}</p>
    </div>

    <div
      v-else-if="!mapkitReady"
      class="mapkit-status absolute inset-0 flex flex-col items-center justify-center z-10 bg-muted/20 backdrop-blur-sm"
    >
      <UIcon name="i-lucide-loader-2" class="size-8 text-primary animate-spin" />
      <p class="text-sm text-muted mt-3">Loading map…</p>
    </div>

    <div
      ref="mapContainer"
      class="mapkit-canvas absolute inset-0 w-full h-full transition-opacity duration-500 ease-out"
      :class="{ 'opacity-0': !mapkitReady, 'opacity-100': mapkitReady }"
    />
  </div>
</template>
