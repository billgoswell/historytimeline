import { useEffect } from 'react'
import { loadInitialData } from './data/bootstrap.ts'
import { initTheme, patch } from './store/appStore.ts'
import { startVisibleSync } from './timeline/visibleSync.ts'
import { TimelineIsland } from './timeline/TimelineIsland.tsx'
import { Header } from './ui/Header.tsx'
import { FilterPanel } from './ui/FilterPanel.tsx'
import { StatusLine } from './ui/StatusLine.tsx'
import { ZoomControls } from './ui/ZoomControls.tsx'
import { DetailOverlay } from './ui/DetailOverlay.tsx'
import { EventList } from './ui/EventList.tsx'
import { EmptyState } from './ui/EmptyState.tsx'
import { LoadError } from './ui/LoadError.tsx'
import { getState } from './store/appStore.ts'

export default function App() {
  useEffect(() => {
    initTheme()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => {
      if (getState().themePref === 'system') initTheme()
    }
    mq.addEventListener('change', onScheme)
    return () => mq.removeEventListener('change', onScheme)
  }, [])

  useEffect(() => {
    void loadInitialData()
  }, [])

  useEffect(() => startVisibleSync(), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const s = getState()
      if (s.detailId) return
      // Close one layer per keypress, topmost first: the mobile filter sheet
      // is a modal dialog over the timeline, so it takes priority over just
      // clearing a marker selection.
      if (s.filtersOpen) {
        patch({ filtersOpen: false })
        return
      }
      if (s.selectedId) patch({ selectedId: null })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Header />
      <LoadError />
      <div className="workspace">
        <FilterPanel />
        <main className="stage">
          <TimelineIsland />
          <EmptyState />
          <ZoomControls />
          <StatusLine />
        </main>
        <EventList />
      </div>
      <DetailOverlay />
    </div>
  )
}
