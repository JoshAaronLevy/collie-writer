import { isZoomLevel, type ZoomLevel } from '../../../shared/support'

export type Appearance = 'light' | 'dark' | 'system'
export type VisualPreferences = {
  appearance: Appearance
  zoom: ZoomLevel
  contrast: boolean
  reducedMotion: boolean
}

export const VISUAL_PREFERENCES_KEY = 'collie.visual-settings.v1'
export const defaultPreferences: VisualPreferences = {
  appearance: 'system', zoom: 100, contrast: false, reducedMotion: false
}

export function readVisualPreferences(): { preferences: VisualPreferences; issue: string | null } {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(VISUAL_PREFERENCES_KEY) ?? 'null')
    const stored = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {}
    // Read fields independently so older preferences and partially damaged records retain valid choices.
    return {
      preferences: {
        appearance: stored.appearance === 'light' || stored.appearance === 'dark' ? stored.appearance : 'system',
        zoom: isZoomLevel(stored.zoom) ? stored.zoom : 100,
        contrast: typeof stored.contrast === 'boolean' ? stored.contrast : false,
        reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : false
      },
      issue: null
    }
  } catch {
    return { preferences: { ...defaultPreferences }, issue: 'Saved display preferences could not be read. Default display settings are in use; your projects are still available.' }
  }
}

export function systemPreference(query: string): boolean {
  return window.matchMedia(query).matches
}

export function applyVisualPreferences(preferences: VisualPreferences): void {
  const root = document.documentElement
  root.dataset.mantineColorScheme = preferences.appearance === 'system'
    ? systemPreference('(prefers-color-scheme: dark)') ? 'dark' : 'light'
    : preferences.appearance
  root.dataset.contrast = preferences.contrast || systemPreference('(prefers-contrast: more)') ? 'high' : 'normal'
  root.dataset.motion = preferences.reducedMotion || systemPreference('(prefers-reduced-motion: reduce)') ? 'reduced' : 'system'
}

// Bundled module initialization runs before React mounts. No inline bootstrap script or second storage key.
export function initializeVisualPreferences(): ReturnType<typeof readVisualPreferences> {
  const initial = readVisualPreferences()
  applyVisualPreferences(initial.preferences)
  return initial
}
