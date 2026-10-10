import { lstatSync, opendirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type Database from 'better-sqlite3'
import { isId } from '../../domain/editor/schema'
import { exact, record, type OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import { requestDigest } from '../storage/digest'
import { PROJECT_SCHEMA_VERSION } from '../storage/schema'
import { entriesFor, readManifest, isHash, isUtc } from './manifest'
import { isSavedLocation, selectedPath } from './file-state'
import { readPortableGraph } from './portable-db'
import { portableContentDigest, retentionDatabase } from './retention-database'
import { inspectRetentionArchive } from './retention-archive'
import {
  boundedJson,
  inspectRetentionPayload,
  namedStamp,
  parentStamp,
  stamp,
  retentionNames,
  type PayloadProof
} from './retention-files'
import { isSaveIntent, type SaveIntent } from './save-intent'
import { searchProjection } from './search-schema'
import { workspacePath, retiredWorkspace, type WorkingCopyReceipt } from './working-copy-records'

export class WorkingCopyProtected extends Error {}
export function requireCopy(value: unknown, message: string): asserts value {
  if (!value) throw new WorkingCopyProtected(message)
}
export type WorkingTree = {
  files: Array<Omit<PayloadProof, 'sha256'>>
  directories: Array<[string, string]>
}
/** Bounded traversal, never follows links. Directory identities stay stable while exact files go away. */
export function workingTree(workspace: string): WorkingTree {
  const files: WorkingTree['files'] = [],
    directories: WorkingTree['directories'] = []
  let visited = 0
  const walk = (path: string, depth: number): void => {
    requireCopy(
      ++visited <= 1024 && depth <= 5 && path.length <= 4096,
      'This working folder exceeds the bounded removal review. Its data stays local.'
    )
    const info = lstatSync(path, { bigint: true })
    requireCopy(!info.isSymbolicLink(), 'A redirected file or folder prevents local removal.')
    if (info.isDirectory()) {
      directories.push([path, parentStamp(join(path, 'entry'))])
      const dir = opendirSync(path)
      try {
        for (let entry = dir.readSync(); entry; entry = dir.readSync())
          walk(join(path, entry.name), depth + 1)
      } finally {
        dir.closeSync()
      }
    } else {
      files.push({ path, identity: stamp(info), parent: parentStamp(path) })
      requireCopy(
        files.length <= 512,
        'Too many local files for this removal review; data remains retained.'
      )
    }
  }
  walk(workspace, 0)
  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    directories: directories.sort((a, b) => a[0].localeCompare(b[0]))
  }
}
function operationsDatabase(db: Database.Database): void {
  const expected = [
    'CREATE TABLE jobs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT) STRICT',
    'CREATE TABLE delivery (operation_id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT',
    'CREATE INDEX ai_binding_capacity ON jobs (kind,state,created_at,id)'
  ]
  const rows = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all() as {
    sql: string
  }[]
  requireCopy(
    db.pragma('user_version', { simple: true }) === 2 &&
      rows.length === expected.length &&
      rows.every((r) => expected.includes(r.sql)),
    'The local operation journal is unsupported; keep this working copy for recovery.'
  )
  requireCopy(
    !db
      .prepare(
        "SELECT 1 FROM jobs WHERE kind!='search' OR state NOT IN ('completed','failed','cancelled','interrupted') LIMIT 1"
      )
      .get() && !db.prepare('SELECT 1 FROM delivery LIMIT 1').get(),
    'AI bindings, pending work or unsupported operation history requires this original working copy. Keep it for recovery.'
  )
}
async function settledFileRecords(
  root: string,
  scope: OpenInput
): Promise<Map<string, SaveIntent>> {
  const out = new Map<string, SaveIntent>()
  for (const id of await retentionNames(join(root, 'file-operations'), 4096)) {
    if (!isId(id)) {
      requireCopy(id === '.DS_Store', 'Unknown file-operation history prevents removal.')
      continue
    }
    for (const name of ['save.json', 'backup.json']) {
      const path = join(root, 'file-operations', id, name)
      if (!namedStamp(path)) continue
      const v = boundedJson(path, 32768)
      requireCopy(
        isSaveIntent(v) && v.id === id,
        'Unreadable file-operation history prevents removal.'
      )
      if (!sameScope(v.scope, scope)) continue
      requireCopy(
        v.phase === 'acknowledged' && !out.has(id),
        'This project has an unresolved or ambiguous Save/Backup. Open it and reconcile that operation first.'
      )
      out.set(id, v)
    }
  }
  return out
}
function completedSnapshot(
  v: unknown,
  id: string,
  scope: OpenInput,
  intents: Map<string, SaveIntent>
): void {
  requireCopy(
    record(v) &&
      exact(v, [
        'version',
        'id',
        'projectId',
        'operations',
        'parentSnapshotId',
        'state',
        'phase',
        'bytesProcessed',
        'createdAt',
        'capturedHead',
        'lease',
        'blobs',
        'manifest',
        'error'
      ]) &&
      v.version === 1 &&
      v.id === id &&
      v.projectId === scope.projectId &&
      v.state === 'completed' &&
      v.phase === 'done' &&
      v.lease === 'released' &&
      v.error === null &&
      isUtc(v.createdAt) &&
      isId(v.capturedHead) &&
      (v.parentSnapshotId === null || isId(v.parentSnapshotId)) &&
      Number.isSafeInteger(v.bytesProcessed) &&
      Number(v.bytesProcessed) >= 0 &&
      Array.isArray(v.operations) &&
      v.operations.length > 0 &&
      v.operations.length <= 1000,
    'An incomplete snapshot or unreleased lease requires this original working copy. Review recovery first.'
  )
  const manifest = readManifest(v.manifest)
  requireCopy(
    manifest.projectId === scope.projectId &&
      manifest.headCommitId === v.capturedHead &&
      requestDigest(v.blobs) === requestDigest(manifest.blobs) &&
      new Set(v.operations.map((op) => (record(op) ? op.id : null))).size === v.operations.length,
    'Snapshot ownership or retained inventory is uncertain; keep the working copy.'
  )
  for (const op of v.operations) {
    requireCopy(
      record(op) &&
        exact(op, ['id', 'digest', 'minimumHead']) &&
        isId(op.id) &&
        isHash(op.digest) &&
        isId(op.minimumHead),
      'Snapshot operation history is unreadable.'
    )
    const intent = intents.get(op.id)
    requireCopy(
      intent &&
        intent.snapshotJob === id &&
        intent.snapshotId === manifest.snapshotId &&
        intent.head === manifest.headCommitId,
      'A snapshot lacks a completed transfer receipt. Its original working copy stays retained.'
    )
  }
}
export type WorkingCopyProof = Omit<WorkingCopyReceipt, 'version' | 'kind' | 'view'> & {
  title: string
  head: string
  bytes: number
  retainedBytes: number
}
export async function proveWorkingCopy(
  root: string,
  scope: OpenInput,
  nativeBinding?: string
): Promise<WorkingCopyProof> {
  requireCopy(
    !retiredWorkspace(root, scope),
    'This original working copy is already retired. Check its recorded outcome; deletion never repeats.'
  )
  const workspace = workspacePath(root, scope),
    tree = workingTree(workspace)
  const destinationFile = join(workspace, 'destination-v1.json')
  requireCopy(
    namedStamp(destinationFile),
    'This project has no selected saved file. Open it and use Save before removing local work.'
  )
  const raw = boundedJson(destinationFile, 16384)
  requireCopy(
    record(raw) &&
      exact(raw, ['version', 'destination']) &&
      raw.version === 1 &&
      isSavedLocation(raw.destination),
    'Saved-file metadata is unavailable. Open the project and resolve its file status first.'
  )
  const destination = raw.destination
  requireCopy(
    (await selectedPath(root, destination.path)) === destination.path,
    'The saved destination is unavailable or redirected. Open and locate it first.'
  )
  requireCopy(
    !tree.files.some((f) =>
      /(?:^|\/)(?:working-v|active\.json|migrations|exports)/.test(
        relative(workspace, f.path).split(sep).join('/')
      )
    ),
    'Migration originals or export recovery must remain in this working copy; removal is unavailable.'
  )
  const db = await retentionDatabase(join(workspace, 'working.sqlite'), nativeBinding)
  let title: string, head: string, digest: string
  try {
    const graph = readPortableGraph(db)
    requireCopy(
      graph.schemaVersion === PROJECT_SCHEMA_VERSION && graph.projectId === scope.projectId,
      'This project needs its original database or migration recovery; keep it locally.'
    )
    head = graph.headCommitId
    for (const table of [
      'import_batches',
      'import_batch_revisions',
      'import_files',
      'import_artifacts'
    ])
      requireCopy(
        !db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get(),
        'This project contains retained import work or originals. Keep its original working copy; import-bearing working copies cannot be removed yet.'
      )
    requireCopy(
      head === destination.headCommitId,
      'Local changes are newer than the selected file. Open this project and Save, then switch away and review again.'
    )
    for (const table of [
      'conversations',
      'ai_captures',
      'conversation_attempts',
      'conversation_messages',
      'conversation_memory',
      'conversation_context',
      'conversation_research',
      'conversation_sources',
      'proofreading_captures',
      'proofreading_runs',
      'proofreading_findings',
      'proofreading_decisions'
    ])
      requireCopy(
        !db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get(),
        'This project contains AI-linked records. Its original working copy is required for account/output recovery and cannot be removed yet.'
      )
    title = (db.prepare('SELECT title FROM projects').get() as { title: string }).title
    digest = portableContentDigest(db)
  } finally {
    db.close()
  }
  const archive = await inspectRetentionArchive(destination.path, nativeBinding, true)
  requireCopy(
    archive.sha256 === destination.fingerprint.sha256 &&
      archive.manifest.projectId === scope.projectId &&
      archive.manifest.snapshotId === destination.snapshotId &&
      archive.manifest.headCommitId === head &&
      archive.contentDigest === digest,
    'The accessible saved file does not contain the exact local project content and history. Save or resolve the destination before removal.'
  )
  const intents = await settledFileRecords(root, scope),
    entries = entriesFor(archive.manifest)
  const operations = await retentionDatabase(join(workspace, 'operations.sqlite'), nativeBinding)
  const payloads: WorkingCopyProof['payloads'] = [],
    retained: PayloadProof[] = []
  try {
    operationsDatabase(operations)
    let total = 0,
      metadata = 0
    for (const item of tree.files) {
      const name = relative(workspace, item.path).split(sep).join('/')
      requireCopy(
        (total += item.identity.size) <= 1024 ** 3,
        'The working copy exceeds this bounded removal review; keep it locally.'
      )
      let remove = name === 'working.sqlite'
      const ref = entries.get(name)
      if (/^(?:blobs|citation-assets)\/[a-f0-9]{64}$/.test(name)) {
        requireCopy(
          ref,
          'A managed file is missing from the saved archive inventory. Keep the original working copy.'
        )
        remove = true
      } else if (name === 'search.sqlite') {
        const search = await retentionDatabase(item.path, nativeBinding)
        try {
          requireCopy(
            searchProjection(search, operations),
            'The search file is unrecognized; keep it for review.'
          )
        } finally {
          search.close()
        }
        remove = true
      } else if (!remove) {
        if (/^snapshots\/[a-f0-9-]{36}\/job\.json$/.test(name))
          completedSnapshot(boundedJson(item.path, 1024 ** 2), name.split('/')[1], scope, intents)
        else
          requireCopy(
            [
              'operations.sqlite',
              'destination-v1.json',
              'recovery.json',
              'organization-v1.json',
              'origin.json',
              'manifest.json',
              '.DS_Store'
            ].includes(name),
            'Independent snapshots, migration/reset/export recovery, prior cleanup records or unknown files remain in this working copy. Review and retain those originals; removal is unavailable.'
          )
        requireCopy(
          (metadata += item.identity.size) <= 8 * 1024 ** 2,
          'Required local operation records exceed the retained-metadata limit; keep this working copy.'
        )
      }
      const proof = await inspectRetentionPayload(
        item.path,
        remove ? 512 * 1024 ** 2 : 8 * 1024 ** 2
      )
      if (ref && remove)
        requireCopy(
          proof.sha256 === ref.sha256 && proof.identity.size === ref.bytes,
          'Managed file bytes do not match the saved inventory; keep local originals.'
        )
      if (remove) payloads.push({ ...proof, state: 'pending' })
      else retained.push(proof)
    }
  } finally {
    operations.close()
  }
  requireCopy(
    requestDigest(workingTree(workspace)) === requestDigest(tree),
    'Local files changed while reviewing. Nothing was removed; review again.'
  )
  // Every saved managed entry must exist locally; an absent local asset is not deletion authority.
  for (const [name] of entries)
    if (name !== 'project.sqlite')
      requireCopy(
        payloads.some((p) => relative(workspace, p.path).split(sep).join('/') === name),
        'The local managed inventory is incomplete. Keep this copy for recovery.'
      )
  // Retire the database first; even older readers cannot open a partially removed content set.
  payloads.sort(
    (a, b) =>
      Number(b.path === join(workspace, 'working.sqlite')) -
        Number(a.path === join(workspace, 'working.sqlite')) || a.path.localeCompare(b.path)
  )
  return {
    title,
    head,
    tree: requestDigest(tree),
    retained,
    payloads,
    bytes: payloads.reduce((n, p) => n + p.identity.size, 0),
    retainedBytes: retained.reduce((n, p) => n + p.identity.size, 0),
    saved: {
      path: destination.path,
      identity: archive.identity,
      parent: archive.parent,
      sha256: archive.sha256,
      projectId: scope.projectId,
      snapshotId: archive.manifest.snapshotId,
      head,
      createdAt: archive.manifest.createdAt
    }
  }
}
