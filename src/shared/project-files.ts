import { isId } from '../domain/editor/schema'
import { exact, record, isDestination, isOpenInput, isProjectCode, type DestinationView, type OpenInput, type ProjectCode, type ProjectResult } from './projects'

export const FILE_CHANNELS = {
  backup: 'files.backup', move: 'files.move', restore: 'files.restore', duplicate: 'files.duplicate', recover: 'files.recover',
  pick: 'files.pick', save: 'files.save', open: 'files.open', locate: 'files.locate', inspect: 'files.inspect',
  status: 'files.status', cancel: 'files.cancel', answer: 'files.answer', consent: 'files.consent',
  revealProject: 'files.revealProject', revealWorking: 'files.revealWorking', claimShell: 'files.claimShell'
} as const
export const FILE_CHANGED = 'files.changed'
export const FILE_ACTION = 'files.action'
export const CLOSE_REPLY = 'files.closeReply'
export type FileAction = { id: string; kind: 'save' | 'save-as' | 'open' | 'open-shell' | 'close' | 'close-cancelled' | 'suspend' | 'resume' }
export type FileChoice = 'cancel' | 'open-copy' | 'use-local' | 'import'
export type PickInput = { purpose: 'save' | 'open' | 'locate' | 'backup' | 'move' | 'restore'; scope: OpenInput | null }
export type FileSelection = { token: string; path: string }
export type SaveInput = { scope: OpenInput; operationId: string; minimumHead: string; expectedGeneration: string | null; token: string | null }
export type SelectedInput = { operationId: string; token: string }
export type LocateInput = SelectedInput & { scope: OpenInput }
export type InspectInput = { scope: OpenInput; operationId: string }
export type FileInspection = { projectId: string; snapshotId: string; headCommitId: string; title: string; local: OpenInput | null }
export type FileJobView = {
  id: string; kind: 'save' | 'open' | 'locate' | 'inspect' | 'check' | 'backup' | 'move' | 'restore' | 'duplicate' | 'recover'; scope: OpenInput | null; path: string
  state: 'running' | 'awaiting-consent' | 'awaiting-choice' | 'completed' | 'failed' | 'cancelled'
  phase: 'reading' | 'capture' | 'archive' | 'staging' | 'replacing' | 'verifying' | 'done'
  bytes: number; capturedHead: string | null; error: ProjectCode | null; inspection: FileInspection | null; opened: OpenInput | null
  cancellable: boolean
}
export type FileStatus = {
  scope: OpenInput | null; destination: DestinationView | null
  state: 'unsaved' | 'checking' | 'saved' | 'pending' | 'external-change' | 'unavailable' | 'interrupted'
  job: FileJobView | null
}
export type FileAPI = {
  backupProject: (input: SaveInput) => Promise<ProjectResult<FileStatus>>
  moveProject: (input: SaveInput) => Promise<ProjectResult<FileStatus>>
  restoreProject: (input: SelectedInput) => Promise<ProjectResult<FileStatus>>
  duplicateProject: (input: { scope: OpenInput; operationId: string; expectedHead: string }) => Promise<ProjectResult<FileStatus>>
  recoverProjectVersion: (input: { operationId: string; artifactId: string }) => Promise<ProjectResult<FileStatus>>
  pickProjectFile: (input: PickInput) => Promise<ProjectResult<FileSelection | null>>
  claimShellProjectFile: () => Promise<ProjectResult<FileSelection | null>>
  saveProjectFile: (input: SaveInput) => Promise<ProjectResult<FileStatus>>
  openProjectFile: (input: SelectedInput) => Promise<ProjectResult<FileStatus>>
  locateProjectFile: (input: LocateInput) => Promise<ProjectResult<FileStatus>>
  inspectProjectFile: (input: InspectInput) => Promise<ProjectResult<FileStatus>>
  getProjectFileStatus: (scope: OpenInput | null) => Promise<ProjectResult<FileStatus>>
  revealProjectFile: (scope: OpenInput) => Promise<ProjectResult<boolean>>
  revealWorkingData: () => Promise<ProjectResult<boolean>>
  cancelFileJob: (id: string) => Promise<ProjectResult<FileStatus>>
  answerFileJob: (input: { id: string; choice: FileChoice }) => Promise<ProjectResult<FileStatus>>
  confirmFileOverwrite: (id: string) => Promise<ProjectResult<FileStatus>>
  onFileStatus: (callback: (status: FileStatus) => void) => () => void
  onFileAction: (callback: (action: FileAction) => void) => () => void
  finishClose: (id: string, outcome: 'saved' | 'local' | 'failed' | 'cancel') => void
}
export function isPickInput(v: unknown): v is PickInput {
  return record(v) && exact(v, ['purpose', 'scope']) && (['open','restore'].includes(String(v.purpose)) ? v.scope === null : ['save','locate','backup','move'].includes(String(v.purpose)) && isOpenInput(v.scope))
}
export function isSelection(v: unknown): v is FileSelection | null {
  return v === null || record(v) && exact(v, ['token','path']) && isId(v.token) && typeof v.path === 'string' && v.path.length <= 4096
}
export function isSaveInput(v: unknown): v is SaveInput {
  return record(v) && exact(v, ['scope','operationId','minimumHead','expectedGeneration','token']) && isOpenInput(v.scope) && isId(v.operationId) && isId(v.minimumHead) && (v.expectedGeneration === null || isId(v.expectedGeneration)) && (v.token === null || isId(v.token))
}
export function isSelectedInput(v: unknown): v is SelectedInput { return record(v) && exact(v, ['operationId','token']) && isId(v.operationId) && isId(v.token) }
export function isLocateInput(v: unknown): v is LocateInput { return record(v) && exact(v, ['scope','operationId','token']) && isOpenInput(v.scope) && isId(v.operationId) && isId(v.token) }
export function isInspectInput(v: unknown): v is InspectInput { return record(v) && exact(v, ['scope','operationId']) && isOpenInput(v.scope) && isId(v.operationId) }
export function isFileChoice(v: unknown): v is FileChoice { return ['cancel','open-copy','use-local','import'].includes(String(v)) }
export function sameScope(a: OpenInput | null, b: OpenInput | null): boolean { return a === null ? b === null : !!b && a.projectId === b.projectId && a.workspaceId === b.workspaceId }
export function fileBusy(job: FileJobView | null): boolean { return !!job && ['running','awaiting-consent','awaiting-choice'].includes(job.state) }
export function isFileStatus(v: unknown): v is FileStatus {
  if (!record(v) || !exact(v, ['scope','destination','state','job']) || !(v.scope === null || isOpenInput(v.scope)) || !(v.destination === null || isDestination(v.destination)) || !['unsaved','checking','saved','pending','external-change','unavailable','interrupted'].includes(String(v.state))) return false
  const j = v.job
  if (j === null) return true
  if (!record(j) || !exact(j, ['id','kind','scope','path','state','phase','bytes','capturedHead','error','inspection','opened','cancellable']) || !isId(j.id) || !['save','open','locate','inspect','check','backup','move','restore','duplicate','recover'].includes(String(j.kind)) || !(j.scope === null || isOpenInput(j.scope)) || typeof j.path !== 'string' || j.path.length > 4096 || !['running','awaiting-consent','awaiting-choice','completed','failed','cancelled'].includes(String(j.state)) || !['reading','capture','archive','staging','replacing','verifying','done'].includes(String(j.phase)) || !Number.isSafeInteger(j.bytes) || Number(j.bytes) < 0 || !(j.capturedHead === null || isId(j.capturedHead)) || !(j.error === null || isProjectCode(j.error)) || !(j.opened === null || isOpenInput(j.opened)) || typeof j.cancellable !== 'boolean') return false
  const i = j.inspection
  return i === null || record(i) && exact(i, ['projectId','snapshotId','headCommitId','title','local']) && [i.projectId,i.snapshotId,i.headCommitId].every(isId) && typeof i.title === 'string' && i.title.length <= 500 && (i.local === null || isOpenInput(i.local))
}
export function isFileAction(v: unknown): v is FileAction { return record(v) && exact(v, ['id','kind']) && isId(v.id) && ['save','save-as','open','open-shell','close','close-cancelled','suspend','resume'].includes(String(v.kind)) }
