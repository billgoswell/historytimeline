/**
 * Loads the taxonomy/eras/manifest the rest of the app depends on. Pulled out
 * of App.tsx so a "Retry" button can call the exact same routine the initial
 * mount used, instead of duplicating the effect logic.
 */
import { getEras, getManifest, getTaxonomy } from './eventsRepo.ts'
import { applyRange, getState, patch } from '../store/appStore.ts'
import { TIMELINE_MAX_YEAR } from './types.ts'

export async function loadInitialData(): Promise<void> {
  patch({ loading: true, loadError: null })
  try {
    const syn = getState().synthetic
    const [taxonomy, eras, manifest] = await Promise.all([getTaxonomy(), getEras(), getManifest(syn)])
    patch({ taxonomy, eras, loading: false })
    applyRange(manifest.minYear, TIMELINE_MAX_YEAR)
  } catch (err) {
    console.error('Failed to load timeline data', err)
    patch({
      loading: false,
      loadError: 'Could not load timeline data. Check your connection and try again.',
    })
  }
}
