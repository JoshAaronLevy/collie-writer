import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from './projects'
import { importHash, importTime } from './project-import'
import {
  isConfirmationEntry,
  type ConfirmationEntry,
  type ConfirmationManifest
} from './import-review'

/** One immutable command per protected confirmation. Routing is never part of its digest. */
export type ImportCommitCommand = {
  version: 1
  manifestId: string
  operationId: string
  expectedHead: string
  entriesDigest: string
}
export const confirmationCommand = (m: ConfirmationManifest): ImportCommitCommand => ({
  version: 1,
  manifestId: m.id,
  operationId: m.receiptId,
  expectedHead: m.expectedHead,
  entriesDigest: m.entriesDigest
})
export type ImportCommitResult = {
  version: 2
  kind: 'import-commit'
  projectId: string
  batchId: string
  receiptId: string
  headCommitId: string
}
export type ImportCommitReceipt = {
  version: 1
  id: string
  batchId: string
  graphId: string
  manifestId: string
  manifestDigest: string
  command: ImportCommitCommand
  commandDigest: string
  beforeHead: string
  afterHead: string
  createdAt: string
}
export type CommitRequest = OpenInput &
  (
    | { action: 'import-commit' | 'import-outcome'; command: ImportCommitCommand }
    | { action: 'import-report'; batchId: string; offset: number }
  )
export type CommitValue = {
  type: 'import-committed'
  receipt: ImportCommitReceipt | null
  counts: ConfirmationManifest['counts'] | null
  entries: ConfirmationEntry[]
  offset: number
  total: number
}
export function isImportCommitCommand(v: unknown): v is ImportCommitCommand {
  return (
    record(v) &&
    exact(v, ['version', 'manifestId', 'operationId', 'expectedHead', 'entriesDigest']) &&
    v.version === 1 &&
    [v.manifestId, v.operationId, v.expectedHead].every(isId) &&
    importHash(v.entriesDigest)
  )
}
export function isImportCommitResult(v: unknown): v is ImportCommitResult {
  return (
    record(v) &&
    exact(v, ['version', 'kind', 'projectId', 'batchId', 'receiptId', 'headCommitId']) &&
    v.version === 2 &&
    v.kind === 'import-commit' &&
    [v.projectId, v.batchId, v.receiptId, v.headCommitId].every(isId)
  )
}
export function isImportCommitReceipt(v: unknown): v is ImportCommitReceipt {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'batchId',
      'graphId',
      'manifestId',
      'manifestDigest',
      'command',
      'commandDigest',
      'beforeHead',
      'afterHead',
      'createdAt'
    ]) &&
    v.version === 1 &&
    [v.id, v.batchId, v.graphId, v.manifestId, v.beforeHead, v.afterHead].every(isId) &&
    importHash(v.manifestDigest) &&
    importHash(v.commandDigest) &&
    importTime(v.createdAt) &&
    isImportCommitCommand(v.command) &&
    v.command.operationId === v.id &&
    v.command.manifestId === v.manifestId &&
    v.command.expectedHead === v.beforeHead
  )
}
export function isCommitRequest(v: unknown): v is CommitRequest {
  if (!record(v) || !isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }))
    return false
  return (
    (['import-commit', 'import-outcome'].includes(String(v.action)) &&
      exact(v, ['projectId', 'workspaceId', 'action', 'command']) &&
      isImportCommitCommand(v.command)) ||
    (v.action === 'import-report' &&
      exact(v, ['projectId', 'workspaceId', 'action', 'batchId', 'offset']) &&
      isId(v.batchId) &&
      Number.isSafeInteger(v.offset) &&
      Number(v.offset) >= 0 &&
      Number(v.offset) <= 50000)
  )
}
export function isCommitValue(v: unknown): v is CommitValue {
  if (
    !record(v) ||
    !exact(v, ['type', 'receipt', 'counts', 'entries', 'offset', 'total']) ||
    v.type !== 'import-committed' ||
    !Array.isArray(v.entries) ||
    v.entries.length > 10 ||
    !v.entries.every(isConfirmationEntry) ||
    !Number.isSafeInteger(v.offset) ||
    Number(v.offset) < 0 ||
    Number(v.offset) > 50000 ||
    !Number.isSafeInteger(v.total) ||
    Number(v.total) < 0 ||
    Number(v.total) > 50000
  )
    return false
  if (v.receipt === null) return v.counts === null && v.entries.length === 0 && v.total === 0
  return (
    isImportCommitReceipt(v.receipt) &&
    record(v.counts) &&
    exact(v.counts, [
      'chats',
      'messages',
      'sources',
      'newSources',
      'reusedSources',
      'notes',
      'excluded',
      'retained'
    ]) &&
    Object.values(v.counts).every(
      (n) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 50000
    )
  )
}
