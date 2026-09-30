import { isId, readDocument, type DocumentPayload } from '../domain/editor/schema'

export const PROJECT_CHANNELS = {
  location: 'projects.location', chooseLocation: 'projects.chooseLocation',
  list: 'projects.list', create: 'projects.create', open: 'projects.open', commit: 'document.commit'
} as const
export type ProjectCode = 'VALIDATION' | 'DENIED' | 'UNAVAILABLE' | 'STORAGE_LOCATION_REQUIRED' | 'PROJECT_LOCKED' | 'STALE_REVISION' | 'OPERATION_CONFLICT' | 'DISK_FULL' | 'FORMAT_TOO_NEW' | 'CORRUPT_PROJECT' | 'MIGRATION_FAILED' | 'NOT_FOUND' | 'CANCELLED' | 'EXTERNAL_CHANGE' | 'DESTINATION_UNAVAILABLE' | 'UNSAFE_DESTINATION' | 'JOB_INTERRUPTED' | 'INVALID_ARCHIVE' | 'LIMIT_EXCEEDED'
export const projectMessages: Record<ProjectCode, string> = {
  VALIDATION: 'This document or request is not supported. Your current text has been kept.',
  DENIED: 'Access to local storage was denied. Your current text has been kept.',
  UNAVAILABLE: 'Local storage is unavailable. Keep this window open and copy any unprotected text.',
  STORAGE_LOCATION_REQUIRED: 'Choose a device-local working folder outside cloud sync and network storage.',
  PROJECT_LOCKED: 'This project is already owned by another process. Close that copy before reopening.',
  STALE_REVISION: 'The document changed since it was opened. Your text is kept; copy it before reopening the stored version.',
  OPERATION_CONFLICT: 'This operation ID was already used for different content. Your text has been kept.',
  DISK_FULL: 'The disk is full. Free space, then retry the same local commit; your text is still here.',
  FORMAT_TOO_NEW: 'This project needs a newer Collie Writer. Its files have not been migrated.',
  CORRUPT_PROJECT: 'This local project could not be read safely. Its original files have been retained.',
  MIGRATION_FAILED: 'The migration could not finish. The original and any migration copies have been retained.',
  NOT_FOUND: 'This local project could not be found. Its files have not been removed.',
  CANCELLED: 'The file operation was cancelled. Local writing and existing destinations have been kept.',
  EXTERNAL_CHANGE: 'The selected file changed outside Collie Writer. Inspect it or save your local work to another file.',
  DESTINATION_UNAVAILABLE: 'The selected file cannot be reached. Retry, locate the moved file, or use Save As. Local recovery remains here.',
  UNSAFE_DESTINATION: 'This location cannot support the selected-file save safely. Choose a local APFS/HFS+ or fixed NTFS/ReFS folder, including a local cloud-sync folder.',
  JOB_INTERRUPTED: 'An interrupted file operation needs inspection. Retained candidates and previous files have not been removed. Use Save As to preserve another copy.',
  INVALID_ARCHIVE: 'This file is not a supported, intact Collie Writer project. The original has been kept.',
  LIMIT_EXCEEDED: 'This file exceeds the supported size or resource limits. The original and local work have been kept.'
}
export type ProjectResult<T> = { ok: true; requestId: string; value: T } | { ok: false; requestId: string; error: { code: ProjectCode; message: string; retryable: boolean } }
export type LocationStatus = { state: 'ready' | 'required'; path: string | null; message: string }
export type DestinationView = { path: string; snapshotId: string; headCommitId: string; generationId: string }
export type ProjectSummary = { projectId: string; workspaceId: string; title: string; headCommitId: string; updatedAt: string; destination: DestinationView | null }
export type ProjectList = { projects: ProjectSummary[]; issues: { projectId: string; code: ProjectCode }[] }
export type OpenProject = ProjectSummary & { documentId: string; revisionId: string; payload: DocumentPayload }
export type CreateInput = { operationId: string; template: 'blank' }
export type OpenInput = { projectId: string; workspaceId: string }
export type CommitInput = OpenInput & { operationId: string; documentId: string; expectedRevisionId: string; payload: DocumentPayload }
export type CommitReceipt = { projectId: string; documentId: string; revisionId: string; headCommitId: string }
export type ProjectCommand = { kind: 'list' } | { kind: 'create'; input: CreateInput } | { kind: 'open'; input: OpenInput } | { kind: 'commit'; input: CommitInput }
export type ProjectValue = ProjectList | OpenProject | CommitReceipt
export type ProjectAPI = {
  getWorkingLocation: () => Promise<ProjectResult<LocationStatus>>
  chooseWorkingLocation: () => Promise<ProjectResult<LocationStatus>>
  listProjects: () => Promise<ProjectResult<ProjectList>>
  createProject: (input: CreateInput) => Promise<ProjectResult<OpenProject>>
  openProject: (input: OpenInput) => Promise<ProjectResult<OpenProject>>
  commitDocument: (input: CommitInput) => Promise<ProjectResult<CommitReceipt>>
  setUnprotectedChanges: (dirty: boolean) => void
}
export const DIRTY_CHANGED = 'document.unprotectedChanges'
export function record(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
export function exact(v: Record<string, unknown>, names: string[]): boolean { return Object.keys(v).length === names.length && names.every(k => Object.hasOwn(v, k)) }
export function isProjectCode(v: unknown): v is ProjectCode { return typeof v === 'string' && Object.hasOwn(projectMessages, v) }
export function projectFailure(requestId: string, code: ProjectCode): ProjectResult<never> {
  return { ok: false, requestId, error: { code, message: projectMessages[code], retryable: ['UNAVAILABLE', 'DISK_FULL', 'PROJECT_LOCKED'].includes(code) } }
}
export function isOpenInput(v: unknown): v is OpenInput { return record(v) && exact(v, ['projectId', 'workspaceId']) && isId(v.projectId) && isId(v.workspaceId) }
export function isCreateInput(v: unknown): v is CreateInput { return record(v) && exact(v, ['operationId', 'template']) && isId(v.operationId) && v.template === 'blank' }
export function isCommitInput(v: unknown): v is CommitInput {
  if (!record(v) || !exact(v, ['projectId', 'workspaceId', 'operationId', 'documentId', 'expectedRevisionId', 'payload']) || ![v.projectId, v.workspaceId, v.operationId, v.documentId, v.expectedRevisionId].every(isId)) return false
  try { readDocument(v.payload); return true } catch { return false }
}
export function isProjectCommand(v: unknown): v is ProjectCommand {
  if (!record(v)) return false
  if (v.kind === 'list') return exact(v, ['kind'])
  if (!exact(v, ['kind', 'input'])) return false
  return v.kind === 'create' ? isCreateInput(v.input) : v.kind === 'open' ? isOpenInput(v.input) : v.kind === 'commit' && isCommitInput(v.input)
}
export function isDestination(v: unknown): v is DestinationView {
  return record(v) && exact(v, ['path', 'snapshotId', 'headCommitId', 'generationId']) && typeof v.path === 'string' && v.path.length > 0 && v.path.length <= 4096 && [v.snapshotId, v.headCommitId, v.generationId].every(isId)
}
function summary(v: unknown): v is ProjectSummary {
  return record(v) && [v.projectId, v.workspaceId, v.headCommitId].every(isId) && typeof v.title === 'string' && v.title.length <= 500 && typeof v.updatedAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.updatedAt) && (v.destination === null || isDestination(v.destination))
}
export function isProjectValue(kind: ProjectCommand['kind'], v: unknown): v is ProjectValue {
  if (!record(v)) return false
  if (kind === 'list') return exact(v, ['projects', 'issues']) && Array.isArray(v.projects) && v.projects.length <= 10000 && v.projects.every(p => summary(p) && exact(p, ['projectId', 'workspaceId', 'title', 'headCommitId', 'updatedAt', 'destination'])) && Array.isArray(v.issues) && v.issues.length <= 10000 && v.issues.every(p => record(p) && exact(p, ['projectId', 'code']) && isId(p.projectId) && isProjectCode(p.code))
  if (kind === 'commit') return exact(v, ['projectId', 'documentId', 'revisionId', 'headCommitId']) && Object.values(v).every(isId)
  if (!summary(v) || !exact(v, ['projectId', 'workspaceId', 'title', 'headCommitId', 'updatedAt', 'destination', 'documentId', 'revisionId', 'payload']) || !isId(v.documentId) || !isId(v.revisionId)) return false
  try { readDocument(v.payload); return true } catch { return false }
}
export function isProjectResult<T>(v: unknown, requestId: string, valid: (value: unknown) => boolean): v is ProjectResult<T> {
  if (!record(v) || v.requestId !== requestId) return false
  if (v.ok === true) return exact(v, ['ok', 'requestId', 'value']) && valid(v.value)
  return v.ok === false && exact(v, ['ok', 'requestId', 'error']) && record(v.error) && exact(v.error, ['code', 'message', 'retryable']) && isProjectCode(v.error.code) && v.error.message === projectMessages[v.error.code] && typeof v.error.retryable === 'boolean'
}
export function isLocation(v: unknown): v is LocationStatus { return record(v) && exact(v, ['state', 'path', 'message']) && ['ready', 'required'].includes(String(v.state)) && (v.path === null || typeof v.path === 'string' && v.path.length <= 4096) && typeof v.message === 'string' && v.message.length <= 500 }
