import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createReadStream, watch, type FSWatcher } from 'node:fs'
import { link, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError, projectError } from '../../domain/projects/errors'
import { type OpenInput, type ProjectCode } from '../../shared/projects'
import { sameScope, type FileChoice, type FileJobView, type FileStatus, type SaveInput } from '../../shared/project-files'
import type { FileCommand, FileGrant } from '../../shared/file-worker'
import { contained, directory, syncDirectory } from '../storage/files'
import { requestDigest } from '../storage/digest'
import { extractArchive } from './archive'
import { cancelled, SnapshotError } from './manifest'
import { ARCHIVE_BYTES, destinationView, observe, sameGeneration, selectedPath, type SavedLocation } from './file-state'
import { requireDestinationVolume } from './destination-volume'
import { requireSpace, transfer } from './streams'
import { promoteIncoming } from './incoming'
import { persistIntent, readIntent, type SaveIntent } from './save-intent'
import type { ProjectRepository } from './repository'
import type { SnapshotJob } from './snapshot-jobs'

type Running = { view: FileJobView; controller: AbortController; task?: Promise<void>; challenge: string | null; answer?: (choice: FileChoice | 'overwrite') => void }
function fileError(error: unknown): ProjectCode {
  if (error instanceof SnapshotError) return error.code
  const code = projectError(error)
  return code === 'NOT_FOUND' || code === 'DENIED' || code === 'UNAVAILABLE' ? 'DESTINATION_UNAVAILABLE' : code
}
async function present(path: string): Promise<boolean> { try { await lstat(path); return true } catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return false; throw error } }

