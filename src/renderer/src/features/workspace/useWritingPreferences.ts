type WritingPreferencesState = {
  preferences: WritingPreferences
  update: (patch: Partial<Omit<WritingPreferences, 'version'>>) => void
  issue: string
  revealPanel: (panel: SecondaryPanel) => void
  revealRevision: number
  outlineVisible: boolean
  setOutlineVisible: (visible: boolean) => void
}
import { useRef, useState } from 'react'
import { exact, record } from '../../../../shared/projects'

export type SecondaryPanel = 'closed' | 'material' | 'ai'
type WritingPreferences = {
  version: 2
  outlineWidth: number
  panelWidth: number
  focus: boolean
  panel: SecondaryPanel
}
const key = 'collie.writing-view.v2'
const defaults: WritingPreferences = {
  version: 2,
  outlineWidth: 248,
  panelWidth: 320,
  focus: false,
  panel: 'closed'
}
function read(): WritingPreferences {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem('collie.writing-view.v1')
    if (!raw || raw.length > 1000) return defaults
    const value: unknown = JSON.parse(raw)
    if (
      record(value) &&
      exact(value, ['version', 'outlineWidth', 'panelWidth', 'focus', 'panel']) &&
      (value.version === 1 || value.version === 2) &&
      typeof value.outlineWidth === 'number' &&
      value.outlineWidth >= 200 &&
      value.outlineWidth <= 360 &&
      typeof value.panelWidth === 'number' &&
      value.panelWidth >= 260 &&
      value.panelWidth <= 460 &&
      typeof value.focus === 'boolean' &&
      (value.version === 1
        ? ['closed', 'notes', 'source', 'ai']
        : ['closed', 'material', 'ai']
      ).includes(String(value.panel))
    )
      return {
        ...value,
        version: 2,
        panel: value.panel === 'notes' || value.panel === 'source' ? 'material' : value.panel
      } as WritingPreferences
  } catch {
    /* Layout preferences never prevent access to writing. */
  }
  return defaults
}
export function useWritingPreferences(): WritingPreferencesState {
  const [preferences, setPreferences] = useState(read)
  const preferencesRef = useRef(preferences)
  const [issue, setIssue] = useState('')
  const [revealRevision, setRevealRevision] = useState(0)
  // Outline visibility is session-only; v1 panel choices migrate without changing pane sizes.
  const [outlineVisible, setOutlineVisible] = useState(true)
  function update(patch: Partial<Omit<WritingPreferences, 'version'>>): void {
    const next = { ...preferencesRef.current, ...patch }
    preferencesRef.current = next
    setPreferences(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setIssue('')
    } catch {
      setIssue('This layout works for this session, but could not be remembered on this device.')
    }
  }
  function revealPanel(panel: SecondaryPanel): void {
    update({ panel, focus: false })
    setRevealRevision((value) => value + 1)
  }
  return {
    preferences,
    update,
    issue,
    revealPanel,
    revealRevision,
    outlineVisible,
    setOutlineVisible
  }
}
