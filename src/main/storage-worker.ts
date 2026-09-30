import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import workerPath from '../worker/index?modulePath'
import { isProjectResult, isProjectValue, projectFailure, record, exact, type ProjectCommand, type ProjectResult, type ProjectValue } from '../shared/projects'
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
  private pending = new Map<string, { command: ProjectCommand; resolve: (result: ProjectResult<ProjectValue>) => void; timer: ReturnType<typeof setTimeout> }>()
  private rejectPending(): void {
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve(projectFailure(id, 'UNAVAILABLE')) }
    this.pending.clear()
  }
  request(requestId: string, command: ProjectCommand): Promise<ProjectResult<ProjectValue>> {
    if (!this.child || this.stopping || this.status.state !== 'ready' || this.pending.size >= 32 || this.pending.has(requestId)) return Promise.resolve(projectFailure(requestId, 'UNAVAILABLE'))
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve(projectFailure(requestId, 'UNAVAILABLE')) // Unknown outcome: caller retains operation ID and buffer.
      }, 60000)
      this.pending.set(requestId, { command, resolve, timer })
      try { this.child!.postMessage({ kind: 'project', requestId, command }) } catch { clearTimeout(timer); this.pending.delete(requestId); resolve(projectFailure(requestId, 'UNAVAILABLE')) }
    })
  }

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
    this.rejectPending()
    if (this.status.state !== 'unavailable') this.update({ state: 'unavailable' })
    try {
      child.kill()
    } catch {
      // Status already reflects that storage is unavailable.
    }
  }

  start(workingRoot: string | null = null): void {
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
            : null,
          workingRoot
        })
      } catch {
        this.unavailable(child)
      }
    })
    child.on('message', (message: unknown) => {
      if (this.child !== child || this.stopping) return
      if (record(message) && exact(message, ['kind', 'result']) && message.kind === 'project-result' && record(message.result) && typeof message.result.requestId === 'string') {
        const id = message.result.requestId
        const pending = this.pending.get(id)
        if (!pending) return // Late result after a timeout is not an acknowledgment to a different request.
        if (!isProjectResult<ProjectValue>(message.result, id, value => isProjectValue(pending.command.kind, value))) { this.unavailable(child); return }
        clearTimeout(pending.timer); this.pending.delete(id); pending.resolve(message.result)
        return
      }
      if (!isStorageWorkerMessage(message)) {
        this.unavailable(child)
        return
      }
      this.receive(child, message)
    })
    child.on('error', () => this.unavailable(child))
    child.on('exit', () => {
      this.clearStartupTimer()
      this.rejectPending()
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
    // Project commands use the separately validated request/result channel above.
    // A crash never replays a write automatically.
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.clearStartupTimer()
    this.rejectPending()
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
      }, 30_000)
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
