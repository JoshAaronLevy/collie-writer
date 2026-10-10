import { ipcRenderer } from 'electron'
import {
  IMPORT_ANALYSIS_CHANNEL,
  IMPORT_ANALYSIS_CHANGED,
  isImportAnalysisEvent,
  isAnalysisValue,
  type ImportAnalysisAPI,
  type AnalysisValue
} from '../shared/import-analysis'
import { isProjectResult, projectFailure } from '../shared/projects'
export const importAnalysisApi: ImportAnalysisAPI = {
  importAnalysis: async (input) => {
    const requestId = crypto.randomUUID()
    try {
      const result: unknown = await ipcRenderer.invoke(IMPORT_ANALYSIS_CHANNEL, {
        requestId,
        input
      })
      if (isProjectResult<AnalysisValue>(result, requestId, isAnalysisValue)) return result
    } catch {
      /* An unknown reply retains the exact request for local replay. */
    }
    return projectFailure(requestId, 'UNAVAILABLE')
  },
  onImportAnalysisChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      if (isImportAnalysisEvent(value)) listener(value)
    }
    ipcRenderer.on(IMPORT_ANALYSIS_CHANGED, receive)
    return () => ipcRenderer.removeListener(IMPORT_ANALYSIS_CHANGED, receive)
  }
}
