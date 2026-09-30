import { contextBridge, ipcRenderer } from 'electron'
import {
  GET_INFO,
  GET_STORAGE_STATUS,
  STORAGE_STATUS_CHANGED,
  type CollieAPI
} from '../shared/commands'
import { isInfoResult, isStorageResult } from '../shared/schemas'
import { isStorageStatus } from '../shared/storage'
import { DIRTY_CHANGED, PROJECT_CHANNELS, isLocation, isProjectResult, isProjectValue, projectFailure, type ProjectResult, type LocationStatus, type ProjectList, type OpenProject, type CommitReceipt } from '../shared/projects'

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
  getWorkingLocation: () => projectCall<LocationStatus>(PROJECT_CHANNELS.location, isLocation),
  chooseWorkingLocation: () => projectCall<LocationStatus>(PROJECT_CHANNELS.chooseLocation, isLocation),
  listProjects: () => projectCall<ProjectList>(PROJECT_CHANNELS.list, value => isProjectValue('list', value)),
  createProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.create, value => isProjectValue('create', value), input),
  openProject: input => projectCall<OpenProject>(PROJECT_CHANNELS.open, value => isProjectValue('open', value), input),
  commitDocument: input => projectCall<CommitReceipt>(PROJECT_CHANNELS.commit, value => isProjectValue('commit', value), input),
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
