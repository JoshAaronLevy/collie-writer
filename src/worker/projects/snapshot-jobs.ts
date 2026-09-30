import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { readFile, readdir, mkdir, rm, lstat } from 'node:fs/promises'
import { isId } from '../../domain/editor/schema'
import { record, exact } from '../../shared/projects'
import { requestDigest } from '../storage/digest'
import { contained, directory, syncDirectory, writeJson } from '../storage/files'
import { LIMITS, SnapshotError, cancelled, isHash, isUtc, readManifest, type BlobRef, type SnapshotCode, type SnapshotManifest } from './manifest'
import { captureDatabase, buildSnapshot, type CaptureSource } from './snapshot'

export type SnapshotRequest = { operationId: string; minimumHeadCommitId: string; parentSnapshotId: string | null; expectedHeadCommitId?: string }
export type SnapshotJob = {
  version: 1; id: string; projectId: string; operations: { id: string; digest: string; minimumHead: string }[]
  parentSnapshotId: string | null; state: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'failed' | 'interrupted' | 'completed'
  phase: 'waiting' | 'capture' | 'archive' | 'done'; bytesProcessed: number; createdAt: string; capturedHead: string | null
  lease: 'provisional' | 'exact' | 'released'; blobs: BlobRef[]; manifest: SnapshotManifest | null
  error: SnapshotCode | null
}
type Boundary = <T>(work: () => Promise<T>) => Promise<T>
type Running = { job: SnapshotJob; controller: AbortController }
export type SnapshotProgress = Pick<SnapshotJob, 'id' | 'state' | 'phase' | 'bytesProcessed'> & { capturedHead: string | null }

