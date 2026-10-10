import { ipcRenderer } from 'electron'
import {
  PROJECT_IMPORT_CHANNEL,
  isImportValue,
  type ProjectImportAPI,
  type ImportValue
} from '../shared/project-import'
import { isProjectResult, projectFailure } from '../shared/projects'

export const projectImportApi: ProjectImportAPI = {
  projectImport: async (input) => {
    const requestId = crypto.randomUUID()
    try {
      const result: unknown = await ipcRenderer.invoke(PROJECT_IMPORT_CHANNEL, { requestId, input })
      if (isProjectResult<ImportValue>(result, requestId, isImportValue)) return result
    } catch {
      /* A lost acknowledgment never permits a new operation or destroys the old intent. */
    }
    return projectFailure(requestId, 'UNAVAILABLE')
  }
}
