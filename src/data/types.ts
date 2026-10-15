export type Precision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'circa'
export type Importance = 1 | 2 | 3 | 4 | 5

export interface HistoryEvent {
  id: string
  title: string
  startYear: number
  startMonth?: number
  startDay?: number
  endYear?: number | null
  precision: Precision
  salience: number
  salienceByRegion?: Record<string, number>
  importance: Importance
  regions: string[]
  subjects: string[]
  summary: string
  body: string
  sources: { name: string; url?: string }[]
  image?: string
  lat?: number
  lng?: number
  synthetic?: boolean
}

export type EventMarker = Omit<HistoryEvent, 'body' | 'sources'> & {
  /** Runtime lane assignment when parallel regions are selected. */
  lane?: string
}

export interface IndexEntry {
  id: string
  startYear: number
  endYear?: number | null
  salience: number
  salienceByRegion?: Record<string, number>
  regions: string[]
  subjects: string[]
  synthetic?: boolean
}

/** Precomputed, normalized text for search ranking. `title` alone lets a match
 * in the title outrank one buried in the summary. */
export interface SearchEntry {
  title: string
  text: string
}

export interface TaxonomyTerm {
  slug: string
  label: string
}

export interface Taxonomy {
  regions: TaxonomyTerm[]
  subjects: TaxonomyTerm[]
}

export interface Era {
  id: string
  label: string
  startYear: number
  endYear: number
  regions: string[]
}

export interface Manifest {
  minYear: number
  maxYear: number
  eventCount: number
  buckets: number[]
  maxSpanYears: number
  generatedAt: string
}

export interface ListQuery {
  fromYear: number
  toYear: number
  regions?: string[]
  subjects?: string[]
  q?: string
  bins: { size: number; topK: number }
  signal?: AbortSignal
  includeSynthetic?: boolean
  /** Previously shown ids, for hysteresis. Empty on a fresh URL load. */
  keepIds?: string[]
}

export interface BinMeta {
  fromYear: number
  toYear: number
  count: number
  shown: number
}

export interface ListResult {
  items: EventMarker[]
  total: number
  bins: BinMeta[]
}

export interface DensityBin {
  year: number
  count: number
}

export interface Camera {
  centerYear: number
  pxPerYear: number
}

export interface Viewport {
  width: number
  height: number
}

export const MARKER_CAP = 150
/** Vertical space one labelled marker needs (date + title + two-line blurb). */
export const LABEL_ROW_PX = 80
export const COL_MIN_PX = 220
export const TARGET_BIN_PX = LABEL_ROW_PX
export const MIN_PX_PER_YEAR = 0.06
export const MAX_PX_PER_YEAR = 96
export const BAR_MIN_PX = 6
/** Most-recent year the camera will show (top of the timeline). */
export const TIMELINE_MAX_YEAR = 2500
