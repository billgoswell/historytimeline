import type { Camera, Viewport } from '../data/types.ts'
import { MAX_PX_PER_YEAR, MIN_PX_PER_YEAR } from '../data/types.ts'
import type { WarpTable } from './warp.ts'

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function zoomToPxPerYear(z: number): number {
  return MIN_PX_PER_YEAR * 2 ** z
}

export function pxPerYearToZoom(pxPerYear: number): number {
  return Math.log2(pxPerYear / MIN_PX_PER_YEAR)
}

function toW(year: number, warp?: WarpTable | null): number {
  return warp ? warp.yearToW(year) : year
}

function fromW(w: number, warp?: WarpTable | null): number {
  return warp ? warp.wToYear(w) : w
}

/**
 * Recent at the top, ancient at the bottom.
 * y = 0 is the top of the viewport.
 */
export function yearToY(
  year: number,
  camera: Camera,
  viewport: Viewport,
  warp?: WarpTable | null,
): number {
  const w = toW(year, warp)
  const wc = toW(camera.centerYear, warp)
  return (wc - w) * camera.pxPerYear + viewport.height / 2
}

export function yToYear(
  y: number,
  camera: Camera,
  viewport: Viewport,
  warp?: WarpTable | null,
): number {
  const wc = toW(camera.centerYear, warp)
  const w = wc - (y - viewport.height / 2) / camera.pxPerYear
  return fromW(w, warp)
}

export function visibleYearRange(
  camera: Camera,
  viewport: Viewport,
  padPx = 0,
  warp?: WarpTable | null,
): { fromYear: number; toYear: number } {
  const toYear = yToYear(-padPx, camera, viewport, warp)
  const fromYear = yToYear(viewport.height + padPx, camera, viewport, warp)
  return { fromYear, toYear }
}

/** Cursor-anchored zoom: the year under `y` stays under `y`. */
export function zoomAt(
  camera: Camera,
  viewport: Viewport,
  y: number,
  factor: number,
  warp?: WarpTable | null,
): Camera {
  const year = yToYear(y, camera, viewport, warp)
  const pxPerYear = clamp(camera.pxPerYear * factor, MIN_PX_PER_YEAR, MAX_PX_PER_YEAR)
  const wc = toW(year, warp) + (y - viewport.height / 2) / pxPerYear
  return { centerYear: fromW(wc, warp), pxPerYear }
}

export function panByPx(camera: Camera, dy: number, warp?: WarpTable | null): Camera {
  const wc = toW(camera.centerYear, warp) + dy / camera.pxPerYear
  return { centerYear: fromW(wc, warp), pxPerYear: camera.pxPerYear }
}

export function panByYears(camera: Camera, dYear: number): Camera {
  return { centerYear: camera.centerYear + dYear, pxPerYear: camera.pxPerYear }
}

export function clampCamera(
  camera: Camera,
  minYear: number,
  maxYear: number,
  viewport?: Viewport,
  warp?: WarpTable | null,
): Camera {
  const pxPerYear = clamp(camera.pxPerYear, MIN_PX_PER_YEAR, MAX_PX_PER_YEAR)
  let centerYear = camera.centerYear
  if (viewport && viewport.height > 0) {
    const topYear = yToYear(0, { centerYear, pxPerYear }, viewport, warp)
    if (topYear > maxYear) {
      const wc = toW(maxYear, warp) - viewport.height / 2 / pxPerYear
      centerYear = fromW(wc, warp)
    }
    const botYear = yToYear(viewport.height, { centerYear, pxPerYear }, viewport, warp)
    if (botYear < minYear) {
      const wc = toW(minYear, warp) + viewport.height / 2 / pxPerYear
      centerYear = fromW(wc, warp)
      const top2 = yToYear(0, { centerYear, pxPerYear }, viewport, warp)
      if (top2 > maxYear) {
        const pinned = toW(maxYear, warp) - viewport.height / 2 / pxPerYear
        centerYear = fromW(pinned, warp)
      }
    }
  } else {
    centerYear = clamp(centerYear, minYear, maxYear)
  }
  return { centerYear, pxPerYear }
}

export function fitWorld(
  viewport: Viewport,
  minYear: number,
  maxYear: number,
): Camera {
  const span = Math.max(1, maxYear - minYear)
  const pxPerYear = clamp((viewport.height * 0.86) / span, MIN_PX_PER_YEAR, MAX_PX_PER_YEAR)
  return { centerYear: (minYear + maxYear) / 2, pxPerYear }
}
