import { useRef, useState } from 'react'
import { exact, record, type OpenInput } from '../../../../shared/projects'
import { isId } from '../../../../domain/editor/schema'
import {
  isPlanningReadInput,
  type PlanningLocation,
  type PlanningReadInput
} from '../../../../shared/planning'

type Preferences = Pick<PlanningReadInput, 'filter' | 'kind' | 'status' | 'query'> & {
  location: PlanningLocation
  parentId: string | null
  pane: 'material' | 'structure' | 'detail'
  poolOffset: number
  detailOffset: number
  chapterOffset: number
  topicOffset: number
  materialScroll: number
  structureScroll: number
  detailScroll: number
}
const key = 'collie.plan-view.v1'
const defaults: Preferences = {
  filter: 'unplaced',
  kind: 'all',
  status: 'all',
  query: '',
  location: { kind: 'pool' },
  parentId: null,
  pane: 'structure',
  poolOffset: 0,
  detailOffset: 0,
  chapterOffset: 0,
  topicOffset: 0,
  materialScroll: 0,
  structureScroll: 0,
  detailScroll: 0
}
function read(scope: OpenInput): Preferences {
  try {
    const raw = localStorage.getItem(key)
    if (!raw || raw.length > 4096) return defaults
    const v: unknown = JSON.parse(raw)
    if (
      !record(v) ||
      !exact(v, ['version', 'projectId', 'workspaceId', 'preferences']) ||
      v.version !== 1 ||
      v.projectId !== scope.projectId ||
      v.workspaceId !== scope.workspaceId ||
      !record(v.preferences)
    )
      return defaults
    const p = v.preferences
    if (
      exact(p, Object.keys(defaults)) &&
      isPlanningReadInput({
        ...scope,
        location: p.location,
        filter: p.filter,
        kind: p.kind,
        status: p.status,
        query: p.query,
        offset: p.poolOffset
      }) &&
      (p.parentId === null || isId(p.parentId)) &&
      ['material', 'structure', 'detail'].includes(String(p.pane)) &&
      [
        p.detailOffset,
        p.chapterOffset,
        p.topicOffset,
        p.materialScroll,
        p.structureScroll,
        p.detailScroll
      ].every((n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1000000)
    )
      return p as Preferences
  } catch {
    /* View hints never prevent opening project data. */
  }
  return defaults
}
export function usePlanningPreferences(scope: OpenInput): {
  preferences: Preferences
  update: (patch: Partial<Preferences>) => void
  issue: string
} {
  const [preferences, setPreferences] = useState(() => read(scope))
  const current = useRef(preferences)
  const [issue, setIssue] = useState('')
  function update(patch: Partial<Preferences>): void {
    const next = { ...current.current, ...patch }
    current.current = next
    setPreferences(next)
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...scope, preferences: next }))
      setIssue('')
    } catch {
      setIssue('This Plan layout works now, but could not be remembered on this device.')
    }
  }
  return { preferences, update, issue }
}
