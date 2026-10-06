import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { exact, record, type OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import { isRetentionView, type RetentionView } from '../../shared/retained-versions'
import { isHash } from './manifest'
import { boundedJson, namedStamp, isRetentionStamp, type PayloadProof } from './retention-files'
import { isRetentionProof, type RetentionProof } from './retention-receipts'

export const LOCAL_ARTIFACT_CLASSES = {
  candidate: 'Transferred snapshot candidate',
  capture: 'Completed snapshot capture',
  inspection: 'Completed snapshot inspection file',
  stage: 'Acknowledged Save/Backup staging inspection file',
  final: 'Acknowledged Save/Backup final inspection file'
} as const
export type LocalArtifact = {
  class: keyof typeof LOCAL_ARTIFACT_CLASSES
  operationId: string
  snapshotJob: string
  relativePath: string
}
export type LocalArtifactReceipt = {
  version: 2
  kind: 'local-artifact'
  view: RetentionView
  selected: string
  context: string
  artifact: LocalArtifact
  target: PayloadProof
  replacement: RetentionProof
}
export function artifactFolder(root: string, scope: OpenInput, a: LocalArtifact): string {
  return a.class === 'stage' || a.class === 'final'
    ? join(root, 'file-operations', a.operationId)
    : join(root, 'workspaces', scope.projectId, scope.workspaceId, 'snapshots', a.snapshotJob)
}
export function artifactPath(root: string, scope: OpenInput, a: LocalArtifact): string {
  const folder = artifactFolder(root, scope, a)
  return join(
    folder,
    ...(a.class === 'stage'
      ? ['stage-inspection']
      : a.class === 'final'
        ? ['final-inspection']
        : a.class === 'inspection'
          ? ['inspection']
          : []),
    a.relativePath
  )
}
export function artifactMarker(root: string, scope: OpenInput, a: LocalArtifact): string {
  const key = createHash('sha256').update(`${a.class}:${a.relativePath}`).digest('hex')
  return join(artifactFolder(root, scope, a), 'payload-removals-v1', `${key}.json`)
}
function isArtifact(v: unknown): v is LocalArtifact {
  if (
    !record(v) ||
    !exact(v, ['class', 'operationId', 'snapshotJob', 'relativePath']) ||
    !isId(v.operationId) ||
    !isId(v.snapshotJob) ||
    typeof v.relativePath !== 'string'
  )
    return false
  if (v.class === 'candidate') return v.relativePath === 'candidate.collie'
  if (v.class === 'capture') return v.relativePath === 'capture.sqlite'
  return (
    ['inspection', 'stage', 'final'].includes(String(v.class)) &&
    /^(?:manifest\.json|project\.sqlite|(?:blobs|citation-assets)\/[a-f0-9]{64})$/.test(
      v.relativePath
    )
  )
}
export function readLocalArtifactReceipt(root: string, id: string): LocalArtifactReceipt | null {
  if (!isId(id)) throw new Error('Invalid retention identity')
  const path = join(root, 'retention-actions', `${id}.json`)
  try {
    if (!namedStamp(path)) return null
  } catch (error) {
    if (record(error) && error.code === 'ENOENT') return null
    throw error
  }
  const v = boundedJson(path, 128 * 1024)
  if (
    !record(v) ||
    !exact(v, [
      'version',
      'kind',
      'view',
      'selected',
      'context',
      'artifact',
      'target',
      'replacement'
    ]) ||
    v.version !== 2 ||
    v.kind !== 'local-artifact' ||
    !isRetentionView(v.view) ||
    v.view.id !== id ||
    !['interrupted', 'complete'].includes(v.view.phase) ||
    !isId(v.selected) ||
    !isHash(v.context) ||
    !isArtifact(v.artifact) ||
    !record(v.target) ||
    !exact(v.target, ['path', 'identity', 'parent', 'sha256']) ||
    !isRetentionStamp(v.target.identity) ||
    !isHash(v.target.parent) ||
    !isHash(v.target.sha256) ||
    v.target.path !== artifactPath(root, v.view.scope, v.artifact) ||
    !isRetentionProof(v.replacement) ||
    v.replacement.projectId !== v.view.scope.projectId ||
    v.view.files.length !== 1 ||
    v.view.files[0].id !== v.selected ||
    v.view.files[0].path !== v.target.path
  )
    throw new Error('Invalid local artifact receipt')
  return v as LocalArtifactReceipt
}
export function localArtifactOutcome(root: string, scope: OpenInput, id: string): RetentionView {
  const r = readLocalArtifactReceipt(root, id)
  if (!r)
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
      files: [],
      message:
        'No durable cleanup receipt was found. No removal can be confirmed; review remaining files again.'
    }
  if (!sameScope(r.view.scope, scope)) throw new Error('Wrong retention scope')
  return {
    ...r.view,
    files: r.view.files.map((f) =>
      f.state === 'eligible'
        ? {
            ...f,
            state: 'unknown',
            reason: 'Interrupted outcome. Checking this receipt never repeats deletion.'
          }
        : f
    )
  }
}
/** Report only; an unresolved receipt or a reappearing removed file cannot authorize deletion. */
export function localArtifactRemovalState(
  root: string,
  scope: OpenInput,
  a: LocalArtifact
): 'none' | 'retryable' | 'removed' | 'unresolved' {
  try {
    const marker = artifactMarker(root, scope, a)
    try {
      if (!namedStamp(marker)) return 'none'
    } catch (error) {
      if (record(error) && error.code === 'ENOENT') return 'none'
      throw error
    }
    const v = boundedJson(marker, 1024)
    if (!record(v) || !exact(v, ['version', 'actionId']) || v.version !== 1 || !isId(v.actionId))
      return 'unresolved'
    const r = readLocalArtifactReceipt(root, v.actionId)
    if (
      !r ||
      !sameScope(r.view.scope, scope) ||
      r.target.path !== artifactPath(root, scope, a) ||
      r.artifact.class !== a.class ||
      r.artifact.snapshotJob !== a.snapshotJob ||
      r.view.phase !== 'complete'
    )
      return 'unresolved'
    const state = r.view.files[0].state
    return state === 'removed' ? 'removed' : state === 'changed' ? 'retryable' : 'unresolved'
  } catch {
    return 'unresolved'
  }
}
