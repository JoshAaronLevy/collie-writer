import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { GET_INFO, type AppInfo, type Result } from '../shared/commands'
import { isAppInfo, isInfoRequest } from '../shared/schemas'
import { trustedDocument } from './security'

export function isTrustedSender(
  event: IpcMainInvokeEvent,
  owner: WebContents | undefined,
  devOrigin?: string
): boolean {
  return (
    !!owner &&
    !owner.isDestroyed() &&
    event.sender === owner &&
    event.senderFrame !== null &&
    event.senderFrame === owner.mainFrame &&
    trustedDocument(event.senderFrame.url, devOrigin)
  )
}
export function registerAppIpc(
  owner: () => WebContents | undefined,
  info: () => AppInfo,
  devOrigin?: string
): void {
  ipcMain.handle(GET_INFO, (event, payload: unknown): Result<AppInfo> => {
    if (!isTrustedSender(event, owner(), devOrigin)) {
      return {
        ok: false,
        requestId: '',
        error: { code: 'DENIED', message: 'This window cannot use that command.', retryable: false }
      }
    }
    if (!isInfoRequest(payload)) {
      return {
        ok: false,
        requestId: '',
        error: {
          code: 'VALIDATION',
          message: 'Invalid application information request.',
          retryable: false
        }
      }
    }
    const value = info()
    if (!isAppInfo(value)) {
      return {
        ok: false,
        requestId: payload.requestId,
        error: {
          code: 'UNAVAILABLE',
          message: 'Application information is unavailable.',
          retryable: false
        }
      }
    }
    return { ok: true, requestId: payload.requestId, value }
  })
}
