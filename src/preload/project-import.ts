import { ipcRenderer, webUtils } from 'electron'
import {
  PROJECT_IMPORT_CHANNEL,
  PROJECT_IMPORT_DROP_CHANNEL,
  IMPORT_LIMITS,
  isImportValue,
  type ProjectImportAPI,
  type ImportValue
} from '../shared/project-import'
import { isProjectResult, projectFailure } from '../shared/projects'

export const projectImportApi: ProjectImportAPI = {
  dropImportFiles: async (input, files) => {
    const requestId = crypto.randomUUID()
    try {
      if (!Array.isArray(files) || !files.length || files.length > IMPORT_LIMITS.files)
        return projectFailure(requestId, 'VALIDATION')
      // Native File handles are the only way renderer code can select these paths.
      // Never expose paths or accept renderer-authored path strings through the bridge.
      const paths = files.map((file) => webUtils.getPathForFile(file))
      if (paths.some((path) => !path)) return projectFailure(requestId, 'VALIDATION')
      const result: unknown = await ipcRenderer.invoke(PROJECT_IMPORT_DROP_CHANNEL, {
        requestId,
        input,
        paths
      })
      if (isProjectResult<ImportValue>(result, requestId, isImportValue)) return result
    } catch {
      /* Existing intake recovery owns any lost acknowledgment. */
    }
    return projectFailure(requestId, 'UNAVAILABLE')
  },
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
