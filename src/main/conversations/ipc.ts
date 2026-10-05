import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { isAbsolute } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError, projectError } from '../../domain/projects/errors'
import {
  CONVERSATION_CHANNEL,
  CONVERSATION_CHANGED,
  isConversationEvent,
  isConversationRequest,
  type ConversationValue
} from '../../shared/conversations'
import { exact, record, projectFailure, type ProjectResult } from '../../shared/projects'
import { isTrustedSender } from '../ipc'
import { trustedDocument } from '../security'
import type { ConversationService } from './service'

export function registerConversationIpc(
  owner: () => WebContents | undefined,
  service: ConversationService,
  devOrigin?: string
): void {
  ipcMain.handle(
    CONVERSATION_CHANNEL,
    async (event, payload: unknown): Promise<ProjectResult<ConversationValue>> => {
      if (
        !isTrustedSender(event, owner(), devOrigin) ||
        !record(payload) ||
        !exact(payload, ['requestId', 'input']) ||
        !isId(payload.requestId) ||
        !isConversationRequest(payload.input)
      )
        return projectFailure('', 'VALIDATION')
      const { requestId, input } = payload
      try {
        let value: ConversationValue
        if (input.action === 'export') {
          const current = await service.command({
            projectId: input.projectId,
            workspaceId: input.workspaceId,
            action: 'read',
            conversationId: input.conversationId,
            before: null
          })
          if (current.type !== 'page' || current.conversation.revisionId !== input.expectedRevision)
            throw new ProjectError('STALE_REVISION')
          const target = owner(),
            window = target ? BrowserWindow.fromWebContents(target) : null
          if (!window) throw new ProjectError('CANCELLED')
          const picked = await dialog.showSaveDialog(window, {
            title: 'Export conversation',
            defaultPath: 'Conversation.txt',
            filters: [{ name: 'Plain text transcript', extensions: ['txt'] }],
            properties: ['showOverwriteConfirmation']
          })
          if (picked.canceled || !picked.filePath) throw new ProjectError('CANCELLED')
          if (
            !isTrustedSender(event, owner(), devOrigin) ||
            !isAbsolute(picked.filePath) ||
            picked.filePath.length > 4096
          )
            throw new ProjectError('DENIED')
          // No-overwrite creation preserves a pre-existing file even if the native picker offers replacement.
          value = await service.worker({ ...input, destinationPath: picked.filePath })
        } else value = await service.command(input)
        if (!isTrustedSender(event, owner(), devOrigin)) throw new ProjectError('UNAVAILABLE')
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
      isConversationEvent(value)
    )
      target.send(CONVERSATION_CHANGED, value)
  })
}
