import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'

export type WorkingCopyInput =
  | { kind: 'preview'; scope: OpenInput; id: string }
  | { kind: 'status'; scope: OpenInput; id: string }
  | { kind: 'remove'; scope: OpenInput; id: string; reviewId: string }
  | { kind: 'history'; id: string; offset: number }
export type WorkspaceAiEvidence = 'clear' | 'linked' | 'unknown'
export type WorkingCopyCommand = { request: WorkingCopyInput; ai: WorkspaceAiEvidence }
export type WorkingCopyView = {
  id: string
  scope: OpenInput
  reviewId: string | null
  phase: 'preview' | 'complete' | 'interrupted' | 'not-started'
  title: string | null
  workspace: string | null
  savedPath: string | null
  head: string | null
  eligible: boolean
  retired: boolean
  bytes: number | null
  retainedBytes: number | null
  files: number | null
  removedBytes: number
  removedFiles: number
  reason: string
}
export type WorkingCopyReply = {
  id: string
  view: WorkingCopyView | null
  history: WorkingCopyView[]
  more: boolean
}
export function isWorkingCopyInput(v: unknown): v is WorkingCopyInput {
  return (
    record(v) &&
    isId(v.id) &&
    ((v.kind === 'history' &&
      exact(v, ['kind', 'id', 'offset']) &&
      Number.isSafeInteger(v.offset) &&
      Number(v.offset) >= 0 &&
      Number(v.offset) <= 1024) ||
      (isOpenInput(v.scope) &&
        ((['preview', 'status'].includes(String(v.kind)) && exact(v, ['kind', 'id', 'scope'])) ||
          (v.kind === 'remove' &&
            exact(v, ['kind', 'id', 'scope', 'reviewId']) &&
            isId(v.reviewId)))))
  )
}
export function isWorkingCopyCommand(v: unknown): v is WorkingCopyCommand {
  return (
    record(v) &&
    exact(v, ['request', 'ai']) &&
    isWorkingCopyInput(v.request) &&
    ['clear', 'linked', 'unknown'].includes(String(v.ai))
  )
}
const count = (v: unknown): boolean => Number.isSafeInteger(v) && Number(v) >= 0
export function isWorkingCopyView(v: unknown): v is WorkingCopyView {
  return (
    record(v) &&
    exact(v, [
      'id',
      'scope',
      'reviewId',
      'phase',
      'title',
      'workspace',
      'savedPath',
      'head',
      'eligible',
      'retired',
      'bytes',
      'retainedBytes',
      'files',
      'removedBytes',
      'removedFiles',
      'reason'
    ]) &&
    isId(v.id) &&
    isOpenInput(v.scope) &&
    [v.reviewId, v.head].every((id) => id === null || isId(id)) &&
    ['preview', 'complete', 'interrupted', 'not-started'].includes(String(v.phase)) &&
    (v.title === null || (typeof v.title === 'string' && v.title.length <= 500)) &&
    [v.workspace, v.savedPath].every(
      (path) => path === null || (typeof path === 'string' && path.length <= 4096)
    ) &&
    typeof v.eligible === 'boolean' &&
    typeof v.retired === 'boolean' &&
    [v.bytes, v.retainedBytes, v.files].every((n) => n === null || count(n)) &&
    count(v.removedBytes) &&
    count(v.removedFiles) &&
    typeof v.reason === 'string' &&
    v.reason.length <= 1000
  )
}
export function isWorkingCopyReply(v: unknown): v is WorkingCopyReply {
  return (
    record(v) &&
    exact(v, ['id', 'view', 'history', 'more']) &&
    isId(v.id) &&
    (v.view === null || (isWorkingCopyView(v.view) && v.view.id === v.id)) &&
    Array.isArray(v.history) &&
    v.history.length <= 8 &&
    v.history.every(isWorkingCopyView) &&
    typeof v.more === 'boolean'
  )
}
