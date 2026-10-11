import { randomUUID } from 'node:crypto'
import { lstat, rm, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ProjectError } from '../../domain/projects/errors'
import { extractArchive } from './archive'
import { observe, sameFileContents, selectedPath, type SavedLocation } from './file-state'
import { persistIntent, type SaveIntent } from './save-intent'
import { syncDirectory } from '../storage/files'

export function publicationPending(intent: SaveIntent): boolean {
  // These durable phases precede every publication. Keep their artifacts as history.
  return intent.phase === 'replacing' || intent.phase === 'replaced'
}

/** Only an exact acknowledged destination can settle a Save without reading its output. */
function acknowledgedIntent(intent: SaveIntent, destination: SavedLocation | null): boolean {
  return (
    !!destination &&
    destination.generationId === intent.id &&
    destination.path === intent.path &&
    destination.snapshotId === intent.snapshotId &&
    destination.headCommitId === intent.head &&
    destination.fingerprint.sha256 === intent.candidateHash
  )
}

/** Finish local acknowledgment only; never publish, retry capture, or replace a file. */
export async function reconcileFileIntent(
  root: string,
  folder: string,
  intent: SaveIntent,
  journal: 'save.json' | 'backup.json',
  destination: SavedLocation | null,
  acknowledge: (next: SavedLocation) => Promise<void>,
  nativeBinding?: string,
  signal?: AbortSignal
): Promise<void> {
  if (intent.phase === 'acknowledged' || !publicationPending(intent)) return
  if (journal === 'save.json' && acknowledgedIntent(intent, destination)) {
    await persistIntent(folder, { ...intent, phase: 'acknowledged' }, journal)
    intent.phase = 'acknowledged'
    return
  }
  if (journal === 'save.json' && destination?.generationId === intent.id)
    throw new ProjectError('JOB_INTERRUPTED')
  if (!intent.snapshotId || !intent.head || !intent.candidateHash)
    throw new ProjectError('JOB_INTERRUPTED')
  const path = await selectedPath(root, intent.path)
  if (path !== intent.path) throw new ProjectError('UNSAFE_DESTINATION')
  // A new-file publication may stop between link and unlink. Remove only its proven alias.
  const stage = join(dirname(path), `.collie-${intent.id}.staging`)
  if (intent.expected === null) {
    const optionalStat = async (
      name: string
    ): Promise<Awaited<ReturnType<typeof lstat>> | null> => {
      try {
        return await lstat(name)
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
          return null
        throw error
      }
    }
    const targetInfo = await optionalStat(path),
      stageInfo = await optionalStat(stage)
    if (
      targetInfo?.isFile() &&
      !targetInfo.isSymbolicLink() &&
      stageInfo?.isFile() &&
      !stageInfo.isSymbolicLink() &&
      targetInfo.nlink === 2 &&
      targetInfo.ino === stageInfo.ino &&
      targetInfo.dev === stageInfo.dev
    ) {
      await unlink(stage)
      await syncDirectory(dirname(path))
    }
  }
  const observed = await observe(path, signal)
  if (!observed) throw new ProjectError('DESTINATION_UNAVAILABLE')
  if (observed.sha256 !== intent.candidateHash) throw new ProjectError('EXTERNAL_CHANGE')
  const inspection = join(folder, `reconcile-${randomUUID()}`)
  const manifest = await extractArchive(path, inspection, nativeBinding, signal)
  if (
    manifest.projectId !== intent.scope.projectId ||
    manifest.snapshotId !== intent.snapshotId ||
    manifest.headCommitId !== intent.head ||
    !sameFileContents(observed, await observe(path, signal))
  )
    throw new ProjectError('EXTERNAL_CHANGE')
  // A newer chosen destination wins. Confirm this older output without changing that mapping.
  if (journal === 'save.json' && (destination?.generationId ?? null) === intent.priorGeneration)
    await acknowledge({
      path,
      snapshotId: intent.snapshotId,
      headCommitId: intent.head,
      generationId: intent.id,
      fingerprint: observed,
      grantId: intent.grantId
    })
  await persistIntent(folder, { ...intent, phase: 'acknowledged' }, journal)
  intent.phase = 'acknowledged'
  await rm(inspection, { recursive: true }).catch(() => {})
}
