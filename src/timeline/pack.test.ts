import { describe, expect, it } from 'vitest'
import { packMarkers, truncateLabel } from './pack.ts'
import { LABEL_ROW_PX } from '../data/types.ts'

describe('marker packing', () => {
  it('puts simultaneous events in adjacent columns instead of stacking', () => {
    const items = [
      { id: 'a', y: 100, salience: 90 },
      { id: 'b', y: 101, salience: 80 },
      { id: 'c', y: 102, salience: 70 },
    ]
    const { placed, overflowIds } = packMarkers(items, {
      spineX: 500,
      labelLeft: 20,
      labelRight: 980,
      mobile: false,
    })
    expect(overflowIds).toEqual([])
    expect(placed).toHaveLength(3)
    const xs = new Set(placed.map((p) => p.xLabel))
    expect(xs.size).toBe(3)
    const left = placed.filter((p) => p.anchor === 'end')
    const right = placed.filter((p) => p.anchor === 'start')
    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
  })

  it('drops an outer box below the inner box on the same side', () => {
    const items = [
      { id: 'a', y: 100, salience: 90 },
      { id: 'b', y: 101, salience: 80 },
      { id: 'c', y: 102, salience: 70 },
    ]
    const { placed } = packMarkers(items, {
      spineX: 500,
      labelLeft: 20,
      labelRight: 980,
      mobile: false,
    })
    const sameSide = new Map<string, number[]>()
    for (const p of placed) {
      const list = sameSide.get(p.anchor) ?? []
      list.push(p.boxY)
      sameSide.set(p.anchor, list)
    }
    for (const ys of sameSide.values()) {
      ys.sort((a, b) => a - b)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(LABEL_ROW_PX)
      }
    }
  })

  it('overflows when a row is full', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, y: 40, salience: 50 - i }))
    const { placed, overflowIds } = packMarkers(items, {
      spineX: 80,
      labelLeft: 90,
      labelRight: 90 + 148 * 2,
      mobile: false,
    })
    expect(placed.length).toBeLessThanOrEqual(2)
    expect(overflowIds.length).toBeGreaterThan(0)
    expect(placed.length + overflowIds.length).toBe(6)
  })

  it('allows reuse of a column after LABEL_ROW_PX', () => {
    const { placed } = packMarkers(
      [
        { id: 'a', y: 10, salience: 50 },
        { id: 'b', y: 10 + LABEL_ROW_PX, salience: 50 },
      ],
      { spineX: 80, labelLeft: 90, labelRight: 240, mobile: true },
    )
    expect(placed).toHaveLength(2)
    expect(placed[0].xLabel).toBe(placed[1].xLabel)
  })

  it('truncates long titles to the column', () => {
    const s = truncateLabel('Independence and Partition of India', 80)
    expect(s.endsWith('…')).toBe(true)
    expect(s.length).toBeLessThan(20)
  })
})
