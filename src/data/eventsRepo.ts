/**
 * The only data-access module the UI may import.
 *
 * Today this talks to local generated JSON via `fetch`. A future HTTP API
 * replaces this file (or its backend) with `fetch('/api/events?...')` —
 * same shapes, same params. Nothing in the UI should change.
 */
import type {
  DensityBin,
  Era,
  EventMarker,
  HistoryEvent,
  IndexEntry,
  ListQuery,
  ListResult,
  Manifest,
  SearchEntry,
  Taxonomy,
} from './types.ts'
import { MARKER_CAP } from './types.ts'
import { densitySelect, densitySelectLanes, matchesFilters } from './density.ts'
import { sliceOverlapping } from './binSearch.ts'
import { yearBucket } from './years.ts'
import { normalizeSearch } from './text.ts'

export interface RepoBackend {
  loadIndex(includeSynthetic: boolean, signal?: AbortSignal): Promise<IndexEntry[]>
  loadManifest(includeSynthetic: boolean, signal?: AbortSignal): Promise<Manifest>
  loadMarkers(entries: IndexEntry[], signal?: AbortSignal): Promise<EventMarker[]>
  loadDetail(id: string, includeSynthetic: boolean, signal?: AbortSignal): Promise<HistoryEvent>
  loadSearchIndex(includeSynthetic: boolean, signal?: AbortSignal): Promise<Record<string, SearchEntry>>
  loadTaxonomy(signal?: AbortSignal): Promise<Taxonomy>
  loadEras(signal?: AbortSignal): Promise<Era[]>
  prefetchBuckets(buckets: { year: number; synthetic: boolean }[]): Promise<void>
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Aborted')
    err.name = 'AbortError'
    throw err
  }
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
  return (await res.json()) as T
}

function mergeIndex(seed: IndexEntry[], extra: IndexEntry[]): IndexEntry[] {
  const map = new Map<string, IndexEntry>()
  for (const e of seed) map.set(e.id, e)
  for (const e of extra) map.set(e.id, e)
  return [...map.values()].sort((a, b) => a.startYear - b.startYear || a.id.localeCompare(b.id))
}

