import { ipcMain, type WebContents } from 'electron'
import { isId } from '../../domain/editor/schema'
import { projectError } from '../../domain/projects/errors'
import {
  PROOFREADING_CHANNEL,
  PROOFREADING_CHANGED,
  isProofreadRequest,
  isProofreadingEvent,
  type ProofreadValue
} from '../../shared/proofreading'
import { exact, record, projectFailure, type ProjectResult } from '../../shared/projects'
import { isTrustedSender } from '../ipc'
import { trustedDocument } from '../security'
import type { ProofreadingService } from './service'

export function registerProofreadingIpc(
  owner: () => WebContents | undefined,
  service: ProofreadingService,
  devOrigin?: string
): void {
  ipcMain.handle(
    PROOFREADING_CHANNEL,
    async (event, payload: unknown): Promise<ProjectResult<ProofreadValue>> => {
      if (
        !isTrustedSender(event, owner(), devOrigin) ||
        !record(payload) ||
        !exact(payload, ['requestId', 'input']) ||
        !isId(payload.requestId) ||
        !isProofreadRequest(payload.input)
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
      isProofreadingEvent(value)
    )
      target.send(PROOFREADING_CHANGED, value)
  })
}
