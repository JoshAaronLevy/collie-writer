import { storageRuntime } from './storage/driver'
import type { StorageWorkerMessage } from '../shared/storage'

const parent = process.parentPort
let initialized = false

function send(message: StorageWorkerMessage): void {
  parent.postMessage(message)
}

parent.on('message', (event) => {
  const message: unknown = event.data
  if (typeof message !== 'object' || message === null || !('kind' in message)) return
  if (message.kind === 'shutdown' && Object.keys(message).length === 1) process.exit(0)
  if (
    initialized ||
    message.kind !== 'initialize' ||
    Object.keys(message).length !== 2 ||
    !('nativeBinding' in message)
  )
    return
  const binding = message.nativeBinding
  if (binding !== null && typeof binding !== 'string') return
  initialized = true
  try {
    const sqliteVersion = storageRuntime(binding ?? undefined)
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
    send({ kind: 'unavailable' })
  }
})
