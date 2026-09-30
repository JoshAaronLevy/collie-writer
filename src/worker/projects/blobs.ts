import { createReadStream } from 'node:fs'
import { lstat, link, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { contained, syncDirectory } from '../storage/files'
import { fileHash, requireSpace, transfer } from './streams'
import { LIMITS, SnapshotError, type BlobRef } from './manifest'

/** Ingest is a trusted-worker primitive; callers must hold the same mutation/capture boundary. */
export async function stageBlob(root: string, workspace: string, source: string, signal?: AbortSignal): Promise<BlobRef> {
  await contained(root, workspace, true)
  const folder = join(workspace, 'blobs')
  await contained(root, folder, true)
  const info = await lstat(source)
  if (!info.isFile() || info.isSymbolicLink() || info.size > LIMITS.blob) throw new SnapshotError('LIMIT_EXCEEDED')
  await requireSpace(folder, info.size)
  const temporary = join(folder, `.incoming-${randomUUID()}`)
  try {
    const ref = await transfer(createReadStream(source), temporary, LIMITS.blob, signal)
    const final = join(folder, ref.sha256)
    try {
      // Atomic no-replace publication. Unlinking the staging name leaves one immutable file link.
      await link(temporary, final)
      await unlink(temporary)
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error
      const existing = await fileHash(final, LIMITS.blob, signal)
      if (existing.sha256 !== ref.sha256 || existing.bytes !== ref.bytes) throw new SnapshotError('INVALID_ARCHIVE')
      await unlink(temporary)
    }
    await syncDirectory(folder)
    return ref
  } catch (error) {
    // A failed SQL command may leave an immutable orphan; never remove a previously published hash.
    await unlink(temporary).catch(() => {})
    throw error
  }
}
export async function leasedBlobFiles(root: string, workspace: string, refs: BlobRef[], signal?: AbortSignal): Promise<{ name: string; path: string; ref: BlobRef }[]> {
  await contained(root, join(workspace, 'blobs'), true)
  const files: { name: string; path: string; ref: BlobRef }[] = []
  for (const ref of refs) {
    const path = join(workspace, 'blobs', ref.sha256)
    await contained(root, path, false)
    const actual = await fileHash(path, LIMITS.blob, signal)
    if (actual.sha256 !== ref.sha256 || actual.bytes !== ref.bytes) throw new SnapshotError('INVALID_ARCHIVE')
    files.push({ name: `blobs/${ref.sha256}`, path, ref })
  }
  return files
}
