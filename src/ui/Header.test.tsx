import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, beforeEach } from 'vitest'
import { Header } from './Header.tsx'
import { getState, patch } from '../store/appStore.ts'

describe('Header', () => {
  beforeEach(() => {
    patch({ compressEmpty: false, synthetic: false, listOpen: false })
  })

  it('toggles compress-empty-time from the checkbox', async () => {
    render(<Header />)
    const checkbox = screen.getByRole('checkbox', { name: /compress empty time/i })
    expect(checkbox).not.toBeChecked()
    await userEvent.click(checkbox)
    expect(getState().compressEmpty).toBe(true)
    expect(checkbox).toBeChecked()
  })

  it('shows the synthetic-corpus pill only when synthetic data is enabled', () => {
    render(<Header />)
    expect(screen.queryByText(/synthetic corpus/i)).not.toBeInTheDocument()
    act(() => {
      patch({ synthetic: true })
    })
    expect(screen.getByText(/synthetic corpus/i)).toBeInTheDocument()
  })

  it('toggles the event list button label and aria-pressed state', async () => {
    render(<Header />)
    const btn = screen.getByRole('button', { name: 'Event list' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(btn)
    expect(getState().listOpen).toBe(true)
    expect(screen.getByRole('button', { name: 'Hide list' })).toHaveAttribute('aria-pressed', 'true')
  })
})
