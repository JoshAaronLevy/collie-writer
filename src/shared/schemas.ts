import type { AppInfo, InfoRequest, Result } from './commands'
import { isStorageStatus, type StorageStatus } from './storage'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return (
    Object.keys(value).length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  )
}
export function isInfoRequest(value: unknown): value is InfoRequest {
  return (
    record(value) &&
    keys(value, ['requestId']) &&
    typeof value.requestId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.requestId)
  )
}
export function isAppInfo(value: unknown): value is AppInfo {
  return (
    record(value) &&
    keys(value, ['name', 'version', 'channel', 'platform']) &&
    value.name === 'Collie Writer' &&
    ['development', 'beta', 'production'].includes(String(value.channel)) &&
    typeof value.version === 'string' &&
    /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(value.version) &&
    value.version.length <= 64 &&
    ['darwin', 'win32', 'linux'].includes(String(value.platform))
  )
}
export function isInfoResult(value: unknown, requestId: string): value is Result<AppInfo> {
  if (!record(value) || value.requestId !== requestId) return false
  if (value.ok === true) return keys(value, ['ok', 'requestId', 'value']) && isAppInfo(value.value)
  if (value.ok !== false || !keys(value, ['ok', 'requestId', 'error']) || !record(value.error))
    return false
  const error = value.error
  return (
    keys(error, ['code', 'message', 'retryable']) &&
    ['VALIDATION', 'DENIED', 'UNAVAILABLE'].includes(String(error.code)) &&
    typeof error.message === 'string' &&
    error.message.length <= 160 &&
    typeof error.retryable === 'boolean'
  )
}

export function isStorageResult(value: unknown, requestId: string): value is Result<StorageStatus> {
  if (!record(value) || value.requestId !== requestId) return false
  if (value.ok === true)
    return keys(value, ['ok', 'requestId', 'value']) && isStorageStatus(value.value)
  if (value.ok !== false || !keys(value, ['ok', 'requestId', 'error']) || !record(value.error))
    return false
  const error = value.error
  return (
    keys(error, ['code', 'message', 'retryable']) &&
    ['VALIDATION', 'DENIED', 'UNAVAILABLE'].includes(String(error.code)) &&
    typeof error.message === 'string' &&
    error.message.length <= 160 &&
    typeof error.retryable === 'boolean'
  )
}
