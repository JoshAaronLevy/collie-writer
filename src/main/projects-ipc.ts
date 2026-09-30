import { isRenameInput, isArchiveInput, isResetInput } from '../shared/project-lifecycle'
import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { isTrustedSender } from './ipc'
import { isInfoRequest } from '../shared/schemas'
import { isId } from '../domain/editor/schema'
import { DIRTY_CHANGED, PROJECT_CHANNELS, exact, record, isCreateInput, isOpenInput, isCommitInput, projectFailure, type ProjectCommand } from '../shared/projects'
import type { WorkingLocation } from './paths/working-root'
import type { StorageWorker } from './storage-worker'

export function registerProjectIpc(owner: () => WebContents | undefined, location: WorkingLocation, storage: StorageWorker, dirty: (value: boolean) => void, devOrigin?: string): void {
  let hasUnprotectedChanges = false
  let resetting = false
  const access = (event: Electron.IpcMainInvokeEvent, payload: unknown): boolean => isTrustedSender(event, owner(), devOrigin) && record(payload) && isId(payload.requestId)
  ipcMain.on(DIRTY_CHANGED, (event, payload: unknown) => {
    if (isTrustedSender(event, owner(), devOrigin) && typeof payload === 'boolean') { hasUnprotectedChanges = payload; dirty(payload) }
  })
  for (const [kind, channel] of Object.entries(PROJECT_CHANNELS)) {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!access(event, payload)) return projectFailure('', 'DENIED')
      const value = payload as Record<string, unknown>
      const requestId = value.requestId as string
      if (kind === 'location' || kind === 'chooseLocation') {
        if (!isInfoRequest(value)) return projectFailure(requestId, 'VALIDATION')
        if (kind === 'chooseLocation') {
          await location.choose()
          if (location.path()) storage.start(location.path()!)
        }
        return { ok: true, requestId, value: location.current() }
      }
      if (!location.path()) return projectFailure(requestId, 'STORAGE_LOCATION_REQUIRED')
      let command: ProjectCommand
      if ((kind === 'list' || kind === 'data' || kind === 'cleanup') && isInfoRequest(value)) command = { kind }
      else if (exact(value, ['requestId', 'input']) && kind === 'create' && isCreateInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'open' && isOpenInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'commit' && isCommitInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'rename' && isRenameInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'archive' && isArchiveInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'recoverReset' && isId(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId','input']) && kind === 'reset' && isResetInput(value.input)) {
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window || hasUnprotectedChanges || resetting) return projectFailure(requestId, 'DENIED')
        resetting = true
        try {
          const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Reset local work?', message: 'Remove the reviewed projects from the active list?', detail: 'Use Save or Backup for anything you need outside this computer before continuing. All reviewed local work will be retained in Reset recovery, with no automatic expiry. Chosen project and backup files will not be removed. Deleting app data or using an uninstaller that removes it can still destroy local recovery.', buttons: ['Cancel','Reset and retain recovery'], defaultId: 0, cancelId: 0, noLink: true })
          if (answer.response !== 1) return projectFailure(requestId, 'CANCELLED')
          if (hasUnprotectedChanges || !isTrustedSender(event, owner(), devOrigin)) return projectFailure(requestId, 'DENIED')
          return await storage.request(requestId, { kind, input: value.input })
        } finally { resetting = false }
      }
      else return projectFailure(requestId, 'VALIDATION')
      return storage.request(requestId, command)
    })
  }
}
