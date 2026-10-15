import type { DensityBin } from '../data/types.ts'

export interface WarpTable {
  yearToW: (year: number) => number
  wToYear: (w: number) => number
  identity: boolean
}

interface Knot {
  year: number
  w: number
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interp(knots: Knot[], x: number, from: 'year' | 'w'): number {
  const xa = from === 'year' ? (k: Knot) => k.year : (k: Knot) => k.w
  const ya = from === 'year' ? (k: Knot) => k.w : (k: Knot) => k.year
  if (x <= xa(knots[0])) return ya(knots[0])
  if (x >= xa(knots[knots.length - 1])) return ya(knots[knots.length - 1])
  let lo = 0
  let hi = knots.length - 1
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (xa(knots[mid]) <= x) lo = mid
    else hi = mid
  }
  const span = xa(knots[hi]) - xa(knots[lo]) || 1
  const t = (x - xa(knots[lo])) / span
  return lerp(ya(knots[lo]), ya(knots[hi]), t)
}

/**
 * Piecewise linear year↔warped-year map.
 * Empty centuries keep a floor scale so the axis stays continuous;
 * dense centuries expand. Camera still stores real years.
 */
export function buildWarpTable(
  histogram: DensityBin[],
  minYear: number,
  maxYear: number,
  compress: boolean,
): WarpTable {
  if (!compress || histogram.length === 0) {
    return {
      identity: true,
      yearToW: (y) => y,
      wToYear: (w) => w,
    }
  }

  const sorted = [...histogram].sort((a, b) => a.year - b.year)
  const maxCount = Math.max(1, ...sorted.map((b) => b.count))
  const knots: Knot[] = [{ year: minYear, w: minYear }]
  let w = minYear
  let cursor = minYear

  for (const bin of sorted) {
    const start = bin.year
    const end = bin.year + 100
    if (start > cursor) {
      const empty = start - cursor
      w += empty * 0.22
      knots.push({ year: start, w })
    }
    const density = bin.count / maxCount
    const scale = 0.22 + 0.78 * (0.15 + 0.85 * density)
    const span = Math.max(1, end - start)
    w += span * scale
    knots.push({ year: end, w })
    cursor = end
  }
  if (cursor < maxYear) {
    w += (maxYear - cursor) * 0.22
    knots.push({ year: maxYear, w })
  }

  return {
    identity: false,
    yearToW: (year) => interp(knots, year, 'year'),
    wToYear: (value) => interp(knots, value, 'w'),
  }
}
