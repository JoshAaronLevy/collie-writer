import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { backupStorageDatabase, inWriteTransaction, openStorageDatabase } from './driver'
import { PROJECT_SCHEMA_VERSION, assetTable, inspectVersion, validateProjectSchema } from './schema'
import { contained, directory, syncFile, syncDirectory, writeJson } from './files'
import { ProjectError } from '../../domain/projects/errors'

type Migration = { from: number; to: number; validateSource: (db: Database.Database) => void; apply: (db: Database.Database) => void }
// Stage 4 schema 1 is retained untouched; only its verified candidate receives the asset inventory.
const migrations: readonly Migration[] = [{
  from: 1, to: 2,
  validateSource: db => validateProjectSchema(db, 1),
  apply: db => { db.exec(assetTable); db.prepare('UPDATE format SET schema_version=2,minimum_reader=2').run() }
}]

export async function activeDatabase(root: string, workspace: string): Promise<string> {
  let file = 'working.sqlite'
  try {
    const pointer = join(workspace, 'active.json')
    await contained(root, pointer, false)
    const value: unknown = JSON.parse(await readFile(pointer, 'utf8'))
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 || !('file' in value) || typeof value.file !== 'string' || !/^working(?:-v\d+-[a-f0-9-]{36})?\.sqlite$/.test(value.file)) throw new ProjectError('CORRUPT_PROJECT')
    file = value.file
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
  }
  const path = join(workspace, file)
  await contained(root, path, false)
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await contained(root, path + suffix, false).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
  return path
}

/** Caller holds the project owner lock throughout. Switch a pointer, never replace the original DB. */
export async function openProjectDatabase(root: string, workspace: string, nativeBinding?: string): Promise<Database.Database> {
  let path = await activeDatabase(root, workspace)
  const source = new Database(path, { nativeBinding, readonly: true, fileMustExist: true, timeout: 5000 })
  try {
    let version = inspectVersion(source)
    if (version === PROJECT_SCHEMA_VERSION) validateProjectSchema(source)
    else {
      const first = migrations.find(step => step.from === version)
      if (!first) throw new ProjectError('MIGRATION_FAILED')
      first.validateSource(source)
      const retained = join(workspace, 'migrations')
      await directory(root, retained)
      const original = join(retained, `before-v${version}-${randomUUID()}.sqlite`)
      await backupStorageDatabase(source, original, nativeBinding)
      await syncFile(original)
      await syncDirectory(retained)
      const candidateName = `working-v${PROJECT_SCHEMA_VERSION}-${randomUUID()}.sqlite`
      const candidatePath = join(workspace, candidateName)
      await backupStorageDatabase(source, candidatePath, nativeBinding)
      const candidate = openStorageDatabase(candidatePath, nativeBinding)
      try {
        inWriteTransaction(candidate, () => {
          while (version < PROJECT_SCHEMA_VERSION) {
            const step = migrations.find(m => m.from === version)
            if (!step || step.to <= version) throw new ProjectError('MIGRATION_FAILED')
            step.validateSource(candidate)
            step.apply(candidate)
            version = step.to
            candidate.pragma(`user_version = ${version}`)
          }
        })
        validateProjectSchema(candidate)
        candidate.pragma('wal_checkpoint(TRUNCATE)')
      } finally { candidate.close() }
      // Backups and candidate remain on any failure. Publication follows verified copy completion.
      await syncFile(candidatePath)
      await syncDirectory(workspace)
      await writeJson(join(workspace, 'active.json'), { file: candidateName })
      path = candidatePath
    }
  } finally { source.close() }
  const db = openStorageDatabase(path, nativeBinding)
  try { validateProjectSchema(db); return db } catch (error) { db.close(); throw error }
}
