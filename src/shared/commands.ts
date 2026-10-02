import type { StorageStatus } from './storage'
import type { ProjectResult } from './projects'
import type { ProjectAPI } from './projects'
import type { LifecycleAPI } from './project-lifecycle'
import type { FileAPI } from './project-files'
import type { AccessAPI } from './access'
import type { SupportAPI } from './support'
import type { DirectAPI } from './direct-access'

export const HELP_ACTION = 'app.helpAction'
export type HelpAction = 'licenses' | 'check-updates' | 'install-update'
export const GET_INFO = 'app.getInfo'
export const GET_STORAGE_STATUS = 'storage.getStatus'
export const STORAGE_STATUS_CHANGED = 'storage.statusChanged'
export const EDITOR_ACTION = 'editor.action'
export type AppInfo = {
  name: 'Collie Writer'
  version: string
  channel: 'development' | 'beta' | 'production'
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
export type CollieAPI = ProjectAPI & FileAPI & LifecycleAPI & AccessAPI & SupportAPI & DirectAPI & {
  helpAction: (action: HelpAction) => Promise<ProjectResult<boolean>>
  onEditorAction: (callback: (action: 'undo' | 'redo' | 'find' | 'paste-plain') => void) => () => void
  getInfo: () => Promise<Result<AppInfo>>
  getStorageStatus: () => Promise<Result<StorageStatus>>
  onStorageStatus: (callback: (status: StorageStatus) => void) => () => void
}
