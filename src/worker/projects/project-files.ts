import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { createReadStream, watch, type FSWatcher } from 'node:fs'
import { link, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError, projectError } from '../../domain/projects/errors'
import { type OpenInput, type ProjectCode } from '../../shared/projects'
import {
  sameScope,
  type FileChoice,
  type FileJobView,
  type FileStatus,
  type SaveInput
} from '../../shared/project-files'
import type { DataLocations, RecoveryItem } from '../../shared/project-lifecycle'
import type { FileCommand, FileGrant } from '../../shared/file-worker'
import { contained, directory, syncDirectory } from '../storage/files'
import { requestDigest } from '../storage/digest'
import { extractArchive } from './archive'
import { cancelled, SnapshotError } from './manifest'
import {
  ARCHIVE_BYTES,
  destinationView,
  observe,
  sameFileContents,
  sameGeneration,
  selectedPath,
  type SavedLocation
} from './file-state'
import { requireDestinationVolume } from './destination-volume'
import { requireSpace, transfer } from './streams'
import { promoteIncoming } from './incoming'
import { persistIntent, readIntent, type SaveIntent } from './save-intent'
import type { ProjectRepository } from './repository'
import type { SnapshotJob } from './snapshot-jobs'

type Running = {
  view: FileJobView
  controller: AbortController
  task?: Promise<void>
  challenge: string | null
  answer?: (choice: FileChoice | 'overwrite') => void
}
function fileError(error: unknown): ProjectCode {
  if (error instanceof SnapshotError) return error.code
  const code = projectError(error)
  return code === 'NOT_FOUND' || code === 'DENIED' || code === 'UNAVAILABLE'
    ? 'DESTINATION_UNAVAILABLE'
    : code
}
async function present(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}

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
  private artifacts = new Map<string, { path: string; local: boolean; hash: string | null }>()
  private review: { id: string; digest: string } | null = null
  private readonly results = new Map<string, FileJobView>()
  constructor(
    private readonly root: string,
    private readonly repository: ProjectRepository,
    private readonly changed: (status: FileStatus) => void,
    private readonly nativeBinding?: string
  ) {}
  private get jobsRoot(): string {
    return join(this.root, 'file-operations')
  }
  async initialize(): Promise<void> {
    await directory(this.root, this.jobsRoot)
    await syncDirectory(this.root)
  }
  beforeProjectChange(): void {
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.watcher?.close()
    this.watcher = undefined
    this.watchPath = null
    this.scope = null
    this.state = 'unsaved'
    this.needsCheck = true
  }
  private folder(id: string): string {
    return join(this.jobsRoot, id)
  }
  current(): FileStatus {
    const context = this.scope ? this.repository.fileContext(this.scope) : null
    let state = this.state
    if (state === 'saved' || state === 'pending')
      state = context?.destination?.headCommitId === context?.head ? 'saved' : 'pending'
    return {
      scope: this.scope,
      destination: destinationView(context?.destination ?? null),
      state,
      job: this.running?.view ?? this.last
    }
  }
  private emit(): void {
    try {
      this.changed(this.current())
    } catch {
      /* Window/transport loss cannot change durable state. */
    }
  }
  private attach(scope: OpenInput | null): void {
    if (sameScope(scope, this.scope)) return
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    const destination = scope ? this.repository.fileContext(scope).destination : null
    this.scope = scope
    this.state = destination ? 'checking' : 'unsaved'
    this.needsCheck = true
    this.watcher?.close()
    this.watcher = undefined
    this.watchPath = null
  }
  private watchDestination(): void {
    const path = this.scope
      ? (this.repository.fileContext(this.scope).destination?.path ?? null)
      : null
    if (path === this.watchPath && this.watcher) return
    this.watcher?.close()
    this.watcher = undefined
    this.watchPath = path
    if (!path) return
    try {
      this.watcher = watch(dirname(path), { persistent: false }, (_event, name) => {
        if (name && name.toString().toLowerCase() !== basename(path).toLowerCase()) return
        this.needsCheck = true
        if (this.watchTimer) clearTimeout(this.watchTimer)
        this.watchTimer = setTimeout(() => {
          if (!this.running && this.scope && !this.stopping) {
            try {
              this.startCheck(this.scope)
            } catch {
              this.needsCheck = true
            }
          }
        }, 1000)
      })
      this.watcher.on('error', () => {
        this.needsCheck = true
        this.watcher?.close()
        this.watcher = undefined
      })
    } catch {
      this.needsCheck = true
    } // Missing watchers never remove Save/Open generation checks.
  }
  private begin(
    id: string,
    kind: FileJobView['kind'],
    scope: OpenInput | null,
    path: string,
    work: (running: Running) => Promise<void>
  ): FileStatus {
    if (this.stopping || this.running) throw new ProjectError('PROJECT_LOCKED')
    this.attach(scope)
    const running: Running = {
      view: {
        id,
        kind,
        scope,
        path,
        state: 'running',
        phase: 'reading',
        bytes: 0,
        capturedHead: null,
        error: null,
        inspection: null,
        opened: null,
        cancellable: true
      },
      controller: new AbortController(),
      challenge: null
    }
    this.running = running
    this.repository.holdFiles(true)
    running.task = Promise.resolve()
      .then(() => work(running))
      .then(() => {
        running.view.state = 'completed'
        running.view.phase = 'done'
      })
      .catch((error) => {
        running.view.error = running.controller.signal.aborted ? 'CANCELLED' : fileError(error)
        running.view.state = running.view.error === 'CANCELLED' ? 'cancelled' : 'failed'
        if (kind === 'save' || kind === 'move' || kind === 'check' || kind === 'locate') {
          if (running.view.error === 'EXTERNAL_CHANGE') this.state = 'external-change'
          else if (running.view.error === 'JOB_INTERRUPTED') this.state = 'interrupted'
          else if (
            running.view.error !== 'CANCELLED' &&
            running.view.error !== 'STALE_REVISION' &&
            running.view.error !== 'DESTINATION_EXISTS'
          )
            this.state = 'unavailable'
          else if (kind === 'check') {
            this.state = 'unavailable'
            this.needsCheck = true
          }
        }
      })
      .finally(() => {
        running.view.cancellable = false
        this.last = running.view
        this.running = undefined
        if (kind !== 'check') {
          this.results.set(id, structuredClone(running.view))
          if (this.results.size > 64) this.results.delete(this.results.keys().next().value!)
        }
        this.repository.holdFiles(false)
        this.watchDestination()
        this.emit()
      })
    this.emit()
    return this.current()
  }
  private progress(running: Running): (bytes: number) => void {
    let last = 0
    return (bytes) => {
      running.view.bytes += bytes
      if (Date.now() - last > 150) {
        last = Date.now()
        this.emit()
      }
    }
  }
  private async choice(running: Running, consent: boolean): Promise<FileChoice | 'overwrite'> {
    cancelled(running.controller.signal)
    running.view.state = consent ? 'awaiting-consent' : 'awaiting-choice'
    running.challenge = consent ? randomUUID() : null
    const answer = new Promise<FileChoice | 'overwrite'>((resolve) => {
      running.answer = resolve
    })
    this.emit()
    const value = await answer
    running.answer = undefined
    running.challenge = null
    running.view.state = 'running'
    this.emit()
    if (value === 'cancel') throw new SnapshotError('CANCELLED')
    cancelled(running.controller.signal)
    return value
  }
  consentChallenge(id: string): string | null {
    return this.running?.view.id === id && this.running.view.state === 'awaiting-consent'
      ? this.running.challenge
      : null
  }
  private remember(id: string, digest: string): boolean {
    const prior = this.operations.get(id)
    if (prior && prior !== digest) throw new ProjectError('OPERATION_CONFLICT')
    if (prior) return true
    if (this.operations.size >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
    this.operations.set(id, digest)
    return false
  }
  private priorResult(id: string): FileStatus {
    const job = this.running?.view.id === id ? this.running.view : this.results.get(id)
    if (!job) throw new ProjectError('JOB_INTERRUPTED')
    return { ...this.current(), job }
  }
  async command(command: FileCommand): Promise<FileStatus> {
    if (
      !['status', 'cancel', 'answer'].includes(command.kind) &&
      this.running?.view.kind === 'check'
    ) {
      this.running.controller.abort()
      await this.running.task
    }
    switch (command.kind) {
      case 'status': {
        this.attach(command.scope)
        if (command.recheck) this.needsCheck = true
        if (command.scope && this.needsCheck && !this.running) this.startCheck(command.scope)
        this.watchDestination()
        return this.current()
      }
      case 'backup':
      case 'move':
      case 'save':
        return this.save(command.input, command.grant, command.kind)
      case 'restore':
        return this.open(command.operationId, command.grant, undefined, undefined, 'restore')
      case 'open':
        return this.open(command.operationId, command.grant)
      case 'duplicate':
        return this.duplicate(command.operationId, command.scope, command.expectedHead)
      case 'recover': {
        const artifact = this.artifacts.get(command.artifactId)
        if (!artifact) throw new ProjectError('STALE_REVISION')
        return this.open(
          command.operationId,
          { id: command.artifactId, path: artifact.path, purpose: 'restore', scope: null },
          undefined,
          undefined,
          'recover',
          artifact.local,
          artifact.hash
        )
      }
      case 'locate':
        return this.open(command.operationId, command.grant, command.scope)
      case 'inspect': {
        const destination = this.repository.fileContext(command.scope).destination
        if (!destination) throw new ProjectError('DESTINATION_UNAVAILABLE')
        return this.open(
          command.operationId,
          { id: destination.grantId, path: destination.path, purpose: 'open', scope: null },
          undefined,
          command.scope
        )
      }
      case 'cancel': {
        const job = this.running
        if (job?.view.id !== command.id) return this.current()
        if (job.view.cancellable) {
          job.controller.abort()
          job.answer?.('cancel')
        }
        return this.current()
      }
      case 'answer': {
        const job = this.running
        if (!job || job.view.id !== command.id || !job.answer)
          throw new ProjectError('STALE_REVISION')
        if (
          job.view.state === 'awaiting-consent' &&
          ((command.choice !== 'overwrite' && command.choice !== 'cancel') ||
            command.challenge !== job.challenge)
        )
          throw new ProjectError('DENIED')
        if (job.view.state === 'awaiting-choice' && command.choice === 'overwrite')
          throw new ProjectError('DENIED')
        job.answer(command.choice)
        job.answer = undefined
        return this.current()
      }
    }
  }
  private startCheck(scope: OpenInput): void {
    const path = this.repository.fileContext(scope).destination?.path ?? ''
    this.needsCheck = false
    this.state = 'checking'
    this.begin(randomUUID(), 'check', scope, path, async (running) => {
      const signal = running.controller.signal
      const unresolved = await this.reconcile(scope, signal)
      const destination = this.repository.fileContext(scope).destination
      if (!destination) {
        this.state = unresolved ? 'interrupted' : 'unsaved'
        return
      }
      const path = await selectedPath(this.root, destination.path)
      if (
        path !== destination.path ||
        !sameFileContents(
          await observe(path, signal, this.progress(running)),
          destination.fingerprint
        )
      )
        throw new ProjectError(
          (await present(path)) ? 'EXTERNAL_CHANGE' : 'DESTINATION_UNAVAILABLE'
        )
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
      if (!(await present(join(folder, 'save.json')))) continue
      let intent: SaveIntent
      try {
        intent = await readIntent(this.root, folder)
      } catch {
        unresolved = true
        continue
      }
      if (intent.id !== id) {
        unresolved = true
        continue
      }
      if (!sameScope(intent.scope, scope) || intent.phase === 'acknowledged') continue
      try {
        const current = this.repository.fileContext(scope).destination
        if (current?.generationId === id) {
          intent.phase = 'acknowledged'
          await persistIntent(folder, intent)
          continue
        }
        if ((current?.generationId ?? null) !== intent.priorGeneration) continue // A later confirmed mapping wins, never an older intent.
        if (
          !['replacing', 'replaced'].includes(intent.phase) ||
          !intent.snapshotId ||
          !intent.head ||
          !intent.candidateHash
        ) {
          unresolved = true
          continue
        }
        const path = await selectedPath(this.root, intent.path)
        if (path !== intent.path) {
          unresolved = true
          continue
        }
        // A new-file publication can stop between link and unlink. Remove only its owned staging alias.
        const stage = join(dirname(path), `.collie-${id}.staging`)
        if (intent.expected === null && (await present(path)) && (await present(stage))) {
          const targetInfo = await lstat(path),
            stageInfo = await lstat(stage)
          if (
            targetInfo.isFile() &&
            !targetInfo.isSymbolicLink() &&
            stageInfo.isFile() &&
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
        if (!observed || observed.sha256 !== intent.candidateHash) {
          unresolved = true
          continue
        }
        // A fingerprint match alone is not enough to reconcile a replaced-but-unacknowledged archive.
        const inspection = join(folder, `reconcile-${randomUUID()}`)
        const manifest = await extractArchive(path, inspection, this.nativeBinding, signal)
        if (
          manifest.projectId !== scope.projectId ||
          manifest.snapshotId !== intent.snapshotId ||
          manifest.headCommitId !== intent.head ||
          !sameFileContents(observed, await observe(path, signal))
        ) {
          unresolved = true
          continue
        }
        await this.repository.acknowledgeFile(scope, {
          path,
          snapshotId: intent.snapshotId,
          headCommitId: intent.head,
          generationId: id,
          fingerprint: observed,
          grantId: intent.grantId
        })
        intent.phase = 'acknowledged'
        await persistIntent(folder, intent)
        await rm(inspection, { recursive: true }).catch(() => {})
      } catch {
        cancelled(signal)
        unresolved = true // An unreachable old destination cannot prevent Save As to a new one.
      }
    }
    return unresolved
  }
  private save(
    input: SaveInput,
    grant: FileGrant | null,
    mode: 'save' | 'backup' | 'move' = 'save'
  ): FileStatus {
    const context = this.repository.fileContext(input.scope)
    if (
      grant &&
      (grant.purpose !== mode || !sameScope(grant.scope, input.scope) || input.token !== grant.id)
    )
      throw new ProjectError('DENIED')
    if (!grant && (input.token !== null || !context.destination))
      throw new ProjectError('DESTINATION_UNAVAILABLE')
    if (mode !== 'save' && !grant) throw new ProjectError('DENIED')
    if (mode === 'move' && !context.destination) throw new ProjectError('DESTINATION_UNAVAILABLE')
    const backup = mode === 'backup',
      journal = backup ? 'backup.json' : 'save.json'
    const path = grant?.path ?? context.destination!.path
    const digest = requestDigest({ mode, ...input, token: grant?.id ?? null, path })
    if (this.operations.has(input.operationId)) {
      this.remember(input.operationId, digest)
      return this.priorResult(input.operationId)
    }
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    this.remember(input.operationId, digest)
    return this.begin(input.operationId, mode, input.scope, path, async (running) => {
      const signal = running.controller.signal,
        progress = this.progress(running),
        folder = this.folder(input.operationId)
      if (await present(folder)) {
        const prior = await readIntent(this.root, folder, journal)
        if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
        if (backup) throw new ProjectError('JOB_INTERRUPTED')
        await this.reconcile(input.scope, signal)
        if (
          this.repository.fileContext(input.scope).destination?.generationId === input.operationId
        ) {
          this.state = 'saved'
          return
        }
        throw new ProjectError('JOB_INTERRUPTED')
      }
      if (!backup) await this.reconcile(input.scope, signal)
      const destination = this.repository.fileContext(input.scope).destination
      if ((destination?.generationId ?? null) !== input.expectedGeneration)
        throw new ProjectError('STALE_REVISION')
      const target = await selectedPath(this.root, path)
      running.view.path = target
      await requireDestinationVolume(target)
      const expected = await observe(target, signal, progress)
      // Only the assigned path inherits ordinary Save authority. A historical inode
      // may have been reused and cannot authorize another Save As target.
      const replacingAssigned = !!destination && target === destination.path
      if (!grant && target !== destination?.path) throw new ProjectError('EXTERNAL_CHANGE')
      // Explicit Save publishes local work over the currently observed assigned file,
      // retaining that file first. The last save's fingerprint is not an overwrite veto.
      // Still refuse content changes during this operation; metadata-only rewrites are harmless.
      const matchesTarget = replacingAssigned ? sameFileContents : sameGeneration
      // Backup/Move require a fresh filename; neither can replace an assigned file.
      if (mode !== 'save' && (expected || target === destination?.path))
        throw new ProjectError('DESTINATION_EXISTS')
      // Save As to an existing unrelated file always gets generation-bound native consent.
      if (
        grant &&
        !replacingAssigned &&
        expected &&
        (await this.choice(running, true)) !== 'overwrite'
      )
        throw new SnapshotError('CANCELLED')
      cancelled(signal)
      await mkdir(folder, { mode: 0o700 })
      await syncDirectory(this.jobsRoot)
      const intent: SaveIntent = {
        version: 1,
        id: input.operationId,
        digest,
        scope: input.scope,
        path: target,
        grantId: grant?.id ?? destination!.grantId,
        priorGeneration: destination?.generationId ?? null,
        expected,
        phase: 'capturing',
        snapshotId: null,
        head: null,
        candidateHash: null,
        snapshotJob: null
      }
      await persistIntent(folder, intent, journal)
      running.view.phase = 'capture'
      this.emit()
      const jobs = this.repository.snapshotJobs(input.scope)
      const captureStartBytes = running.view.bytes
      const unsubscribe = jobs.subscribe((job) => {
        if (intent.snapshotJob && job.id !== intent.snapshotJob) return
        running.view.phase =
          job.phase === 'capture' || job.phase === 'waiting' ? 'capture' : 'archive'
        running.view.capturedHead = job.capturedHead
        running.view.bytes = captureStartBytes + job.bytesProcessed
        this.emit()
      })
      let snapshot: SnapshotJob
      try {
        const queued = await this.repository.queueSnapshot(input.scope, {
          operationId: input.operationId,
          minimumHeadCommitId: input.minimumHead,
          parentSnapshotId: destination?.snapshotId ?? null,
          ...(backup ? { expectedHeadCommitId: input.minimumHead } : {})
        })
        intent.snapshotJob = queued.id
        await persistIntent(folder, intent, journal)
        snapshot = await jobs.finish(queued.id, signal)
      } catch (error) {
        if (intent.snapshotJob) {
          await jobs.cancel(intent.snapshotJob).catch(() => {})
          await jobs.finish(intent.snapshotJob, signal).catch(() => {})
        }
        throw error
      } finally {
        unsubscribe()
      }
      if (!snapshot.manifest) throw new ProjectError('INVALID_ARCHIVE')
      cancelled(signal)
      intent.snapshotId = snapshot.manifest.snapshotId
      intent.head = snapshot.manifest.headCommitId
      running.view.capturedHead = intent.head
      running.view.phase = 'staging'
      this.emit()
      const candidate = jobs.candidate(snapshot.id)
      await contained(this.root, candidate, false)
      const candidateInfo = await lstat(candidate)
      const destinationBytes = candidateInfo.size + Number(expected?.size ?? 0)
      const sharedVolume = (await lstat(folder)).dev === (await lstat(dirname(target))).dev
      await requireSpace(dirname(target), destinationBytes)
      await requireSpace(folder, candidateInfo.size * 2 + (sharedVolume ? destinationBytes : 0))
      const staging = join(dirname(target), `.collie-${intent.id}.staging`)
      const previous = join(dirname(target), `.collie-${intent.id}.previous.collie`)
      if ((await selectedPath(this.root, target)) !== target)
        throw new ProjectError('EXTERNAL_CHANGE')
      const hash = await transfer(
        createReadStream(candidate),
        staging,
        ARCHIVE_BYTES,
        signal,
        progress
      )
      intent.candidateHash = hash.sha256
      // Reopen the sibling stage through the full archive validator before replacing anything.
      const staged = await extractArchive(
        staging,
        join(folder, 'stage-inspection'),
        this.nativeBinding,
        signal,
        progress
      )
      if (
        staged.snapshotId !== intent.snapshotId ||
        staged.headCommitId !== intent.head ||
        staged.projectId !== input.scope.projectId
      )
        throw new ProjectError('INVALID_ARCHIVE')
      intent.phase = 'staged'
      await persistIntent(folder, intent, journal)
      await syncDirectory(dirname(target))
      if (!matchesTarget(expected, await observe(target, signal, progress)))
        throw new ProjectError('EXTERNAL_CHANGE')
      if (expected) {
        const retained = await observe(target, signal, progress, previous)
        if (
          !matchesTarget(expected, retained) ||
          (await observe(previous, signal, progress))?.sha256 !== expected.sha256
        )
          throw new ProjectError('EXTERNAL_CHANGE')
        await syncDirectory(dirname(target))
      }
      cancelled(signal)
      if ((await observe(staging, signal, progress))?.sha256 !== intent.candidateHash)
        throw new ProjectError('EXTERNAL_CHANGE')
      intent.phase = 'replacing'
      await persistIntent(folder, intent, journal)
      // Final target/parent check occurs after intent and retention are durable.
      if (
        (await selectedPath(this.root, target)) !== target ||
        !matchesTarget(expected, await observe(target, signal, progress))
      )
        throw new ProjectError('EXTERNAL_CHANGE')
      cancelled(signal)
      running.view.cancellable = false
      running.view.phase = 'replacing'
      this.emit()
      if (expected) {
        // POSIX rename / libuv MoveFileExW(REPLACE_EXISTING). No unlink-first gap.
        await rename(staging, target)
      } else {
        // First publication must never clobber a file that appeared after the missing-file check.
        try {
          await link(staging, target)
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')
            throw new ProjectError('EXTERNAL_CHANGE')
          throw new ProjectError('UNSAFE_DESTINATION')
        }
        await unlink(staging)
      }
      await syncDirectory(dirname(target))
      intent.phase = 'replaced'
      await persistIntent(folder, intent, journal)
      running.view.phase = 'verifying'
      this.emit()
      // Cancellation stops at replacement: finish acknowledgment or retain an unknown-outcome intent.
      const final = await observe(target, undefined, progress)
      if (!final || final.sha256 !== intent.candidateHash) throw new ProjectError('EXTERNAL_CHANGE')
      const reopened = await extractArchive(
        target,
        join(folder, 'final-inspection'),
        this.nativeBinding,
        undefined,
        progress
      )
      if (
        reopened.projectId !== input.scope.projectId ||
        reopened.snapshotId !== intent.snapshotId ||
        reopened.headCommitId !== intent.head ||
        !matchesTarget(final, await observe(target, undefined, progress))
      )
        throw new ProjectError('EXTERNAL_CHANGE')
      if (!backup)
        await this.repository.acknowledgeFile(input.scope, {
          path: target,
          snapshotId: intent.snapshotId,
          headCommitId: intent.head,
          generationId: intent.id,
          fingerprint: final,
          grantId: intent.grantId
        })
      intent.phase = 'acknowledged'
      await persistIntent(folder, intent, journal)
      if (!backup) {
        this.state = 'saved'
        this.needsCheck = false
      }
      // Only redundant app-owned copies go away after durable acknowledgment. Previous file stays.
      await jobs.discardTransferredCandidate(snapshot.id, intent.snapshotId).catch(() => {})
      for (const name of ['stage-inspection', 'final-inspection'])
        await rm(join(folder, name), { recursive: true }).catch(() => {})
    })
  }
  private open(
    operationId: string,
    grant: FileGrant,
    locate?: OpenInput,
    inspect?: OpenInput,
    restore?: 'restore' | 'recover',
    localArchiveSource = false,
    expectedHash: string | null = null
  ): FileStatus {
    if (
      grant.purpose !== (locate ? 'locate' : restore ? 'restore' : 'open') ||
      (locate && !sameScope(locate, grant.scope))
    )
      throw new ProjectError('DENIED')
    const scope = locate ?? inspect ?? this.scope
    if (locate) this.repository.fileContext(locate)
    const digest = requestDigest({
      grant,
      restore: restore ?? null,
      localArchiveSource,
      expectedHash,
      locate: locate ?? null,
      inspect: inspect ?? null
    })
    if (this.operations.has(operationId)) {
      this.remember(operationId, digest)
      return this.priorResult(operationId)
    }
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    this.remember(operationId, digest)
    return this.begin(
      operationId,
      locate ? 'locate' : inspect ? 'inspect' : (restore ?? 'open'),
      scope,
      grant.path,
      async (running) => {
        const signal = running.controller.signal,
          progress = this.progress(running),
          folder = this.folder(operationId)
        if (localArchiveSource) await contained(this.root, grant.path, false)
        const path = localArchiveSource ? grant.path : await selectedPath(this.root, grant.path)
        running.view.path = path
        await mkdir(folder, { mode: 0o700 })
        await syncDirectory(this.jobsRoot)
        const localArchive = join(folder, 'incoming.collie')
        const info = await lstat(path)
        if (info.size > ARCHIVE_BYTES) throw new ProjectError('LIMIT_EXCEEDED')
        await requireSpace(folder, info.size)
        // Reading hydrates placeholders through the OS. All later parsing uses this retained local copy.
        const generation = await observe(path, signal, progress, localArchive)
        if (!generation) throw new ProjectError('DESTINATION_UNAVAILABLE')
        if (expectedHash && generation.sha256 !== expectedHash)
          throw new ProjectError('EXTERNAL_CHANGE')
        const staging = join(folder, 'incoming')
        const manifest = await extractArchive(
          localArchive,
          staging,
          this.nativeBinding,
          signal,
          progress
        )
        const db = new Database(join(staging, 'project.sqlite'), {
          nativeBinding: this.nativeBinding,
          readonly: true,
          fileMustExist: true
        })
        let title: string
        try {
          db.pragma('trusted_schema=OFF')
          title = (db.prepare('SELECT title FROM projects').get() as { title: string }).title
        } finally {
          db.close()
        }
        const local = restore ? null : await this.repository.knownProject(manifest.projectId)
        running.view.inspection = {
          projectId: manifest.projectId,
          snapshotId: manifest.snapshotId,
          headCommitId: manifest.headCommitId,
          title,
          local
        }
        if (locate) {
          const current = this.repository.fileContext(locate).destination
          if (
            !current ||
            manifest.projectId !== locate.projectId ||
            manifest.snapshotId !== current.snapshotId ||
            manifest.headCommitId !== current.headCommitId ||
            generation.sha256 !== current.fingerprint.sha256
          )
            throw new ProjectError('EXTERNAL_CHANGE')
          if (!sameGeneration(generation, await observe(path, signal, progress)))
            throw new ProjectError('EXTERNAL_CHANGE')
          await this.repository.acknowledgeFile(locate, {
            ...current,
            path,
            fingerprint: generation,
            generationId: randomUUID(),
            grantId: grant.id
          })
          this.state = 'saved'
          this.needsCheck = false
          return
        }
        const choice = await this.choice(running, false)
        if (restore && choice !== 'open-copy') throw new ProjectError('VALIDATION')
        if (choice === 'use-local') {
          if (!local) throw new ProjectError('VALIDATION')
          running.view.opened = local
          return
        }
        if (choice !== 'open-copy' && (choice !== 'import' || local))
          throw new ProjectError('VALIDATION')
        cancelled(signal)
        const copy = choice === 'open-copy'
        let destination: SavedLocation | null = null
        if (!copy) {
          if (!sameGeneration(generation, await observe(path, signal, progress)))
            throw new ProjectError('EXTERNAL_CHANGE')
          destination = {
            path,
            snapshotId: manifest.snapshotId,
            headCommitId: manifest.headCommitId,
            generationId: randomUUID(),
            fingerprint: generation,
            grantId: grant.id
          }
        }
        running.view.cancellable = false // Promotion is an atomic local ownership transition.
        running.view.opened = await promoteIncoming(
          this.root,
          staging,
          manifest,
          copy,
          destination,
          this.nativeBinding
        )
      }
    )
  }
  private duplicate(operationId: string, scope: OpenInput, expectedHead: string): FileStatus {
    const digest = requestDigest({ kind: 'duplicate', scope, expectedHead })
    if (this.operations.has(operationId)) {
      this.remember(operationId, digest)
      return this.priorResult(operationId)
    }
    const context = this.repository.fileContext(scope)
    if (context.head !== expectedHead) throw new ProjectError('STALE_REVISION')
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    this.remember(operationId, digest)
    return this.begin(operationId, 'duplicate', scope, '', async (running) => {
      const folder = this.folder(operationId),
        signal = running.controller.signal
      await mkdir(folder, { mode: 0o700 })
      await syncDirectory(this.jobsRoot)
      const jobs = this.repository.snapshotJobs(scope)
      running.view.phase = 'capture'
      this.emit()
      const unsubscribe = jobs.subscribe((job) => {
        running.view.phase = job.phase === 'archive' ? 'archive' : 'capture'
        running.view.bytes = job.bytesProcessed
        running.view.capturedHead = job.capturedHead
        this.emit()
      })
      let id: string | undefined
      try {
        const job = await this.repository.queueSnapshot(scope, {
          operationId,
          minimumHeadCommitId: expectedHead,
          expectedHeadCommitId: expectedHead,
          parentSnapshotId: context.destination?.snapshotId ?? null
        })
        id = job.id
        const snapshot = await jobs.finish(id, signal)
        const staging = join(folder, 'duplicate')
        running.view.phase = 'verifying'
        running.view.capturedHead = snapshot.capturedHead
        this.emit()
        const manifest = await extractArchive(
          jobs.candidate(id),
          staging,
          this.nativeBinding,
          signal,
          this.progress(running)
        )
        if (manifest.headCommitId !== expectedHead || manifest.projectId !== scope.projectId)
          throw new ProjectError('STALE_REVISION')
        cancelled(signal)
        running.view.cancellable = false
        running.view.opened = await promoteIncoming(
          this.root,
          staging,
          manifest,
          true,
          null,
          this.nativeBinding
        )
        // The source candidate remains a complete recovery checkpoint.
      } catch (error) {
        if (id) {
          await jobs.cancel(id).catch(() => {})
          await jobs.finish(id, signal).catch(() => {})
        }
        throw error
      } finally {
        unsubscribe()
      }
    })
  }
  async overview(): Promise<DataLocations> {
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    const projects = await this.repository.list(),
      items: RecoveryItem[] = []
    const artifacts = new Map<string, { path: string; local: boolean; hash: string | null }>()
    let issues = 0
    const add = (
      kind: RecoveryItem['kind'],
      path: string,
      projectId: string | null,
      head: string | null,
      status: string,
      local: boolean,
      hash: string | null = null
    ): void => {
      if (items.length >= 10000) {
        issues++
        return
      }
      const id = randomUUID()
      artifacts.set(id, { path, local, hash })
      items.push({ id, kind, path, projectId, head, status })
    }
    const names = await readdir(this.jobsRoot)
    if (names.length > 10000) throw new ProjectError('LIMIT_EXCEEDED')
    for (const id of names.filter(isId)) {
      const folder = this.folder(id)
      try {
        await contained(this.root, folder, true)
        for (const journal of ['save.json', 'backup.json'] as const) {
          if (!(await present(join(folder, journal)))) continue
          const intent = await readIntent(this.root, folder, journal)
          if (intent.id !== id) throw new ProjectError('JOB_INTERRUPTED')
          const local = projects.projects.find((p) =>
            sameScope({ projectId: p.projectId, workspaceId: p.workspaceId }, intent.scope)
          )
          // Reconcile local acknowledgment at startup without hydrating every external destination.
          if (
            journal === 'save.json' &&
            local?.destination?.generationId === id &&
            local.destination.snapshotId === intent.snapshotId &&
            local.destination.headCommitId === intent.head &&
            intent.phase !== 'acknowledged'
          ) {
            intent.phase = 'acknowledged'
            await persistIntent(folder, intent)
          }
          if (intent.phase !== 'acknowledged') issues++
          if (journal === 'backup.json')
            add(
              'backup',
              intent.path,
              intent.scope.projectId,
              intent.head,
              intent.phase === 'acknowledged'
                ? 'Verified when written; inspect to check the current file.'
                : 'Interrupted backup; inspect before using.',
              false,
              intent.candidateHash
            )
          if (intent.expected)
            add(
              'previous',
              join(dirname(intent.path), `.collie-${id}.previous.collie`),
              null,
              null,
              'Previous-copy location; incomplete saves may not have written it. Inspect to check.',
              false,
              intent.expected.sha256
            )
        }
        if (await present(join(folder, 'incoming.collie')))
          add(
            'incoming',
            join(folder, 'incoming.collie'),
            null,
            null,
            'Retained incoming file; inspection validates it again.',
            true
          )
      } catch {
        issues++
      }
    }
    for (const p of projects.projects) {
      const folder = join(this.root, 'workspaces', p.projectId, p.workspaceId, 'snapshots')
      try {
        await contained(this.root, folder, true)
        const names = await readdir(folder)
        if (names.length > 10000) throw new ProjectError('LIMIT_EXCEEDED')
        for (const id of names.filter(isId)) {
          const path = join(folder, id, 'candidate.collie')
          if (await present(path)) {
            await contained(this.root, path, false)
            add(
              'candidate',
              path,
              p.projectId,
              null,
              'Retained snapshot; inspection reads its actual revision.',
              true
            )
          }
        }
      } catch {
        issues++
      }
    }
    const resets: DataLocations['resets'] = [],
      resetRoot = join(this.root, 'reset-recovery')
    if (await present(resetRoot)) {
      await contained(this.root, resetRoot, true)
      const names = await readdir(resetRoot)
      if (names.length > 10000) throw new ProjectError('LIMIT_EXCEEDED')
      for (const id of names.filter(isId)) {
        try {
          const path = join(resetRoot, id, 'workspaces')
          await contained(this.root, path, true)
          const count = (await readdir(path)).filter(isId).length
          if (count) resets.push({ id, projects: count })
        } catch {
          issues++
        }
      }
    }
    // Metadata-only size accounting. Never follow links or classify recovery as disposable cache.
    let bytes = 0,
      visited = 0,
      sizeComplete = true
    const pending = [this.root],
      deadline = Date.now() + 1500
    while (pending.length && visited < 200000 && Date.now() < deadline) {
      const path = pending.pop()!
      visited++
      try {
        const info = await lstat(path)
        if (info.isSymbolicLink()) {
          sizeComplete = false
          continue
        }
        if (info.isDirectory()) {
          await contained(this.root, path, true)
          const names = await readdir(path)
          if (pending.length + names.length + visited > 200000) {
            sizeComplete = false
            continue
          }
          for (const name of names) pending.push(join(path, name))
        } else if (info.isFile()) bytes += info.size
      } catch {
        sizeComplete = false
      }
    }
    if (pending.length) sizeComplete = false
    this.artifacts = artifacts
    this.review = { id: randomUUID(), digest: requestDigest(projects) }
    return {
      root: this.root,
      bytes,
      sizeComplete,
      projects,
      items,
      issues,
      resets,
      review: this.review.id
    }
  }
  async reset(review: string): Promise<DataLocations> {
    if (this.running?.view.kind === 'check') {
      this.running.controller.abort()
      await this.running.task
    }
    if (!this.review || this.review.id !== review || this.running)
      throw new ProjectError('STALE_REVISION')
    const expected = this.review.digest
    this.beforeProjectChange()
    this.review = null
    await this.repository.resetWorkspaces(expected)
    await this.clearPicker()
    this.last = null
    this.emit()
    return this.overview()
  }
  async recoverReset(id: string): Promise<DataLocations> {
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    await this.repository.recoverReset(id)
    return this.overview()
  }
  private async clearPicker(): Promise<void> {
    const path = join(this.root, 'settings', 'picker-v1.json')
    if (await present(path)) {
      await contained(this.root, path, false)
      await unlink(path)
      await syncDirectory(dirname(path))
    }
  }
  async cleanup(): Promise<DataLocations> {
    if (this.running) throw new ProjectError('PROJECT_LOCKED')
    await this.clearPicker()
    return this.overview()
  }
  async stop(): Promise<void> {
    this.stopping = true
    this.watcher?.close()
    if (this.watchTimer) clearTimeout(this.watchTimer)
    if (this.running?.view.cancellable) {
      this.running.controller.abort()
      this.running.answer?.('cancel')
    }
    await this.running?.task
  }
}
