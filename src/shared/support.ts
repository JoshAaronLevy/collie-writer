import { exact, isProjectCode, record, type ProjectCode, type ProjectResult } from './projects'

export const SUPPORT_CHANNELS = { preview: 'support.preview', zoom: 'support.zoom' } as const
export const ZOOM_LEVELS = [100, 125, 150, 200] as const
export type ZoomLevel = typeof ZOOM_LEVELS[number]
export type SupportPreview = {
  appVersion: string; electronVersion: string; nodeVersion: string; sqliteVersion: string | null
  platform: 'darwin' | 'win32' | 'linux'; architecture: 'arm64' | 'x64' | 'other'
  storage: 'starting' | 'ready' | 'unavailable'; uptimeSeconds: number; errorCodes: ProjectCode[]
}
export type SupportAPI = {
  readSupportPreview: () => Promise<ProjectResult<SupportPreview>>
  setUiZoom: (level: ZoomLevel) => Promise<ProjectResult<ZoomLevel>>
}
const version=(v:unknown):v is string=>typeof v==='string'&&/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(v)&&v.length<=40
export function isSupportPreview(v:unknown):v is SupportPreview {
  return record(v)&&exact(v,['appVersion','electronVersion','nodeVersion','sqliteVersion','platform','architecture','storage','uptimeSeconds','errorCodes'])&&
    version(v.appVersion)&&version(v.electronVersion)&&version(v.nodeVersion)&&(v.sqliteVersion===null||version(v.sqliteVersion))&&
    ['darwin','win32','linux'].includes(String(v.platform))&&['arm64','x64','other'].includes(String(v.architecture))&&
    ['starting','ready','unavailable'].includes(String(v.storage))&&Number.isSafeInteger(v.uptimeSeconds)&&Number(v.uptimeSeconds)>=0&&
    Array.isArray(v.errorCodes)&&v.errorCodes.length<=20&&v.errorCodes.every(isProjectCode)
}
export function isZoomLevel(v:unknown):v is ZoomLevel { return ZOOM_LEVELS.includes(v as ZoomLevel) }