/** One owned file operation at a time. Long work runs outside the IPC queue; capture uses the repository boundary. */
export class ProjectFiles {
  private scope: OpenInput | null = null
  private state: FileStatus['state'] = 'unsaved'
  private running: Running | undefined
  private last: FileJobView | null = null
  private watcher: FSWatcher | undefined
  private watchPath: string | null = null
  private watchTimer: ReturnType<typeof setTimeout> | undefined
  private needsCheck = true
  private stopping = false
  private readonly operations = new Map<string, string>()
  private readonly results = new Map<string, FileJobView>()
  constructor(private readonly root: string, private readonly repository: ProjectRepository, private readonly changed: (status: FileStatus) => void, private readonly nativeBinding?: string) {}
  private get jobsRoot(): string { return join(this.root, 'file-operations') }
  async initialize(): Promise<void> { await directory(this.root, this.jobsRoot); await syncDirectory(this.root) }
  beforeProjectChange(): void {
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watcher?.close(); this.watcher = undefined; this.watchPath = null
    this.scope = null; this.state = 'unsaved'; this.needsCheck = true
  }
  private folder(id: string): string { return join(this.jobsRoot, id) }
  current(): FileStatus {
    const context = this.scope ? this.repository.fileContext(this.scope) : null
    let state = this.state
    if (state === 'saved' || state === 'pending') state = context?.destination?.headCommitId === context?.head ? 'saved' : 'pending'
    return { scope: this.scope, destination: destinationView(context?.destination ?? null), state, job: this.running?.view ?? this.last }
  }
  private emit(): void { try { this.changed(this.current()) } catch { /* Window/transport loss cannot change durable state. */ } }
  private attach(scope: OpenInput | null): void {
    if (sameScope(scope, this.scope)) return
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    const destination = scope ? this.repository.fileContext(scope).destination : null
    this.scope = scope; this.state = destination ? 'checking' : 'unsaved'; this.needsCheck = true
    this.watcher?.close(); this.watcher = undefined; this.watchPath = null
  }
  private watchDestination(): void {
    const path = this.scope ? this.repository.fileContext(this.scope).destination?.path ?? null : null
    if (path === this.watchPath && this.watcher) return
    this.watcher?.close(); this.watcher = undefined; this.watchPath = path
    if (!path) return
    try {
      this.watcher = watch(dirname(path), { persistent: false }, (_event, name) => {
        if (name && name.toString().toLowerCase() !== basename(path).toLowerCase()) return
        this.needsCheck = true
        if (this.watchTimer) clearTimeout(this.watchTimer)
        this.watchTimer = setTimeout(() => { if (!this.running && this.scope && !this.stopping) { try { this.startCheck(this.scope) } catch { this.needsCheck = true } } }, 1000)
      })
      this.watcher.on('error', () => { this.needsCheck = true; this.watcher?.close(); this.watcher = undefined })
    } catch { this.needsCheck = true } // Missing watchers never remove Save/Open generation checks.
  }
  private begin(id: string, kind: FileJobView['kind'], scope: OpenInput | null, path: string, work: (running: Running) => Promise<void>): FileStatus {
    if (this.stopping || this.running) throw new ProjectError('PROJECT_LOCKED')
    this.attach(scope)
    const running: Running = { view: { id, kind, scope, path, state: 'running', phase: 'reading', bytes: 0, capturedHead: null, error: null, inspection: null, opened: null, cancellable: true }, controller: new AbortController(), challenge: null }
    this.running = running; this.repository.holdFiles(true)
    running.task = Promise.resolve().then(() => work(running)).then(() => { running.view.state = 'completed'; running.view.phase = 'done' }).catch(error => {
      running.view.error = running.controller.signal.aborted ? 'CANCELLED' : fileError(error)
      running.view.state = running.view.error === 'CANCELLED' ? 'cancelled' : 'failed'
      if (kind === 'save' || kind === 'check' || kind === 'locate') {
        if (running.view.error === 'EXTERNAL_CHANGE') this.state = 'external-change'
        else if (running.view.error === 'JOB_INTERRUPTED') this.state = 'interrupted'
        else if (running.view.error !== 'CANCELLED' && running.view.error !== 'STALE_REVISION') this.state = 'unavailable'
        else if (kind === 'check') { this.state = 'unavailable'; this.needsCheck = true }
      }
    }).finally(() => {
      running.view.cancellable = false; this.last = running.view; this.running = undefined
      if (kind !== 'check') {
        this.results.set(id, structuredClone(running.view))
        if (this.results.size > 64) this.results.delete(this.results.keys().next().value!)
      }
      this.repository.holdFiles(false); this.watchDestination(); this.emit()
    })
    this.emit(); return this.current()
  }
  private progress(running: Running): (bytes: number) => void {
    let last = 0
    return bytes => { running.view.bytes += bytes; if (Date.now() - last > 150) { last = Date.now(); this.emit() } }
  }
  private async choice(running: Running, consent: boolean): Promise<FileChoice | 'overwrite'> {
    cancelled(running.controller.signal)
    running.view.state = consent ? 'awaiting-consent' : 'awaiting-choice'
    running.challenge = consent ? randomUUID() : null
    const answer = new Promise<FileChoice | 'overwrite'>(resolve => { running.answer = resolve })
    this.emit()
    const value = await answer
    running.answer = undefined; running.challenge = null; running.view.state = 'running'; this.emit()
    if (value === 'cancel') throw new SnapshotError('CANCELLED')
    cancelled(running.controller.signal)
    return value
  }
  consentChallenge(id: string): string | null { return this.running?.view.id === id && this.running.view.state === 'awaiting-consent' ? this.running.challenge : null }
  private remember(id: string, digest: string): boolean {
    const prior = this.operations.get(id)
    if (prior && prior !== digest) throw new ProjectError('OPERATION_CONFLICT')
    if (prior) return true
    if (this.operations.size >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
    this.operations.set(id, digest); return false
  }
  private priorResult(id: string): FileStatus {
    const job = this.running?.view.id === id ? this.running.view : this.results.get(id)
    if (!job) throw new ProjectError('JOB_INTERRUPTED')
    return { ...this.current(), job }
  }
  async command(command: FileCommand): Promise<FileStatus> {
    if (!['status','cancel','answer'].includes(command.kind) && this.running?.view.kind === 'check') {
      this.running.controller.abort()
      await this.running.task
    }
    switch (command.kind) {
      case 'status': {
        this.attach(command.scope)
        if (command.recheck) this.needsCheck = true
        if (command.scope && this.needsCheck && !this.running) this.startCheck(command.scope)
        this.watchDestination(); return this.current()
      }
      case 'save': return this.save(command.input, command.grant)
      case 'open': return this.open(command.operationId, command.grant)
      case 'locate': return this.open(command.operationId, command.grant, command.scope)
      case 'inspect': {
        const destination = this.repository.fileContext(command.scope).destination
        if (!destination) throw new ProjectError('DESTINATION_UNAVAILABLE')
        return this.open(command.operationId, { id: destination.grantId, path: destination.path, purpose: 'open', scope: null }, undefined, command.scope)
      }
      case 'cancel': {
        const job = this.running
        if (job?.view.id !== command.id) return this.current()
        if (job.view.cancellable) { job.controller.abort(); job.answer?.('cancel') }
        return this.current()
      }
      case 'answer': {
        const job = this.running
        if (!job || job.view.id !== command.id || !job.answer) throw new ProjectError('STALE_REVISION')
        if (job.view.state === 'awaiting-consent' && (command.choice !== 'overwrite' && command.choice !== 'cancel' || command.challenge !== job.challenge)) throw new ProjectError('DENIED')
        if (job.view.state === 'awaiting-choice' && command.choice === 'overwrite') throw new ProjectError('DENIED')
        job.answer(command.choice); job.answer = undefined; return this.current()
      }
    }
  }
  private startCheck(scope: OpenInput): void {
    const path = this.repository.fileContext(scope).destination?.path ?? ''
    this.needsCheck = false; this.state = 'checking'
    this.begin(randomUUID(), 'check', scope, path, async running => {
      const signal = running.controller.signal
      const unresolved = await this.reconcile(scope, signal)
      const destination = this.repository.fileContext(scope).destination
      if (!destination) { this.state = unresolved ? 'interrupted' : 'unsaved'; return }
      const path = await selectedPath(this.root, destination.path)
      if (path !== destination.path || !sameGeneration(await observe(path, signal, this.progress(running)), destination.fingerprint)) throw new ProjectError(await present(path) ? 'EXTERNAL_CHANGE' : 'DESTINATION_UNAVAILABLE')
      this.state = unresolved ? 'interrupted' : 'saved'
    })
  }
  private async reconcile(scope: OpenInput, signal: AbortSignal): Promise<boolean> {
    let unresolved = false
    const names = await readdir(this.jobsRoot)
    if (names.length > 10000) throw new ProjectError('LIMIT_EXCEEDED')
    for (const id of names.filter(isId)) {
      cancelled(signal)
      const folder = this.folder(id)
      if (!await present(join(folder, 'save.json'))) continue
      let intent: SaveIntent
      try { intent = await readIntent(this.root, folder) } catch { unresolved = true; continue }
      if (intent.id !== id) { unresolved = true; continue }
      if (!sameScope(intent.scope, scope) || intent.phase === 'acknowledged') continue
      try {
      const current = this.repository.fileContext(scope).destination
      if (current?.generationId === id) { intent.phase = 'acknowledged'; await persistIntent(folder, intent); continue }
      if ((current?.generationId ?? null) !== intent.priorGeneration) continue // A later confirmed mapping wins, never an older intent.
      if (!['replacing','replaced'].includes(intent.phase) || !intent.snapshotId || !intent.head || !intent.candidateHash) { unresolved = true; continue }
      const path = await selectedPath(this.root, intent.path)
      if (path !== intent.path) { unresolved = true; continue }
      // A new-file publication can stop between link and unlink. Remove only its owned staging alias.
      const stage = join(dirname(path), `.collie-${id}.staging`)
      if (intent.expected === null && await present(path) && await present(stage)) {
        const targetInfo = await lstat(path), stageInfo = await lstat(stage)
        if (targetInfo.isFile() && !targetInfo.isSymbolicLink() && stageInfo.isFile() && !stageInfo.isSymbolicLink() && targetInfo.nlink === 2 && targetInfo.ino === stageInfo.ino && targetInfo.dev === stageInfo.dev) { await unlink(stage); await syncDirectory(dirname(path)) }
      }
      const observed = await observe(path, signal)
      if (!observed || observed.sha256 !== intent.candidateHash) { unresolved = true; continue }
      // A fingerprint match alone is not enough to reconcile a replaced-but-unacknowledged archive.
      const inspection = join(folder, `reconcile-${randomUUID()}`)
      const manifest = await extractArchive(path, inspection, this.nativeBinding, signal)
      if (manifest.projectId !== scope.projectId || manifest.snapshotId !== intent.snapshotId || manifest.headCommitId !== intent.head || !sameGeneration(observed, await observe(path, signal))) { unresolved = true; continue }
      await this.repository.acknowledgeFile(scope, { path, snapshotId: intent.snapshotId, headCommitId: intent.head, generationId: id, fingerprint: observed, grantId: intent.grantId })
      intent.phase = 'acknowledged'; await persistIntent(folder, intent)
      await rm(inspection, { recursive: true }).catch(() => {})
      } catch {
        cancelled(signal)
        unresolved = true // An unreachable old destination cannot prevent Save As to a new one.
      }
    }
    return unresolved
  }
  private save(input: SaveInput, grant: FileGrant | null): FileStatus {
    const context = this.repository.fileContext(input.scope)
    if (grant && (grant.purpose !== 'save' || !sameScope(grant.scope, input.scope) || input.token !== grant.id)) throw new ProjectError('DENIED')
    if (!grant && (input.token !== null || !context.destination)) throw new ProjectError('DESTINATION_UNAVAILABLE')
    const path = grant?.path ?? context.destination!.path
    const digest = requestDigest({ ...input, token: grant?.id ?? null, path })
    if (this.operations.has(input.operationId)) { this.remember(input.operationId, digest); return this.priorResult(input.operationId) }
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    this.remember(input.operationId, digest)
    return this.begin(input.operationId, 'save', input.scope, path, async running => {
      const signal = running.controller.signal, progress = this.progress(running), folder = this.folder(input.operationId)
      if (await present(folder)) {
        const prior = await readIntent(this.root, folder)
        if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        await this.reconcile(input.scope, signal)
        if (this.repository.fileContext(input.scope).destination?.generationId === input.operationId) { this.state = 'saved'; return }
        throw new ProjectError('JOB_INTERRUPTED')
      }
      await this.reconcile(input.scope, signal)
      const destination = this.repository.fileContext(input.scope).destination
      if ((destination?.generationId ?? null) !== input.expectedGeneration) throw new ProjectError('STALE_REVISION')
      const target = await selectedPath(this.root, path)
      running.view.path = target
      await requireDestinationVolume(target)
      const expected = await observe(target, signal, progress)
      const replacingAssigned = !!destination && (target === destination.path || !!expected && expected.dev === destination.fingerprint.dev && expected.ino === destination.fingerprint.ino)
      if ((!grant || replacingAssigned) && !sameGeneration(expected, destination?.fingerprint ?? null)) throw new ProjectError(expected ? 'EXTERNAL_CHANGE' : 'DESTINATION_UNAVAILABLE')
      // Save As to an existing unrelated file always gets generation-bound native consent.
      if (grant && !replacingAssigned && expected && await this.choice(running, true) !== 'overwrite') throw new SnapshotError('CANCELLED')
      cancelled(signal)
      await mkdir(folder, { mode: 0o700 }); await syncDirectory(this.jobsRoot)
      const intent: SaveIntent = { version: 1, id: input.operationId, digest, scope: input.scope, path: target, grantId: grant?.id ?? destination!.grantId, priorGeneration: destination?.generationId ?? null, expected, phase: 'capturing', snapshotId: null, head: null, candidateHash: null, snapshotJob: null }
      await persistIntent(folder, intent)
      running.view.phase = 'capture'; this.emit()
      const jobs = this.repository.snapshotJobs(input.scope)
      const captureStartBytes = running.view.bytes
      const unsubscribe = jobs.subscribe(job => {
        if (intent.snapshotJob && job.id !== intent.snapshotJob) return
        running.view.phase = job.phase === 'capture' || job.phase === 'waiting' ? 'capture' : 'archive'
        running.view.capturedHead = job.capturedHead; running.view.bytes = captureStartBytes + job.bytesProcessed; this.emit()
      })
      let snapshot: SnapshotJob
      try {
        const queued = await this.repository.queueSnapshot(input.scope, { operationId: input.operationId, minimumHeadCommitId: input.minimumHead, parentSnapshotId: destination?.snapshotId ?? null })
        intent.snapshotJob = queued.id; await persistIntent(folder, intent)
        snapshot = await jobs.finish(queued.id, signal)
      } catch (error) {
        if (intent.snapshotJob) {
          await jobs.cancel(intent.snapshotJob).catch(() => {})
          await jobs.finish(intent.snapshotJob, signal).catch(() => {})
        }
        throw error
      } finally { unsubscribe() }
      if (!snapshot.manifest) throw new ProjectError('INVALID_ARCHIVE')
      cancelled(signal)
      intent.snapshotId = snapshot.manifest.snapshotId; intent.head = snapshot.manifest.headCommitId
      running.view.capturedHead = intent.head; running.view.phase = 'staging'; this.emit()
      const candidate = jobs.candidate(snapshot.id)
      await contained(this.root, candidate, false)
      const candidateInfo = await lstat(candidate)
      const destinationBytes = candidateInfo.size + Number(expected?.size ?? 0)
      const sharedVolume = (await lstat(folder)).dev === (await lstat(dirname(target))).dev
      await requireSpace(dirname(target), destinationBytes)
      await requireSpace(folder, candidateInfo.size * 2 + (sharedVolume ? destinationBytes : 0))
      const staging = join(dirname(target), `.collie-${intent.id}.staging`)
      const previous = join(dirname(target), `.collie-${intent.id}.previous.collie`)
      if (await selectedPath(this.root, target) !== target) throw new ProjectError('EXTERNAL_CHANGE')
      const hash = await transfer(createReadStream(candidate), staging, ARCHIVE_BYTES, signal, progress)
      intent.candidateHash = hash.sha256
      // Reopen the sibling stage through the full archive validator before replacing anything.
      const staged = await extractArchive(staging, join(folder, 'stage-inspection'), this.nativeBinding, signal, progress)
      if (staged.snapshotId !== intent.snapshotId || staged.headCommitId !== intent.head || staged.projectId !== input.scope.projectId) throw new ProjectError('INVALID_ARCHIVE')
      intent.phase = 'staged'; await persistIntent(folder, intent); await syncDirectory(dirname(target))
      if (!sameGeneration(expected, await observe(target, signal, progress))) throw new ProjectError('EXTERNAL_CHANGE')
      if (expected) {
        const retained = await observe(target, signal, progress, previous)
        if (!sameGeneration(expected, retained) || (await observe(previous, signal, progress))?.sha256 !== expected.sha256) throw new ProjectError('EXTERNAL_CHANGE')
        await syncDirectory(dirname(target))
      }
      cancelled(signal)
      if ((await observe(staging, signal, progress))?.sha256 !== intent.candidateHash) throw new ProjectError('EXTERNAL_CHANGE')
      intent.phase = 'replacing'; await persistIntent(folder, intent)
      // Final generation/parent check occurs after intent and retention are durable.
      if (await selectedPath(this.root, target) !== target || !sameGeneration(expected, await observe(target, signal, progress))) throw new ProjectError('EXTERNAL_CHANGE')
      cancelled(signal)
      running.view.cancellable = false; running.view.phase = 'replacing'; this.emit()
      if (expected) {
        // POSIX rename / libuv MoveFileExW(REPLACE_EXISTING). No unlink-first gap.
        await rename(staging, target)
      } else {
        // First publication must never clobber a file that appeared after the missing-file check.
        try { await link(staging, target) } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') throw new ProjectError('EXTERNAL_CHANGE')
          throw new ProjectError('UNSAFE_DESTINATION')
        }
        await unlink(staging)
      }
      await syncDirectory(dirname(target))
      intent.phase = 'replaced'; await persistIntent(folder, intent)
      running.view.phase = 'verifying'; this.emit()
      // Cancellation stops at replacement: finish acknowledgment or retain an unknown-outcome intent.
      const final = await observe(target, undefined, progress)
      if (!final || final.sha256 !== intent.candidateHash) throw new ProjectError('EXTERNAL_CHANGE')
      const reopened = await extractArchive(target, join(folder, 'final-inspection'), this.nativeBinding, undefined, progress)
      if (reopened.projectId !== input.scope.projectId || reopened.snapshotId !== intent.snapshotId || reopened.headCommitId !== intent.head || !sameGeneration(final, await observe(target, undefined, progress))) throw new ProjectError('EXTERNAL_CHANGE')
      await this.repository.acknowledgeFile(input.scope, { path: target, snapshotId: intent.snapshotId, headCommitId: intent.head, generationId: intent.id, fingerprint: final, grantId: intent.grantId })
      intent.phase = 'acknowledged'; await persistIntent(folder, intent)
      this.state = 'saved'; this.needsCheck = false
      // Only redundant app-owned copies go away after durable acknowledgment. Previous file stays.
      await jobs.discardTransferredCandidate(snapshot.id, intent.snapshotId).catch(() => {})
      for (const name of ['stage-inspection','final-inspection']) await rm(join(folder, name), { recursive: true }).catch(() => {})
    })
  }
  private open(operationId: string, grant: FileGrant, locate?: OpenInput, inspect?: OpenInput): FileStatus {
    if (grant.purpose !== (locate ? 'locate' : 'open') || locate && !sameScope(locate, grant.scope)) throw new ProjectError('DENIED')
    const scope = locate ?? inspect ?? this.scope
    if (locate) this.repository.fileContext(locate)
    const digest = requestDigest({ grant, locate: locate ?? null, inspect: inspect ?? null })
    if (this.operations.has(operationId)) { this.remember(operationId, digest); return this.priorResult(operationId) }
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    this.remember(operationId, digest)
    return this.begin(operationId, locate ? 'locate' : inspect ? 'inspect' : 'open', scope, grant.path, async running => {
      const signal = running.controller.signal, progress = this.progress(running), folder = this.folder(operationId)
      const path = await selectedPath(this.root, grant.path)
      running.view.path = path
      await mkdir(folder, { mode: 0o700 }); await syncDirectory(this.jobsRoot)
      const localArchive = join(folder, 'incoming.collie')
      const info = await lstat(path)
      if (info.size > ARCHIVE_BYTES) throw new ProjectError('LIMIT_EXCEEDED')
      await requireSpace(folder, info.size)
      // Reading hydrates placeholders through the OS. All later parsing uses this retained local copy.
      const generation = await observe(path, signal, progress, localArchive)
      if (!generation) throw new ProjectError('DESTINATION_UNAVAILABLE')
      const staging = join(folder, 'incoming')
      const manifest = await extractArchive(localArchive, staging, this.nativeBinding, signal, progress)
      const db = new Database(join(staging, 'project.sqlite'), { nativeBinding: this.nativeBinding, readonly: true, fileMustExist: true })
      let title: string
      try { db.pragma('trusted_schema=OFF'); title = (db.prepare('SELECT title FROM projects').get() as { title: string }).title } finally { db.close() }
      const local = await this.repository.knownProject(manifest.projectId)
      running.view.inspection = { projectId: manifest.projectId, snapshotId: manifest.snapshotId, headCommitId: manifest.headCommitId, title, local }
      if (locate) {
        const current = this.repository.fileContext(locate).destination
        if (!current || manifest.projectId !== locate.projectId || manifest.snapshotId !== current.snapshotId || manifest.headCommitId !== current.headCommitId || generation.sha256 !== current.fingerprint.sha256) throw new ProjectError('EXTERNAL_CHANGE')
        if (!sameGeneration(generation, await observe(path, signal, progress))) throw new ProjectError('EXTERNAL_CHANGE')
        await this.repository.acknowledgeFile(locate, { ...current, path, fingerprint: generation, generationId: randomUUID(), grantId: grant.id })
        this.state = 'saved'; this.needsCheck = false; return
      }
      const choice = await this.choice(running, false)
      if (choice === 'use-local') {
        if (!local) throw new ProjectError('VALIDATION')
        running.view.opened = local; return
      }
      if (choice !== 'open-copy' && (choice !== 'import' || local)) throw new ProjectError('VALIDATION')
      cancelled(signal)
      const copy = choice === 'open-copy'
      let destination: SavedLocation | null = null
      if (!copy) {
        if (!sameGeneration(generation, await observe(path, signal, progress))) throw new ProjectError('EXTERNAL_CHANGE')
        destination = { path, snapshotId: manifest.snapshotId, headCommitId: manifest.headCommitId, generationId: randomUUID(), fingerprint: generation, grantId: grant.id }
      }
      running.view.cancellable = false // Promotion is an atomic local ownership transition.
      running.view.opened = await promoteIncoming(this.root, staging, manifest, copy, destination, this.nativeBinding)
    })
  }
  async stop(): Promise<void> {
    this.stopping = true; this.watcher?.close(); if (this.watchTimer) clearTimeout(this.watchTimer)
    if (this.running?.view.cancellable) { this.running.controller.abort(); this.running.answer?.('cancel') }
    await this.running?.task
  }
}
