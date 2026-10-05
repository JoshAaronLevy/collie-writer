import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { extname, isAbsolute } from 'node:path'

const MINIMUM_SQLITE = [3, 51, 3] as const

function supportedSqlite(version: string): boolean {
  const parts = version.split('.').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0))
    return false
  for (let index = 0; index < MINIMUM_SQLITE.length; index += 1) {
    if (parts[index] > MINIMUM_SQLITE[index]) return true
    if (parts[index] < MINIMUM_SQLITE[index]) return false
  }
  return true
}

function options(nativeBinding?: string): Database.Options {
  return nativeBinding ? { nativeBinding, timeout: 5000 } : { timeout: 5000 }
}

/** A startup gate for the exact SQLite capabilities required by local project storage. */
export function storageRuntime(nativeBinding?: string): string {
  const database = new Database(':memory:', options(nativeBinding))
  try {
    const version = database.prepare('SELECT sqlite_version() AS version').get() as
      { version?: unknown } | undefined
    if (typeof version?.version !== 'string' || !supportedSqlite(version.version))
      throw new Error('Unsupported SQLite version')
    const fts5 = database
      .prepare("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS enabled")
      .get() as { enabled?: unknown } | undefined
    if (fts5?.enabled !== 1) throw new Error('SQLite FTS5 is unavailable')
    const napi = Number(process.versions.napi)
    if (!Number.isInteger(napi) || napi < 10) throw new Error('Node-API 10 is required')
    return version.version
  } finally {
    database.close()
  }
}

/** Only trusted worker services may pass a device-local database path here. */
export function openStorageDatabase(filename: string, nativeBinding?: string): Database.Database {
  if (!isAbsolute(filename) || extname(filename) !== '.sqlite')
    throw new Error('A trusted absolute SQLite path is required')
  const database = new Database(filename, options(nativeBinding))
  try {
    database.pragma('trusted_schema = OFF')
    database.pragma('foreign_keys = ON')
    const journal = database.pragma('journal_mode = WAL', { simple: true })
    if (journal !== 'wal') throw new Error('SQLite WAL is unavailable')
    database.pragma('synchronous = FULL')
    if (process.platform === 'darwin') database.pragma('fullfsync = ON')
    if (database.pragma('foreign_keys', { simple: true }) !== 1)
      throw new Error('SQLite foreign keys are unavailable')
    if (database.pragma('synchronous', { simple: true }) !== 2)
      throw new Error('SQLite full synchronization is unavailable')
    return database
  } catch (error) {
    database.close()
    throw error
  }
}

/** The single worker owns the writer; a rejected transaction cannot acknowledge a mutation. */
export function inWriteTransaction<T>(database: Database.Database, change: () => T): T {
  return database
    .transaction(() => {
      const result = change()
      if (
        result !== null &&
        typeof result === 'object' &&
        'then' in result &&
        typeof result.then === 'function'
      )
        throw new Error('Asynchronous work cannot run inside a SQLite transaction')
      return result
    })
    .immediate()
}

/** A consistent copy for later snapshot capture. Caller owns staging and retention. */
export async function backupStorageDatabase(
  database: Database.Database,
  destination: string,
  nativeBinding?: string,
  activity?: { signal?: AbortSignal; progress?: (bytes: number) => void }
): Promise<void> {
  if (!isAbsolute(destination) || extname(destination) !== '.sqlite' || existsSync(destination))
    throw new Error('A new absolute SQLite backup path is required')
  let copied = 0
  const pageSize = Number(database.pragma('page_size', { simple: true }))
  await database.backup(destination, {
    progress: ({ totalPages, remainingPages }) => {
      activity?.signal?.throwIfAborted()
      const next = (totalPages - remainingPages) * pageSize
      activity?.progress?.(Math.max(0, next - copied))
      copied = next
      return 256
    }
  })
  const copy = new Database(destination, {
    ...options(nativeBinding),
    readonly: true,
    fileMustExist: true
  })
  try {
    copy.pragma('trusted_schema = OFF')
    if (copy.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('SQLite backup integrity failed')
    const foreignKeys = copy.pragma('foreign_key_check')
    if (!Array.isArray(foreignKeys) || foreignKeys.length !== 0)
      throw new Error('SQLite backup foreign keys failed')
  } finally {
    copy.close()
  }
}
