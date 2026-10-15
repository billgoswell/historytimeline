import { describe, expect, it, beforeEach } from 'vitest'
import { createMemoryBackend, listEvents, searchEvents, setRepoBackend } from './eventsRepo.ts'
import { normalizeSearch } from './text.ts'
import type { EventMarker, HistoryEvent, IndexEntry, SearchEntry } from './types.ts'

function make(id: string, year: number, regions: string[], subjects: string[], salience = 50): {
  index: IndexEntry
  marker: EventMarker
  detail: HistoryEvent
} {
  const index: IndexEntry = { id, startYear: year, salience, regions, subjects }
  const marker: EventMarker = {
    id,
    title: id,
    startYear: year,
    precision: 'year',
    salience,
    importance: 3,
    regions,
    subjects,
    summary: `summary ${id}`,
  }
  const detail: HistoryEvent = { ...marker, body: `body ${id}`, sources: [{ name: 'Test' }] }
  return { index, marker, detail }
}

const a = make('rome', 0, ['europe'], ['politics-empire'], 90)
const b = make('qin', -221, ['china', 'asia'], ['politics-empire'], 95)
const c = make('newton', 1687, ['europe', 'united-kingdom'], ['science-technology'], 80)
const d = make('meiji', 1868, ['japan', 'asia'], ['politics-empire', 'science-technology'], 70)
const e = make('galileo', 1610, ['europe'], ['science-technology'], 75)

const all = [a, b, c, d, e]

describe('eventsRepo listEvents', () => {
  beforeEach(() => {
    setRepoBackend(
      createMemoryBackend({
        index: all.map((x) => x.index),
        markers: all.map((x) => x.marker),
        details: Object.fromEntries(all.map((x) => [x.detail.id, x.detail])),
        taxonomy: { regions: [], subjects: [] },
        eras: [],
        search: Object.fromEntries(
          all.map((x): [string, SearchEntry] => [
            x.index.id,
            { title: normalizeSearch(x.marker.title), text: normalizeSearch(`${x.marker.title} ${x.marker.summary}`) },
          ]),
        ),
      }),
    )
  })

  it('ORs within a group and ANDs across groups', async () => {
    const europeOrAsia = await listEvents({
      fromYear: -500,
      toYear: 2000,
      regions: ['europe', 'asia'],
      bins: { size: 500, topK: 10 },
    })
    expect(europeOrAsia.total).toBe(5)
    expect(europeOrAsia.items.length).toBeGreaterThan(0)

    const scienceEurope = await listEvents({
      fromYear: -500,
      toYear: 2000,
      regions: ['europe'],
      subjects: ['science-technology'],
      bins: { size: 500, topK: 10 },
    })
    expect(scienceEurope.total).toBe(2)
    expect(scienceEurope.items.map((i) => i.id).sort()).toEqual(['galileo', 'newton'])
  })

  it('reports total matches even when density hides most of them', async () => {
    const r = await listEvents({
      fromYear: -500,
      toYear: 2000,
      bins: { size: 3000, topK: 1 },
    })
    expect(r.total).toBe(5)
    expect(r.items.length).toBeLessThanOrEqual(2)
    expect(r.bins.reduce((n, b) => n + b.count, 0)).toBeGreaterThanOrEqual(5)
  })

  it('honors AbortSignal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(
      listEvents({ fromYear: -500, toYear: 2000, bins: { size: 100, topK: 3 }, signal: ac.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('eventsRepo searchEvents', () => {
  function searchEntry(title: string, summary: string): SearchEntry {
    return { title: normalizeSearch(title), text: normalizeSearch(`${title} ${summary}`) }
  }

  it('ranks a title match above a higher-salience match buried in the summary', async () => {
    const titleHit = make('roman-empire', 27, ['europe'], ['politics-empire'], 50)
    titleHit.marker.title = 'Roman Empire founded'
    const summaryHit = make('unrelated-event', 1500, ['europe'], ['politics-empire'], 90)
    summaryHit.marker.title = 'Unrelated event'
    summaryHit.marker.summary = 'A passing mention of the Roman Empire.'

    setRepoBackend(
      createMemoryBackend({
        index: [titleHit.index, summaryHit.index],
        markers: [titleHit.marker, summaryHit.marker],
        details: {},
        taxonomy: { regions: [], subjects: [] },
        eras: [],
        search: {
          [titleHit.index.id]: searchEntry(titleHit.marker.title, titleHit.marker.summary),
          [summaryHit.index.id]: searchEntry(summaryHit.marker.title, summaryHit.marker.summary),
        },
      }),
    )

    const results = await searchEvents('roman')
    expect(results.map((r) => r.id)).toEqual(['roman-empire', 'unrelated-event'])
  })

  it('falls back to salience to break ties within the same match tier', async () => {
    const lo = make('low-salience', 100, ['europe'], ['politics-empire'], 20)
    lo.marker.title = 'War of the roses'
    const hi = make('high-salience', 200, ['europe'], ['politics-empire'], 80)
    hi.marker.title = 'War of independence'

    setRepoBackend(
      createMemoryBackend({
        index: [lo.index, hi.index],
        markers: [lo.marker, hi.marker],
        details: {},
        taxonomy: { regions: [], subjects: [] },
        eras: [],
        search: {
          [lo.index.id]: searchEntry(lo.marker.title, lo.marker.summary),
          [hi.index.id]: searchEntry(hi.marker.title, hi.marker.summary),
        },
      }),
    )

    const results = await searchEvents('war')
    expect(results.map((r) => r.id)).toEqual(['high-salience', 'low-salience'])
  })
})
