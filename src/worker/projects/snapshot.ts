import Database from 'better-sqlite3'
import { dirname, join } from 'node:path'
import { rename, lstat, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isId } from '../../domain/editor/schema'
import { backupStorageDatabase } from '../storage/driver'
import { contained, syncDirectory, syncFile, writeJson } from '../storage/files'
import { readPortableGraph, includesHeads, type PortableGraph } from './portable-db'
import { requireSpace, fileHash, type Progress } from './streams'
import { LIMITS, SnapshotError, cancelled, type SnapshotManifest } from './manifest'
import { bundledCitationFiles } from './citation-assets'
import { leasedBlobFiles } from './blobs'
import { writeArchive, extractArchive, type ArchiveFile } from './archive'

export type CaptureSource = { db: Database.Database; root: string; workspace: string; projectId: string; nativeBinding?: string }
export type Capture = { database: string; graph: PortableGraph }

/** Caller holds mutation/GC boundary and a persisted provisional lease until exact pins are durable. */
export async function captureDatabase(source: CaptureSource, target: string, minimumHeads: string[], signal?: AbortSignal, progress?: Progress): Promise<Capture> {
  cancelled(signal)
  const head = (source.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(source.projectId) as { head_commit_id: string } | undefined)?.head_commit_id
  if (!head || minimumHeads.some(minimum => !isId(minimum)) || !includesHeads(source.db, source.projectId, head, minimumHeads)) throw new SnapshotError('STALE_REVISION')
  const pages = Number(source.db.pragma('page_count', { simple: true })) * Number(source.db.pragma('page_size', { simple: true }))
  if (!Number.isSafeInteger(pages) || pages > LIMITS.database) throw new SnapshotError('LIMIT_EXCEEDED')
  await requireSpace(source.workspace, pages * 2)
  await backupStorageDatabase(source.db, target, source.nativeBinding, { signal, progress })
  cancelled(signal)
  // The closed copy must be independently readable without a live WAL. Never touch source pragmas.
  const copy = new Database(target, { nativeBinding: source.nativeBinding, fileMustExist: true })
  let graph: PortableGraph
  try {
    copy.pragma('trusted_schema=OFF')
    if (copy.pragma('journal_mode=DELETE', { simple: true }) !== 'delete') throw new SnapshotError('UNAVAILABLE')
    graph = readPortableGraph(copy)
    if (graph.projectId !== source.projectId || !includesHeads(copy, graph.projectId, graph.headCommitId, minimumHeads)) throw new SnapshotError('STALE_REVISION')
  } finally { copy.close() }
  await syncFile(target); await syncDirectory(dirname(target))
  return { database: target, graph }
}

/** Streaming phase runs outside capture boundary; exact blob leases survive until completion. */
export async function buildSnapshot(source: CaptureSource, capture: Capture, jobFolder: string, resources: string, parentSnapshotId: string | null, signal?: AbortSignal, progress?: Progress): Promise<SnapshotManifest> {
  const citations = await bundledCitationFiles(resources, signal)
  const files: ArchiveFile[] = [
    { name: 'project.sqlite', path: capture.database, ref: await fileHash(capture.database, LIMITS.database, signal) },
    ...await leasedBlobFiles(source.root, source.workspace, capture.graph.blobs, signal),
    ...citations.map(asset => ({ name: `citation-assets/${asset.ref.sha256}`, ...asset }))
  ]
  const manifest: SnapshotManifest = {
    format: 'collie', formatVersion: 1, minimumReader: 1, schemaVersion: 2, editorVersion: 1,
    projectId: capture.graph.projectId, snapshotId: randomUUID(), parentSnapshotId,
    headCommitId: capture.graph.headCommitId, createdAt: new Date().toISOString(),
    database: files[0].ref, blobs: capture.graph.blobs,
    citationAssets: citations.map(asset => asset.ref)
  }
  const bytes = files.reduce((n,f) => n + f.ref.bytes, 0)
  // Candidate + validation extraction coexist with the captured database and previous candidates.
  await requireSpace(jobFolder, bytes * 2 + files.length * 512 + LIMITS.manifest)
  const temporary = join(jobFolder, 'candidate.partial')
  await writeArchive(temporary, manifest, files, signal, progress)
  const inspected = await extractArchive(temporary, join(jobFolder, 'inspection'), source.nativeBinding, signal, progress)
  if (inspected.snapshotId !== manifest.snapshotId || inspected.headCommitId !== capture.graph.headCommitId) throw new SnapshotError('INVALID_ARCHIVE')
  cancelled(signal)
  await rename(temporary, join(jobFolder, 'candidate.collie'))
  await syncDirectory(jobFolder)
  return manifest
}

/** Stage 6 supplies a native grant path. Archive is never edited; collisions preserve both copies. */
export async function openSnapshot(root: string, source: string, stagingParent: string, nativeBinding?: string, signal?: AbortSignal, progress?: Progress): Promise<{ manifest: SnapshotManifest; workspaceId: string }> {
  await contained(root, stagingParent, true)
  const staging = join(stagingParent, randomUUID())
  const manifest = await extractArchive(source, staging, nativeBinding, signal, progress)
  const workspaceId = randomUUID(), project = join(root, 'workspaces', manifest.projectId)
  // A same-ID project must go through Stage 6 conflict handling, never replace or shadow recovery.
  try { await lstat(project); throw new SnapshotError('OPERATION_CONFLICT') }
  catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error }
  cancelled(signal)
  await rename(join(staging, 'project.sqlite'), join(staging, 'working.sqlite'))
  await writeJson(join(staging, 'origin.json'), { snapshotId: manifest.snapshotId, headCommitId: manifest.headCommitId, parentSnapshotId: manifest.parentSnapshotId })
  await contained(root, join(root, 'workspaces'), true)
  try { await mkdir(project, { mode: 0o700 }) } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') throw new SnapshotError('OPERATION_CONFLICT')
    throw error
  }
  // Only app-generated IDs are used for the final location, never archive entry text.
  await rename(staging, join(project, workspaceId))
  await syncDirectory(project); await syncDirectory(join(root, 'workspaces'))
  return { manifest, workspaceId }
}
