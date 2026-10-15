import { clearFilters, patch, toggleFilter } from '../store/appStore.ts'
import { useStore } from './useStore.ts'

export function FilterPanel() {
  const taxonomy = useStore((s) => s.taxonomy)
  const filters = useStore((s) => s.filters)
  const open = useStore((s) => s.filtersOpen)
  if (!taxonomy) return null

  const body = (
    <>
      <div className="filter-head">
        <h2>Filters</h2>
        {(filters.regions.length > 0 || filters.subjects.length > 0) && (
          <button type="button" className="text-btn" onClick={() => clearFilters()}>
            Clear all
          </button>
        )}
      </div>
      <p className="hint">AND across groups, OR within a group. Two or more regions open parallel lanes.</p>
      <fieldset>
        <legend>Region</legend>
        {taxonomy.regions.map((r) => (
          <label key={r.slug} className="check">
            <input
              type="checkbox"
              checked={filters.regions.includes(r.slug)}
              onChange={() => toggleFilter('regions', r.slug)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Subject</legend>
        {taxonomy.subjects.map((r) => (
          <label key={r.slug} className="check">
            <input
              type="checkbox"
              checked={filters.subjects.includes(r.slug)}
              onChange={() => toggleFilter('subjects', r.slug)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <ActiveChips />
    </>
  )

  return (
    <>
      <aside className="filter-panel desktop-only">{body}</aside>
      <button
        type="button"
        className="sheet-toggle mobile-only"
        onClick={() => patch({ filtersOpen: !open })}
      >
        Filters
      </button>
      {open && (
        <div className="sheet mobile-only" role="dialog" aria-label="Filters">
          <button type="button" className="text-btn" onClick={() => patch({ filtersOpen: false })}>
            Close
          </button>
          {body}
        </div>
      )}
    </>
  )
}

function ActiveChips() {
  const taxonomy = useStore((s) => s.taxonomy)
  const filters = useStore((s) => s.filters)
  if (!taxonomy) return null
  const chips = [
    ...filters.regions.map((slug) => ({
      slug,
      group: 'regions' as const,
      label: taxonomy.regions.find((r) => r.slug === slug)?.label ?? slug,
    })),
    ...filters.subjects.map((slug) => ({
      slug,
      group: 'subjects' as const,
      label: taxonomy.subjects.find((r) => r.slug === slug)?.label ?? slug,
    })),
  ]
  if (!chips.length) return null
  return (
    <div className="chips" aria-label="Active filters">
      {chips.map((c) => (
        <button key={`${c.group}-${c.slug}`} type="button" className="chip" onClick={() => toggleFilter(c.group, c.slug)}>
          {c.label} ×
        </button>
      ))}
    </div>
  )
}
