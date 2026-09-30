import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readdir, lstat } from 'node:fs/promises'
import { isId, readDocument, type DocumentPayload } from '../../domain/editor/schema'
import { requestDigest } from '../storage/digest'
import { ProjectError, projectError } from '../../domain/projects/errors'
import type { CommitInput, CommitReceipt, CreateInput, OpenInput, OpenProject, ProjectList, ProjectSummary } from '../../shared/projects'
import { inWriteTransaction, openStorageDatabase } from '../storage/driver'
import { contained, directory, syncDirectory, writeJson } from '../storage/files'
import { createProjectSchema, validateProjectSchema, inspectVersion } from '../storage/schema'
import { openProjectDatabase } from '../storage/migrations'
import { SnapshotJobs, type SnapshotRequest, type SnapshotJob } from './snapshot-jobs'
import { SnapshotError } from './manifest'

const catalogSchema = [
  'CREATE TABLE creation_intents (operation_id TEXT PRIMARY KEY, digest TEXT NOT NULL, project_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL UNIQUE) STRICT',
  'CREATE TABLE destinations (project_id TEXT PRIMARY KEY, selected_path TEXT, base_snapshot_id TEXT, base_snapshot_head TEXT) STRICT'
]
const operationsSchema = [
  'CREATE TABLE jobs (id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, result TEXT) STRICT',
  'CREATE TABLE delivery (operation_id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT'
]
type Owned = { projectId: string; workspaceId: string; workspace: string; db: Database.Database; operations: Database.Database; lock: Database.Database; snapshots?: SnapshotJobs }
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true } catch (e) { if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return false; throw e } }

