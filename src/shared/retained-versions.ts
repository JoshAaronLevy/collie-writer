import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'

export type RetentionInput =
  | { kind: 'preview'; scope: OpenInput; id: string; offset: number }
  | { kind: 'status'; scope: OpenInput; id: string }
  | { kind: 'remove'; scope: OpenInput; id: string; reviewId: string; artifactId: string }
export type RetainedVersion = {
  id: string
  path: string
  bytes: number | null
  createdAt: string | null
  projectId: string | null
  snapshotId: string | null
  head: string | null
  state: 'eligible' | 'protected' | 'removed' | 'absent' | 'changed' | 'unknown'
  reason: string
}
export type RetentionView = {
  id: string
  scope: OpenInput
  reviewId: string | null
  head: string | null
  at: string
  phase: 'preview' | 'complete' | 'interrupted' | 'not-started'
  limited: boolean
  offset: number
  hasOlder: boolean
  message: string
  files: RetainedVersion[]
}
export function isRetentionInput(v: unknown): v is RetentionInput {
  return (
    record(v) &&
    isId(v.id) &&
    isOpenInput(v.scope) &&
    ((v.kind === 'status' && exact(v, ['kind', 'scope', 'id'])) ||
      (v.kind === 'preview' &&
        exact(v, ['kind', 'scope', 'id', 'offset']) &&
        Number.isSafeInteger(v.offset) &&
        Number(v.offset) >= 0 &&
        Number(v.offset) <= 4096) ||
      (v.kind === 'remove' &&
        exact(v, ['kind', 'scope', 'id', 'reviewId', 'artifactId']) &&
        isId(v.reviewId) &&
        isId(v.artifactId)))
  )
}
export function isRetainedVersion(v: unknown): v is RetainedVersion {
  return (
    record(v) &&
    exact(v, [
      'id',
      'path',
      'bytes',
      'createdAt',
      'projectId',
      'snapshotId',
      'head',
      'state',
      'reason'
    ]) &&
    isId(v.id) &&
    typeof v.path === 'string' &&
    v.path.length <= 4096 &&
    (v.bytes === null || (Number.isSafeInteger(v.bytes) && Number(v.bytes) >= 0)) &&
    (v.createdAt === null ||
      (typeof v.createdAt === 'string' && Number.isFinite(Date.parse(v.createdAt)))) &&
    [v.projectId, v.snapshotId, v.head].every((id) => id === null || isId(id)) &&
    ['eligible', 'protected', 'removed', 'absent', 'changed', 'unknown'].includes(
      String(v.state)
    ) &&
    typeof v.reason === 'string' &&
    v.reason.length <= 500
  )
}
export function isRetentionView(v: unknown): v is RetentionView {
  return (
    record(v) &&
    exact(v, [
      'id',
      'scope',
      'reviewId',
      'head',
      'at',
      'phase',
      'limited',
      'offset',
      'hasOlder',
      'message',
      'files'
    ]) &&
    isId(v.id) &&
    isOpenInput(v.scope) &&
    [v.reviewId, v.head].every((id) => id === null || isId(id)) &&
    typeof v.at === 'string' &&
    Number.isFinite(Date.parse(v.at)) &&
    ['preview', 'complete', 'interrupted', 'not-started'].includes(String(v.phase)) &&
    typeof v.limited === 'boolean' &&
    typeof v.hasOlder === 'boolean' &&
    Number.isSafeInteger(v.offset) &&
    Number(v.offset) >= 0 &&
    Number(v.offset) <= 4096 &&
    typeof v.message === 'string' &&
    v.message.length <= 1000 &&
    Array.isArray(v.files) &&
    v.files.length <= 4 &&
    v.files.every(isRetainedVersion) &&
    new Set(v.files.map((f) => f.id)).size === v.files.length
  )
}
