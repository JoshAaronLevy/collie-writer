import { extname } from 'node:path'
import { describeSelectedFile, importExtensions, selectedName } from './selected-file'
import {
  IMPORT_LIMITS,
  type ImportPickResult,
  type ImportFileSelection
} from '../../shared/project-import'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { StorageWorker } from '../storage-worker'
import { ProjectError, projectError } from '../../domain/projects/errors'
import {
  isImportValue,
  isImportWorkerInput,
  type ImportMutation,
  type ImportServiceRequest,
  type ImportWorkerInput,
  type ImportValue
} from '../../shared/project-import'
import type { OpenInput, ProjectCode } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'

/** Owns exact local writes across renderer loss. This owner has no provider capability. */
export class ImportService {
  private pending: { scope: OpenInput; mutation: ImportMutation; input: ImportWorkerInput } | null =
    null
  private intakeScope: OpenInput | null = null
  private busy = false
  private closing = false
  private externalBusy: () => boolean = () => false
  setExternalBusy(read: () => boolean): void {
    this.externalBusy = read
  }
  private issue: ProjectCode | null = null
  constructor(private readonly storage: StorageWorker) {}
  hasPendingWork(): boolean {
    return this.busy || this.intakeScope !== null || this.pending !== null
  }
  canReacquire(scope: OpenInput): boolean {
    return (
      !this.intakeScope &&
      !this.busy &&
      !this.closing &&
      !!this.pending &&
      sameScope(this.pending.scope, scope)
    )
  }
  setClosing(value: boolean): void {
    this.closing = value
  }
  private async worker(input: ImportWorkerInput): Promise<ImportValue> {
    const result = await this.storage.request(randomUUID(), { kind: 'importSession', input })
    if (!result.ok) throw new ProjectError(result.error.code)
    if (!isImportValue(result.value)) throw new ProjectError('UNAVAILABLE')
    return result.value
  }
  async command(request: ImportServiceRequest): Promise<ImportValue> {
    // Capture the exact request before an await; callers cannot mutate retained intent.
    const input = structuredClone(request)
    if (input.action === 'pick-files') throw new ProjectError('DENIED')
    if (input.action === 'resolve-file') {
      if (this.intakeScope || this.busy) throw new ProjectError('PROJECT_LOCKED')
      const pending = this.pending
      if (
        !pending ||
        !sameScope(pending.scope, input) ||
        !isDeepStrictEqual(pending.mutation, input.mutation) ||
        pending.input.action !== 'stage-file'
      )
        throw new ProjectError('OPERATION_CONFLICT')
      const known = await this.worker({
        ...pending.scope,
        action: 'lookup',
        mutation: pending.mutation
      })
      if (this.pending !== pending || this.busy || this.intakeScope)
        throw new ProjectError('OPERATION_CONFLICT')
      if (known.type !== 'receipt') throw new ProjectError('UNAVAILABLE')
      if (known.receipt || input.decision === 'abandon') {
        this.pending = null
        this.issue = null
        return known
      }
      return this.write(pending.input)
    }
    if (input.action === 'recovery') {
      await this.worker({
        projectId: input.projectId,
        workspaceId: input.workspaceId,
        action: 'list',
        offset: 0
      })
      const own = this.pending && sameScope(this.pending.scope, input)
      const intake = this.intakeScope && sameScope(this.intakeScope, input)
      return {
        type: 'recovery',
        pending: own ? structuredClone(this.pending!.mutation) : null,
        busy: (!!own && this.busy) || !!intake,
        issue: own ? this.issue : null
      }
    }
    if (this.intakeScope) throw new ProjectError('PROJECT_LOCKED')
    if (input.action === 'mutate') return this.write(input)
    if (input.action === 'lookup' && this.busy) throw new ProjectError('PROJECT_LOCKED')
    const pending = this.pending
    const result = await this.worker(input)
    if (
      input.action === 'lookup' &&
      this.pending &&
      this.pending === pending &&
      !this.busy &&
      sameScope(this.pending.scope, input) &&
      isDeepStrictEqual(this.pending.mutation, input.mutation) &&
      result.type === 'receipt' &&
      (result.receipt !== null || this.pending.input.action !== 'stage-file')
    ) {
      // A serialized lookup proves either a durable receipt or absence after the old write.
      // Neither case resubmits. The caller retains any unapplied intent for explicit retry.
      this.pending = null
      this.issue = null
    }
    return result
  }
  /** Native authority lasts for this exact scope and selection only. Paths never leave main. */
  async pickFiles(
    request: Extract<ImportServiceRequest, { action: 'pick-files' }>,
    choose: () => Promise<string[] | null>,
    authorize: () => void
  ): Promise<ImportValue> {
    if (this.closing || this.externalBusy()) throw new ProjectError('ACCESS_BUSY')
    if (this.hasPendingWork() || this.externalBusy()) throw new ProjectError('PROJECT_LOCKED')
    const input = structuredClone(request)
    this.intakeScope = { projectId: input.projectId, workspaceId: input.workspaceId }
    const results: ImportPickResult[] = []
    try {
      authorize()
      const initial = await this.worker({
        ...this.intakeScope,
        action: 'read',
        batchId: input.batchId,
        revisionId: null,
        offset: 0
      })
      if (
        initial.type !== 'batch' ||
        initial.revision.phase !== 'preparing' ||
        initial.revision.id !== input.expectedRevision
      )
        throw new ProjectError('STALE_REVISION')
      let revisionId = initial.revision.id
      const files: ImportFileSelection[] = [...initial.files]
      if (initial.nextOffset !== null) {
        const next = await this.worker({
          ...this.intakeScope,
          action: 'read',
          batchId: input.batchId,
          revisionId,
          offset: initial.nextOffset
        })
        if (next.type !== 'batch' || next.nextOffset !== null) throw new ProjectError('UNAVAILABLE')
        files.push(...next.files)
      }
      const paths = await choose()
      authorize()
      if (this.closing || this.externalBusy()) throw new ProjectError('ACCESS_BUSY')
      if (paths === null) return { type: 'picked', cancelled: true, results: [] }
      if (paths.length > IMPORT_LIMITS.files) throw new ProjectError('LIMIT_EXCEEDED')
      let stopped = false
      for (const path of paths) {
        const item: ImportPickResult = {
          name: selectedName(path),
          bytes: null,
          status: 'not-staged',
          fileId: null,
          code: null
        }
        results.push(item)
        if (stopped) continue
        if (!importExtensions.includes(extname(path).slice(1).toLowerCase())) {
          item.status = 'unsupported'
          continue
        }
        try {
          authorize()
          if (this.closing || this.externalBusy()) throw new ProjectError('ACCESS_BUSY')
          const file = await describeSelectedFile(path)
          item.bytes = file.bytes
          authorize()
          if (this.closing || this.externalBusy()) throw new ProjectError('ACCESS_BUSY')
          const duplicate = files.find((f) => f.sha256 === file.sha256 && f.bytes === file.bytes)
          if (duplicate) {
            item.status = 'duplicate'
            item.fileId = duplicate.id
            continue
          }
          if (
            files.length >= IMPORT_LIMITS.files ||
            files.reduce((n, f) => n + f.bytes, 0) + file.bytes > IMPORT_LIMITS.batchBytes
          )
            throw new ProjectError('LIMIT_EXCEEDED')
          const mutation: Extract<ImportMutation, { action: 'add-file' }> = {
            version: 1,
            operationId: randomUUID(),
            batchId: input.batchId,
            action: 'add-file',
            expectedRevision: revisionId,
            file
          }
          const saved = await this.stageSelected({
            ...this.intakeScope,
            action: 'stage-file',
            mutation,
            sourcePath: path
          })
          if (saved.type !== 'receipt' || !saved.receipt) throw new ProjectError('UNAVAILABLE')
          revisionId = saved.receipt.revisionId
          files.push(file)
          item.status = 'staged'
          item.fileId = file.id
        } catch (error) {
          item.status = 'failed'
          item.code = projectError(error)
          // A retained exact write must be reconciled before any other file is attempted.
          stopped =
            !!this.pending ||
            this.closing ||
            [
              'DENIED',
              'READ_ONLY_PROJECT',
              'ACCESS_BUSY',
              'ACCESS_TRANSITION',
              'UNAVAILABLE'
            ].includes(item.code)
        }
      }
      return { type: 'picked', cancelled: false, results }
    } finally {
      this.intakeScope = null
    }
  }
  /** IM03's trusted native picker supplies this; it is never exposed as renderer IPC. */
  async stageSelected(
    input: Extract<ImportWorkerInput, { action: 'stage-file' }>
  ): Promise<ImportValue> {
    if (!isImportWorkerInput(input)) throw new ProjectError('VALIDATION')
    return this.write(structuredClone(input))
  }
  private async write(
    input: Extract<ImportWorkerInput, { action: 'mutate' | 'stage-file' }>
  ): Promise<ImportValue> {
    if (this.closing || this.externalBusy()) throw new ProjectError('ACCESS_BUSY')
    if (this.busy) throw new ProjectError('PROJECT_LOCKED')
    if (
      this.pending &&
      (!sameScope(this.pending.scope, input) || !isDeepStrictEqual(this.pending.input, input))
    )
      throw new ProjectError('OPERATION_CONFLICT')
    this.pending = {
      scope: { projectId: input.projectId, workspaceId: input.workspaceId },
      mutation: input.mutation,
      input
    }
    this.busy = true
    this.issue = null
    try {
      // Read permission is sufficient to reconcile a previously completed operation.
      const known = await this.worker({
        ...this.pending.scope,
        action: 'lookup',
        mutation: input.mutation
      })
      const value = known.type === 'receipt' && known.receipt ? known : await this.worker(input)
      if (
        value.type !== 'receipt' ||
        !value.receipt ||
        value.operationId !== input.mutation.operationId ||
        value.receipt.batchId !== input.mutation.batchId ||
        value.receipt.projectId !== input.projectId
      )
        throw new ProjectError('UNAVAILABLE')
      this.pending = null
      return value
    } catch (error) {
      this.issue = projectError(error)
      throw error
    } finally {
      this.busy = false
    }
  }
}
