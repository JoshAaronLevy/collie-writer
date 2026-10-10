import { storageRuntime } from './storage/driver'
import type { StorageWorkerMessage } from '../shared/storage'
import { ProjectRepository } from './projects/repository'
import {
  isProjectCommand,
  projectFailure,
  type ProjectValue,
  type ProjectResult
} from '../shared/projects'
import { isId } from '../domain/editor/schema'
import { projectError } from '../domain/projects/errors'
import { isAbsolute } from 'node:path'
import { isFileCommand } from '../shared/file-worker'
import { ProjectFiles } from './projects/project-files'
import type { PrintDocument } from './exports/html'
import { randomUUID } from 'node:crypto'
import { StorageInventory } from './projects/storage-inventory'
import { isInventoryCommand, isInventoryAiOwners } from '../shared/storage-inventory'
import { exact, record } from '../shared/projects'
import { withSpaceBudget, errorSpace } from './projects/streams'

const parent = process.parentPort
let initialized = false
let repository: ProjectRepository | undefined
let files: ProjectFiles | undefined
let inventory: StorageInventory | undefined
let workingRoot = ''
let queue = Promise.resolve()
const pdfPending = new Map<
  string,
  {
    resolve: (value: { bytes: Buffer; pages: number; capturedHead: string }) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }
>()
function renderPdf(
  document: PrintDocument,
  signal: AbortSignal
): Promise<{ bytes: Buffer; pages: number; capturedHead: string }> {
  if (signal.aborted) return Promise.reject(new Error('CANCELLED'))
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (error: Error): void => {
      clearTimeout(timer)
      pdfPending.delete(id)
      signal.removeEventListener('abort', abort)
      reject(error)
    }
    const abort = (): void => {
      parent.postMessage({ kind: 'pdf-cancel', id })
      finish(new Error('CANCELLED'))
    }
    const timer = setTimeout(() => {
      parent.postMessage({ kind: 'pdf-cancel', id })
      finish(new Error('PDF_EXPORT_FAILED'))
    }, 130_000)
    pdfPending.set(id, {
      resolve: (value) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      reject: finish,
      timer
    })
    signal.addEventListener('abort', abort, { once: true })
    parent.postMessage({ kind: 'pdf-request', id, document })
  })
}

function send(message: StorageWorkerMessage): void {
  parent.postMessage(message)
}

