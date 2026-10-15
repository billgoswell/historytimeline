import { COL_MIN_PX, LABEL_ROW_PX } from '../data/types.ts'
import { clamp } from '../camera/scale.ts'

export interface PackItem {
  id: string
  y: number
  salience: number
}

export interface PackedMarker {
  id: string
  y: number
  /** Card Y; may sit below the year so a stem can dogleg around inner boxes. */
  boxY: number
  col: number
  xDot: number
  xLabel: number
  gutterX: number
  colWidth: number
  anchor: 'start' | 'end'
}

interface Col {
  lastBoxY: number
  xLabel: number
  gutterX: number
  width: number
  anchor: 'start' | 'end'
  side: 'left' | 'right'
  depth: number
}

export function fitColumns(labelArea: number, mobile: boolean): { n: number; width: number } {
  const width = Math.min(COL_MIN_PX, Math.max(96, labelArea))
  if (mobile) {
    return { n: 1, width }
  }
  const n = clamp(Math.floor(Math.max(labelArea, 1) / COL_MIN_PX), 1, 6)
  return { n, width }
}

/** Gap from the spine to the inner edge of the first event box. */
const SPINE_GUTTER = 10
/** Vertical dogleg sits close to the spine so it misses the inner box. */
const STEM_ELBOW = 6

function sideColumns(
  area: number,
  spineX: number,
  side: 'left' | 'right',
  mobile: boolean,
): Col[] {
  if (area < 72) return []
  const { n, width } = fitColumns(area, mobile)
  const cols: Col[] = []
  const gutterX = side === 'right' ? spineX + SPINE_GUTTER : spineX - SPINE_GUTTER
  for (let i = 0; i < n; i++) {
    if (side === 'right') {
      cols.push({
        lastBoxY: -Infinity,
        xLabel: gutterX + 8 + i * width,
        gutterX: side === 'right' ? spineX + STEM_ELBOW : spineX - STEM_ELBOW,
        width,
        anchor: 'start',
        side,
        depth: i,
      })
    } else {
      cols.push({
        lastBoxY: -Infinity,
        xLabel: gutterX - 8 - i * width,
        gutterX: spineX - STEM_ELBOW,
        width,
        anchor: 'end',
        side,
        depth: i,
      })
    }
  }
  return cols
}

/**
 * Greedy column packing around a centre spine: nearest right, nearest left,
 * then further columns. One event per column per LABEL_ROW_PX.
 */
export function packMarkers(
  items: PackItem[],
  opts: { spineX: number; labelLeft: number; labelRight: number; mobile: boolean; gap?: number },
): { placed: PackedMarker[]; overflowIds: string[] } {
  const gap = opts.gap ?? LABEL_ROW_PX
  const rightArea = Math.max(0, opts.labelRight - opts.spineX)
  const leftArea = Math.max(0, opts.spineX - opts.labelLeft)

  let cols: Col[]
  if (opts.mobile) {
    cols = sideColumns(rightArea, opts.spineX, 'right', true)
  } else {
    const right = sideColumns(rightArea, opts.spineX, 'right', false)
    const left = sideColumns(leftArea, opts.spineX, 'left', false)
    cols = []
    const maxN = Math.max(right.length, left.length)
    for (let i = 0; i < maxN; i++) {
      if (i < right.length) cols.push(right[i])
      if (i < left.length) cols.push(left[i])
    }
  }
  if (!cols.length) {
    cols = sideColumns(Math.max(rightArea, 96), opts.spineX, 'right', true)
  }

  const sorted = [...items].sort((a, b) => a.y - b.y || b.salience - a.salience || (a.id < b.id ? -1 : 1))
  const placed: PackedMarker[] = []
  const overflowIds: string[] = []

  for (const item of sorted) {
    let hit = -1
    let boxY = item.y
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      let y = item.y
      for (const other of cols) {
        if (other.side !== col.side || other.depth >= col.depth) continue
        y = Math.max(y, other.lastBoxY + gap)
      }
      if (y - col.lastBoxY >= gap) {
        hit = i
        boxY = y
        break
      }
    }
    if (hit < 0) {
      overflowIds.push(item.id)
      continue
    }
    const col = cols[hit]
    col.lastBoxY = boxY
    placed.push({
      id: item.id,
      y: item.y,
      boxY,
      col: hit,
      xDot: opts.spineX,
      xLabel: col.xLabel,
      gutterX: col.gutterX,
      colWidth: col.width,
      anchor: col.anchor,
    })
  }
  return { placed, overflowIds }
}

export function truncateLabel(title: string, colWidth: number): string {
  const maxChars = Math.max(8, Math.floor(colWidth / 6.6))
  if (title.length <= maxChars) return title
  return `${title.slice(0, Math.max(4, maxChars - 1)).trimEnd()}…`
}

export function wrapTwoLines(text: string, colWidth: number): [string, string] {
  const maxChars = Math.max(8, Math.floor(colWidth / 6.6))
  if (text.length <= maxChars) return [text, '']
  const slice = text.slice(0, maxChars)
  const sp = slice.lastIndexOf(' ')
  const first = (sp > 8 ? slice.slice(0, sp) : slice).trimEnd()
  const rest = text.slice(first.length).trim()
  return [first, truncateLabel(rest, colWidth)]
}

export function packStack<T extends { y: number }>(items: T[], gap = LABEL_ROW_PX): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const out: T[] = []
  let last = -Infinity
  for (const item of sorted) {
    if (item.y - last < gap) continue
    out.push(item)
    last = item.y
  }
  return out
}