/** One active capture/archive per workspace, plus one coalesced successor per parent lineage. */
export class SnapshotJobs {
  private readonly jobs = new Map<string, SnapshotJob>()
  private pending: SnapshotJob[] = []
  private exactHeads = new Map<string, string>()
  private active: Running | undefined
  private task: Promise<void> | undefined
  private stopping = false
  private controls: Promise<unknown> = Promise.resolve()
  private listeners = new Set<(job: SnapshotProgress) => void>()
  constructor(private readonly source: CaptureSource, private readonly resources: string, private readonly boundary: Boundary, private readonly changed: (job: SnapshotProgress) => void = () => {}) {}
  private control<T>(work: () => Promise<T>): Promise<T> {
    const task = this.controls.then(work); this.controls = task.catch(() => {}); return task
  }
  private folder(id: string): string { return join(this.source.workspace, 'snapshots', id) }
  private async persist(job: SnapshotJob): Promise<void> { await writeJson(join(this.folder(job.id), 'job.json'), job) }
  private emit(job: SnapshotJob): void {
    const progress = { id: job.id, state: job.state, phase: job.phase, bytesProcessed: job.bytesProcessed, capturedHead: job.capturedHead }
    for (const listener of [this.changed, ...this.listeners]) try { listener(progress) } catch { /* Subscribers cannot alter durable job state. */ }
  }
  subscribe(listener: (job: SnapshotProgress) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  async finish(id: string, signal: AbortSignal): Promise<SnapshotJob> {
    // The task must settle (including journal errors), not merely emit a completion event.
    const abort = (): void => { void this.cancel(id).catch(() => {}) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      if (signal.aborted) abort()
      while (this.busy() && this.task) await this.task
      const job = this.jobs.get(id)
      if (!job) throw new SnapshotError('UNAVAILABLE')
      if (job.state !== 'completed') throw new SnapshotError(job.error ?? 'UNAVAILABLE')
      return structuredClone(job)
    } finally { signal.removeEventListener('abort', abort) }
  }
  busy(): boolean { return !!this.active || this.pending.length > 0 }
  statuses(): SnapshotJob[] { return [...this.jobs.values()].map(job => structuredClone(job)) }

  async initialize(): Promise<void> {
    const parent = join(this.source.workspace, 'snapshots')
    await directory(this.source.root, parent)
    await syncDirectory(this.source.workspace)
    for (const id of await readdir(parent)) {
      if (!isId(id)) continue
      try {
      await contained(this.source.root, this.folder(id), true)
      const file = join(this.folder(id), 'job.json')
      await contained(this.source.root, file, false)
      if ((await lstat(file)).size > LIMITS.manifest) throw new SnapshotError('LIMIT_EXCEEDED')
      const raw = await readFile(file)
      const value: unknown = JSON.parse(raw.toString('utf8'))
      if (!record(value) || !exact(value, ['version','id','projectId','operations','parentSnapshotId','state','phase','bytesProcessed','createdAt','capturedHead','lease','blobs','manifest','error']) || value.version !== 1 || value.id !== id || value.projectId !== this.source.projectId || !Array.isArray(value.operations) || value.operations.length > 1000 || !value.operations.every(op => record(op) && exact(op,['id','digest','minimumHead']) && isId(op.id) && isHash(op.digest) && isId(op.minimumHead)) || !Array.isArray(value.blobs) || !value.blobs.every(ref => record(ref) && exact(ref,['sha256','bytes']) && isHash(ref.sha256) && Number.isSafeInteger(ref.bytes) && Number(ref.bytes) >= 0) || !['provisional','exact','released'].includes(String(value.lease)) || !['queued','running','cancelling','cancelled','failed','interrupted','completed'].includes(String(value.state))) throw new SnapshotError('INVALID_ARCHIVE')
      const job = value as SnapshotJob
      if ((job.error !== null && !['INVALID_ARCHIVE','FORMAT_TOO_NEW','LIMIT_EXCEEDED','DISK_FULL','CANCELLED','STALE_REVISION','UNAVAILABLE','OPERATION_CONFLICT'].includes(job.error)) || new Set(job.operations.map(op => op.id)).size !== job.operations.length) throw new SnapshotError('INVALID_ARCHIVE')
      if (!isUtc(job.createdAt) || (job.parentSnapshotId !== null && !isId(job.parentSnapshotId)) || (job.capturedHead !== null && !isId(job.capturedHead)) || !Number.isSafeInteger(job.bytesProcessed) || job.bytesProcessed < 0 || !['waiting','capture','archive','done'].includes(job.phase) || job.blobs.length > LIMITS.entries || job.blobs.some(blob => blob.bytes > LIMITS.blob)) throw new SnapshotError('INVALID_ARCHIVE')
      if (job.manifest !== null) {
        job.manifest = readManifest(job.manifest)
        if (job.manifest.projectId !== job.projectId || job.manifest.headCommitId !== job.capturedHead) throw new SnapshotError('INVALID_ARCHIVE')
      }
      if (job.state === 'completed' && (!job.manifest || job.lease !== 'released')) throw new SnapshotError('INVALID_ARCHIVE')
      if (['queued','running','cancelling'].includes(job.state)) {
        job.state = 'interrupted'; job.error = 'UNAVAILABLE'
        // Keep provisional/exact leases and candidates until explicit recovery inspection.
        await this.persist(job)
      }
      this.jobs.set(id, job)
      } catch {
        // An incomplete journal must not make writing inaccessible or authorize garbage collection.
        this.jobs.set(id, { version: 1, id, projectId: this.source.projectId, operations: [], parentSnapshotId: null, state: 'interrupted', phase: 'waiting', bytesProcessed: 0, capturedHead: null, createdAt: new Date().toISOString(), lease: 'provisional', blobs: [], manifest: null, error: 'INVALID_ARCHIVE' })
      }
    }
  }
  /** GC must consult this inside the same capture boundary. Unreconciled jobs fail closed. */
  mayCollect(hash: string): boolean {
    return [...this.jobs.values()].every(job => job.lease === 'released' || (job.lease === 'exact' && !job.blobs.some(blob => blob.sha256 === hash)))
  }
  enqueue(input: SnapshotRequest): Promise<SnapshotJob> { return this.control(() => this.enqueueUnlocked(input)) }
  private async enqueueUnlocked(input: SnapshotRequest): Promise<SnapshotJob> {
    if (this.stopping || !isId(input.operationId) || !isId(input.minimumHeadCommitId) || (input.parentSnapshotId !== null && !isId(input.parentSnapshotId))) throw new SnapshotError('UNAVAILABLE')
    const digest = requestDigest(input)
    for (const job of this.jobs.values()) {
      const prior = job.operations.find(op => op.id === input.operationId)
      if (prior) {
        if (prior.digest !== digest) throw new SnapshotError('OPERATION_CONFLICT')
        return structuredClone(job) // Never silently replay a failed/interrupted operation.
      }
    }
    const previous = input.expectedHeadCommitId ? undefined : this.pending.find(item => !item.operations.some(op => this.exactHeads.has(op.id)) && item.parentSnapshotId === input.parentSnapshotId && item.operations.length < 1000)
    let job: SnapshotJob
    if (!previous) {
      if (this.pending.length >= 8) throw new SnapshotError('LIMIT_EXCEEDED')
      job = { version: 1, id: randomUUID(), projectId: this.source.projectId, operations: [], parentSnapshotId: input.parentSnapshotId, state: 'queued', phase: 'waiting', bytesProcessed: 0, capturedHead: null, createdAt: new Date().toISOString(), lease: 'provisional', blobs: [], manifest: null, error: null }
      await mkdir(this.folder(job.id), { mode: 0o700 })
      await syncDirectory(join(this.source.workspace, 'snapshots'))
    } else job = structuredClone(previous)
    if (input.expectedHeadCommitId) {
      if (!isId(input.expectedHeadCommitId) || input.expectedHeadCommitId !== input.minimumHeadCommitId) throw new SnapshotError('STALE_REVISION')
      this.exactHeads.set(input.operationId, input.expectedHeadCommitId)
    }
    job.operations.push({ id: input.operationId, digest, minimumHead: input.minimumHeadCommitId })
    await this.persist(job)
    this.jobs.set(job.id, job)
    if (previous) this.pending[this.pending.indexOf(previous)] = job
    else this.pending.push(job)
    this.emit(job)
    this.pump()
    return structuredClone(job)
  }
  private pump(): void {
    if (this.task || this.stopping) return
    this.task = this.drain().finally(() => { this.task = undefined; if (this.pending.length && !this.stopping) this.pump() })
    // A persistence failure retains the last journal and pins; no unhandled background rejection.
    void this.task.catch(() => {})
  }
  private async drain(): Promise<void> {
    while (this.pending.length && !this.stopping) {
      const running = await this.control(async () => {
        const job = this.pending.shift()
        if (!job || this.stopping) return undefined
        const controller = new AbortController()
        this.active = { job, controller }; return this.active
      })
      if (!running) break
      const { job, controller } = running
      let lastProgress = 0
      const progress = (bytes: number): void => {
        job.bytesProcessed += bytes
        if (Date.now() - lastProgress > 150) { this.emit(job); lastProgress = Date.now() }
      }
      try {
        cancelled(controller.signal)
        job.state = 'running'; job.phase = 'capture'; await this.persist(job); cancelled(controller.signal); this.emit(job)
        const capture = await this.boundary(async () => {
          const head = (this.source.db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(this.source.projectId) as { head_commit_id: string }).head_commit_id
          if (job.operations.some(op => this.exactHeads.has(op.id) && this.exactHeads.get(op.id) !== head)) throw new SnapshotError('STALE_REVISION')
          const result = await captureDatabase(this.source, join(this.folder(job.id), 'capture.sqlite'), job.operations.map(op => op.minimumHead), controller.signal, progress)
          job.blobs = result.graph.blobs; job.capturedHead = result.graph.headCommitId; job.lease = 'exact'; await this.persist(job)
          return result // Exact durable leases precede release of the mutation/GC barrier.
        })
        job.phase = 'archive'; await this.persist(job); this.emit(job)
        job.manifest = await buildSnapshot(this.source, capture, this.folder(job.id), this.resources, job.parentSnapshotId, controller.signal, progress)
        job.state = 'completed'; job.phase = 'done'; job.lease = 'released'
        await this.persist(job); this.emit(job)
        // Completed candidate is retained for transfer/retry. Remove only this job's disposable copies.
        for (const name of ['capture.sqlite','inspection']) await this.removeOwned(job, name).catch(() => {})
      } catch (error) {
        job.state = controller.signal.aborted ? 'cancelled' : 'failed'
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        job.error = controller.signal.aborted ? 'CANCELLED' : error instanceof SnapshotError ? error.code : code === 'FORMAT_TOO_NEW' ? 'FORMAT_TOO_NEW' : code === 'CORRUPT_PROJECT' ? 'INVALID_ARCHIVE' : code === 'ENOSPC' || code.startsWith('SQLITE_FULL') ? 'DISK_FULL' : 'UNAVAILABLE'
        job.lease = 'released' // All live streams and the capture have settled before this point.
        await this.persist(job); this.emit(job)
        // Preserve a complete candidate even if acknowledgment failed; never infer transfer success.
        if (!job.manifest) for (const name of ['candidate.partial','capture.sqlite','inspection']) await this.removeOwned(job, name).catch(() => {})
      } finally { this.active = undefined }
    }
  }
  private async removeOwned(job: SnapshotJob, name: 'candidate.partial' | 'capture.sqlite' | 'inspection'): Promise<void> {
    const folder = this.folder(job.id)
    await contained(this.source.root, folder, true)
    const path = join(folder, name)
    await contained(folder, path, name === 'inspection')
    await rm(path, { recursive: name === 'inspection' })
  }
  cancel(id: string): Promise<void> { return this.control(() => this.cancelUnlocked(id)) }
  private async cancelUnlocked(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job || !['queued','running'].includes(job.state)) return
    if (this.active?.job.id === id) {
      job.state = 'cancelling'; this.active.controller.abort()
      // The running task owns terminal persistence, avoiding out-of-order state overwrites.
      this.emit(job)
    } else {
      this.pending = this.pending.filter(item => item.id !== id)
      job.state = 'cancelled'; job.error = 'CANCELLED'; job.lease = 'released'
      await this.persist(job); this.emit(job)
    }
  }
  async stop(): Promise<void> {
    this.stopping = true
    // Disk-full journal failures must not prevent aborting the remaining streams and releasing locks.
    for (const job of [...this.pending]) await this.cancel(job.id).catch(() => {})
    if (this.active) await this.cancel(this.active.job.id).catch(() => {})
    await this.task?.catch(() => {})
  }
  candidate(id: string): string {
    const job = this.jobs.get(id)
    if (job?.state !== 'completed' || !job.manifest) throw new SnapshotError('UNAVAILABLE')
    return join(this.folder(id), 'candidate.collie')
  }
  async discardTransferredCandidate(id: string, snapshotId: string): Promise<void> {
    const job = this.jobs.get(id)
    if (job?.state !== 'completed' || job.manifest?.snapshotId !== snapshotId) throw new SnapshotError('UNAVAILABLE')
    const path = this.candidate(id)
    await contained(this.source.root, path, false)
    // Stage 6 calls only after verified destination replacement and durable save acknowledgment.
    await rm(path)
  }
}
