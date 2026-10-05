import { createContext, useContext } from 'react'
import type { VisualPreferences } from './visual-preferences'
type PreferencesContext = {
  preferences: VisualPreferences
  updatePreferences: (patch: Partial<VisualPreferences>) => void
  persistenceIssue: string | null
  zoomIssue: string | null
  zoomPending: boolean
  retryZoom: () => void
  reducedMotion: boolean
}
export const Context = createContext<PreferencesContext | null>(null)
export function useVisualPreferences(): PreferencesContext {
  const value = useContext(Context)
  if (!value) throw new Error('Visual preferences provider is missing')
  return value
}
