import { ipcMain, type WebContents } from 'electron'
import { isTrustedSender } from './ipc'
import { isInfoRequest } from '../shared/schemas'
import { isId } from '../domain/editor/schema'
import { DIRTY_CHANGED, PROJECT_CHANNELS, exact, record, isCreateInput, isOpenInput, isCommitInput, projectFailure, type ProjectCommand } from '../shared/projects'
import type { WorkingLocation } from './paths/working-root'
import type { StorageWorker } from './storage-worker'

export function registerProjectIpc(owner: () => WebContents | undefined, location: WorkingLocation, storage: StorageWorker, dirty: (value: boolean) => void, devOrigin?: string): void {
  const access = (event: Electron.IpcMainInvokeEvent, payload: unknown): boolean => isTrustedSender(event, owner(), devOrigin) && record(payload) && isId(payload.requestId)
  ipcMain.on(DIRTY_CHANGED, (event, payload: unknown) => {
    if (isTrustedSender(event, owner(), devOrigin) && typeof payload === 'boolean') dirty(payload)
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
      if (kind === 'list' && isInfoRequest(value)) command = { kind: 'list' }
      else if (exact(value, ['requestId', 'input']) && kind === 'create' && isCreateInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'open' && isOpenInput(value.input)) command = { kind, input: value.input }
      else if (exact(value, ['requestId', 'input']) && kind === 'commit' && isCommitInput(value.input)) command = { kind, input: value.input }
      else return projectFailure(requestId, 'VALIDATION')
      return storage.request(requestId, command)
    })
  }
}
