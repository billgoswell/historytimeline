import { pxPerYearToZoom } from '../camera/scale.ts'
import { MAX_PX_PER_YEAR, MIN_PX_PER_YEAR } from '../data/types.ts'
import { setZoomLevel, zoomBy } from '../timeline/TimelineIsland.tsx'
import { useStore } from './useStore.ts'

export function ZoomControls() {
  const ppy = useStore((s) => s.camera.pxPerYear)
  const z = pxPerYearToZoom(ppy)
  const zMin = pxPerYearToZoom(MIN_PX_PER_YEAR)
  const zMax = pxPerYearToZoom(MAX_PX_PER_YEAR)
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.2)}>
        +
      </button>
      <input
        type="range"
        min={zMin}
        max={zMax}
        step={0.05}
        value={z}
        aria-label="Zoom level"
        onChange={(e) => setZoomLevel(Number(e.target.value))}
      />
      <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
        −
      </button>
    </div>
  )
}
