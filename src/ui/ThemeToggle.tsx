import { setThemePref } from '../store/appStore.ts'
import { useStore } from './useStore.ts'

const OPTIONS = [
  { id: 'light' as const, label: 'Light' },
  { id: 'dark' as const, label: 'Dark' },
  { id: 'system' as const, label: 'System' },
]

export function ThemeToggle() {
  const pref = useStore((s) => s.themePref)
  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={pref === o.id}
          className={pref === o.id ? 'is-active' : ''}
          onClick={() => setThemePref(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
