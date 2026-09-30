import { contextBridge, ipcRenderer } from 'electron'
import {
  GET_INFO,
  GET_STORAGE_STATUS,
  STORAGE_STATUS_CHANGED,
  type CollieAPI
} from '../shared/commands'
import { isInfoResult, isStorageResult } from '../shared/schemas'
import { isStorageStatus } from '../shared/storage'

if (!process.contextIsolated || !process.sandboxed) throw new Error('Secure preload required')
const api: CollieAPI = {
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
