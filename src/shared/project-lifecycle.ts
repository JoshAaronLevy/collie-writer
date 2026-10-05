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
export type ResetCopy = { id: string; projects: number }
export type DataLocations = {
  root: string
  bytes: number
  sizeComplete: boolean
  projects: ProjectList
  items: RecoveryItem[]
  issues: number
  resets: ResetCopy[]
  review: string
}
export type ResetInput = { review: string; confirmation: 'RESET LOCAL WORK' }
export type LifecycleAPI = {
  renameProject: (input: RenameInput) => Promise<ProjectResult<OpenProject>>
  archiveProject: (input: ArchiveInput) => Promise<ProjectResult<OpenProject>>
  getDataLocations: () => Promise<ProjectResult<DataLocations>>
  resetLocalWork: (input: ResetInput) => Promise<ProjectResult<DataLocations>>
  recoverReset: (id: string) => Promise<ProjectResult<DataLocations>>
  clearPickerHistory: () => Promise<ProjectResult<DataLocations>>
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
    !/[\u0000-\u001f]/.test(v.title)
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
export function isResetInput(v: unknown): v is ResetInput {
  return (
    record(v) &&
    exact(v, ['review', 'confirmation']) &&
    isId(v.review) &&
    v.confirmation === 'RESET LOCAL WORK'
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
        exact(r, ['id', 'projects']) &&
        isId(r.id) &&
        Number.isSafeInteger(r.projects) &&
        Number(r.projects) >= 0
    )
  )
}
