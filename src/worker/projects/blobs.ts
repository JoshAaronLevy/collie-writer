import { createReadStream, constants } from 'node:fs'
import { lstat, link, unlink, open } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { contained, syncDirectory } from '../storage/files'
import { fileHash, requireSpace, transfer, type Progress } from './streams'
import { LIMITS, SnapshotError, type BlobRef } from './manifest'

/** Ingest is a trusted-worker primitive; callers must hold the same mutation/capture boundary. */
export async function stageBlob(
  root: string,
  workspace: string,
  source: string,
  signal?: AbortSignal,
  progress?: Progress,
  maximum = LIMITS.blob
): Promise<BlobRef> {
  await contained(root, workspace, true)
  const folder = join(workspace, 'blobs')
  await contained(root, folder, true)
  const info = await lstat(source)
  if (
    !Number.isSafeInteger(maximum) ||
    maximum < 0 ||
    maximum > LIMITS.blob ||
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > maximum
  )
    throw new SnapshotError('LIMIT_EXCEEDED')
  await requireSpace(folder, info.size)
  const temporary = join(folder, `.incoming-${randomUUID()}`)
  const sourceHandle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const opened = await sourceHandle.stat()
    if (
      !opened.isFile() ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino ||
      opened.size !== info.size
    )
      throw new SnapshotError('INVALID_ARCHIVE')
    const ref = await transfer(
      createReadStream(source, { fd: sourceHandle.fd, autoClose: false }),
      temporary,
      maximum,
      signal,
      progress
    )
    const after = await sourceHandle.stat()
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || ref.bytes !== opened.size)
      throw new SnapshotError('INVALID_ARCHIVE')
    const final = join(folder, ref.sha256)
    try {
      // Atomic no-replace publication. Unlinking the staging name leaves one immutable file link.
      await link(temporary, final)
      await unlink(temporary)
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
        throw error
      const existing = await fileHash(final, LIMITS.blob, signal)
      if (existing.sha256 !== ref.sha256 || existing.bytes !== ref.bytes)
        throw new SnapshotError('INVALID_ARCHIVE')
      await unlink(temporary)
    }
    await syncDirectory(folder)
    return ref
  } catch (error) {
    // A failed SQL command may leave an immutable orphan; never remove a previously published hash.
    await unlink(temporary).catch(() => {})
    throw error
  } finally {
    await sourceHandle.close()
  }
}
export async function leasedBlobFiles(
  root: string,
  workspace: string,
  refs: BlobRef[],
  signal?: AbortSignal
): Promise<{ name: string; path: string; ref: BlobRef }[]> {
  await contained(root, join(workspace, 'blobs'), true)
  const files: { name: string; path: string; ref: BlobRef }[] = []
  for (const ref of refs) {
    const path = join(workspace, 'blobs', ref.sha256)
    await contained(root, path, false)
    const actual = await fileHash(path, LIMITS.blob, signal)
    if (actual.sha256 !== ref.sha256 || actual.bytes !== ref.bytes)
      throw new SnapshotError('INVALID_ARCHIVE')
    files.push({ name: `blobs/${ref.sha256}`, path, ref })
  }
  return files
}
