import { join, sep } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import { isWorkingCopyView, type WorkingCopyView } from '../../shared/working-copy'
import { isHash } from './manifest'
import { boundedJson, namedStamp, isRetentionStamp, type PayloadProof } from './retention-files'
import { isRetentionProof, type RetentionProof } from './retention-receipts'

export type WorkingCopyReceipt = {
  version: 3
  kind: 'working-copy'
  view: WorkingCopyView
  tree: string
  saved: RetentionProof
  retained: PayloadProof[]
  payloads: Array<PayloadProof & { state: 'pending' | 'removed' | 'retained' | 'unknown' }>
}
export const workspacePath = (root: string, scope: OpenInput): string =>
  join(root, 'workspaces', scope.projectId, scope.workspaceId)
export const removalMarker = (root: string, scope: OpenInput): string =>
  join(root, 'workspace-retirements', `${scope.workspaceId}.json`)
export function pathPresent(path: string): boolean {
  try {
    return namedStamp(path) !== null
  } catch (error) {
    if (record(error) && error.code === 'ENOENT') return false
    throw error
  }
}
function isPayload(v: unknown, workspace: string, outcome: boolean): boolean {
  return (
    record(v) &&
    exact(v, ['path', 'identity', 'parent', 'sha256', ...(outcome ? ['state'] : [])]) &&
    typeof v.path === 'string' &&
    v.path.startsWith(workspace + sep) &&
    v.path.length <= 4096 &&
    !v.path
      .slice(workspace.length + 1)
      .split(/[\\/]/)
      .some((p) => !p || p === '.' || p === '..') &&
    isRetentionStamp(v.identity) &&
    isHash(v.parent) &&
    isHash(v.sha256) &&
    (!outcome || ['pending', 'removed', 'retained', 'unknown'].includes(String(v.state)))
  )
}
export function readWorkingCopyReceipt(root: string, id: string): WorkingCopyReceipt | null {
  if (!isId(id)) throw new Error('Invalid removal identity')
  const path = join(root, 'retention-actions', `${id}.json`)
  if (!pathPresent(path)) return null
  const v = boundedJson(path, 4 * 1024 ** 2)
  if (!record(v) || !isWorkingCopyView(v.view)) throw new Error('Invalid working copy receipt')
  const view = v.view
  if (
    !record(v) ||
    !exact(v, ['version', 'kind', 'view', 'tree', 'saved', 'retained', 'payloads']) ||
    v.version !== 3 ||
    v.kind !== 'working-copy' ||
    !isWorkingCopyView(v.view) ||
    v.view.id !== id ||
    v.view.eligible ||
    !['complete', 'interrupted'].includes(v.view.phase) ||
    !isHash(v.tree) ||
    !isRetentionProof(v.saved) ||
    v.saved.projectId !== v.view.scope.projectId ||
    v.saved.path !== v.view.savedPath ||
    v.view.workspace !== workspacePath(root, v.view.scope) ||
    !Array.isArray(v.retained) ||
    v.retained.length > 512 ||
    !v.retained.every((p) => isPayload(p, view.workspace as string, false)) ||
    !Array.isArray(v.payloads) ||
    !v.payloads.length ||
    v.payloads.length > 512 ||
    !v.payloads.every((p) => isPayload(p, view.workspace as string, true))
  )
    throw new Error('Invalid working copy receipt')
  const r = v as WorkingCopyReceipt
  if (
    new Set([...r.retained, ...r.payloads].map((p) => p.path)).size !==
      r.retained.length + r.payloads.length ||
    r.view.files !== r.payloads.length ||
    r.view.bytes !== r.payloads.reduce((n, p) => n + p.identity.size, 0) ||
    r.view.retainedBytes !== r.retained.reduce((n, p) => n + p.identity.size, 0) ||
    r.view.removedFiles !== r.payloads.filter((p) => p.state === 'removed').length ||
    r.view.removedBytes !==
      r.payloads.filter((p) => p.state === 'removed').reduce((n, p) => n + p.identity.size, 0)
  )
    throw new Error('Inconsistent working copy receipt')
  return r
}
/** Any unreadable marker fails closed. Its target directory is retained and never auto-recreated. */
export function retiredWorkspace(root: string, scope: OpenInput): WorkingCopyReceipt | null {
  const path = removalMarker(root, scope)
  if (!pathPresent(path)) return null
  const v = boundedJson(path, 1024)
  if (
    !record(v) ||
    !exact(v, ['version', 'actionId', 'scope']) ||
    v.version !== 1 ||
    !isId(v.actionId) ||
    !isOpenInput(v.scope) ||
    !sameScope(v.scope, scope)
  )
    throw new Error('Unreadable workspace removal reference')
  const r = readWorkingCopyReceipt(root, v.actionId)
  if (!r || !sameScope(r.view.scope, scope)) throw new Error('Missing workspace removal receipt')
  return r
}
export function workingCopyOutcome(root: string, scope: OpenInput, id: string): WorkingCopyView {
  const r = readWorkingCopyReceipt(root, id)
  if (!r)
    return emptyWorkingCopy(
      scope,
      id,
      'not-started',
      'No durable removal receipt was found. No removal is confirmed. Refresh the library and request a new review.'
    )
  if (!sameScope(r.view.scope, scope)) throw new Error('Wrong removal scope')
  const retired = retiredWorkspace(root, scope)
  return {
    ...r.view,
    retired: !!retired,
    reason:
      r.view.phase === 'interrupted'
        ? retired
          ? 'Removal was interrupted or its outcome was not fully protected. Remaining files and records stay retained at the original location, or in reset recovery after Reset. This action never resumes deletion. Use Open project file to validate and reopen the saved project.'
          : 'Removal stopped before retirement was confirmed. Local content stays retained. This action never resumes deletion. Refresh the library and review the original project again.'
        : r.view.reason
  }
}
export function emptyWorkingCopy(
  scope: OpenInput,
  id: string,
  phase: WorkingCopyView['phase'],
  reason: string
): WorkingCopyView {
  return {
    id,
    scope,
    reviewId: null,
    phase,
    title: null,
    workspace: null,
    savedPath: null,
    head: null,
    eligible: false,
    retired: false,
    bytes: null,
    retainedBytes: null,
    files: null,
    removedBytes: 0,
    removedFiles: 0,
    reason
  }
}
