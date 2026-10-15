import { formatEventDate } from '../data/years.ts'
import { patch } from '../store/appStore.ts'
import { useStore } from './useStore.ts'

export function EventList() {
  const items = useStore((s) => s.visible.items)
  const selected = useStore((s) => s.selectedId)
  const open = useStore((s) => s.listOpen)
  return (
    <section
      className={`event-list ${open ? 'is-open' : ''}`}
      aria-label="Visible events"
    >
      <h2 className="sr-only">Visible events</h2>
      <ol>
        {items.map((e) => (
          <li key={e.id}>
            {open ? (
              <button
                type="button"
                className={selected === e.id ? 'is-active' : ''}
                onClick={() => patch({ selectedId: e.id, markerFocusId: e.id })}
              >
                <span className="when">{formatEventDate(e)}</span>
                <span className="what">{e.title}</span>
                <span className="blurb">{e.summary}</span>
              </button>
            ) : (
              <div className={selected === e.id ? 'is-active' : ''}>
                <span className="when">{formatEventDate(e)}</span>
                <span className="what">{e.title}</span>
                <span className="blurb">{e.summary}</span>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
