import { isDataLocations, type DataLocations } from '../shared/project-lifecycle'
import { contextBridge, ipcRenderer } from 'electron'
import {
  GET_INFO,
  EDITOR_ACTION,
  GET_STORAGE_STATUS,
  STORAGE_STATUS_CHANGED,
  type CollieAPI
} from '../shared/commands'
import { isInfoResult, isStorageResult } from '../shared/schemas'
import { isStorageStatus } from '../shared/storage'
import { isId } from '../domain/editor/schema'
import { DIRTY_CHANGED, PROJECT_CHANNELS, isLocation, isProjectResult, isProjectValue, projectFailure, record, exact, type ProjectResult, type LocationStatus, type ProjectList, type OpenProject, type CommitReceipt, type ImageAsset, type ImageData, type ImagePick } from '../shared/projects'
import { CLOSE_REPLY, FILE_ACTION, FILE_CHANGED, FILE_CHANNELS, isFileAction, isFileStatus, isSelection, type FileStatus, type FileSelection } from '../shared/project-files'

async function projectCall<T>(channel: string, validate: (value: unknown) => boolean, input?: unknown): Promise<ProjectResult<T>> {
  const requestId = crypto.randomUUID()
  try {
    const result: unknown = await ipcRenderer.invoke(channel, input === undefined ? { requestId } : { requestId, input })
    if (isProjectResult<T>(result, requestId, validate)) return result
  } catch { /* Preserve the operation ID at the caller; a transport error does not prove rollback. */ }
  return projectFailure(requestId, 'UNAVAILABLE')
}

