import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import {
  HELP_ACTION,
  GET_INFO,
  GET_STORAGE_STATUS,
  type AppInfo,
  type Result
} from '../shared/commands'
import { exact, record, projectFailure, type ProjectResult } from '../shared/projects'
import { isId } from '../domain/editor/schema'
import { showLicenses } from './menus'
import type { DirectUpdater } from './updates/direct'
import type { StorageStatus } from '../shared/storage'
import { isAppInfo, isInfoRequest } from '../shared/schemas'
import { trustedDocument } from './security'

export function isTrustedSender(
  event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
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

export function registerStorageIpc(
  owner: () => WebContents | undefined,
  storageStatus: () => StorageStatus,
  devOrigin?: string
): void {
  ipcMain.handle(GET_STORAGE_STATUS, (event, payload: unknown): Result<StorageStatus> => {
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
        error: { code: 'VALIDATION', message: 'Invalid storage status request.', retryable: false }
      }
    }
    return {
      ok: true,
      requestId: payload.requestId,
      value: storageStatus()
    }
  })
}

/** Fixed, trusted menu actions only; no renderer URL, path, feed or restart primitive. */
export function registerHelpIpc(
  owner: () => WebContents | undefined,
  updater: DirectUpdater,
  devOrigin?: string
): void {
  let active = false
  ipcMain.handle(HELP_ACTION, async (event, payload: unknown): Promise<ProjectResult<boolean>> => {
    if (!isTrustedSender(event, owner(), devOrigin)) return projectFailure('', 'DENIED')
    if (
      !record(payload) ||
      !exact(payload, ['requestId', 'input']) ||
      !isId(payload.requestId) ||
      typeof payload.input !== 'string' ||
      !['licenses', 'check-updates', 'install-update'].includes(payload.input)
    )
      return projectFailure('', 'VALIDATION')
    if (active) return projectFailure(payload.requestId, 'UNAVAILABLE')
    active = true
    try {
      if (payload.input === 'licenses') await showLicenses()
      else if (payload.input === 'check-updates') await updater.check()
      else await updater.install()
      return { ok: true, requestId: payload.requestId, value: true }
    } catch {
      return projectFailure(payload.requestId, 'UNAVAILABLE')
    } finally {
      active = false
    }
  })
}
