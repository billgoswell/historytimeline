import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, beforeEach } from 'vitest'
import { FilterPanel } from './FilterPanel.tsx'
import { getState, patch } from '../store/appStore.ts'
import type { Taxonomy } from '../data/types.ts'

const taxonomy: Taxonomy = {
  regions: [
    { slug: 'europe', label: 'Europe' },
    { slug: 'asia', label: 'Asia' },
  ],
  subjects: [{ slug: 'politics-empire', label: 'Politics & Empire' }],
}

describe('FilterPanel', () => {
  beforeEach(() => {
    patch({ taxonomy, filters: { regions: [], subjects: [] }, filtersOpen: false })
  })

  it('renders nothing until the taxonomy has loaded', () => {
    patch({ taxonomy: null })
    const { container } = render(<FilterPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('toggles a region checkbox and reflects the change in the store', async () => {
    render(<FilterPanel />)
    const checkbox = screen.getByRole('checkbox', { name: 'Europe' })
    expect(checkbox).not.toBeChecked()
    await userEvent.click(checkbox)
    expect(getState().filters.regions).toEqual(['europe'])
    expect(checkbox).toBeChecked()
  })

  it('shows "Clear all" only once a filter is active, and clears every filter when clicked', async () => {
    render(<FilterPanel />)
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Europe' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Politics & Empire' }))

    const clearBtn = screen.getByRole('button', { name: /clear all/i })
    await userEvent.click(clearBtn)
    expect(getState().filters).toEqual({ regions: [], subjects: [] })
    expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
  })
})
