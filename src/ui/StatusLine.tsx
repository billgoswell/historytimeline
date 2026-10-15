import { useStore } from './useStore.ts'

export function StatusLine() {
  const status = useStore((s) => s.status)
  const total = useStore((s) => s.visible.total)
  const n = useStore((s) => s.visible.items.length)
  return (
    <div className="status-line" role="status" aria-live="polite">
      {status || `${total.toLocaleString()} events match · ${n} visible at this zoom.`}
    </div>
  )
}
