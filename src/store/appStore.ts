import type { Camera, DensityBin, Era, EventMarker, HistoryEvent, ListResult, Taxonomy, Viewport } from '../data/types.ts'
import { MIN_PX_PER_YEAR, TIMELINE_MAX_YEAR } from '../data/types.ts'
import { parseUrl, serializeUrl } from '../url/urlState.ts'
import { applyTheme, readThemePref, resolvedTheme, type ThemePref } from '../theme/theme.ts'
import { clampCamera, fitWorld } from '../camera/scale.ts'
import type { WarpTable } from '../camera/warp.ts'

export interface Filters {
  regions: string[]
  subjects: string[]
}

export interface AppState {
  camera: Camera
  viewport: Viewport
  filters: Filters
  query: string
  searchOpen: boolean
  selectedId: string | null
  hoveredId: string | null
  detailId: string | null
  listOpen: boolean
  filtersOpen: boolean
  compressEmpty: boolean
  synthetic: boolean
  themePref: ThemePref
  theme: 'light' | 'dark'
  visible: ListResult
  contextBars: EventMarker[]
  taxonomy: Taxonomy | null
  eras: Era[]
  minYear: number
  maxYear: number
  detail: HistoryEvent | null
  searchResults: EventMarker[]
  warp: WarpTable | null
  histogram: DensityBin[]
  status: string
  markerFocusId: string | null
  /** True until the initial taxonomy/eras/manifest load resolves (success or failure). */
  loading: boolean
  /** Set when the initial load fails; cleared on retry. User-facing message. */
  loadError: string | null
}

type Listener = () => void

const listeners = new Set<Listener>()

const initialUrl = typeof window !== 'undefined' ? parseUrl(window.location.search) : parseUrl('')

let state: AppState = {
  camera: {
    centerYear: initialUrl.centerYear ?? 1000,
    pxPerYear: initialUrl.pxPerYear ?? MIN_PX_PER_YEAR * 4,
  },
  viewport: { width: 1200, height: 800 },
  filters: { regions: initialUrl.regions, subjects: initialUrl.subjects },
  query: initialUrl.q ?? '',
  searchOpen: false,
  selectedId: initialUrl.event ?? null,
  hoveredId: null,
  detailId: null,
  listOpen: false,
  filtersOpen: false,
  compressEmpty: false,
  synthetic: initialUrl.synthetic,
  themePref: 'system',
  theme: 'dark',
  visible: { items: [], total: 0, bins: [] },
  contextBars: [],
  taxonomy: null,
  eras: [],
  minYear: -3000,
  maxYear: TIMELINE_MAX_YEAR,
  detail: null,
  searchResults: [],
  warp: null,
  histogram: [],
  status: '',
  markerFocusId: null,
  loading: true,
  loadError: null,
}

export function getState(): AppState {
  return state
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const l of listeners) l()
}

export function patch(partial: Partial<AppState>): void {
  state = { ...state, ...partial }
  emit()
}

export function setCamera(camera: Camera): void {
  const next = clampCamera(camera, state.minYear, state.maxYear, state.viewport, state.warp)
  if (next.centerYear === state.camera.centerYear && next.pxPerYear === state.camera.pxPerYear) return
  state = { ...state, camera: next }
  emit()
}

export function setViewport(viewport: Viewport): void {
  if (viewport.width === state.viewport.width && viewport.height === state.viewport.height) return
  state = { ...state, viewport }
  emit()
}

export function setFilters(filters: Filters): void {
  state = { ...state, filters, selectedId: state.selectedId }
  emit()
}

export function toggleFilter(group: 'regions' | 'subjects', slug: string): void {
  const cur = state.filters[group]
  const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]
  setFilters({ ...state.filters, [group]: next })
}

export function clearFilters(): void {
  setFilters({ regions: [], subjects: [] })
}

export function initTheme(): void {
  const pref = readThemePref()
  applyTheme(pref)
  state = { ...state, themePref: pref, theme: resolvedTheme(pref) }
  emit()
}

export function setThemePref(pref: ThemePref): void {
  applyTheme(pref)
  state = { ...state, themePref: pref, theme: resolvedTheme(pref) }
  emit()
}

export function fitToWorld(): void {
  setCamera(fitWorld(state.viewport, state.minYear, state.maxYear))
}

export function writeUrl(): void {
  if (typeof window === 'undefined') return
  const url = serializeUrl({
    camera: state.camera,
    regions: state.filters.regions,
    subjects: state.filters.subjects,
    event: state.selectedId,
    q: state.query || undefined,
    synthetic: state.synthetic,
  })
  const next = `${window.location.pathname}${url}`
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', next)
  }
}

export function applyRange(minYear: number, maxYear: number): void {
  const end = Math.min(maxYear, TIMELINE_MAX_YEAR)
  const parsed = parseUrl(typeof window !== 'undefined' ? window.location.search : '')
  let camera = state.camera
  if (parsed.centerYear == null && parsed.pxPerYear == null) {
    camera = fitWorld(state.viewport, minYear, end)
  } else {
    camera = clampCamera(
      {
        centerYear: parsed.centerYear ?? camera.centerYear,
        pxPerYear: parsed.pxPerYear ?? camera.pxPerYear,
      },
      minYear,
      end,
      state.viewport,
      state.warp,
    )
  }
  state = { ...state, minYear, maxYear: end, camera }
  emit()
}
