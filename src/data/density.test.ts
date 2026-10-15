import { describe, expect, it } from 'vitest'
import { binParamsForZoom, densitySelect, matchesFilters } from './density.ts'
import type { IndexEntry } from './types.ts'
import { LABEL_ROW_PX, MARKER_CAP } from './types.ts'

function ev(partial: Partial<IndexEntry> & { id: string; startYear: number }): IndexEntry {
  return {
    salience: 50,
    regions: ['europe'],
    subjects: ['politics-empire'],
    ...partial,
  }
}

describe('bin params follow screen size', () => {
  it('uses more columns (higher top-K) on a wide viewport than a narrow one', () => {
    const wide = binParamsForZoom(8, 800, 1400, 1)
    const narrow = binParamsForZoom(8, 800, 720, 1)
    expect(wide.topK).toBeGreaterThan(narrow.topK)
    expect(wide.size).toBeCloseTo(narrow.size)
  })

  it('sizes bins to one label row of pixels', () => {
    const { size } = binParamsForZoom(11, 800, 1200)
    expect(size).toBeCloseTo(LABEL_ROW_PX / 11)
  })

  it('still uses the full column count when zoomed out', () => {
    const world = binParamsForZoom(0.12, 800, 1400)
    const close = binParamsForZoom(20, 800, 1400)
    expect(world.topK).toBe(close.topK)
    expect(world.topK).toBeGreaterThan(1)
    expect(world.size).toBeGreaterThan(close.size)
  })
})

describe('density selection', () => {
  it('takes top-K per bin by salience after filters', () => {
    const events = [
      ev({ id: 'a', startYear: 100, salience: 90, subjects: ['science-technology'] }),
      ev({ id: 'b', startYear: 101, salience: 40, subjects: ['science-technology'] }),
      ev({ id: 'c', startYear: 102, salience: 80, subjects: ['war-conflict'] }),
      ev({ id: 'd', startYear: 200, salience: 99, subjects: ['science-technology'] }),
    ]
    const filtered = events.filter((e) => matchesFilters(e, undefined, ['science-technology']))
    const { selected, bins } = densitySelect({
      events: filtered,
      fromYear: 0,
      toYear: 300,
      size: 150,
      topK: 1,
    })
    expect(selected.map((e) => e.id).sort()).toEqual(['a', 'd'])
    expect(bins.every((b) => b.shown <= 1 || b.count === 0)).toBe(true)
  })

  it('never returns more than the marker cap', () => {
    const events: IndexEntry[] = []
    for (let i = 0; i < 4000; i++) {
      events.push(ev({ id: `e-${i}`, startYear: i, salience: (i * 17) % 100 }))
    }
    const { selected } = densitySelect({
      events,
      fromYear: 0,
      toYear: 4000,
      size: 10,
      topK: 12,
    })
    expect(selected.length).toBeLessThanOrEqual(MARKER_CAP)
  })

  it('is deterministic for the same inputs', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      ev({ id: `x-${i}`, startYear: 1900 + i, salience: 40 + (i % 20) }),
    )
    const a = densitySelect({ events, fromYear: 1900, toYear: 1940, size: 5, topK: 2 })
    const b = densitySelect({ events, fromYear: 1900, toYear: 1940, size: 5, topK: 2 })
    expect(a.selected.map((e) => e.id)).toEqual(b.selected.map((e) => e.id))
  })

  it('uses hysteresis keepIds so a shown marker is not immediately dropped', () => {
    const events = [
      ev({ id: 'keep', startYear: 10, salience: 60 }),
      ev({ id: 'new', startYear: 11, salience: 61 }),
      ev({ id: 'low', startYear: 12, salience: 10 }),
    ]
    const { selected } = densitySelect({
      events,
      fromYear: 0,
      toYear: 50,
      size: 50,
      topK: 1,
      keepIds: ['keep'],
    })
    expect(selected.some((e) => e.id === 'keep')).toBe(true)
  })
})
