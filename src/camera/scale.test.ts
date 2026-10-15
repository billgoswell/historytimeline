import { describe, expect, it } from 'vitest'
import { clampCamera, panByPx, visibleYearRange, yToYear, yearToY, zoomAt } from './scale.ts'
import type { Camera, Viewport } from '../data/types.ts'
import { TIMELINE_MAX_YEAR } from '../data/types.ts'

const cam: Camera = { centerYear: 0, pxPerYear: 2 }
const vp: Viewport = { width: 800, height: 400 }

describe('year ↔ pixel scale', () => {
  it('puts more recent years above (smaller y)', () => {
    expect(yearToY(100, cam, vp)).toBeLessThan(yearToY(-100, cam, vp))
    expect(yearToY(0, cam, vp)).toBe(200)
  })

  it('inverts yearToY / yToYear', () => {
    for (const year of [-500, 0, 476, 1914, 2020]) {
      const y = yearToY(year, cam, vp)
      expect(yToYear(y, cam, vp)).toBeCloseTo(year, 8)
    }
  })

  it('keeps the year under the cursor when zooming', () => {
    const y = 80
    const year = yToYear(y, cam, vp)
    const zoomed = zoomAt(cam, vp, y, 2.5)
    expect(yToYear(y, zoomed, vp)).toBeCloseTo(year, 8)
    expect(zoomed.pxPerYear).toBeCloseTo(5)
  })

  it('pans by mutating centerYear, not a scroll offset', () => {
    const next = panByPx(cam, 40)
    expect(next.pxPerYear).toBe(cam.pxPerYear)
    expect(next.centerYear).toBeCloseTo(cam.centerYear + 20)
  })

  it('visible range is ancient at the bottom', () => {
    const { fromYear, toYear } = visibleYearRange(cam, vp)
    expect(fromYear).toBeLessThan(toYear)
    expect(toYear).toBeGreaterThan(cam.centerYear)
  })

  it('does not let the top of the view pass TIMELINE_MAX_YEAR', () => {
    const next = clampCamera({ centerYear: 4000, pxPerYear: 2 }, -3000, TIMELINE_MAX_YEAR, vp)
    expect(yToYear(0, next, vp)).toBeCloseTo(TIMELINE_MAX_YEAR, 5)
    expect(yToYear(0, next, vp)).toBeLessThanOrEqual(TIMELINE_MAX_YEAR + 1e-6)
  })
})
