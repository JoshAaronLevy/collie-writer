import { contextBridge, ipcRenderer } from 'electron'
import { GET_INFO, type CollieAPI } from '../shared/commands'
import { isInfoResult } from '../shared/schemas'

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
  }
}
contextBridge.exposeInMainWorld('collie', Object.freeze(api))
