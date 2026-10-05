import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'
import { isSaveInput, type FileChoice, type SaveInput } from './project-files'

// Main-to-worker only. This type is never a renderer capability.
export type FileGrant = {
  id: string
  path: string
  purpose: 'save' | 'open' | 'locate' | 'backup' | 'move' | 'restore'
  scope: OpenInput | null
}
export type FileCommand =
  | { kind: 'duplicate'; operationId: string; scope: OpenInput; expectedHead: string }
  | { kind: 'recover'; operationId: string; artifactId: string }
  | { kind: 'status'; scope: OpenInput | null; recheck: boolean }
  | { kind: 'save' | 'backup' | 'move'; input: SaveInput; grant: FileGrant | null }
  | { kind: 'open' | 'restore'; operationId: string; grant: FileGrant }
  | { kind: 'locate'; operationId: string; scope: OpenInput; grant: FileGrant }
  | { kind: 'inspect'; operationId: string; scope: OpenInput }
  | { kind: 'cancel'; id: string }
  | { kind: 'answer'; id: string; choice: FileChoice | 'overwrite'; challenge: string | null }
export function isFileGrant(v: unknown): v is FileGrant {
  return (
    record(v) &&
    exact(v, ['id', 'path', 'purpose', 'scope']) &&
    isId(v.id) &&
    typeof v.path === 'string' &&
    v.path.length > 0 &&
    v.path.length <= 4096 &&
    (v.path.startsWith('/') || /^[a-z]:[\\/]/i.test(v.path)) &&
    ['save', 'open', 'locate', 'backup', 'move', 'restore'].includes(String(v.purpose)) &&
    (['open', 'restore'].includes(String(v.purpose)) ? v.scope === null : isOpenInput(v.scope))
  )
}
export function isFileCommand(v: unknown): v is FileCommand {
  if (!record(v)) return false
  switch (v.kind) {
    case 'duplicate':
      return (
        exact(v, ['kind', 'operationId', 'scope', 'expectedHead']) &&
        isId(v.operationId) &&
        isOpenInput(v.scope) &&
        isId(v.expectedHead)
      )
    case 'recover':
      return (
        exact(v, ['kind', 'operationId', 'artifactId']) && isId(v.operationId) && isId(v.artifactId)
      )
    case 'status':
      return (
        exact(v, ['kind', 'scope', 'recheck']) &&
        (v.scope === null || isOpenInput(v.scope)) &&
        typeof v.recheck === 'boolean'
      )
    case 'backup':
    case 'move':
    case 'save':
      return (
        exact(v, ['kind', 'input', 'grant']) &&
        isSaveInput(v.input) &&
        (v.grant === null || isFileGrant(v.grant))
      )
    case 'restore':
    case 'open':
      return (
        exact(v, ['kind', 'operationId', 'grant']) && isId(v.operationId) && isFileGrant(v.grant)
      )
    case 'locate':
      return (
        exact(v, ['kind', 'operationId', 'scope', 'grant']) &&
        isId(v.operationId) &&
        isOpenInput(v.scope) &&
        isFileGrant(v.grant)
      )
    case 'inspect':
      return (
        exact(v, ['kind', 'operationId', 'scope']) && isId(v.operationId) && isOpenInput(v.scope)
      )
    case 'cancel':
      return exact(v, ['kind', 'id']) && isId(v.id)
    case 'answer':
      return (
        exact(v, ['kind', 'id', 'choice', 'challenge']) &&
        isId(v.id) &&
        ['cancel', 'overwrite', 'import', 'use-local', 'open-copy'].includes(String(v.choice)) &&
        (v.challenge === null || isId(v.challenge))
      )
    default:
      return false
  }
}
