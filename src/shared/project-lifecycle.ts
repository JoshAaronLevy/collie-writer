import { hasControlCharacters } from './control-characters'
import { isRecoveryIssue, type RecoveryIssue } from './recovery'
import { isId } from '../domain/editor/schema'
import {
  exact,
  record,
  isOpenInput,
  isProjectValue,
  type OpenInput,
  type ProjectList,
  type ProjectResult,
  type OpenProject
} from './projects'

export type RenameInput = {
  scope: OpenInput
  operationId: string
  expectedHead: string
  title: string
}
export type ArchiveInput = { scope: OpenInput; archived: boolean }
export type RecoveryItem = {
  id: string
  kind: 'backup' | 'previous' | 'candidate' | 'incoming'
  path: string
  projectId: string | null
  head: string | null
  status: string
}
export type ResetCopy = { id: string; projects: number; titles: string[] }
export type DataLocations = {
  root: string
  bytes: number
  sizeComplete: boolean
  projects: ProjectList
  items: RecoveryItem[]
  issues: number
  recovery: RecoveryIssue[]
  resets: ResetCopy[]
  review: string
}
export type LifecycleAPI = {
  renameProject: (input: RenameInput) => Promise<ProjectResult<OpenProject>>
  archiveProject: (input: ArchiveInput) => Promise<ProjectResult<OpenProject>>
  getDataLocations: () => Promise<ProjectResult<DataLocations>>
  reviewRecovery: () => Promise<ProjectResult<DataLocations>>
  recoverReset: (id: string) => Promise<ProjectResult<DataLocations>>
}
export function isRenameInput(v: unknown): v is RenameInput {
  return (
    record(v) &&
    exact(v, ['scope', 'operationId', 'expectedHead', 'title']) &&
    isOpenInput(v.scope) &&
    isId(v.operationId) &&
    isId(v.expectedHead) &&
    typeof v.title === 'string' &&
    v.title.trim() === v.title &&
    v.title.length > 0 &&
    v.title.length <= 500 &&
    !hasControlCharacters(v.title)
  )
}
export function isArchiveInput(v: unknown): v is ArchiveInput {
  return (
    record(v) &&
    exact(v, ['scope', 'archived']) &&
    isOpenInput(v.scope) &&
    typeof v.archived === 'boolean'
  )
}
export function isDataLocations(v: unknown): v is DataLocations {
  if (
    !record(v) ||
    !exact(v, [
      'root',
      'bytes',
      'sizeComplete',
      'projects',
      'items',
      'issues',
      'recovery',
      'resets',
      'review'
    ]) ||
    typeof v.root !== 'string' ||
    v.root.length > 4096 ||
    !Number.isSafeInteger(v.bytes) ||
    Number(v.bytes) < 0 ||
    typeof v.sizeComplete !== 'boolean' ||
    !isProjectValue('list', v.projects) ||
    !isId(v.review) ||
    !Number.isSafeInteger(v.issues) ||
    Number(v.issues) < 0
  )
    return false
  return (
    Array.isArray(v.recovery) &&
    v.recovery.length <= 10000 &&
    v.recovery.every(isRecoveryIssue) &&
    new Set(v.recovery.map((i) => i.id)).size === v.recovery.length &&
    v.issues === v.recovery.filter((i) => i.outcome === 'unresolved').length &&
    Array.isArray(v.items) &&
    v.items.length <= 10000 &&
    v.items.every(
      (i) =>
        record(i) &&
        exact(i, ['id', 'kind', 'path', 'projectId', 'head', 'status']) &&
        isId(i.id) &&
        ['backup', 'previous', 'candidate', 'incoming'].includes(String(i.kind)) &&
        typeof i.path === 'string' &&
        i.path.length <= 4096 &&
        (i.projectId === null || isId(i.projectId)) &&
        (i.head === null || isId(i.head)) &&
        typeof i.status === 'string' &&
        i.status.length <= 200
    ) &&
    Array.isArray(v.resets) &&
    v.resets.length <= 10000 &&
    v.resets.every(
      (r) =>
        record(r) &&
        exact(r, ['id', 'projects', 'titles']) &&
        isId(r.id) &&
        Number.isSafeInteger(r.projects) &&
        Number(r.projects) >= 0 &&
        Array.isArray(r.titles) &&
        r.titles.length === r.projects &&
        r.titles.length <= 10000 &&
        r.titles.every((t) => typeof t === 'string' && t.length <= 500)
    )
  )
}
