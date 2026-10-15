import type { Camera, Viewport } from '../data/types.ts'
import { TIMELINE_MAX_YEAR } from '../data/types.ts'
import { toAxisLabel } from '../data/years.ts'
import { visibleYearRange, yearToY } from '../camera/scale.ts'
import type { WarpTable } from '../camera/warp.ts'

export interface Tick {
  year: number
  y: number
  major: boolean
  label: string
}

export function niceStep(yearsTarget: number): number {
  const t = Math.max(yearsTarget, 1 / 365.25)
  const mag = 10 ** Math.floor(Math.log10(t))
  const r = t / mag
  if (r < 1.5) return mag
  if (r < 3.5) return 2 * mag
  if (r < 7.5) return 5 * mag
  return 10 * mag
}

export function buildTicks(
  camera: Camera,
  viewport: Viewport,
  warp?: WarpTable | null,
  yearMax = TIMELINE_MAX_YEAR,
): Tick[] {
  const { fromYear, toYear } = visibleYearRange(camera, viewport, 80, warp)
  const majorYears = niceStep(80 / camera.pxPerYear)
  const minorYears = majorYears / (majorYears >= 2 ? 5 : 2)
  const start = Math.floor(fromYear / minorYears) * minorYears
  const ticks: Tick[] = []
  const max = 80
  const end = Math.min(toYear + minorYears, yearMax)
  for (let y = start, n = 0; y <= end && n < max; y += minorYears, n++) {
    const year = Math.round(y * 1e6) / 1e6
    if (year > yearMax) break
    const major = Math.abs(year / majorYears - Math.round(year / majorYears)) < 1e-6
    ticks.push({
      year,
      y: yearToY(year, camera, viewport, warp),
      major,
      label: major ? toAxisLabel(Math.round(year)) : '',
    })
  }
  return ticks
}
