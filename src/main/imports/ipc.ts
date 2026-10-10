import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { isId } from '../../domain/editor/schema'
import { projectError } from '../../domain/projects/errors'
import { exact, record, projectFailure, type ProjectResult } from '../../shared/projects'
import {
  PROJECT_IMPORT_CHANNEL,
  isImportServiceRequest,
  type ImportValue
} from '../../shared/project-import'
import { isTrustedSender } from '../ipc'
import { importExtensions } from './selected-file'
import { ProjectError } from '../../domain/projects/errors'
import type { OpenInput } from '../../shared/projects'
import type { ImportService } from './service'

export function registerImportIpc(
  owner: () => WebContents | undefined,
  service: ImportService,
  authorize: (scope: OpenInput) => void,
  devOrigin?: string
): void {
  ipcMain.handle(
    PROJECT_IMPORT_CHANNEL,
    async (event, payload: unknown): Promise<ProjectResult<ImportValue>> => {
      if (!isTrustedSender(event, owner(), devOrigin)) return projectFailure('', 'DENIED')
      if (
        !record(payload) ||
        !exact(payload, ['requestId', 'input']) ||
        !isId(payload.requestId) ||
        !isImportServiceRequest(payload.input)
      )
        return projectFailure('', 'VALIDATION')
      try {
        const input = payload.input
        const window = BrowserWindow.fromWebContents(event.sender)
        const frame = event.senderFrame,
          processId = frame?.processId,
          routingId = frame?.routingId
        const guard = (): void => {
          if (
            !window ||
            window.isDestroyed() ||
            !isTrustedSender(event, owner(), devOrigin) ||
            !event.senderFrame ||
            event.senderFrame.processId !== processId ||
            event.senderFrame.routingId !== routingId
          )
            throw new ProjectError('DENIED')
          authorize(input)
        }
        const value =
          input.action === 'pick-files'
            ? await service.pickFiles(
                input,
                async () => {
                  guard()
                  const answer = await dialog.showOpenDialog(window!, {
                    title: 'Add chats, research or notes to this project',
                    filters: [
                      { name: 'Supported import files', extensions: importExtensions },
                      { name: 'All files', extensions: ['*'] }
                    ],
                    properties: ['openFile', 'multiSelections', 'dontAddToRecent']
                  })
                  guard()
                  return answer.canceled ? null : answer.filePaths
                },
                guard
              )
            : await service.command(input)
        if (!isTrustedSender(event, owner(), devOrigin))
          return projectFailure(payload.requestId, 'UNAVAILABLE')
        return { ok: true, requestId: payload.requestId, value }
      } catch (error) {
        return projectFailure(payload.requestId, projectError(error))
      }
    }
  )
}
