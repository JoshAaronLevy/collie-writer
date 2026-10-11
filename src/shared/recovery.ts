import { isId } from '../domain/editor/schema'
import {
  exact,
  record,
  isOpenInput,
  isProjectCode,
  type OpenInput,
  type ProjectList,
  type ProjectCode
} from './projects'

/** Transient explanations derived from existing records, never recovery authority. */
export type RecoveryIssue = {
  id: string
  projectId: string | null
  scope: OpenInput | null
  title: string | null
  kind: 'save' | 'backup' | 'operation' | 'snapshots' | 'reset' | 'discovery'
  operationId: string | null
  cause: ProjectCode | null
  phase: string | null
  outcome: 'unresolved' | 'confirmed'
  actions: ('open-project' | 'save-copy' | 'recover-copy' | 'open-backup' | 'diagnostics')[]
}

export function projectDiscoveryIssue(p: ProjectList['issues'][number]): RecoveryIssue {
  return {
    id: `project:${p.projectId}`,
    projectId: p.projectId,
    scope: p.scope,
    title: p.title,
    kind: 'discovery',
    operationId: null,
    cause: p.code,
    phase: null,
    outcome: 'unresolved',
    actions: p.scope
      ? ['open-project', 'open-backup', 'diagnostics']
      : ['open-backup', 'diagnostics']
  }
}

export function isRecoveryIssue(v: unknown): v is RecoveryIssue {
  return (
    record(v) &&
    exact(v, [
      'id',
      'projectId',
      'scope',
      'title',
      'kind',
      'operationId',
      'cause',
      'phase',
      'outcome',
      'actions'
    ]) &&
    typeof v.id === 'string' &&
    /^[a-z0-9:-]{1,200}$/i.test(v.id) &&
    (v.projectId === null || isId(v.projectId)) &&
    (v.scope === null || (isOpenInput(v.scope) && v.scope.projectId === v.projectId)) &&
    (v.title === null || (typeof v.title === 'string' && v.title.length <= 500)) &&
    ['save', 'backup', 'operation', 'snapshots', 'reset', 'discovery'].includes(String(v.kind)) &&
    (v.operationId === null || isId(v.operationId)) &&
    (v.cause === null || isProjectCode(v.cause)) &&
    (v.phase === null || (typeof v.phase === 'string' && v.phase.length <= 100)) &&
    ['unresolved', 'confirmed'].includes(String(v.outcome)) &&
    Array.isArray(v.actions) &&
    v.actions.length <= 5 &&
    new Set(v.actions).size === v.actions.length &&
    v.actions.every((a) =>
      ['open-project', 'save-copy', 'recover-copy', 'open-backup', 'diagnostics'].includes(
        String(a)
      )
    ) &&
    (!v.actions.some((a) => a === 'save-copy' || a === 'open-project') || isOpenInput(v.scope))
  )
}
