import { describe, expect, it } from 'vitest'
import { parseUrl, serializeUrl } from './urlState.ts'
import { fromDisplayYearNumber } from '../data/years.ts'

describe('URL serialize/parse', () => {
  it('round-trips camera, filters, event, and search', () => {
    const url = serializeUrl({
      camera: { centerYear: 1776, pxPerYear: 1.28 },
      regions: ['europe', 'united-states'],
      subjects: ['politics-empire'],
      event: 'american-declaration',
      q: 'independence',
    })
    const parsed = parseUrl(url)
    expect(parsed.centerYear).toBeCloseTo(1776, 5)
    expect(parsed.regions).toEqual(['europe', 'united-states'])
    expect(parsed.subjects).toEqual(['politics-empire'])
    expect(parsed.event).toBe('american-declaration')
    expect(parsed.q).toBe('independence')
  })

  it('encodes BCE as a negative display year, never 0', () => {
    const url = serializeUrl({
      camera: { centerYear: 0, pxPerYear: 0.5 },
      regions: [],
      subjects: [],
    })
    expect(url).toContain('y=-1')
    expect(parseUrl(url).centerYear).toBe(0)
    const fortyFour = serializeUrl({
      camera: { centerYear: fromDisplayYearNumber(-44), pxPerYear: 1 },
      regions: [],
      subjects: [],
    })
    expect(parseUrl(fortyFour).centerYear).toBe(-43)
  })

  it('is tolerant of missing params', () => {
    const parsed = parseUrl('')
    expect(parsed.regions).toEqual([])
    expect(parsed.subjects).toEqual([])
    expect(parsed.centerYear).toBeUndefined()
    expect(parsed.synthetic).toBe(false)
  })
})
