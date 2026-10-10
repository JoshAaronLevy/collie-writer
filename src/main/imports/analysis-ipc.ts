import { ipcMain, type WebContents } from 'electron'
import { isId } from '../../domain/editor/schema'
import { projectError } from '../../domain/projects/errors'
import {
  IMPORT_ANALYSIS_CHANNEL,
  IMPORT_ANALYSIS_CHANGED,
  isAnalysisRequest,
  isImportAnalysisEvent,
  type AnalysisValue
} from '../../shared/import-analysis'
import { exact, record, projectFailure, type ProjectResult } from '../../shared/projects'
import { isTrustedSender } from '../ipc'
import { trustedDocument } from '../security'
import type { ImportAnalysisService } from './analysis-service'

export function registerImportAnalysisIpc(
  owner: () => WebContents | undefined,
  service: ImportAnalysisService,
  devOrigin?: string
): void {
  ipcMain.handle(
    IMPORT_ANALYSIS_CHANNEL,
    async (event, payload: unknown): Promise<ProjectResult<AnalysisValue>> => {
      if (
        !isTrustedSender(event, owner(), devOrigin) ||
        !record(payload) ||
        !exact(payload, ['requestId', 'input']) ||
        !isId(payload.requestId) ||
        !isAnalysisRequest(payload.input)
      )
        return projectFailure('', 'VALIDATION')
      const { requestId, input } = payload
      try {
        const value = await service.command(input)
        if (!isTrustedSender(event, owner(), devOrigin))
          return projectFailure(requestId, 'UNAVAILABLE')
        return { ok: true, requestId, value }
      } catch (error) {
        return projectFailure(requestId, projectError(error))
      }
    }
  )
  service.subscribe((value) => {
    const target = owner()
    if (
      target &&
      !target.isDestroyed() &&
      trustedDocument(target.getURL(), devOrigin) &&
      isImportAnalysisEvent(value)
    )
      target.send(IMPORT_ANALYSIS_CHANGED, value)
  })
}
