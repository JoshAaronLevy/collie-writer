import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record, isOpenInput, type OpenInput } from '../../shared/projects'
import { contained, writeJson } from '../storage/files'
import { isHash } from './manifest'
import { isGeneration, type Generation } from './file-state'

export type SaveIntent = {
  version: 1; id: string; digest: string; scope: OpenInput; path: string; grantId: string
  priorGeneration: string | null; expected: Generation | null
  phase: 'capturing' | 'staged' | 'replacing' | 'replaced' | 'acknowledged'
  snapshotId: string | null; head: string | null; candidateHash: string | null; snapshotJob: string | null
}
export async function readIntent(root: string, folder: string): Promise<SaveIntent> {
  const path = join(folder, 'save.json')
  await contained(root, folder, true); await contained(root, path, false)
  if ((await lstat(path)).size > 32768) throw new ProjectError('JOB_INTERRUPTED')
  const v: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!record(v) || !exact(v, ['version','id','digest','scope','path','grantId','priorGeneration','expected','phase','snapshotId','head','candidateHash','snapshotJob']) || v.version !== 1 || !isId(v.id) || !isHash(v.digest) || !isOpenInput(v.scope) || typeof v.path !== 'string' || v.path.length > 4096 || !isId(v.grantId) || !(v.priorGeneration === null || isId(v.priorGeneration)) || !(v.expected === null || isGeneration(v.expected)) || !['capturing','staged','replacing','replaced','acknowledged'].includes(String(v.phase)) || ![v.snapshotId,v.head,v.snapshotJob].every(id => id === null || isId(id)) || !(v.candidateHash === null || isHash(v.candidateHash))) throw new ProjectError('JOB_INTERRUPTED')
  if (v.phase !== 'capturing' && (!v.snapshotId || !v.head || !v.snapshotJob || !v.candidateHash)) throw new ProjectError('JOB_INTERRUPTED')
  return v as SaveIntent
}
export async function persistIntent(folder: string, intent: SaveIntent): Promise<void> { await writeJson(join(folder, 'save.json'), intent) }
