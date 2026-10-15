import { useEffect, useRef, useState } from 'react'
import { getEvent, searchEvents } from '../data/eventsRepo.ts'
import { eventPosition } from '../data/years.ts'
import { getState, patch, setCamera } from '../store/appStore.ts'
import { useStore } from './useStore.ts'
import { MAX_PX_PER_YEAR } from '../data/types.ts'

export function SearchBox() {
  const q = useStore((s) => s.query)
  const synthetic = useStore((s) => s.synthetic)
  const [results, setResults] = useState<{ id: string; title: string }[]>([])
  const [open, setOpen] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    abort.current?.abort()
    if (!q.trim()) {
      setResults([])
      return
    }
    const ac = new AbortController()
    abort.current = ac
    const t = window.setTimeout(async () => {
      try {
        const rows = await searchEvents(q, ac.signal, synthetic)
        setResults(rows.map((r) => ({ id: r.id, title: r.title })))
        setOpen(true)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error(e)
      }
    }, 180)
    return () => {
      window.clearTimeout(t)
      ac.abort()
    }
  }, [q, synthetic])

  async function pick(id: string) {
    const ev = await getEvent(id, { includeSynthetic: synthetic })
    setCamera({
      centerYear: eventPosition(ev.startYear, ev.startMonth, ev.startDay),
      pxPerYear: Math.min(MAX_PX_PER_YEAR, Math.max(8, getState().camera.pxPerYear)),
    })
    patch({ selectedId: id, query: ev.title, markerFocusId: id })
    setOpen(false)
  }

  return (
    <div className="search">
      <label className="sr-only" htmlFor="timeline-search">
        Search events
      </label>
      <input
        id="timeline-search"
        type="search"
        placeholder="Search title or summary"
        value={q}
        onChange={(e) => patch({ query: e.target.value })}
        onFocus={() => results.length && setOpen(true)}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="search-results" role="listbox">
          {results.slice(0, 12).map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => void pick(r.id)}>
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