export function createHttpBackend(base = '/data/generated'): RepoBackend {
  const bucketCache = new Map<string, EventMarker[]>()
  const markerCache = new Map<string, EventMarker>()
  let seedIndex: IndexEntry[] | null = null
  let synIndex: IndexEntry[] | null = null
  let taxonomy: Taxonomy | null = null
  let eras: Era[] | null = null
  let seedManifest: Manifest | null = null
  let synManifest: Manifest | null = null
  let searchSeed: Record<string, SearchEntry> | null = null
  let searchSyn: Record<string, SearchEntry> | null = null

  async function getSeedIndex(signal?: AbortSignal): Promise<IndexEntry[]> {
    if (!seedIndex) seedIndex = await fetchJson<IndexEntry[]>(`${base}/index.json`, signal)
    return seedIndex
  }
  async function getSynIndex(signal?: AbortSignal): Promise<IndexEntry[]> {
    if (!synIndex) {
      try {
        synIndex = await fetchJson<IndexEntry[]>(`${base}/synthetic/index.json`, signal)
      } catch {
        synIndex = []
      }
    }
    return synIndex
  }

  const inflight = new Map<string, Promise<void>>()

  async function loadBucket(bucket: number, synthetic: boolean, signal?: AbortSignal): Promise<void> {
    const key = `${synthetic ? 's' : 'r'}:${bucket}`
    if (bucketCache.has(key)) return
    const pending = inflight.get(key)
    if (pending) {
      await pending
      return
    }
    const url = synthetic
      ? `${base}/synthetic/events/${bucket}.json`
      : `${base}/events/${bucket}.json`
    const work = (async () => {
      try {
        // Never abort bucket fetches — finish and cache so pan/zoom stays warm.
        const rows = await fetchJson<EventMarker[]>(url)
        bucketCache.set(key, rows)
        for (const r of rows) markerCache.set(r.id, r)
      } catch {
        bucketCache.set(key, [])
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, work)
    await work
    throwIfAborted(signal)
  }

  return {
    async loadIndex(includeSynthetic, signal) {
      const seed = await getSeedIndex(signal)
      if (!includeSynthetic) return seed
      return mergeIndex(seed, await getSynIndex(signal))
    },
    async loadManifest(includeSynthetic, signal) {
      if (!seedManifest) seedManifest = await fetchJson<Manifest>(`${base}/manifest.json`, signal)
      if (!includeSynthetic) return seedManifest
      if (!synManifest) {
        try {
          synManifest = await fetchJson<Manifest>(`${base}/synthetic/manifest.json`, signal)
        } catch {
          synManifest = seedManifest
        }
      }
      return {
        minYear: Math.min(seedManifest.minYear, synManifest.minYear),
        maxYear: Math.max(seedManifest.maxYear, synManifest.maxYear),
        eventCount: seedManifest.eventCount + synManifest.eventCount,
        buckets: [...new Set([...seedManifest.buckets, ...synManifest.buckets])].sort((a, b) => a - b),
        maxSpanYears: Math.max(seedManifest.maxSpanYears, synManifest.maxSpanYears),
        generatedAt: seedManifest.generatedAt,
      }
    },
    async loadMarkers(entries, signal) {
      const missing = entries.filter((e) => !markerCache.has(e.id))
      const needed = new Map<string, { bucket: number; synthetic: boolean }>()
      for (const e of missing) {
        const synthetic = !!e.synthetic
        needed.set(`${synthetic ? 's' : 'r'}:${yearBucket(e.startYear)}`, {
          bucket: yearBucket(e.startYear),
          synthetic,
        })
      }
      await Promise.all([...needed.values()].map((n) => loadBucket(n.bucket, n.synthetic, signal)))
      const out: EventMarker[] = []
      for (const e of entries) {
        const m = markerCache.get(e.id)
        if (m) out.push({ ...m })
      }
      return out
    },
    async loadDetail(id, includeSynthetic, signal) {
      throwIfAborted(signal)
      try {
        return await fetchJson<HistoryEvent>(`${base}/details/${id}.json`, signal)
      } catch {
        if (includeSynthetic || id.startsWith('syn-')) {
          const marker = await findSyntheticMarker(base, id, signal)
          if (marker) {
            return {
              ...marker,
              body: `${marker.summary}\n\nThis record is synthetic filler generated for density and performance tests. It is not a historical source.`,
              sources: [{ name: 'Synthetic corpus (not historical)' }],
            }
          }
        }
        throw new Error(`Unknown event: ${id}`)
      }
    },
    async loadSearchIndex(includeSynthetic, signal) {
      if (!searchSeed) searchSeed = await fetchJson<Record<string, SearchEntry>>(`${base}/search-index.json`, signal)
      if (!includeSynthetic) return searchSeed
      if (!searchSyn) {
        try {
          searchSyn = await fetchJson<Record<string, SearchEntry>>(`${base}/synthetic/search-index.json`, signal)
        } catch {
          searchSyn = {}
        }
      }
      return { ...searchSeed, ...searchSyn }
    },
    async loadTaxonomy(signal) {
      if (!taxonomy) taxonomy = await fetchJson<Taxonomy>(`${base}/taxonomy.json`, signal)
      return taxonomy
    },
    async loadEras(signal) {
      if (!eras) eras = await fetchJson<Era[]>(`${base}/eras.json`, signal)
      return eras
    },
    async prefetchBuckets(buckets) {
      await Promise.all(buckets.map((b) => loadBucket(b.year, b.synthetic)))
    },
  }
}

async function findSyntheticMarker(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<EventMarker | null> {
  const m = id.match(/^syn-(-?\d+)-/)
  if (!m) return null
  const bucket = Number(m[1])
  try {
    const rows = await fetchJson<EventMarker[]>(`${base}/synthetic/events/${bucket}.json`, signal)
    return rows.find((r) => r.id === id) ?? null
  } catch {
    return null
  }
}

let backend: RepoBackend = createHttpBackend()

export function setRepoBackend(next: RepoBackend): void {
  backend = next
}

export async function listEvents(q: ListQuery): Promise<ListResult> {
  throwIfAborted(q.signal)
  const includeSynthetic = !!q.includeSynthetic
  const [index, manifest] = await Promise.all([
    backend.loadIndex(includeSynthetic, q.signal),
    backend.loadManifest(includeSynthetic, q.signal),
  ])
  throwIfAborted(q.signal)
  let candidates = sliceOverlapping(index, q.fromYear, q.toYear, manifest.maxSpanYears)
  candidates = candidates.filter((e) => matchesFilters(e, q.regions, q.subjects))
  if (q.q && q.q.trim()) {
    const si = await backend.loadSearchIndex(includeSynthetic, q.signal)
    const needle = normalize(q.q)
    candidates = candidates.filter((e) => (si[e.id]?.text ?? '').includes(needle))
  }
  const total = candidates.length
  const lanes = q.regions && q.regions.length >= 2 ? q.regions : null
  const picked = lanes
    ? densitySelectLanes(
        candidates,
        lanes,
        q.fromYear,
        q.toYear,
        q.bins.size,
        q.bins.topK,
        q.keepIds,
      )
    : densitySelect({
        events: candidates,
        fromYear: q.fromYear,
        toYear: q.toYear,
        size: q.bins.size,
        topK: q.bins.topK,
        regions: q.regions,
        keepIds: q.keepIds,
        cap: MARKER_CAP,
      })
  throwIfAborted(q.signal)
  const items = await backend.loadMarkers(picked.selected, q.signal)
  if (lanes) {
    for (const item of items) item.lane = pickLane(item, lanes)
  }
  return { items, total, bins: picked.bins }
}

let seedWarmStarted = false

/** Load century buckets around a range so the next pan does not wait on fetch. */
export async function prefetchAround(
  fromYear: number,
  toYear: number,
  includeSynthetic = false,
): Promise<void> {
  const lo = yearBucket(fromYear) - 200
  const hi = yearBucket(toYear) + 200
  const specs: { year: number; synthetic: boolean }[] = []
  for (let y = lo; y <= hi; y += 100) {
    specs.push({ year: y, synthetic: false })
    if (includeSynthetic) specs.push({ year: y, synthetic: true })
  }
  await backend.prefetchBuckets(specs)
  if (!seedWarmStarted && !includeSynthetic) {
    seedWarmStarted = true
    void backend.loadManifest(false).then((m) => {
      void backend.prefetchBuckets(m.buckets.map((year) => ({ year, synthetic: false })))
    })
  }
}

export async function getEvent(
  id: string,
  opts?: { signal?: AbortSignal; includeSynthetic?: boolean },
): Promise<HistoryEvent> {
  return backend.loadDetail(id, !!opts?.includeSynthetic, opts?.signal)
}

/**
 * Score a candidate against the search needle so a title match always beats
 * one buried in the summary, and a prefix match beats a mid-word one.
 * Returns 0 (no match) to 4 (best).
 */
function matchScore(entry: SearchEntry, needle: string): number {
  if (entry.title.startsWith(needle)) return 4
  if (entry.title.includes(` ${needle}`)) return 3
  if (entry.title.includes(needle)) return 2
  if (entry.text.includes(needle)) return 1
  return 0
}

export async function searchEvents(
  q: string,
  signal?: AbortSignal,
  includeSynthetic = false,
): Promise<EventMarker[]> {
  throwIfAborted(signal)
  const needle = normalize(q)
  if (!needle) return []
  const [index, si] = await Promise.all([
    backend.loadIndex(includeSynthetic, signal),
    backend.loadSearchIndex(includeSynthetic, signal),
  ])
  throwIfAborted(signal)
  const hits: { entry: IndexEntry; score: number }[] = []
  for (const e of index) {
    const s = si[e.id]
    if (!s) continue
    const score = matchScore(s, needle)
    if (score > 0) hits.push({ entry: e, score })
  }
  hits.sort(
    (a, b) => b.score - a.score || b.entry.salience - a.entry.salience || a.entry.id.localeCompare(b.entry.id),
  )
  return backend.loadMarkers(
    hits.slice(0, 40).map((h) => h.entry),
    signal,
  )
}

export async function getTaxonomy(signal?: AbortSignal): Promise<Taxonomy> {
  return backend.loadTaxonomy(signal)
}

export async function getEras(signal?: AbortSignal): Promise<Era[]> {
  return backend.loadEras(signal)
}

export async function getManifest(includeSynthetic = false, signal?: AbortSignal): Promise<Manifest> {
  return backend.loadManifest(includeSynthetic, signal)
}

export async function getDensityHistogram(
  opts: {
    regions?: string[]
    subjects?: string[]
    includeSynthetic?: boolean
    signal?: AbortSignal
  } = {},
): Promise<DensityBin[]> {
  const index = await backend.loadIndex(!!opts.includeSynthetic, opts.signal)
  const counts = new Map<number, number>()
  for (const e of index) {
    if (!matchesFilters(e, opts.regions, opts.subjects)) continue
    const b = yearBucket(e.startYear)
    counts.set(b, (counts.get(b) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count }))
}

export async function listContextBars(
  q: Pick<ListQuery, 'fromYear' | 'toYear' | 'regions' | 'subjects' | 'signal' | 'includeSynthetic'>,
): Promise<EventMarker[]> {
  const [index, manifest] = await Promise.all([
    backend.loadIndex(!!q.includeSynthetic, q.signal),
    backend.loadManifest(!!q.includeSynthetic, q.signal),
  ])
  const spanMin = 8
  let candidates = sliceOverlapping(index, q.fromYear, q.toYear, manifest.maxSpanYears).filter((e) => {
    if (!matchesFilters(e, q.regions, q.subjects)) return false
    const end = e.endYear ?? e.startYear
    return end - e.startYear >= spanMin
  })
  candidates.sort((a, b) => b.salience - a.salience || a.id.localeCompare(b.id))
  candidates = candidates.slice(0, 40)
  const items = await backend.loadMarkers(candidates, q.signal)
  if (q.regions && q.regions.length >= 2) {
    for (const item of items) item.lane = pickLane(item, q.regions)
  }
  return items
}

function pickLane(
  item: { regions: string[]; salienceByRegion?: Record<string, number> },
  lanes: string[],
): string {
  let best = lanes.find((l) => item.regions.includes(l)) ?? lanes[0]
  let bestS = -Infinity
  for (const l of lanes) {
    if (!item.regions.includes(l)) continue
    const s = item.salienceByRegion?.[l] ?? 0
    if (s > bestS) {
      bestS = s
      best = l
    }
  }
  return best
}

function normalize(s: string): string {
  return normalizeSearch(s)
}

/** Test helper: in-memory backend that never hits the network. */
export function createMemoryBackend(opts: {
  index: IndexEntry[]
  markers: EventMarker[]
  details: Record<string, HistoryEvent>
  taxonomy: Taxonomy
  eras: Era[]
  search: Record<string, SearchEntry>
  manifest?: Manifest
}): RepoBackend {
  const manifest: Manifest =
    opts.manifest ??
    ({
      minYear: Math.min(...opts.index.map((e) => e.startYear)),
      maxYear: Math.max(...opts.index.map((e) => e.endYear ?? e.startYear)),
      eventCount: opts.index.length,
      buckets: [...new Set(opts.index.map((e) => yearBucket(e.startYear)))].sort((a, b) => a - b),
      maxSpanYears: Math.max(0, ...opts.index.map((e) => (e.endYear ?? e.startYear) - e.startYear)),
      generatedAt: 'test',
    } satisfies Manifest)
  const markerMap = new Map(opts.markers.map((m) => [m.id, m]))
  return {
    async loadIndex() {
      return [...opts.index].sort((a, b) => a.startYear - b.startYear)
    },
    async loadManifest() {
      return manifest
    },
    async loadMarkers(entries) {
      return entries.map((e) => markerMap.get(e.id)).filter((m): m is EventMarker => !!m)
    },
    async loadDetail(id) {
      const d = opts.details[id]
      if (!d) throw new Error(`Unknown event: ${id}`)
      return d
    },
    async loadSearchIndex() {
      return opts.search
    },
    async loadTaxonomy() {
      return opts.taxonomy
    },
    async loadEras() {
      return opts.eras
    },
    async prefetchBuckets() {},
  }
}
