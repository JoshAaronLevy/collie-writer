import { join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { storedProjectTitle } from '../../domain/projects/details'
import { isProjectKind, type ProjectKind } from '../../domain/projects/templates'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record, type OpenInput } from '../../shared/projects'
import { contained } from '../storage/files'
import { boundedJson } from './retention-files'

type DiscoveryHint = { title: string; updatedAt: string; projectKind?: ProjectKind }

/** Both generations are disposable display hints, never admission or mutation authority. */
export function isDiscoveryHint(v: unknown, scope: OpenInput): v is DiscoveryHint {
  return (
    record(v) &&
    (v.version === 1 || v.version === 2) &&
    exact(v, [
      'version',
      'projectId',
      'workspaceId',
      'headCommitId',
      'title',
      'updatedAt',
      ...(v.version === 2 ? ['projectKind'] : [])
    ]) &&
    v.projectId === scope.projectId &&
    v.workspaceId === scope.workspaceId &&
    isId(v.headCommitId) &&
    storedProjectTitle(v.title) &&
    typeof v.updatedAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.updatedAt) &&
    Number.isFinite(Date.parse(v.updatedAt)) &&
    (v.version === 1 || isProjectKind(v.projectKind))
  )
}

export async function readDiscoveryHint(
  root: string,
  scope: OpenInput,
  resetId?: string
): Promise<DiscoveryHint> {
  const base = resetId ? join(root, 'reset-recovery', resetId) : root
  const path = join(base, 'workspaces', scope.projectId, scope.workspaceId, 'recovery.json')
  await contained(root, path, false)
  const hint = boundedJson(path, 4096)
  if (!isDiscoveryHint(hint, scope)) throw new ProjectError('CORRUPT_PROJECT')
  return hint
}

export async function recoveryTitle(
  root: string,
  scope: OpenInput,
  resetId?: string
): Promise<string | null> {
  return readDiscoveryHint(root, scope, resetId)
    .then((hint) => hint.title)
    .catch(() => null)
}
