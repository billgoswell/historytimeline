import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, beforeEach } from 'vitest'
import { SearchBox } from './SearchBox.tsx'
import { getState, patch } from '../store/appStore.ts'
import { createMemoryBackend, setRepoBackend } from '../data/eventsRepo.ts'
import { normalizeSearch } from '../data/text.ts'
import type { EventMarker, HistoryEvent, IndexEntry, SearchEntry } from '../data/types.ts'

const marker: EventMarker = {
  id: 'meiji',
  title: 'Meiji Restoration',
  startYear: 1868,
  precision: 'year',
  salience: 90,
  importance: 5,
  regions: ['japan'],
  subjects: ['politics-empire'],
  summary: 'Japan modernizes rapidly.',
}
const detail: HistoryEvent = { ...marker, body: 'Body.', sources: [] }
const index: IndexEntry = {
  id: marker.id,
  startYear: marker.startYear,
  salience: marker.salience,
  regions: marker.regions,
  subjects: marker.subjects,
}
const search: Record<string, SearchEntry> = {
  meiji: { title: normalizeSearch(marker.title), text: normalizeSearch(`${marker.title} ${marker.summary}`) },
}

describe('SearchBox', () => {
  beforeEach(() => {
    setRepoBackend(
      createMemoryBackend({
        index: [index],
        markers: [marker],
        details: { meiji: detail },
        taxonomy: { regions: [], subjects: [] },
        eras: [],
        search,
      }),
    )
    patch({ query: '', synthetic: false, selectedId: null, markerFocusId: null })
  })

  it('does not show a dropdown for an empty query', () => {
    render(<SearchBox />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows matching results after the debounce, and picking one selects the event', async () => {
    render(<SearchBox />)
    const input = screen.getByRole('searchbox', { name: /search events/i })
    await userEvent.type(input, 'meiji')

    const option = await screen.findByRole('button', { name: 'Meiji Restoration' })
    await userEvent.click(option)

    expect(getState().selectedId).toBe('meiji')
    expect(getState().query).toBe('Meiji Restoration')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
