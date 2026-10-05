import { Context } from './visualPreferencesContext'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { MantineProvider, type MantineColorSchemeManager } from '@mantine/core'
import { collieTheme } from './theme'
import {
  applyVisualPreferences,
  systemPreference,
  VISUAL_PREFERENCES_KEY,
  type VisualPreferences,
  type readVisualPreferences
} from './visual-preferences'

// Mantine gets its effective scheme from our single preference owner, never another localStorage key.
const schemeManager: MantineColorSchemeManager = {
  get: () => (document.documentElement.dataset.mantineColorScheme === 'dark' ? 'dark' : 'light'),
  set: () => {},
  clear: () => {},
  subscribe: () => {},
  unsubscribe: () => {}
}

function useSystemPreference(query: string): boolean {
  const [matches, setMatches] = useState(() => systemPreference(query))
  useEffect(() => {
    const media = window.matchMedia(query)
    const changed = (): void => setMatches(media.matches)
    changed()
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [query])
  return matches
}

export function VisualPreferencesProvider({
  initial,
  children
}: {
  initial: ReturnType<typeof readVisualPreferences>
  children: ReactNode
}): React.JSX.Element {
  const [preferences, setPreferences] = useState(initial.preferences)
  const [persistenceIssue, setPersistenceIssue] = useState(initial.issue)
  const [zoomIssue, setZoomIssue] = useState<string | null>(null)
  const [zoomPending, setZoomPending] = useState(true)
  const [zoomAttempt, setZoomAttempt] = useState(0)
  const systemDark = useSystemPreference('(prefers-color-scheme: dark)')
  const systemContrast = useSystemPreference('(prefers-contrast: more)')
  const systemMotion = useSystemPreference('(prefers-reduced-motion: reduce)')
  const scheme =
    preferences.appearance === 'system' ? (systemDark ? 'dark' : 'light') : preferences.appearance
  const reducedMotion = preferences.reducedMotion || systemMotion

  useLayoutEffect(() => {
    applyVisualPreferences(preferences)
  }, [preferences, systemDark, systemContrast, systemMotion])

  const zoomKey = `${preferences.zoom}:${zoomAttempt}`
  const [lastZoomKey, setLastZoomKey] = useState(zoomKey)
  if (lastZoomKey !== zoomKey) {
    setLastZoomKey(zoomKey)
    setZoomPending(true)
    setZoomIssue(null)
  }
  useEffect(() => {
    let current = true
    async function applyZoom(): Promise<void> {
      try {
        const result = await window.collie.setUiZoom(preferences.zoom)
        if (current && !result.ok) setZoomIssue(result.error.message)
      } catch {
        if (current)
          setZoomIssue(
            'The interface zoom could not be applied. Try again; your writing is still available.'
          )
      } finally {
        if (current) setZoomPending(false)
      }
    }
    void applyZoom()
    return () => {
      current = false
    }
  }, [preferences.zoom, zoomAttempt])

  function updatePreferences(patch: Partial<VisualPreferences>): void {
    const next = { ...preferences, ...patch }
    setPreferences(next)
    try {
      localStorage.setItem(VISUAL_PREFERENCES_KEY, JSON.stringify(next))
      setPersistenceIssue(null)
    } catch {
      setPersistenceIssue(
        'Display preferences apply to this window but could not be saved on this computer.'
      )
    }
  }

  return (
    <Context.Provider
      value={{
        preferences,
        updatePreferences,
        persistenceIssue,
        zoomIssue,
        zoomPending,
        retryZoom: () => setZoomAttempt((attempt) => attempt + 1),
        reducedMotion
      }}
    >
      <MantineProvider
        theme={collieTheme}
        forceColorScheme={scheme}
        colorSchemeManager={schemeManager}
        withCssVariables={false}
        withGlobalClasses={false}
      >
        {children}
      </MantineProvider>
    </Context.Provider>
  )
}