if (!process.contextIsolated || !process.sandboxed) throw new Error('Secure preload required')
const api: CollieAPI = {
  onEditorAction: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => { if (value === 'undo' || value === 'redo' || value === 'find' || value === 'paste-plain') callback(value) }
    ipcRenderer.on(EDITOR_ACTION, listener); return () => ipcRenderer.removeListener(EDITOR_ACTION, listener)
  },
  renameProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.rename, value => isProjectValue('rename', value), input),
  archiveProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.archive, value => isProjectValue('archive', value), input),
  getDataLocations: () => projectCall<DataLocations>(PROJECT_CHANNELS.data, isDataLocations),
  resetLocalWork: input => projectCall<DataLocations>(PROJECT_CHANNELS.reset, isDataLocations, input),
  recoverReset: id => projectCall<DataLocations>(PROJECT_CHANNELS.recoverReset, isDataLocations, id),
  clearPickerHistory: () => projectCall<DataLocations>(PROJECT_CHANNELS.cleanup, isDataLocations),
  backupProject: input => projectCall<FileStatus>(FILE_CHANNELS.backup, isFileStatus, input),
  moveProject: input => projectCall<FileStatus>(FILE_CHANNELS.move, isFileStatus, input),
  restoreProject: input => projectCall<FileStatus>(FILE_CHANNELS.restore, isFileStatus, input),
  duplicateProject: input => projectCall<FileStatus>(FILE_CHANNELS.duplicate, isFileStatus, input),
  recoverProjectVersion: input => projectCall<FileStatus>(FILE_CHANNELS.recover, isFileStatus, input),
  pickProjectFile: input => projectCall<FileSelection | null>(FILE_CHANNELS.pick, isSelection, input),
  saveProjectFile: input => projectCall<FileStatus>(FILE_CHANNELS.save, isFileStatus, input),
  openProjectFile: input => projectCall<FileStatus>(FILE_CHANNELS.open, isFileStatus, input),
  locateProjectFile: input => projectCall<FileStatus>(FILE_CHANNELS.locate, isFileStatus, input),
  inspectProjectFile: input => projectCall<FileStatus>(FILE_CHANNELS.inspect, isFileStatus, input),
  getProjectFileStatus: scope => projectCall<FileStatus>(FILE_CHANNELS.status, isFileStatus, scope),
  cancelFileJob: id => projectCall<FileStatus>(FILE_CHANNELS.cancel, isFileStatus, id),
  answerFileJob: input => projectCall<FileStatus>(FILE_CHANNELS.answer, isFileStatus, input),
  confirmFileOverwrite: id => projectCall<FileStatus>(FILE_CHANNELS.consent, isFileStatus, id),
  onFileStatus: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => { if (isFileStatus(value)) callback(value) }
    ipcRenderer.on(FILE_CHANGED, listener); return () => ipcRenderer.removeListener(FILE_CHANGED, listener)
  },
  onFileAction: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => { if (isFileAction(value)) callback(value) }
    ipcRenderer.on(FILE_ACTION, listener); return () => ipcRenderer.removeListener(FILE_ACTION, listener)
  },
  finishClose: (id, outcome) => ipcRenderer.send(CLOSE_REPLY, { id, outcome }),
  getWorkingLocation: () => projectCall<LocationStatus>(PROJECT_CHANNELS.location, isLocation),
  chooseWorkingLocation: () => projectCall<LocationStatus>(PROJECT_CHANNELS.chooseLocation, isLocation),
  listProjects: () => projectCall<ProjectList>(PROJECT_CHANNELS.list, value => isProjectValue('list', value)),
  createProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.create, value => isProjectValue('create', value), input),
  openProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.open, value => isProjectValue('open', value), input),
  openSection: input => projectCall<OpenProject>(PROJECT_CHANNELS.section, value => isProjectValue('section', value), input),
  updateSectionMeta: input => projectCall<OpenProject>(PROJECT_CHANNELS.meta, value => isProjectValue('meta', value), input),
  commitDocument: input => projectCall<CommitReceipt>(PROJECT_CHANNELS.commit, value => isProjectValue('commit', value), input),
  pickImage: scope => projectCall<ImagePick | null>(PROJECT_CHANNELS.pickImage, value => value === null || record(value) && exact(value, ['token','name']) && isId(value.token) && typeof value.name === 'string' && value.name.length <= 255 && !/[\\/:\u0000-\u001f]/.test(value.name), scope),
  importImage: input => projectCall<ImageAsset>(PROJECT_CHANNELS.importImage, value => isProjectValue('importImage', value), input),
  readImage: input => projectCall<ImageData>(PROJECT_CHANNELS.readImage, value => isProjectValue('readImage', value), input),
  readPlainClipboard: () => projectCall<string>(PROJECT_CHANNELS.plainClipboard, value => typeof value === 'string' && value.length <= 1_000_000),
  setUnprotectedChanges: dirty => { if (typeof dirty === 'boolean') ipcRenderer.send(DIRTY_CHANGED, dirty) },
  getInfo: async () => {
    const requestId = crypto.randomUUID()
    try {
      const result: unknown = await ipcRenderer.invoke(GET_INFO, { requestId })
      if (isInfoResult(result, requestId)) return result
    } catch {
      /* Transport failure is converted to a bounded application error. */
    }
    return {
      ok: false,
      requestId,
      error: {
        code: 'UNAVAILABLE',
        message: 'Application information is unavailable. Try reopening this window.',
        retryable: true
      }
    }
  },
  getStorageStatus: async () => {
    const requestId = crypto.randomUUID()
    try {
      const result: unknown = await ipcRenderer.invoke(GET_STORAGE_STATUS, { requestId })
      if (isStorageResult(result, requestId)) return result
    } catch {
      /* Transport failure is converted to a bounded application error. */
    }
    return {
      ok: false,
      requestId,
      error: {
        code: 'UNAVAILABLE',
        message: 'Storage status is unavailable. Try reopening this window.',
        retryable: true
      }
    }
  },
  onStorageStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isStorageStatus(value)) callback(value)
    }
    ipcRenderer.on(STORAGE_STATUS_CHANGED, listener)
    return () => ipcRenderer.removeListener(STORAGE_STATUS_CHANGED, listener)
  }
}
contextBridge.exposeInMainWorld('collie', Object.freeze(api))
