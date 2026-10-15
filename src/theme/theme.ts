export type ThemePref = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

export function resolvedTheme(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? getSystemTheme() : pref
}

export function applyTheme(pref: ThemePref): void {
  const mode = resolvedTheme(pref)
  const root = document.documentElement
  root.setAttribute('data-theme', mode)
  root.setAttribute('data-theme-pref', pref)
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    /* ignore */
  }
}

export function cycleTheme(pref: ThemePref): ThemePref {
  if (pref === 'system') return 'light'
  if (pref === 'light') return 'dark'
  return 'system'
}
