import type { IndexEntry } from './types.ts'

export function lowerBound(arr: IndexEntry[], year: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].startYear < year) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function upperBound(arr: IndexEntry[], year: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].startYear <= year) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function sliceOverlapping(
  index: IndexEntry[],
  fromYear: number,
  toYear: number,
  maxSpanYears: number,
): IndexEntry[] {
  const lo = lowerBound(index, fromYear - maxSpanYears)
  const hi = upperBound(index, toYear)
  const out: IndexEntry[] = []
  for (let i = lo; i < hi; i++) {
    const e = index[i]
    const end = e.endYear ?? e.startYear
    if (e.startYear <= toYear && end >= fromYear) out.push(e)
  }
  return out
}
