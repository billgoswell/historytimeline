import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Vitest doesn't expose `afterEach` as a global by default, so RTL's
// automatic-cleanup detection never fires; without this, DOM from one
// test's render() is still mounted when the next test in the same file runs.
afterEach(() => {
  cleanup()
})

// jsdom does not implement matchMedia; several modules (theme, App's system-theme
// listener) call it unconditionally, so component tests need a stub.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
