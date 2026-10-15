import type { BinMeta, IndexEntry } from './types.ts'
import { COL_MIN_PX, LABEL_ROW_PX, MARKER_CAP, MIN_PX_PER_YEAR } from './types.ts'
import { clamp } from '../camera/scale.ts'

export function effectiveSalience(entry: IndexEntry, regions?: string[]): number {
  if (!regions?.length || !entry.salienceByRegion) return entry.salience
  let found = false
  let best = -Infinity
  for (const r of regions) {
    const v = entry.salienceByRegion[r]
    if (v != null) {
      found = true
      if (v > best) best = v
    }
  }
  return found ? best : entry.salience
}

export function columnCountForWidth(width: number, laneCount = 1): number {
  const mobile = width < 720
  if (mobile) return 1
  const usable = Math.max(COL_MIN_PX, width - 88 - 52)
  const perLane = usable / Math.max(1, laneCount)
  return clamp(Math.floor(perLane / COL_MIN_PX), 1, 8)
}

/**
 * One bin ≈ one label-row of pixels. top-K is the number of horizontal
 * columns that fit, so left and right of the spine stay filled.
 */
export function binParamsForZoom(
  pxPerYear: number,
  _viewportHeight: number,
  viewportWidth = 1200,
  laneCount = 1,
): { size: number; topK: number } {
  const size = Math.max(1 / 365.25, LABEL_ROW_PX / Math.max(pxPerYear, MIN_PX_PER_YEAR))
  const cols = columnCountForWidth(viewportWidth, laneCount)
  return { size, topK: Math.max(1, cols) }
}

export function matchesFilters(
  entry: { regions: string[]; subjects: string[] },
  regions?: string[],
  subjects?: string[],
): boolean {
  if (regions?.length && !regions.some((r) => entry.regions.includes(r))) return false
  if (subjects?.length && !subjects.some((s) => entry.subjects.includes(s))) return false
  return true
}

function binIndex(year: number, fromYear: number, size: number): number {
  return Math.floor((year - fromYear) / size)
}

export interface DensitySelectInput {
  events: IndexEntry[]
  fromYear: number
  toYear: number
  size: number
  topK: number
  regions?: string[]
  keepIds?: string[]
  cap?: number
}

export interface DensitySelectResult {
  selected: IndexEntry[]
  bins: BinMeta[]
}

function rank(a: IndexEntry, b: IndexEntry, regions: string[] | undefined): number {
  const sa = effectiveSalience(a, regions)
  const sb = effectiveSalience(b, regions)
  if (sb !== sa) return sb - sa
  if (a.startYear !== b.startYear) return a.startYear - b.startYear
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Density-based selection: after filters, take top-K by salience per zoom-sized bin.
 * Deterministic for a given {events, range, bins, keepIds}.
 */
export function densitySelect(input: DensitySelectInput): DensitySelectResult {
  const { events, fromYear, toYear, size, topK, regions, keepIds } = input
  const cap = input.cap ?? MARKER_CAP
  const keep = new Set(keepIds ?? [])
  const span = Math.max(size, toYear - fromYear)
  const nBins = Math.max(1, Math.ceil(span / size))
  const buckets: IndexEntry[][] = Array.from({ length: nBins }, () => [])

  for (const e of events) {
    const y = e.startYear
    if (y >= toYear || (e.endYear ?? e.startYear) < fromYear) continue
    let i = binIndex(y, fromYear, size)
    if (i < 0) i = 0
    if (i >= nBins) i = nBins - 1
    buckets[i].push(e)
  }

  const bins: BinMeta[] = []
  const picked: IndexEntry[] = []

  for (let i = 0; i < nBins; i++) {
    const binFrom = fromYear + i * size
    const binTo = Math.min(toYear, binFrom + size)
    const members = buckets[i]
    members.sort((a, b) => rank(a, b, regions))
    const margin = topK + 3
    const keptHere = members.filter((e) => keep.has(e.id)).slice(0, topK)
    const chosen: IndexEntry[] = []
    const chosenIds = new Set<string>()
    for (const e of keptHere) {
      const idx = members.indexOf(e)
      if (idx >= 0 && idx < margin && chosen.length < topK) {
        chosen.push(e)
        chosenIds.add(e.id)
      }
    }
    for (const e of members) {
      if (chosen.length >= topK) break
      if (chosenIds.has(e.id)) continue
      chosen.push(e)
      chosenIds.add(e.id)
    }
    bins.push({ fromYear: binFrom, toYear: binTo, count: members.length, shown: chosen.length })
    picked.push(...chosen)
  }

  picked.sort((a, b) => rank(a, b, regions))
  const limited = picked.slice(0, cap)

  const adjusted: BinMeta[] = bins.map((b) => {
    let shown = 0
    for (const e of limited) {
      if (e.startYear >= b.fromYear && e.startYear < b.toYear) shown += 1
    }
    return { ...b, shown }
  })

  limited.sort((a, b) => a.startYear - b.startYear || (a.id < b.id ? -1 : 1))
  return { selected: limited, bins: adjusted }
}

/** Per-lane selection when two or more regions are active. */
export function densitySelectLanes(
  events: IndexEntry[],
  lanes: string[],
  fromYear: number,
  toYear: number,
  size: number,
  topK: number,
  keepIds?: string[],
): DensitySelectResult {
  const perLaneCap = Math.max(12, Math.floor(MARKER_CAP / Math.max(1, lanes.length)))
  const all: IndexEntry[] = []
  const mergedBins = new Map<string, BinMeta>()

  for (const lane of lanes) {
    const subset = events.filter((e) => e.regions.includes(lane))
    const result = densitySelect({
      events: subset,
      fromYear,
      toYear,
      size,
      topK,
      regions: [lane],
      keepIds,
      cap: perLaneCap,
    })
    for (const e of result.selected) {
      all.push({ ...e })
    }
    for (const b of result.bins) {
      const key = `${b.fromYear}:${b.toYear}`
      const prev = mergedBins.get(key)
      if (!prev) mergedBins.set(key, { ...b })
      else mergedBins.set(key, {
        ...prev,
        count: prev.count + b.count,
        shown: prev.shown + b.shown,
      })
    }
  }

  all.sort((a, b) => effectiveSalience(b) - effectiveSalience(a) || a.id.localeCompare(b.id))
  const limited = all.slice(0, MARKER_CAP)
  limited.sort((a, b) => a.startYear - b.startYear || a.id.localeCompare(b.id))
  return {
    selected: limited,
    bins: [...mergedBins.values()].sort((a, b) => a.fromYear - b.fromYear),
  }
}
