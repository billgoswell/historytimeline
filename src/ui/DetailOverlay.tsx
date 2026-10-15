import { useEffect, useRef, useState } from 'react'
import { getEvent, listEvents } from '../data/eventsRepo.ts'
import type { EventMarker, HistoryEvent } from '../data/types.ts'
import { formatEventDate } from '../data/years.ts'
import { getState, patch, setCamera } from '../store/appStore.ts'
import { trapFocus } from './focusTrap.ts'
import { useStore } from './useStore.ts'

export function DetailOverlay() {
  const detailId = useStore((s) => s.detailId)
  const synthetic = useStore((s) => s.synthetic)
  const [event, setEvent] = useState<HistoryEvent | null>(null)
  const [related, setRelated] = useState<EventMarker[]>([])
  const [error, setError] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!detailId) {
      setEvent(null)
      setError(null)
      return
    }
    let alive = true
    setError(null)
    getEvent(detailId, { includeSynthetic: synthetic })
      .then((e) => {
        if (alive) setEvent(e)
      })
      .catch((e) => {
        if (!alive) return
        console.error(e)
        setEvent(null)
        setError('Could not load this event.')
      })
    return () => {
      alive = false
    }
  }, [detailId, synthetic])

  useEffect(() => {
    if (!event) return
    const ac = new AbortController()
    void listEvents({
      fromYear: event.startYear - 80,
      toYear: event.startYear + 80,
      regions: event.regions.slice(0, 1),
      subjects: event.subjects.slice(0, 1),
      bins: { size: 40, topK: 4 },
      signal: ac.signal,
      includeSynthetic: synthetic,
    })
      .then((r) => setRelated(r.items.filter((i) => i.id !== event.id).slice(0, 6)))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') console.error(e)
      })
    return () => ac.abort()
  }, [event, synthetic])

  useEffect(() => {
    if (!event || !panel.current) return
    const release = trapFocus(panel.current)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      release()
      window.removeEventListener('keydown', onKey)
    }
  }, [event])

  if (!detailId) return null

  function close() {
    const focusId = getState().markerFocusId
    patch({ detailId: null })
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-event-id="${focusId}"]`)
      el?.focus()
    }, 0)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        className="overlay-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={event ? 'detail-title' : undefined}
        aria-label={event ? undefined : 'Event details'}
      >
        <button type="button" className="icon-close" aria-label="Close" onClick={close}>
          ×
        </button>
        {error && <p role="alert">{error}</p>}
        {event && (
          <>
            <p className="kicker">{formatEventDate(event)}</p>
            <h2 id="detail-title">{event.title}</h2>
            {event.synthetic && <p className="pill warn">Synthetic filler — not a historical source</p>}
            <div className="prose">
              {event.body.split('\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {event.sources.length > 0 && (
              <section>
                <h3>Sources</h3>
                <ul>
                  {event.sources.map((s) => (
                    <li key={s.name}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {related.length > 0 && (
              <section>
                <h3>Related</h3>
                <ul className="related">
                  {related.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => patch({ detailId: r.id, selectedId: r.id })}>
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button
              type="button"
              className="primary"
              onClick={() => {
                setCamera({ ...getState().camera, centerYear: event.startYear })
              }}
            >
              Jump to year
            </button>
          </>
        )}
      </div>
    </div>
  )
}
