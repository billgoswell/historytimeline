import { useSyncExternalStore } from 'react'
import { getState, subscribe, type AppState } from '../store/appStore.ts'

export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(getState()),
    () => select(getState()),
  )
}