export class ProjectRepository {
  private catalog!: Database.Database
  private active: Owned | undefined
  private boundary: Promise<unknown> = Promise.resolve()
  constructor(private readonly root: string, private readonly resources: string, private readonly nativeBinding?: string) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const task = this.boundary.then(work)
    this.boundary = task.catch(() => {})
    return task
  }
  open(input: OpenInput): Promise<OpenProject> { return this.serial(() => this.openUnlocked(input)) }
  create(input: CreateInput): Promise<OpenProject> { return this.serial(() => this.createUnlocked(input)) }
  list(): Promise<ProjectList> { return this.serial(() => this.listUnlocked()) }
  commit(input: CommitInput): Promise<CommitReceipt> { return this.serial(() => this.commitUnlocked(input)) }
  /** Trusted worker services only. Stage 6 must provide grants/UI before exposing archive commands. */
  queueSnapshot(input: OpenInput, request: SnapshotRequest): Promise<SnapshotJob> {
    return this.serial(async () => {
      const jobs = this.snapshotJobs(input)
      const destination = this.catalog.prepare('SELECT base_snapshot_id FROM destinations WHERE project_id=?').get(input.projectId) as { base_snapshot_id: string | null } | undefined
      if (!destination || request.parentSnapshotId !== destination.base_snapshot_id) throw new SnapshotError('STALE_REVISION')
      return jobs.enqueue(request)
    })
  }
  snapshotJobs(input: OpenInput): SnapshotJobs {
    if (this.active?.projectId !== input.projectId || this.active.workspaceId !== input.workspaceId || !this.active.snapshots) throw new ProjectError('DENIED')
    return this.active.snapshots
  }
  private async safeDatabase(path: string): Promise<void> {
    for (const suffix of ['', '-wal', '-shm', '-journal']) if (await exists(path + suffix)) await contained(this.root, path + suffix, false)
  }
  private async localDatabase(path: string, statements: readonly string[]): Promise<Database.Database> {
    await this.safeDatabase(path)
    const db = openStorageDatabase(path, this.nativeBinding)
    try {
      const objects = db.prepare("SELECT sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all() as { sql: string }[]
      if (!objects.length && db.pragma('user_version', { simple: true }) === 0) inWriteTransaction(db, () => {
        statements.forEach(sql => db.exec(sql)); db.pragma('user_version=1')
      })
      else if (db.pragma('user_version', { simple: true }) !== 1 || objects.length !== statements.length || objects.some(row => !statements.includes(row.sql))) throw new ProjectError('CORRUPT_PROJECT')
      return db
    } catch (error) { db.close(); throw error }
  }
  async initialize(): Promise<void> {
    await contained(this.root, this.root, true)
    await directory(this.root, join(this.root, 'settings'))
    await directory(this.root, join(this.root, 'workspaces'))
    this.catalog = await this.localDatabase(join(this.root, 'settings/local.sqlite'), catalogSchema)
    await syncDirectory(join(this.root, 'settings'))
    await syncDirectory(this.root)
  }
  private async lock(project: string): Promise<Database.Database> {
    const path = join(project, 'owner.sqlite')
    await this.safeDatabase(path)
    const lock = new Database(path, { nativeBinding: this.nativeBinding, timeout: 0 })
    try {
      lock.pragma('trusted_schema=OFF')
      lock.pragma('journal_mode=DELETE')
      lock.exec('BEGIN EXCLUSIVE')
      return lock
    } catch (error) { lock.close(); throw error }
  }
  private release(owned: Owned): void {
    try { owned.db.close() } finally {
      try { owned.operations.close() } finally { owned.lock.close() }
    } // OS/SQLite releases ownership on normal close or process death.
  }
  async close(): Promise<void> {
    await this.active?.snapshots?.stop()
    await this.boundary
    if (this.active) { this.release(this.active); this.active = undefined }
    if (this.catalog?.open) this.catalog.close()
  }
  private read(owned: Owned): OpenProject {
    const project = owned.db.prepare('SELECT * FROM projects').all() as { id: string; title: string; head_commit_id: string; updated_at: string }[]
    const documents = owned.db.prepare('SELECT * FROM documents WHERE project_id=? ORDER BY position').all(owned.projectId) as { id: string; revision_id: string; payload: string }[]
    if (project.length !== 1 || project[0].id !== owned.projectId || documents.length !== 1 || !isId(project[0].head_commit_id) || !isId(documents[0].id) || !isId(documents[0].revision_id)) throw new ProjectError('CORRUPT_PROJECT')
    if (!project[0].title.length || project[0].title.length > 500 || !Number.isFinite(Date.parse(project[0].updated_at))) throw new ProjectError('CORRUPT_PROJECT')
    let payload: DocumentPayload
    try { payload = readDocument(JSON.parse(documents[0].payload)) } catch { throw new ProjectError('CORRUPT_PROJECT') }
    return { projectId: owned.projectId, workspaceId: owned.workspaceId, title: project[0].title, headCommitId: project[0].head_commit_id, updatedAt: project[0].updated_at, destination: null, documentId: documents[0].id, revisionId: documents[0].revision_id, payload }
  }
  private async discovery(owned: Owned): Promise<void> {
    const p = this.read(owned)
    // Derived discovery is never a mutation acknowledgment. A failed refresh is repairable on reopen.
    await writeJson(join(owned.workspace, 'recovery.json'), { version: 1, projectId: p.projectId, workspaceId: p.workspaceId, headCommitId: p.headCommitId, title: p.title, updatedAt: p.updatedAt }).catch(() => {})
  }
  private async acquire(input: OpenInput): Promise<Owned> {
    const project = join(this.root, 'workspaces', input.projectId)
    const workspace = join(project, input.workspaceId)
    await contained(this.root, project, true)
    await contained(this.root, workspace, true)
    const lock = await this.lock(project)
    let db: Database.Database | undefined
    let operations: Database.Database | undefined
    try {
      db = await openProjectDatabase(this.root, workspace, this.nativeBinding)
      operations = await this.localDatabase(join(workspace, 'operations.sqlite'), operationsSchema)
      // No job is silently replayed after interruption.
      operations.prepare("UPDATE jobs SET state='interrupted' WHERE state IN ('queued','running','cancelling')").run()
      const owned: Owned = { ...input, workspace, db, operations, lock }
      this.read(owned)
      this.catalog.prepare('INSERT OR IGNORE INTO destinations VALUES (?,NULL,NULL,NULL)').run(input.projectId)
      await this.discovery(owned)
      owned.snapshots = new SnapshotJobs({ ...owned, root: this.root, nativeBinding: this.nativeBinding }, this.resources, task => this.serial(task))
      await owned.snapshots.initialize()
      return owned
    } catch (error) { db?.close(); operations?.close(); lock.close(); throw error }
  }
  private async openUnlocked(input: OpenInput): Promise<OpenProject> {
    if (this.active?.projectId === input.projectId && this.active.workspaceId === input.workspaceId) return this.read(this.active)
    if (this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
    const next = await this.acquire(input)
    if (this.active) this.release(this.active)
    this.active = next
    return this.read(next)
  }
  private async listUnlocked(): Promise<ProjectList> {
    const result: ProjectList = { projects: [], issues: [] }
    const folders = await readdir(join(this.root, 'workspaces'))
    if (folders.length > 10000) throw new ProjectError('UNAVAILABLE')
    for (const projectId of folders.filter(isId)) {
      try {
        const project = join(this.root, 'workspaces', projectId)
        await contained(this.root, project, true)
        const workspaces = (await readdir(project)).filter(isId)
        if (workspaces.length !== 1) throw new ProjectError('CORRUPT_PROJECT')
        let owned: Owned
        const active = this.active?.projectId === projectId && this.active.workspaceId === workspaces[0]
        if (active) owned = this.active!
        else owned = await this.acquire({ projectId, workspaceId: workspaces[0] })
        try {
          const p = this.read(owned)
          const summary: ProjectSummary = { projectId, workspaceId: p.workspaceId, title: p.title, headCommitId: p.headCommitId, updatedAt: p.updatedAt, destination: null }
          result.projects.push(summary)
        } finally { if (!active) this.release(owned) }
      } catch (error) { result.issues.push({ projectId, code: projectError(error) }) }
    }
    result.projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return result
  }
  private async createUnlocked(input: CreateInput): Promise<OpenProject> {
    if (this.active?.snapshots?.busy()) throw new ProjectError('PROJECT_LOCKED')
    const digest = requestDigest(input)
    // Commit a local intent before touching the workspace. Retrying the same request uses the same IDs.
    const intent = inWriteTransaction(this.catalog, () => {
      const previous = this.catalog.prepare('SELECT * FROM creation_intents WHERE operation_id=?').get(input.operationId) as { digest: string; project_id: string; workspace_id: string } | undefined
      if (previous) {
        if (previous.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        return previous
      }
      const next = { digest, project_id: randomUUID(), workspace_id: randomUUID() }
      this.catalog.prepare('INSERT INTO creation_intents VALUES (?,?,?,?)').run(input.operationId, digest, next.project_id, next.workspace_id)
      this.catalog.prepare('INSERT INTO destinations VALUES (?,NULL,NULL,NULL)').run(next.project_id)
      return next
    })
    if (this.active?.projectId === intent.project_id && this.active.workspaceId === intent.workspace_id) {
      const prior = this.active.db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(intent.project_id, input.operationId) as { digest: string } | undefined
      if (prior?.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return this.read(this.active)
    }
    const project = join(this.root, 'workspaces', intent.project_id)
    await directory(this.root, project)
    const lock = await this.lock(project)
    try {
      const workspace = join(project, intent.workspace_id)
      await directory(this.root, workspace)
      await directory(this.root, join(workspace, 'blobs'))
      const path = join(workspace, 'working.sqlite')
      await this.safeDatabase(path)
      let initialized = false
      // Existing formats must be inspected read-only before enabling WAL or opening a writer.
      if (await exists(path)) {
        const existing = new Database(path, { nativeBinding: this.nativeBinding, readonly: true, fileMustExist: true })
        try {
          existing.pragma('trusted_schema=OFF')
          if (existing.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all().length) {
            validateProjectSchema(existing, inspectVersion(existing)); initialized = true
          }
          else if (existing.pragma('user_version', { simple: true }) !== 0) throw new ProjectError('CORRUPT_PROJECT')
        } finally { existing.close() }
      }
      const db = initialized ? await openProjectDatabase(this.root, workspace, this.nativeBinding) : openStorageDatabase(path, this.nativeBinding)
      try {
        const objects = db.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all()
        if (!objects.length && db.pragma('user_version', { simple: true }) === 0) {
          const projectId = intent.project_id, documentId = randomUUID(), head = randomUUID(), revision = randomUUID(), time = new Date().toISOString()
          const payload: DocumentPayload = { schemaVersion: 1, ast: { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: randomUUID() } }] }, footnotesById: {} }
          inWriteTransaction(db, () => {
            createProjectSchema(db)
            db.prepare('INSERT INTO commits VALUES (?,?,NULL,?)').run(projectId, head, time)
            db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run(projectId, 'blank', 'Untitled project', 'en-US', head, time, time)
            db.prepare('INSERT INTO documents VALUES (?,?,NULL,0,?,?,?,?,?,?,?)').run(projectId, documentId, 'text', 'Draft', 'draft', '', revision, 1, JSON.stringify(payload))
            this.indexIds(db, projectId, documentId, payload)
            db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(projectId, input.operationId, digest, JSON.stringify({ projectId, documentId, revisionId: revision, headCommitId: head }))
          })
        }
        validateProjectSchema(db)
        const operation = db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(intent.project_id, input.operationId) as { digest: string } | undefined
        if (operation?.digest !== digest) throw new ProjectError('CORRUPT_PROJECT')
      } finally { db.close() }
      await syncDirectory(workspace)
      await syncDirectory(project)
      await syncDirectory(join(this.root, 'workspaces'))
    } finally { lock.close() }
    return this.openUnlocked({ projectId: intent.project_id, workspaceId: intent.workspace_id })
  }
  private indexIds(db: Database.Database, projectId: string, documentId: string, payload: DocumentPayload): void {
    const insert = db.prepare('INSERT INTO editor_ids VALUES (?,?,?,?)')
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (['blockId', 'citationId', 'footnoteId'].includes(key)) {
          const prior = db.prepare('SELECT document_id FROM editor_ids WHERE project_id=? AND id=?').get(projectId, child)
          if (prior) throw new ProjectError('VALIDATION')
          insert.run(projectId, child, documentId, key)
        } else visit(child)
      }
    }
    visit(payload)
  }
  private async commitUnlocked(input: CommitInput): Promise<CommitReceipt> {
    const owned = this.active
    if (!owned || owned.projectId !== input.projectId || owned.workspaceId !== input.workspaceId) throw new ProjectError('DENIED')
    const payload = readDocument(input.payload)
    // Source ownership arrives later. Image references must resolve in this project's asset inventory.
    const references = (v: unknown): boolean => !!v && typeof v === 'object' && Object.entries(v).some(([key, child]) => key === 'sourceId' || (key === 'assetId' && !owned.db.prepare('SELECT id FROM managed_assets WHERE project_id=? AND id=?').get(input.projectId, child)) || references(child))
    if (references(payload)) throw new ProjectError('VALIDATION')
    const digest = requestDigest(input)
    const result = inWriteTransaction(owned.db, () => {
      const prior = owned.db.prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?').get(input.projectId, input.operationId) as { digest: string; result: string } | undefined
      if (prior) {
        if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        return JSON.parse(prior.result) as CommitReceipt
      }
      const document = owned.db.prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?').get(input.projectId, input.documentId) as { revision_id: string } | undefined
      if (!document) throw new ProjectError('NOT_FOUND')
      if (document.revision_id !== input.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      const project = owned.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }
      const revisionId = randomUUID(), headCommitId = randomUUID(), time = new Date().toISOString()
      owned.db.prepare('DELETE FROM editor_ids WHERE project_id=? AND document_id=?').run(input.projectId, input.documentId)
      this.indexIds(owned.db, input.projectId, input.documentId, payload)
      owned.db.prepare('UPDATE documents SET revision_id=?,payload=? WHERE project_id=? AND id=?').run(revisionId, JSON.stringify(payload), input.projectId, input.documentId)
      owned.db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId, headCommitId, project.head_commit_id, time)
      owned.db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(headCommitId, time, input.projectId)
      const receipt = { projectId: input.projectId, documentId: input.documentId, revisionId, headCommitId }
      owned.db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId, input.operationId, digest, JSON.stringify(receipt))
      return receipt
    })
    await this.discovery(owned)
    return result
  }
}
