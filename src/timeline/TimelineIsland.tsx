import { useEffect, useRef } from 'react'
import { TimelineEngine } from './engine.ts'
import { getState, patch, setCamera } from '../store/appStore.ts'
import { clamp, zoomToPxPerYear } from '../camera/scale.ts'
import { MAX_PX_PER_YEAR, MIN_PX_PER_YEAR } from '../data/types.ts'

export function TimelineIsland() {
  const ref = useRef<HTMLDivElement>(null)
  const engine = useRef<TimelineEngine | null>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    const eng = new TimelineEngine(host, {
      onSelect: (id, el) => {
        const cur = getState().selectedId
        patch({ selectedId: cur === id ? null : id, markerFocusId: id })
        el.focus()
      },
      onClose: () => patch({ selectedId: null }),
      onHover: (id) => patch({ hoveredId: id }),
    })
    engine.current = eng
    return () => {
      eng.destroy()
      engine.current = null
    }
  }, [])

  return (
    <div
      ref={ref}
      className="timeline-surface"
      data-testid="timeline-surface"
      aria-label="History timeline. Use arrow keys to pan, plus and minus to zoom."
    />
  )
}

export function zoomBy(factor: number): void {
  const s = getState()
  setCamera({
    ...s.camera,
    pxPerYear: clamp(s.camera.pxPerYear * factor, MIN_PX_PER_YEAR, MAX_PX_PER_YEAR),
  })
}

export function setZoomLevel(z: number): void {
  const s = getState()
  setCamera({ ...s.camera, pxPerYear: zoomToPxPerYear(z) })
}
