import { ipcRenderer } from 'electron'
import {
  PROOFREADING_CHANNEL,
  PROOFREADING_CHANGED,
  isProofreadingEvent,
  isProofreadValue,
  type ProofreadingAPI,
  type ProofreadValue
} from '../shared/proofreading'
import { isProjectResult, projectFailure } from '../shared/projects'
export const proofreadingApi: ProofreadingAPI = {
  proofreading: async (input) => {
    const requestId = crypto.randomUUID()
    try {
      const result: unknown = await ipcRenderer.invoke(PROOFREADING_CHANNEL, { requestId, input })
      if (isProjectResult<ProofreadValue>(result, requestId, isProofreadValue)) return result
    } catch {
      /* An unknown reply retains the exact request for local replay. */
    }
    return projectFailure(requestId, 'UNAVAILABLE')
  },
  onProofreadingChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isProofreadingEvent(value)) listener(value)
    }
    ipcRenderer.on(PROOFREADING_CHANGED, receive)
    return () => ipcRenderer.removeListener(PROOFREADING_CHANGED, receive)
  }
}
