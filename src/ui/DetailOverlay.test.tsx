import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, beforeEach } from 'vitest'
import { DetailOverlay } from './DetailOverlay.tsx'
import { getState, patch } from '../store/appStore.ts'
import { createMemoryBackend, setRepoBackend } from '../data/eventsRepo.ts'
import type { EventMarker, HistoryEvent, IndexEntry } from '../data/types.ts'

const marker: EventMarker = {
  id: 'meiji',
  title: 'Meiji Restoration',
  startYear: 1868,
  precision: 'year',
  salience: 90,
  importance: 5,
  regions: ['japan'],
  subjects: ['politics-empire'],
  summary: 'Japan modernizes.',
}
const detail: HistoryEvent = {
  ...marker,
  body: 'Line one.\nLine two.',
  sources: [{ name: 'Test source', url: 'https://example.com' }],
}
const index: IndexEntry = {
  id: marker.id,
  startYear: marker.startYear,
  salience: marker.salience,
  regions: marker.regions,
  subjects: marker.subjects,
}

describe('DetailOverlay', () => {
  beforeEach(() => {
    setRepoBackend(
      createMemoryBackend({
        index: [index],
        markers: [marker],
        details: { [marker.id]: detail },
        taxonomy: { regions: [], subjects: [] },
        eras: [],
        search: {},
      }),
    )
    patch({ detailId: null, selectedId: null, markerFocusId: null, synthetic: false })
  })

  it('renders nothing when there is no open detail', () => {
    const { container } = render(<DetailOverlay />)
    expect(container).toBeEmptyDOMElement()
  })

  it('loads and displays the event once detailId is set', async () => {
    patch({ detailId: 'meiji' })
    render(<DetailOverlay />)
    expect(await screen.findByRole('heading', { name: 'Meiji Restoration' })).toBeInTheDocument()
    expect(screen.getByText('Line one.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Test source' })).toHaveAttribute('href', 'https://example.com')
  })

  it('closes on Escape and clears detailId in the store', async () => {
    patch({ detailId: 'meiji' })
    render(<DetailOverlay />)
    await screen.findByRole('heading', { name: 'Meiji Restoration' })
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(getState().detailId).toBeNull())
  })
})
