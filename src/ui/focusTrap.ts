const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function trapFocus(container: HTMLElement): () => void {
  const prev = document.activeElement as HTMLElement | null

  function list(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (n) => !n.hasAttribute('disabled') && n.getAttribute('aria-hidden') !== 'true',
    )
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return
    const items = list()
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  container.addEventListener('keydown', onKey)
  list()[0]?.focus()
  return () => {
    container.removeEventListener('keydown', onKey)
    prev?.focus?.()
  }
}
