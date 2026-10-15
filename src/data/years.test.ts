import { describe, expect, it } from 'vitest'
import {
  astroFromBce,
  eventPosition,
  fromDisplayYearNumber,
  parseDisplayYear,
  toDisplayYear,
  toDisplayYearNumber,
} from './years.ts'

describe('astronomical year numbering', () => {
  it('maps 1 BCE to year 0 and 2 BCE to -1', () => {
    expect(astroFromBce(1)).toBe(0)
    expect(astroFromBce(2)).toBe(-1)
    expect(parseDisplayYear('44 BCE')).toBe(-43)
    expect(parseDisplayYear('1 BCE')).toBe(0)
    expect(parseDisplayYear('1776')).toBe(1776)
    expect(parseDisplayYear('1776 CE')).toBe(1776)
  })

  it('never prints a year 0', () => {
    expect(toDisplayYear(0)).toBe('1 BCE')
    expect(toDisplayYear(-1)).toBe('2 BCE')
    expect(toDisplayYear(1)).toBe('1 CE')
    expect(toDisplayYear(-43)).toBe('44 BCE')
    expect(toDisplayYear(1776)).toBe('1776 CE')
  })

  it('round-trips display year numbers, skipping 0', () => {
    for (const n of [-44, -1, 1, 476, 1776]) {
      const astro = fromDisplayYearNumber(n)
      expect(toDisplayYearNumber(astro)).toBe(n)
      expect(toDisplayYear(astro).includes('0 BCE') || toDisplayYear(astro) === '0 CE').toBe(false)
    }
    expect(fromDisplayYearNumber(0)).toBe(1)
  })

  it('places month/day as a fraction of the year', () => {
    const a = eventPosition(1914, 6, 28)
    const b = eventPosition(1914, 8, 4)
    expect(a).toBeGreaterThan(1914)
    expect(b).toBeGreaterThan(a)
    expect(b).toBeLessThan(1915)
  })
})
