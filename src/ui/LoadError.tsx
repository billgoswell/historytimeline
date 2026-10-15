import { loadInitialData } from '../data/bootstrap.ts'
import { useStore } from './useStore.ts'

/** Banner shown when the initial taxonomy/eras/manifest fetch fails. */
export function LoadError() {
  const error = useStore((s) => s.loadError)
  if (!error) return null
  return (
    <div className="load-error" role="alert">
      <p>{error}</p>
      <button type="button" onClick={() => void loadInitialData()}>
        Retry
      </button>
    </div>
  )
}
