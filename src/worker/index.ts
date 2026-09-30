import { storageRuntime } from './storage/driver'
import type { StorageWorkerMessage } from '../shared/storage'
import { ProjectRepository } from './projects/repository'
import { isProjectCommand, projectFailure, type ProjectValue, type ProjectResult } from '../shared/projects'
import { isId } from '../domain/editor/schema'
import { projectError } from '../domain/projects/errors'
import { isAbsolute } from 'node:path'

const parent = process.parentPort
let initialized = false
let repository: ProjectRepository | undefined
let queue = Promise.resolve()

function send(message: StorageWorkerMessage): void {
  parent.postMessage(message)
}

async function receive(message: unknown): Promise<void> {
  if (typeof message !== 'object' || message === null || !('kind' in message)) return
  if (message.kind === 'shutdown' && Object.keys(message).length === 1) {
    repository?.close()
    process.exit(0)
  }
  if (message.kind === 'project' && Object.keys(message).length === 3 && 'requestId' in message && isId(message.requestId) && 'command' in message && isProjectCommand(message.command)) {
    let result: ProjectResult<ProjectValue>
    try {
      if (!repository) { parent.postMessage({ kind: 'project-result', result: projectFailure(message.requestId, 'STORAGE_LOCATION_REQUIRED') }); return }
      const command = message.command
      const value = command.kind === 'list' ? await repository.list() : command.kind === 'create' ? await repository.create(command.input) : command.kind === 'open' ? await repository.open(command.input) : await repository.commit(command.input)
      result = { ok: true, requestId: message.requestId, value }
    } catch (error) { result = projectFailure(message.requestId, projectError(error)) }
    parent.postMessage({ kind: 'project-result', result })
    return
  }
  if (
    initialized ||
    message.kind !== 'initialize' ||
    Object.keys(message).length !== 3 ||
    !('nativeBinding' in message) || !('workingRoot' in message)
  )
    return
  const binding = message.nativeBinding
  if (binding !== null && typeof binding !== 'string') return
  if (message.workingRoot !== null && (typeof message.workingRoot !== 'string' || !isAbsolute(message.workingRoot))) return
  initialized = true
  try {
    const sqliteVersion = storageRuntime(binding ?? undefined)
    if (typeof message.workingRoot === 'string') {
      repository = new ProjectRepository(message.workingRoot, binding ?? undefined)
      await repository.initialize()
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
    repository?.close()
    repository = undefined
    send({ kind: 'unavailable' })
  }
}
parent.on('message', event => {
  // One command at a time, including reads/capture/migration and shutdown.
  queue = queue.then(() => receive(event.data)).catch(() => { send({ kind: 'unavailable' }) })
})
