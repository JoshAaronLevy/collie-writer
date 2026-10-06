import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../storage/digest'
import { boundedBytes, namedStamp, inspectRetentionPayload, sameStamp } from './retention-files'

/** Only after exact schema/content validation. Physical layout and journal headers are immaterial. */
export function portableContentDigest(db: Database.Database): string {
  const tables = db
    .prepare(
      "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all() as { name: string; sql: string }[]
  const hash = createHash('sha256')
  let count = 0,
    bytes = 0
  for (const table of tables) {
    if (!/^[a-z_]+$/.test(table.name)) throw new ProjectError('CORRUPT_PROJECT')
    const rows: string[] = []
    for (const row of db.prepare(`SELECT * FROM "${table.name}"`).iterate()) {
      if (++count > 200000 || (bytes += Buffer.byteLength(JSON.stringify(row))) > 128 * 1024 ** 2)
        throw new ProjectError('LIMIT_EXCEEDED')
      rows.push(requestDigest(row))
    }
    hash.update(requestDigest([table.name, table.sql, rows.sort()]))
  }
  return hash.digest('hex')
}

/** Caller holds the inactive project's exclusive owner lock. Never opens the disk DB in SQLite. */
export async function retentionDatabase(
  path: string,
  nativeBinding?: string
): Promise<Database.Database> {
  for (const suffix of ['-wal', '-shm', '-journal'])
    if (namedStamp(path + suffix)) throw new ProjectError('JOB_INTERRUPTED')
  const proof = await inspectRetentionPayload(path, 32 * 1024 ** 2)
  const bytes = boundedBytes(path, 32 * 1024 ** 2)
  if (
    createHash('sha256').update(bytes).digest('hex') !== proof.sha256 ||
    !sameStamp(proof.identity, namedStamp(path)) ||
    bytes.toString('ascii', 0, 16) !== 'SQLite format 3\0' ||
    ![1, 2].includes(bytes[18]) ||
    ![1, 2].includes(bytes[19])
  )
    throw new ProjectError('CORRUPT_PROJECT')
  // A closed, WAL-free image is complete. Deserialize the private memory copy in rollback mode;
  // source bytes and journal settings remain untouched. SQLite cannot read a WAL-mode memory image.
  bytes[18] = bytes[19] = 1
  const db = new Database(bytes, { readonly: true, ...(nativeBinding ? { nativeBinding } : {}) })
  try {
    db.pragma('trusted_schema=OFF')
    if (db.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new ProjectError('CORRUPT_PROJECT')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
