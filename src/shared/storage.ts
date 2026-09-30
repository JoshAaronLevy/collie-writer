export type StorageRuntime = {
  sqliteVersion: string
  nodeVersion: string
  napiVersion: string
  platform: string
  architecture: string
}

export type StorageStatus =
  | { state: 'starting' | 'unavailable'; sequence: number }
  | { state: 'ready'; sequence: number; runtime: StorageRuntime }

export type StorageWorkerMessage =
  | { kind: 'ready'; runtime: StorageRuntime }
  | { kind: 'unavailable' }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, names: string[]): boolean {
  return Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name))
}

export function isStorageRuntime(value: unknown): value is StorageRuntime {
  if (
    !record(value) ||
    !exactKeys(value, ['sqliteVersion', 'nodeVersion', 'napiVersion', 'platform', 'architecture'])
  )
    return false
  return (
    typeof value.sqliteVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(value.sqliteVersion) &&
    value.sqliteVersion.length <= 20 &&
    typeof value.nodeVersion === 'string' &&
    /^\d+\.\d+\.\d+$/.test(value.nodeVersion) &&
    value.nodeVersion.length <= 20 &&
    typeof value.napiVersion === 'string' &&
    /^\d{1,2}$/.test(value.napiVersion) &&
    Number(value.napiVersion) >= 10 &&
    (value.platform === 'darwin' || value.platform === 'win32') &&
    (value.architecture === 'arm64' || value.architecture === 'x64')
  )
}

export function isStorageStatus(value: unknown): value is StorageStatus {
  if (
    !record(value) ||
    typeof value.sequence !== 'number' ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0
  )
    return false
  if (value.state === 'ready')
    return exactKeys(value, ['state', 'sequence', 'runtime']) && isStorageRuntime(value.runtime)
  return (
    (value.state === 'starting' || value.state === 'unavailable') &&
    exactKeys(value, ['state', 'sequence'])
  )
}

export function isStorageWorkerMessage(value: unknown): value is StorageWorkerMessage {
  if (!record(value)) return false
  if (value.kind === 'ready')
    return exactKeys(value, ['kind', 'runtime']) && isStorageRuntime(value.runtime)
  return value.kind === 'unavailable' && exactKeys(value, ['kind'])
}
