import { ipcMain, type WebContents } from 'electron'
import { isTrustedSender } from './ipc'
import { isId } from '../domain/editor/schema'
import { exact, projectFailure, record } from '../shared/projects'
import {
  isInventoryCommand,
  STORAGE_INVENTORY,
  type InventoryAiOwner
} from '../shared/storage-inventory'
import type { StorageWorker } from './storage-worker'

export function registerStorageInventoryIpc(
  owner: () => WebContents | undefined,
  storage: StorageWorker,
  devOrigin?: string,
  aiOwners: () => InventoryAiOwner[] = () => []
): void {
  ipcMain.handle(STORAGE_INVENTORY, async (event, payload: unknown) => {
    if (
      !isTrustedSender(event, owner(), devOrigin) ||
      !record(payload) ||
      !exact(payload, ['requestId', 'input']) ||
      !isId(payload.requestId) ||
      !isInventoryCommand(payload.input)
    )
      return projectFailure('', 'DENIED')
    return storage.requestInventory(
      payload.requestId,
      payload.input,
      payload.input.kind === 'start' ? aiOwners() : []
    )
  })
}
