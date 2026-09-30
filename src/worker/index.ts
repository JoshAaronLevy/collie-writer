import { storageRuntime } from './storage/driver'
import type { StorageWorkerMessage } from '../shared/storage'
import { ProjectRepository } from './projects/repository'
import { isProjectCommand, projectFailure, type ProjectValue, type ProjectResult } from '../shared/projects'
import { isId } from '../domain/editor/schema'
import { projectError } from '../domain/projects/errors'
import { isAbsolute } from 'node:path'
import { isFileCommand } from '../shared/file-worker'
import { ProjectFiles } from './projects/project-files'

const parent = process.parentPort
let initialized = false
let repository: ProjectRepository | undefined
let files: ProjectFiles | undefined
let queue = Promise.resolve()

function send(message: StorageWorkerMessage): void {
  parent.postMessage(message)
}

async function receive(message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null || !('kind' in message)) return
  if (message.kind === 'shutdown' && Object.keys(message).length === 1) {
    await files?.stop()
    await repository?.close()
    process.exit(0)
  }
  if (message.kind === 'file' && Object.keys(message).length === 3 && 'requestId' in message && isId(message.requestId) && 'command' in message && isFileCommand(message.command)) {
    try {
      if (!files) throw new Error('UNAVAILABLE')
      const value = await files.command(message.command)
      parent.postMessage({ kind: 'file-result', result: { ok: true, requestId: message.requestId, value } })
      if (value.job?.state === 'awaiting-consent') {
        const challenge = files.consentChallenge(value.job.id)
        if (challenge) parent.postMessage({ kind: 'file-consent', id: value.job.id, challenge })
      }
    } catch (error) { parent.postMessage({ kind: 'file-result', result: projectFailure(message.requestId, projectError(error)) }) }
    return
  }
  if (message.kind === 'project' && Object.keys(message).length === 3 && 'requestId' in message && isId(message.requestId) && 'command' in message && isProjectCommand(message.command)) {
    let result: ProjectResult<ProjectValue>
    try {
      if (!repository) { parent.postMessage({ kind: 'project-result', result: projectFailure(message.requestId, 'STORAGE_LOCATION_REQUIRED') }); return }
      const command = message.command
      if (command.kind === 'open' || command.kind === 'create') files?.beforeProjectChange()
      let value: ProjectValue
      switch (command.kind) {
        case 'list': value = await repository.list(); break
        case 'create': value = await repository.create(command.input); break
        case 'open': value = await repository.open(command.input); break
        case 'outline': value = await repository.outline(command.input); break
        case 'history': value = await repository.history(command.input); break
        case 'section': value = await repository.section(command.input); break
        case 'meta': value = await repository.meta(command.input); break
        case 'commit': value = await repository.commit(command.input); break
        case 'importImage': value = await repository.importImage(command.input); break
        case 'readImage': value = await repository.readImage(command.input); break
        case 'rename': value = await repository.rename(command.input); break
        case 'archive': value = await repository.archive(command.input); break
        case 'data': if (!files) throw new Error('UNAVAILABLE'); value = await files.overview(); break
        case 'cleanup': if (!files) throw new Error('UNAVAILABLE'); value = await files.cleanup(); break
        case 'reset': if (!files) throw new Error('UNAVAILABLE'); value = await files.reset(command.input.review); break
        case 'recoverReset': if (!files) throw new Error('UNAVAILABLE'); value = await files.recoverReset(command.input); break
      }
      result = { ok: true, requestId: message.requestId, value }
    } catch (error) { result = projectFailure(message.requestId, projectError(error)) }
    parent.postMessage({ kind: 'project-result', result })
    return
  }
  if (
    initialized ||
    message.kind !== 'initialize' ||
    Object.keys(message).length !== 4 ||
    !('nativeBinding' in message) || !('workingRoot' in message) || !('resources' in message)
  )
    return
  const binding = message.nativeBinding
  if (binding !== null && typeof binding !== 'string') return
  if (message.workingRoot !== null && (typeof message.workingRoot !== 'string' || !isAbsolute(message.workingRoot))) return
  if (typeof message.resources !== 'string' || !isAbsolute(message.resources)) return
  initialized = true
  try {
    const sqliteVersion = storageRuntime(binding ?? undefined)
    if (typeof message.workingRoot === 'string') {
      repository = new ProjectRepository(message.workingRoot, message.resources, binding ?? undefined)
      await repository.initialize()
      files = new ProjectFiles(message.workingRoot, repository, status => {
        parent.postMessage({ kind: 'file-changed', status })
        if (status.job?.state === 'awaiting-consent') {
          const challenge = files?.consentChallenge(status.job.id)
          if (challenge) parent.postMessage({ kind: 'file-consent', id: status.job.id, challenge })
        }
      }, binding ?? undefined)
      await files.initialize()
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
parent.on('message', event => {
  // One command at a time, including reads/capture/migration and shutdown.
  queue = queue.then(() => receive(event.data)).catch(() => { send({ kind: 'unavailable' }) })
})
