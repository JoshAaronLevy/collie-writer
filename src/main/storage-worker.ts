import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import workerPath from '../worker/index?modulePath'
import {
  isStorageWorkerMessage,
  type StorageStatus,
  type StorageRuntime,
  type StorageWorkerMessage
} from '../shared/storage'

export class StorageWorker {
  private child: UtilityProcess | undefined
  private status: StorageStatus = { state: 'starting', sequence: 0 }
  private startupTimer: ReturnType<typeof setTimeout> | undefined
  private stopping = false

  constructor(private readonly changed: (status: StorageStatus) => void) {}

  current(): StorageStatus {
    return this.status
  }

  private update(
    next: { state: 'starting' | 'unavailable' } | { state: 'ready'; runtime: StorageRuntime }
  ): void {
    this.status = { ...next, sequence: this.status.sequence + 1 } as StorageStatus
    this.changed(this.status)
  }

  private clearStartupTimer(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer)
    this.startupTimer = undefined
  }

  private unavailable(child: UtilityProcess): void {
    if (this.child !== child || this.stopping) return
    this.clearStartupTimer()
    if (this.status.state !== 'unavailable') this.update({ state: 'unavailable' })
    try {
      child.kill()
    } catch {
      // Status already reflects that storage is unavailable.
    }
  }

  start(): void {
    if (this.child || this.stopping) return
    this.update({ state: 'starting' })
    let child: UtilityProcess
    try {
      child = utilityProcess.fork(workerPath, [], {
        serviceName: 'Collie Storage',
        stdio: 'ignore'
      })
    } catch {
      this.update({ state: 'unavailable' })
      return
    }
    this.child = child
    this.startupTimer = setTimeout(() => this.unavailable(child), 10_000)
    child.on('spawn', () => {
      if (this.child !== child || this.stopping) return
      try {
        child.postMessage({
          kind: 'initialize',
          nativeBinding: app.isPackaged
            ? join(process.resourcesPath, 'native', 'better_sqlite3.node')
            : null
        })
      } catch {
        this.unavailable(child)
      }
    })
    child.on('message', (message: unknown) => {
      if (this.child !== child || this.stopping) return
      if (!isStorageWorkerMessage(message)) {
        this.unavailable(child)
        return
      }
      this.receive(child, message)
    })
    child.on('error', () => this.unavailable(child))
    child.on('exit', () => {
      this.clearStartupTimer()
      if (this.child !== child) return
      this.child = undefined
      if (!this.stopping && this.status.state !== 'unavailable')
        this.update({ state: 'unavailable' })
    })
  }

  private receive(child: UtilityProcess, message: StorageWorkerMessage): void {
    if (message.kind === 'unavailable') {
      this.unavailable(child)
      return
    }
    if (this.status.state !== 'starting') {
      this.unavailable(child)
      return
    }
    this.clearStartupTimer()
    this.update({ state: 'ready', runtime: message.runtime })
    // Future storage commands require a separate validated, acknowledged protocol.
    // A crash never replays a write automatically.
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.clearStartupTimer()
    const child = this.child
    if (!child) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // The child may already have exited.
        }
        resolve()
      }, 2_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      try {
        child.postMessage({ kind: 'shutdown' })
      } catch {
        clearTimeout(timer)
        try {
          child.kill()
        } catch {
          // The child may already have exited.
        }
        resolve()
      }
    })
  }
}
