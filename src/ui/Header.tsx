import { ThemeToggle } from './ThemeToggle.tsx'
import { SearchBox } from './SearchBox.tsx'
import { patch } from '../store/appStore.ts'
import { useStore } from './useStore.ts'

export function Header() {
  const compress = useStore((s) => s.compressEmpty)
  const synthetic = useStore((s) => s.synthetic)
  const listOpen = useStore((s) => s.listOpen)
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>History Timeline</h1>
          <p className="tagline">An editorial reference — recent at the top</p>
        </div>
      </div>
      <SearchBox />
      <div className="header-tools">
        <label className="check">
          <input
            type="checkbox"
            checked={compress}
            onChange={(e) => patch({ compressEmpty: e.target.checked })}
          />
          Compress empty time
        </label>
        {synthetic && <span className="pill warn">Synthetic corpus</span>}
        <button
          type="button"
          className="text-btn"
          aria-pressed={listOpen}
          onClick={() => patch({ listOpen: !listOpen })}
        >
          {listOpen ? 'Hide list' : 'Event list'}
        </button>
        <ThemeToggle />
      </div>
    </header>
  )
}
