import type { StorageStatus } from './storage'

export const GET_INFO = 'app.getInfo'
export const GET_STORAGE_STATUS = 'storage.getStatus'
export const STORAGE_STATUS_CHANGED = 'storage.statusChanged'
export const APP_ID = 'com.colliewriter.app.dev'
export type AppInfo = {
  name: 'Collie Writer'
  version: string
  channel: 'development'
  platform: 'darwin' | 'win32' | 'linux'
}
export type InfoRequest = { requestId: string }
export type AppErrorCode = 'VALIDATION' | 'DENIED' | 'UNAVAILABLE'
export type Result<T> =
  | { ok: true; requestId: string; value: T }
  | {
      ok: false
      requestId: string
      error: { code: AppErrorCode; message: string; retryable: boolean }
    }
export type CollieAPI = {
  getInfo: () => Promise<Result<AppInfo>>
  getStorageStatus: () => Promise<Result<StorageStatus>>
  onStorageStatus: (callback: (status: StorageStatus) => void) => () => void
}
