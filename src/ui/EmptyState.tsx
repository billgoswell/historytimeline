import { useStore } from './useStore.ts'

export function EmptyState() {
  const total = useStore((s) => s.visible.total)
  const n = useStore((s) => s.visible.items.length)
  if (n > 0) return null
  return (
    <div className="empty-state" role="status">
      {total === 0
        ? 'No events match these filters.'
        : 'No events at this zoom — zoom in or clear filters.'}
    </div>
  )
}
