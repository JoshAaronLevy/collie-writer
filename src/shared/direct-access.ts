import { exact, record, type ProjectResult } from './projects'

export const DIRECT_CHANNELS = {
  read: 'direct.read',
  begin: 'direct.begin',
  resume: 'direct.resume',
  claim: 'direct.claim',
  refresh: 'direct.refresh',
  manage: 'direct.manage',
  disconnect: 'direct.disconnect'
} as const
export type DirectAction = 'monthly' | 'lifetime' | 'restore'
export type DirectView = {
  configured: boolean
  checkoutEnabled: boolean
  connected: boolean
  secureStorage: boolean
  pending: DirectAction | null
  expiresAt: number | null
  hasSubscription: boolean
  message: string
}
export type DirectAPI = {
  readDirectAccess: () => Promise<ProjectResult<DirectView>>
  beginDirectAccess: (kind: DirectAction) => Promise<ProjectResult<DirectView>>
  resumeDirectAccess: () => Promise<ProjectResult<DirectView>>
  claimDirectAccess: () => Promise<ProjectResult<DirectView>>
  refreshDirectAccess: () => Promise<ProjectResult<DirectView>>
  manageDirectAccess: () => Promise<ProjectResult<DirectView>>
  disconnectDirectAccess: () => Promise<ProjectResult<DirectView>>
}
export function isDirectAction(value: unknown): value is DirectAction {
  return typeof value === 'string' && ['monthly', 'lifetime', 'restore'].includes(value)
}
export function isDirectView(value: unknown): value is DirectView {
  return (
    record(value) &&
    exact(value, [
      'configured',
      'checkoutEnabled',
      'connected',
      'secureStorage',
      'pending',
      'expiresAt',
      'hasSubscription',
      'message'
    ]) &&
    [
      value.configured,
      value.checkoutEnabled,
      value.connected,
      value.secureStorage,
      value.hasSubscription
    ].every((v) => typeof v === 'boolean') &&
    (value.pending === null || isDirectAction(value.pending)) &&
    (value.expiresAt === null ||
      (Number.isSafeInteger(value.expiresAt) && Number(value.expiresAt) > 0)) &&
    typeof value.message === 'string' &&
    value.message.length <= 1000
  )
}
