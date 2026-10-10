import {
  isImportContentRequest,
  isImportContentValue,
  type ImportContentRequest,
  type ImportContentValue
} from './import-content'
import { isId } from '../domain/editor/schema'
import { hasControlCharacters } from './control-characters'
import {
  exact,
  record,
  isOpenInput,
  isProjectCode,
  type OpenInput,
  type ProjectResult,
  type ProjectCode
} from './projects'

export const PROJECT_IMPORT_CHANNEL = 'project-import.command'
export const IMPORT_LIMITS = {
  files: 100,
  fileBytes: 25 * 1024 ** 2,
  batchBytes: 100 * 1024 ** 2,
  batches: 1000,
  activeBatches: 8,
  revisions: 1000,
  instructions: 4000,
  artifactBytes: 1024 ** 2,
  derivedBytes: 256 * 1024 ** 2,
  descriptorUnits: 65536,
  page: 50
} as const
export type ImportCategory = 'chats' | 'sources' | 'notes'
export type ImportSettings = { categories: ImportCategory[]; instructions: string }
export type ImportFile = {
  version: 1
  id: string
  batchId: string
  assetId: string
  originalName: string
  sha256: string
  bytes: number
  mediaType: string
  order: number
  createdAt: string
}
export type ImportFileSelection = Pick<
  ImportFile,
  'id' | 'assetId' | 'originalName' | 'sha256' | 'bytes' | 'mediaType'
>
/** Portable intent: no selected paths, workspace, account or execution permission. */
export type ImportMutation =
  | ({ version: 1; operationId: string; batchId: string } & (
      | { action: 'create'; settings: ImportSettings }
      | {
          action: 'configure'
          expectedRevision: string
          settings: ImportSettings
          selectedFileIds: string[]
        }
      | { action: 'discard'; expectedRevision: string }
      | { action: 'add-file'; expectedRevision: string; file: ImportFileSelection }
    ))
  | {
      version: 2
      operationId: string
      batchId: string
      action: 'prepare-graph'
      expectedRevision: string
    }
export type ImportSessionReceipt = {
  version: 2
  kind: 'import-session'
  projectId: string
  batchId: string
  revisionId: string
  headCommitId: string
}
export type ImportRevision = {
  version: 1 | 2
  id: string
  batchId: string
  parentRevisionId: string | null
  phase: 'preparing' | 'discarded'
  selectedFileIds: string[]
  settings: ImportSettings
  retention: 'whole-originals'
  intakeArtifactId: string
  graphId: string | null
  planId: null
  proposalId: null
  reviewId: null
  receiptId: null
  createdAt: string
  digest: string
}
export type ImportArtifact = {
  version: 1
  id: string
  batchId: string
  kind: 'intake-v1'
  assetId: string
  sha256: string
  bytes: number
  digest: string
  createdAt: string
}
export type ImportBatchSummary = {
  id: string
  revisionId: string
  phase: ImportRevision['phase'] | 'completed'
  createdAt: string
  selectedFiles: number
  retainedFiles: number
  retainedBytes: number
}
export type ImportRequest =
  | ImportContentRequest
  | (OpenInput &
      (
        | { action: 'list'; offset: number }
        | { action: 'read'; batchId: string; revisionId: string | null; offset: number }
        | { action: 'mutate'; mutation: Exclude<ImportMutation, { action: 'add-file' }> }
        | { action: 'lookup'; mutation: ImportMutation }
      ))
/** Only main's native-selection owner may supply this worker-only path. */
export type ImportWorkerInput =
  | ImportRequest
  | (OpenInput & {
      action: 'stage-file'
      mutation: Extract<ImportMutation, { action: 'add-file' }>
      sourcePath: string
    })
