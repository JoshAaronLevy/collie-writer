import { join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from '../../shared/projects'
import { isRetentionView, type RetentionView } from '../../shared/retained-versions'
import { isHash } from './manifest'
import { boundedJson, namedStamp, isRetentionStamp, type RetentionStamp } from './retention-files'
export type RetentionProof = {
  path: string
  identity: RetentionStamp
  parent: string
  sha256: string
  projectId: string
  snapshotId: string
  head: string
  createdAt: string
}
export type RetentionReceipt = {
  version: 1
  view: RetentionView
  selected: string
  context: string
  target: RetentionProof
  replacement: RetentionProof
  current: RetentionProof
}
export function isRetentionProof(v: unknown): v is RetentionProof {
  return (
    record(v) &&
    exact(v, [
      'path',
      'identity',
      'parent',
      'sha256',
      'projectId',
      'snapshotId',
      'head',
      'createdAt'
    ]) &&
    typeof v.path === 'string' &&
    v.path.length <= 4096 &&
    isRetentionStamp(v.identity) &&
    isHash(v.parent) &&
    isHash(v.sha256) &&
    [v.projectId, v.snapshotId, v.head].every(isId) &&
    typeof v.createdAt === 'string' &&
    Number.isFinite(Date.parse(v.createdAt))
  )
}
export function readRetentionReceipt(root: string, id: string): RetentionReceipt | null {
  if (!isId(id)) throw new Error('Invalid retention identity')
  const folder = join(root, 'retention-actions'),
    path = join(folder, `${id}.json`)
  // The directory must itself be safe, but an absent new receipt folder is normal.
  try {
    if (!namedStamp(path)) return null
  } catch (error) {
    if (record(error) && error.code === 'ENOENT') return null
    throw error
  }
  const v = boundedJson(path, 128 * 1024)
  if (
    !record(v) ||
    !exact(v, ['version', 'view', 'selected', 'context', 'target', 'replacement', 'current']) ||
    v.version !== 1 ||
    !isRetentionView(v.view) ||
    v.view.id !== id ||
    !['complete', 'interrupted'].includes(v.view.phase) ||
    !isId(v.selected) ||
    !isHash(v.context) ||
    !isRetentionProof(v.target) ||
    !isRetentionProof(v.replacement) ||
    !isRetentionProof(v.current) ||
    v.view.files.length !== 1 ||
    v.view.files[0].id !== v.selected ||
    v.view.files[0].path !== v.target.path
  )
    throw new Error('Invalid retention receipt')
  return v as RetentionReceipt
}
export function receiptView(root: string, scope: OpenInput, id: string): RetentionView {
  const receipt = readRetentionReceipt(root, id)
  if (!receipt)
    return {
      id,
      scope,
      reviewId: null,
      head: null,
      at: new Date().toISOString(),
      phase: 'not-started',
      limited: false,
      offset: 0,
      hasOlder: false,
      message:
        'No durable removal receipt was found. No removal can be confirmed; review remaining files again.',
      files: []
    }
  if (
    !isOpenInput(scope) ||
    receipt.view.scope.projectId !== scope.projectId ||
    receipt.view.scope.workspaceId !== scope.workspaceId
  )
    throw new Error('Wrong retention scope')
  return {
    ...receipt.view,
    files: receipt.view.files.map((f) =>
      f.state === 'eligible'
        ? {
            ...f,
            state: 'unknown',
            reason: 'Interrupted outcome. This receipt never repeats deletion.'
          }
        : f
    )
  }
}
/** Reporting only. Never grants deletion. Reappearing files are always shown again. */
export function intentionallyRemovedPrevious(root: string, id: string, path: string): boolean {
  try {
    if (namedStamp(path)) return false
    const markerPath = join(root, 'file-operations', id, 'previous-removal-v1.json')
    if (!namedStamp(markerPath)) return false
    const marker = boundedJson(markerPath, 1024)
    if (
      !record(marker) ||
      !exact(marker, ['version', 'actionId']) ||
      marker.version !== 1 ||
      !isId(marker.actionId)
    )
      return false
    const receipt = readRetentionReceipt(root, marker.actionId)
    return (
      !!receipt &&
      receipt.selected === id &&
      receipt.target.path === path &&
      receipt.view.phase === 'complete' &&
      receipt.view.files[0].state === 'removed'
    )
  } catch {
    return false
  }
}

/** A removed/reappearing or unresolved artifact never silently becomes eligible again. */
export function previousRemovalState(
  root: string,
  id: string,
  path: string
): 'none' | 'removed' | 'retryable' | 'unresolved' {
  try {
    const markerPath = join(root, 'file-operations', id, 'previous-removal-v1.json')
    if (!namedStamp(markerPath)) return 'none'
    const marker = boundedJson(markerPath, 1024)
    if (
      !record(marker) ||
      !exact(marker, ['version', 'actionId']) ||
      marker.version !== 1 ||
      !isId(marker.actionId)
    )
      return 'unresolved'
    const receipt = readRetentionReceipt(root, marker.actionId)
    if (
      !receipt ||
      receipt.selected !== id ||
      receipt.target.path !== path ||
      receipt.view.phase !== 'complete'
    )
      return 'unresolved'
    const state = receipt.view.files[0].state
    return state === 'removed'
      ? 'removed'
      : state === 'changed' || state === 'protected'
        ? 'retryable'
        : 'unresolved'
  } catch {
    return 'unresolved'
  }
}
