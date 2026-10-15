import { visibleYearRange } from '../camera/scale.ts'
import { binParamsForZoom } from '../data/density.ts'
import { buildWarpTable } from '../camera/warp.ts'
import { getDensityHistogram, listContextBars, listEvents, prefetchAround } from '../data/eventsRepo.ts'
import { getState, patch, writeUrl } from '../store/appStore.ts'
import { subscribe } from '../store/appStore.ts'

const QUERY_THROTTLE_MS = 32

export function startVisibleSync(): () => void {
  let visTimer = 0
  let urlTimer = 0
  let abort: AbortController | null = null
  let histKey = ''
  let lastQueryKey = ''
  let applying = false
  let lastFire = 0
  let throttleQueued = false

  const loadVisible = async (): Promise<void> => {
    const s = getState()
    const pad = Math.max(s.viewport.height, 480)
    const range = visibleYearRange(s.camera, s.viewport, pad, s.warp)
    const laneCount = s.filters.regions.length >= 2 ? s.filters.regions.length : 1
    const bins = binParamsForZoom(
      s.camera.pxPerYear,
      s.viewport.height,
      s.viewport.width,
      laneCount,
    )
    const queryKey = JSON.stringify({
      range,
      bins,
      regions: s.filters.regions,
      subjects: s.filters.subjects,
      syn: s.synthetic,
      compress: s.compressEmpty,
    })
    if (queryKey === lastQueryKey && s.visible.items.length > 0) return
    abort?.abort()
    abort = new AbortController()
    const { signal } = abort
    try {
      const filterKey = `${s.filters.regions.join(',')}|${s.filters.subjects.join(',')}|${s.synthetic}|${s.compressEmpty}`
      if (filterKey !== histKey) {
        histKey = filterKey
        const histogram = await getDensityHistogram({
          regions: s.filters.regions,
          subjects: s.filters.subjects,
          includeSynthetic: s.synthetic,
          signal,
        })
        const warp = buildWarpTable(histogram, s.minYear, s.maxYear, s.compressEmpty)
        applying = true
        patch({ histogram, warp })
        applying = false
      }
      const result = await listEvents({
        ...range,
        regions: s.filters.regions,
        subjects: s.filters.subjects,
        bins,
        signal,
        includeSynthetic: s.synthetic,
        keepIds: getState().visible.items.map((i) => i.id),
      })
      lastQueryKey = queryKey
      const n = result.items.length
      const total = result.total.toLocaleString()
      const status =
        result.total === 0
          ? 'No events match these filters.'
          : n === 0
            ? 'No events at this zoom — zoom in or clear filters.'
            : `${total} events match · ${n} visible at this zoom.`
      applying = true
      patch({ visible: result, status })
      applying = false

      const prefetch = visibleYearRange(getState().camera, s.viewport, pad * 2, s.warp)
      void prefetchAround(prefetch.fromYear, prefetch.toYear, s.synthetic)

      const bars = await listContextBars({
        ...range,
        regions: s.filters.regions,
        subjects: s.filters.subjects,
        signal,
        includeSynthetic: s.synthetic,
      })
      applying = true
      patch({ contextBars: bars })
      applying = false
    } catch (err) {
      applying = false
      if ((err as Error).name !== 'AbortError') console.error(err)
    }
  }

  const scheduleVisible = (): void => {
    const now = performance.now()
    const wait = QUERY_THROTTLE_MS - (now - lastFire)
    if (wait <= 0) {
      lastFire = now
      void loadVisible()
      return
    }
    if (throttleQueued) return
    throttleQueued = true
    visTimer = window.setTimeout(() => {
      throttleQueued = false
      lastFire = performance.now()
      void loadVisible()
    }, wait)
  }

  const unsub = subscribe(() => {
    if (applying) return
    scheduleVisible()
    window.clearTimeout(urlTimer)
    urlTimer = window.setTimeout(() => writeUrl(), 200)
  })

  void loadVisible()
  return () => {
    unsub()
    window.clearTimeout(visTimer)
    window.clearTimeout(urlTimer)
    abort?.abort()
  }
}