export type ImportPickResult = {
  name: string
  bytes: number | null
  status: 'staged' | 'duplicate' | 'unsupported' | 'failed' | 'not-staged'
  fileId: string | null
  code: ProjectCode | null
}
export type ImportValue =
  | ImportContentValue
  | { type: 'picked'; cancelled: boolean; results: ImportPickResult[] }
  | { type: 'recovery'; pending: ImportMutation | null; busy: boolean; issue: ProjectCode | null }
  | { type: 'batches'; batches: ImportBatchSummary[]; total: number; nextOffset: number | null }
  | {
      type: 'batch'
      revision: ImportRevision
      files: ImportFile[]
      totalFiles: number
      nextOffset: number | null
    }
  | { type: 'receipt'; operationId: string; receipt: ImportSessionReceipt | null }
export type ProjectImportAPI = {
  projectImport: (input: ImportServiceRequest) => Promise<ProjectResult<ImportValue>>
}
export type ImportServiceRequest =
  | ImportRequest
  | (OpenInput & { action: 'recovery' })
  | (OpenInput & { action: 'pick-files'; batchId: string; expectedRevision: string })
  | (OpenInput & {
      action: 'resolve-file'
      mutation: Extract<ImportMutation, { action: 'add-file' }>
      decision: 'retry' | 'abandon'
    })
export function isImportServiceRequest(v: unknown): v is ImportServiceRequest {
  return (
    isImportRequest(v) ||
    (record(v) &&
      exact(v, ['projectId', 'workspaceId', 'action']) &&
      v.action === 'recovery' &&
      isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId })) ||
    (record(v) &&
      isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }) &&
      ((v.action === 'pick-files' &&
        exact(v, ['projectId', 'workspaceId', 'action', 'batchId', 'expectedRevision']) &&
        isId(v.batchId) &&
        isId(v.expectedRevision)) ||
        (v.action === 'resolve-file' &&
          exact(v, ['projectId', 'workspaceId', 'action', 'mutation', 'decision']) &&
          isImportMutation(v.mutation) &&
          v.mutation.action === 'add-file' &&
          ['retry', 'abandon'].includes(String(v.decision)))))
  )
}
export const importHash = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
export const importTime = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v
const integer = (v: unknown, max: number): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max
const text = (v: unknown, max: number, multiline = false): v is string =>
  typeof v === 'string' && v.length <= max && !hasControlCharacters(v, multiline)
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= IMPORT_LIMITS.files &&
  v.every(isId) &&
  new Set(v).size === v.length