async function receive(message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null || !('kind' in message)) return
  if (message.kind === 'shutdown' && Object.keys(message).length === 1) {
    inventory?.stop()
    await files?.stop()
    await repository?.close()
    process.exit(0)
  }
  if (
    message.kind === 'file' &&
    Object.keys(message).length === 3 &&
    'requestId' in message &&
    isId(message.requestId) &&
    'command' in message &&
    isFileCommand(message.command)
  ) {
    try {
      if (!files) throw new Error('UNAVAILABLE')
      const value = await files.command(message.command)
      parent.postMessage({
        kind: 'file-result',
        result: { ok: true, requestId: message.requestId, value }
      })
      if (value.job?.state === 'awaiting-consent') {
        const challenge = files.consentChallenge(value.job.id)
        if (challenge) parent.postMessage({ kind: 'file-consent', id: value.job.id, challenge })
      }
    } catch (error) {
      parent.postMessage({
        kind: 'file-result',
        result: projectFailure(
          message.requestId,
          projectError(error),
          errorSpace(error, 'Project file operation', workingRoot) ?? undefined
        )
      })
    }
    return
  }
  if (
    message.kind === 'project' &&
    Object.keys(message).length === 3 &&
    'requestId' in message &&
    isId(message.requestId) &&
    'command' in message &&
    isProjectCommand(message.command)
  ) {
    let result: ProjectResult<ProjectValue>
    try {
      if (!repository) {
        parent.postMessage({
          kind: 'project-result',
          result: projectFailure(message.requestId, 'STORAGE_LOCATION_REQUIRED')
        })
        return
      }
      const command = message.command
      if (command.kind === 'open' || command.kind === 'create') files?.beforeProjectChange()
      let value: ProjectValue
      switch (command.kind) {
        case 'importAnalysis':
          value = await repository.importAnalysis(command.input)
          break
        case 'importSession':
          value = await repository.importSession(command.input)
          break
        case 'proofreading':
          value = await repository.proofreading(command.input)
          break
        case 'conversation':
          value = await repository.conversation(command.input)
          break
        case 'exportPreview':
          value = await repository.exportPreview(command.input)
          break
        case 'exportStart':
          value = await repository.exportStart(command.input)
          break
        case 'exportBatchStart':
          value = await repository.exportBatchStart(command.input)
          break
        case 'exportStatus':
          value = await repository.exportStatus(command.input)
          break
        case 'exportCancel':
          value = await repository.exportCancel(command.input)
          break
        case 'recipes':
          value = await repository.recipes(command.input)
          break
        case 'recipeChange':
          value = await repository.recipeChange(command.input)
          break
        case 'interchangePreview':
          value = await repository.interchangePreview(command.input)
          break
        case 'interchangeCommit':
          value = await repository.interchangeCommit(command.input)
          break
        case 'list':
          value = await repository.list()
          break
        case 'create':
          value = await repository.create(command.input)
          break
        case 'open':
          value = await repository.open(command.input)
          break
        case 'outline':
          value = await repository.outline(command.input)
          break
        case 'history':
          value = await repository.history(command.input)
          break
        case 'notes':
          value = await repository.notes(command.input)
          break
        case 'sources':
          value = await repository.sources(command.input)
          break
        case 'inspection':
          value = await repository.inspection(command.input)
          break
        case 'inspectionPage':
          value = await repository.inspectionPage(command.input)
          break
        case 'inspectionAsset':
          value = await repository.inspectionAsset(command.input)
          break
        case 'inspectionChange':
          value = await repository.inspectionChange(command.input)
          break
        case 'citations':
          value = await repository.citations(command.input)
          break
        case 'citationStyle':
          value = await repository.citationStyle(command.input)
          break
        case 'evidence':
          value = await repository.evidence(command.input)
          break
        case 'evidenceChange':
          value = await repository.evidenceChange(command.input)
          break
        case 'search':
          value = await repository.searchQuery(command.input)
          break
        case 'workingCopy':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.workingCopy(command.input)
          break
        case 'localArtifacts':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.retainedVersions(command.input, true)
          break
        case 'retainedVersions':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.retainedVersions(command.input)
          break
        case 'searchCache':
          value = await repository.searchCache(command.input)
          break
        case 'searchActivity':
          value = await repository.searchActivity(command.input)
          break
        case 'searchAction':
          value = await repository.searchAction(command.input)
          break
        case 'sourceChange':
          value = await repository.sourceChange(command.input)
          break
        case 'sourcePreview':
          value = await repository.sourcePreview(command.input)
          break
        case 'sourceImport':
          value = await repository.sourceImport(command.input)
          break
        case 'sourceAttach':
          value = await repository.sourceAttach(command.input, (transferred, total) =>
            parent.postMessage({
              kind: 'source-progress',
              progress: { operationId: command.input.operationId, transferred, total }
            })
          )
          break
        case 'sourceExport':
          value = await repository.sourceExport(command.input)
          break
        case 'sourceExportAttachment':
          value = await repository.sourceExportAttachment(command.input)
          break
        case 'noteChange':
          value = await repository.noteChange(command.input)
          break
        case 'section':
          value = await repository.section(command.input)
          break
        case 'details':
          value = await repository.details(command.input)
          break
        case 'meta':
          value = await repository.meta(command.input)
          break
        case 'commit':
          value = await repository.commit(command.input)
          break
        case 'importImage':
          value = await repository.importImage(command.input)
          break
        case 'readImage':
          value = await repository.readImage(command.input)
          break
        case 'rename':
          value = await repository.rename(command.input)
          break
        case 'archive':
          value = await repository.archive(command.input)
          break
        case 'data':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.overview()
          break
        case 'cleanup':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.cleanup()
          break
        case 'reset':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.reset(command.input.review)
          break
        case 'recoverReset':
          if (!files) throw new Error('UNAVAILABLE')
          value = await files.recoverReset(command.input)
          break
      }
      result = { ok: true, requestId: message.requestId, value }
    } catch (error) {
      result = projectFailure(
        message.requestId,
        projectError(error),
        errorSpace(error, `Local project ${message.command.kind}`, workingRoot) ?? undefined
      )
    }
    parent.postMessage({ kind: 'project-result', result })
    return
  }
  if (
    initialized ||
    message.kind !== 'initialize' ||
    Object.keys(message).length !== 5 ||
    !('nativeBinding' in message) ||
    !('workingRoot' in message) ||
    !('resources' in message) ||
    !('profileRoot' in message)
  )
    return
  const binding = message.nativeBinding
  if (binding !== null && typeof binding !== 'string') return
  if (
    message.workingRoot !== null &&
    (typeof message.workingRoot !== 'string' || !isAbsolute(message.workingRoot))
  )
    return
  if (typeof message.resources !== 'string' || !isAbsolute(message.resources)) return
  if (typeof message.profileRoot !== 'string' || !isAbsolute(message.profileRoot)) return
  initialized = true
  try {
    const sqliteVersion = storageRuntime(binding ?? undefined)
    if (typeof message.workingRoot === 'string') {
      repository = new ProjectRepository(
        message.workingRoot,
        message.resources,
        binding ?? undefined,
        renderPdf
      )
      await repository.initialize()
      workingRoot = message.workingRoot
      files = new ProjectFiles(
        message.workingRoot,
        repository,
        (status) => {
          parent.postMessage({ kind: 'file-changed', status })
          if (status.job?.state === 'awaiting-consent') {
            const challenge = files?.consentChallenge(status.job.id)
            if (challenge)
              parent.postMessage({ kind: 'file-consent', id: status.job.id, challenge })
          }
        },
        binding ?? undefined
      )
      await files.initialize()
      inventory = new StorageInventory(message.workingRoot, message.profileRoot)
    }
    send({
      kind: 'ready',
      runtime: {
        sqliteVersion,
        nodeVersion: process.versions.node,
        napiVersion: process.versions.napi ?? '',
        platform: process.platform,
        architecture: process.arch
      }
    })
  } catch {
    await files?.stop()
    await repository?.close()
    repository = undefined
    send({ kind: 'unavailable' })
  }
}
parent.on('message', (event) => {
  const message: unknown = event.data
  if (
    record(message) &&
    message.kind === 'inventory' &&
    exact(message, ['kind', 'requestId', 'command', 'owners']) &&
    isId(message.requestId) &&
    isInventoryCommand(message.command) &&
    isInventoryAiOwners(message.owners)
  ) {
    const requestId = message.requestId
    const command = message.command,
      owners = message.owners
    void (async () => {
      try {
        if (!inventory) throw new Error('STORAGE_LOCATION_REQUIRED')
        const value = await inventory.command(command, owners)
        parent.postMessage({ kind: 'inventory-result', result: { ok: true, requestId, value } })
      } catch (error) {
        parent.postMessage({
          kind: 'inventory-result',
          result: projectFailure(requestId, projectError(error))
        })
      }
    })()
    return
  }
  if (
    message &&
    typeof message === 'object' &&
    'kind' in message &&
    message.kind === 'pdf-result' &&
    'id' in message &&
    isId(message.id)
  ) {
    const pending = pdfPending.get(message.id)
    if (!pending) return
    pdfPending.delete(message.id)
    if (
      'ok' in message &&
      message.ok === true &&
      'bytes' in message &&
      (message.bytes instanceof Uint8Array || Buffer.isBuffer(message.bytes)) &&
      'pages' in message &&
      Number.isSafeInteger(message.pages) &&
      'capturedHead' in message &&
      isId(message.capturedHead)
    )
      pending.resolve({
        bytes: Buffer.from(message.bytes),
        pages: message.pages as number,
        capturedHead: message.capturedHead
      })
    else pending.reject(new Error('PDF_EXPORT_FAILED'))
    return
  }
  // One command at a time, including reads/capture/migration and shutdown.
  queue = queue
    .then(() => withSpaceBudget('Local project operation', workingRoot, () => receive(event.data)))
    .catch(() => {
      send({ kind: 'unavailable' })
    })
})
