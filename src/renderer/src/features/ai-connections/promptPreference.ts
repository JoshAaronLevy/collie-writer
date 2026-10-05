import { useCallback, useState } from 'react'

const key = 'collie.chatgpt-prompt.v1'
type Preference = { suppressAutomatic: boolean; issue: string | null }

function readPreference(): Preference {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return { suppressAutomatic: false, issue: null }
    if (raw.length > 128) throw new Error('Invalid preference')
    const value: unknown = JSON.parse(raw)
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 2 ||
      !('version' in value) ||
      value.version !== 1 ||
      !('suppressAutomatic' in value) ||
      typeof value.suppressAutomatic !== 'boolean'
    )
      throw new Error('Invalid preference')
    return { suppressAutomatic: value.suppressAutomatic, issue: null }
  } catch {
    return {
      suppressAutomatic: false,
      issue: 'Your automatic-prompt preference could not be read. Choose it again below to save it.'
    }
  }
}

export function usePromptPreference(): Preference & { setSuppression: (value: boolean) => void } {
  const [preference, setPreference] = useState(readPreference)
  const setSuppression = useCallback((suppressAutomatic: boolean) => {
    let issue: string | null = null
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, suppressAutomatic }))
    } catch {
      issue = "This choice couldn't be remembered. It applies for this launch only."
    }
    // Keep the chosen value even if storage is unavailable. Never erase another record.
    setPreference({ suppressAutomatic, issue })
  }, [])
  return { ...preference, setSuppression }
}