export function isImportSettings(v: unknown): v is ImportSettings {
  return (
    record(v) &&
    exact(v, ['categories', 'instructions']) &&
    Array.isArray(v.categories) &&
    v.categories.length <= 3 &&
    v.categories.every((c) => ['chats', 'sources', 'notes'].includes(c)) &&
    new Set(v.categories).size === v.categories.length &&
    v.categories.join() === [...v.categories].sort().join() &&
    text(v.instructions, IMPORT_LIMITS.instructions, true)
  )
}
export function isImportFileSelection(v: unknown): v is ImportFileSelection {
  return (
    record(v) &&
    exact(v, ['id', 'assetId', 'originalName', 'sha256', 'bytes', 'mediaType']) &&
    isId(v.id) &&
    isId(v.assetId) &&
    text(v.originalName, 255) &&
    v.originalName.length > 0 &&
    !/[\\/]/.test(v.originalName) &&
    !['.', '..'].includes(v.originalName) &&
    importHash(v.sha256) &&
    integer(v.bytes, IMPORT_LIMITS.fileBytes) &&
    text(v.mediaType, 128) &&
    /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(v.mediaType)
  )
}
export function isImportFile(v: unknown): v is ImportFile {
  if (
    !record(v) ||
    !exact(v, [
      'version',
      'id',
      'batchId',
      'assetId',
      'originalName',
      'sha256',
      'bytes',
      'mediaType',
      'order',
      'createdAt'
    ])
  )
    return false
  const { version, batchId, order, createdAt, ...selection } = v
  return (
    version === 1 &&
    isId(batchId) &&
    integer(order, IMPORT_LIMITS.files - 1) &&
    importTime(createdAt) &&
    isImportFileSelection(selection)
  )
}
export function isImportMutation(v: unknown): v is ImportMutation {
  if (!record(v) || !isId(v.operationId) || !isId(v.batchId)) return false
  if (v.version === 2)
    return (
      v.action === 'prepare-graph' &&
      exact(v, ['version', 'operationId', 'batchId', 'action', 'expectedRevision']) &&
      isId(v.expectedRevision)
    )
  if (v.version !== 1) return false
  const keys = ['version', 'operationId', 'batchId', 'action']
  if (v.action === 'create') return exact(v, [...keys, 'settings']) && isImportSettings(v.settings)
  if (!isId(v.expectedRevision)) return false
  if (v.action === 'discard') return exact(v, [...keys, 'expectedRevision'])
  if (v.action === 'configure')
    return (
      exact(v, [...keys, 'expectedRevision', 'settings', 'selectedFileIds']) &&
      isImportSettings(v.settings) &&
      ids(v.selectedFileIds)
    )
  return (
    v.action === 'add-file' &&
    exact(v, [...keys, 'expectedRevision', 'file']) &&
    isImportFileSelection(v.file)
  )
}
export function isImportRequest(v: unknown): v is ImportRequest {
  if (isImportContentRequest(v)) return true
  if (!record(v) || !isOpenInput({ projectId: v.projectId, workspaceId: v.workspaceId }))
    return false
  const keys = ['projectId', 'workspaceId', 'action']
  if (v.action === 'list')
    return exact(v, [...keys, 'offset']) && integer(v.offset, IMPORT_LIMITS.batches)
  if (v.action === 'read')
    return (
      exact(v, [...keys, 'batchId', 'revisionId', 'offset']) &&
      isId(v.batchId) &&
      (v.revisionId === null || isId(v.revisionId)) &&
      integer(v.offset, IMPORT_LIMITS.files)
    )
  return (
    (v.action === 'lookup' || v.action === 'mutate') &&
    exact(v, [...keys, 'mutation']) &&
    isImportMutation(v.mutation) &&
    (v.action === 'lookup' || v.mutation.action !== 'add-file')
  )
}
export function isImportWorkerInput(v: unknown): v is ImportWorkerInput {
  return (
    isImportRequest(v) ||
    (record(v) &&
      exact(v, ['projectId', 'workspaceId', 'action', 'mutation', 'sourcePath']) &&
      isId(v.projectId) &&
      isId(v.workspaceId) &&
      v.action === 'stage-file' &&
      isImportMutation(v.mutation) &&
      v.mutation.action === 'add-file' &&
      text(v.sourcePath, 4096) &&
      v.sourcePath.length > 0)
  )
}
export function isImportReceipt(v: unknown): v is ImportSessionReceipt {
  return (
    record(v) &&
    exact(v, ['version', 'kind', 'projectId', 'batchId', 'revisionId', 'headCommitId']) &&
    v.version === 2 &&
    v.kind === 'import-session' &&
    [v.projectId, v.batchId, v.revisionId, v.headCommitId].every(isId)
  )
}
export function isImportRevision(v: unknown): v is ImportRevision {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'batchId',
      'parentRevisionId',
      'phase',
      'selectedFileIds',
      'settings',
      'retention',
      'intakeArtifactId',
      'graphId',
      'planId',
      'proposalId',
      'reviewId',
      'receiptId',
      'createdAt',
      'digest'
    ]) &&
    (v.version === 1 || v.version === 2) &&
    (v.version === 1 ? v.graphId === null : isId(v.graphId)) &&
    [v.id, v.batchId, v.intakeArtifactId].every(isId) &&
    (v.parentRevisionId === null || isId(v.parentRevisionId)) &&
    ['preparing', 'discarded'].includes(String(v.phase)) &&
    ids(v.selectedFileIds) &&
    isImportSettings(v.settings) &&
    v.retention === 'whole-originals' &&
    [v.planId, v.proposalId, v.reviewId, v.receiptId].every((id) => id === null) &&
    importTime(v.createdAt) &&
    importHash(v.digest)
  )
}
export function isImportArtifact(v: unknown): v is ImportArtifact {
  return (
    record(v) &&
    exact(v, [
      'version',
      'id',
      'batchId',
      'kind',
      'assetId',
      'sha256',
      'bytes',
      'digest',
      'createdAt'
    ]) &&
    v.version === 1 &&
    v.kind === 'intake-v1' &&
    [v.id, v.batchId, v.assetId].every(isId) &&
    importHash(v.sha256) &&
    importHash(v.digest) &&
    integer(v.bytes, IMPORT_LIMITS.artifactBytes) &&
    importTime(v.createdAt)
  )
}
export function isImportValue(v: unknown): v is ImportValue {
  if (isImportContentValue(v)) return true
  if (!record(v)) return false
  if (v.type === 'picked')
    return (
      exact(v, ['type', 'cancelled', 'results']) &&
      typeof v.cancelled === 'boolean' &&
      Array.isArray(v.results) &&
      v.results.length <= IMPORT_LIMITS.files &&
      v.results.every(
        (r) =>
          record(r) &&
          exact(r, ['name', 'bytes', 'status', 'fileId', 'code']) &&
          text(r.name, 255) &&
          r.name.length > 0 &&
          (r.bytes === null || integer(r.bytes, IMPORT_LIMITS.fileBytes)) &&
          ['staged', 'duplicate', 'unsupported', 'failed', 'not-staged'].includes(
            String(r.status)
          ) &&
          (r.fileId === null || isId(r.fileId)) &&
          (r.code === null || isProjectCode(r.code)) &&
          ((['staged', 'duplicate'].includes(String(r.status)) &&
            r.fileId !== null &&
            r.bytes !== null &&
            r.code === null) ||
            (['unsupported', 'not-staged'].includes(String(r.status)) &&
              r.fileId === null &&
              r.bytes === null &&
              r.code === null) ||
            (r.status === 'failed' && r.fileId === null && r.code !== null))
      )
    )
  if (v.type === 'recovery')
    return (
      exact(v, ['type', 'pending', 'busy', 'issue']) &&
      (v.pending === null || isImportMutation(v.pending)) &&
      typeof v.busy === 'boolean' &&
      (v.issue === null || isProjectCode(v.issue))
    )
  const next = (value: unknown, max: number): boolean => value === null || integer(value, max)
  if (v.type === 'receipt')
    return (
      exact(v, ['type', 'operationId', 'receipt']) &&
      isId(v.operationId) &&
      (v.receipt === null || isImportReceipt(v.receipt))
    )
  if (v.type === 'batch')
    return (
      exact(v, ['type', 'revision', 'files', 'totalFiles', 'nextOffset']) &&
      isImportRevision(v.revision) &&
      Array.isArray(v.files) &&
      v.files.length <= IMPORT_LIMITS.page &&
      v.files.every(isImportFile) &&
      integer(v.totalFiles, IMPORT_LIMITS.files) &&
      next(v.nextOffset, IMPORT_LIMITS.files)
    )
  return (
    v.type === 'batches' &&
    exact(v, ['type', 'batches', 'total', 'nextOffset']) &&
    integer(v.total, IMPORT_LIMITS.batches) &&
    next(v.nextOffset, IMPORT_LIMITS.batches) &&
    Array.isArray(v.batches) &&
    v.batches.length <= IMPORT_LIMITS.page &&
    v.batches.every(
      (b) =>
        record(b) &&
        exact(b, [
          'id',
          'revisionId',
          'phase',
          'createdAt',
          'selectedFiles',
          'retainedFiles',
          'retainedBytes'
        ]) &&
        isId(b.id) &&
        isId(b.revisionId) &&
        ['preparing', 'discarded', 'completed'].includes(String(b.phase)) &&
        importTime(b.createdAt) &&
        integer(b.selectedFiles, IMPORT_LIMITS.files) &&
        integer(b.retainedFiles, IMPORT_LIMITS.files) &&
        integer(b.retainedBytes, IMPORT_LIMITS.batchBytes)
    )
  )
}
