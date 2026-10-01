import { app, utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import workerPath from '../worker/index?modulePath'
import { bundledResources } from './resources'
import { isId } from '../domain/editor/schema'
import { isFileStatus, type FileStatus } from '../shared/project-files'
import type { FileCommand } from '../shared/file-worker'
import { isSourceProgress, type SourceProgress } from '../shared/sources'
import { isProjectResult, isProjectValue, projectFailure, record, exact, type ProjectCommand, type ProjectResult, type ProjectValue } from '../shared/projects'
import { printPdf } from './printing/pdf'
import type { PrintDocument } from '../worker/exports/html'
import { projectError } from '../domain/projects/errors'
import {
  isStorageWorkerMessage,
  type StorageStatus,
  type StorageRuntime,
  type StorageWorkerMessage
} from '../shared/storage'

export class StorageWorker {
  private authorize: (command: ProjectCommand) => void = () => { throw new Error('ACCESS_NOT_READY') }
  private authorizeFile: (command: FileCommand) => void = () => { throw new Error('ACCESS_NOT_READY') }
  private observe: (command: ProjectCommand, value: ProjectValue) => void = () => {}
  private observeError: (code: string) => void = () => {}
  onErrorCode(observe:(code:string)=>void):void { this.observeError=observe }
  setAccessPolicy(authorize:(command:ProjectCommand)=>void,authorizeFile:(command:FileCommand)=>void,observe:(command:ProjectCommand,value:ProjectValue)=>void):void { this.authorize=authorize;this.authorizeFile=authorizeFile;this.observe=observe }
  idle():boolean { return this.pending.size===0&&this.filePending.size===0 }
  private child: UtilityProcess | undefined
  private status: StorageStatus = { state: 'starting', sequence: 0 }
  private startupTimer: ReturnType<typeof setTimeout> | undefined
  private stopping = false
  private pending = new Map<string, { command: ProjectCommand; resolve: (result: ProjectResult<ProjectValue>) => void; timer: ReturnType<typeof setTimeout> }>()
  private filePending = new Map<string, { resolve: (result: ProjectResult<FileStatus>) => void; timer: ReturnType<typeof setTimeout> }>()
  private fileChanged: (status: FileStatus) => void = () => {}
  private sourceChanged: (progress: SourceProgress) => void = () => {}
  private readonly prints = new Map<string, AbortController>()
  onSourceProgress(changed:(progress:SourceProgress)=>void):void {this.sourceChanged=changed}
  private fileConsent: (id: string, challenge: string) => void = () => {}
  onFiles(changed: (status: FileStatus) => void, consent: (id: string, challenge: string) => void): void { this.fileChanged = changed; this.fileConsent = consent }
  requestFile(requestId: string, command: FileCommand): Promise<ProjectResult<FileStatus>> {
    try { this.authorizeFile(command) } catch(error) { const code=projectError(error);this.observeError(code);return Promise.resolve(projectFailure(requestId,code)) }
    if (!this.child || this.stopping || this.status.state !== 'ready' || this.filePending.size >= 32 || this.filePending.has(requestId)) return Promise.resolve(projectFailure(requestId, 'UNAVAILABLE'))
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.filePending.delete(requestId); resolve(projectFailure(requestId, 'UNAVAILABLE')) }, 60000)
      this.filePending.set(requestId, { resolve, timer })
      try { this.child!.postMessage({ kind: 'file', requestId, command }) } catch { clearTimeout(timer); this.filePending.delete(requestId); resolve(projectFailure(requestId, 'UNAVAILABLE')) }
    })
  }
  private rejectPending(): void {
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.resolve(projectFailure(id, 'UNAVAILABLE')) }
    this.pending.clear()
    for (const [id, p] of this.filePending) { clearTimeout(p.timer); p.resolve(projectFailure(id, 'UNAVAILABLE')) }
    this.filePending.clear()
  }
  request(requestId: string, command: ProjectCommand): Promise<ProjectResult<ProjectValue>> {
    try { this.authorize(command) } catch(error) { const code=projectError(error);this.observeError(code);return Promise.resolve(projectFailure(requestId,code)) }
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
    for (const controller of this.prints.values()) controller.abort()
    this.prints.clear()
    if (this.status.state !== 'unavailable') this.update({ state: 'unavailable' })
    try { child.postMessage({ kind: 'shutdown' }) } catch { /* Keep ownership until the process exits; never kill an unresolved writer. */ }
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
          workingRoot,
          resources: bundledResources()
        })
      } catch {
        this.unavailable(child)
      }
    })
    child.on('message', (message: unknown) => {
      if (this.child !== child || this.stopping) return
      if (record(message) && message.kind === 'pdf-request' && exact(message,['kind','id','document']) && isId(message.id) && record(message.document)) {
        const doc=message.document
        if(!exact(doc,['body','css','paper','capturedHead'])||typeof doc.body!=='string'||doc.body.length>400_000_000||typeof doc.css!=='string'||doc.css.length>100_000||!['Letter','A4'].includes(String(doc.paper))||!isId(doc.capturedHead)){this.unavailable(child);return}
        if(this.prints.has(message.id)||this.prints.size>=1){child.postMessage({kind:'pdf-result',id:message.id,ok:false,error:'UNAVAILABLE'});return}
        const controller=new AbortController();this.prints.set(message.id,controller)
        const document:PrintDocument={body:doc.body as string,css:doc.css as string,paper:doc.paper as 'Letter'|'A4',capturedHead:doc.capturedHead as string}
        void printPdf(document,controller.signal).then(value=>{
          if(this.child===child&&!this.stopping)child.postMessage({kind:'pdf-result',id:message.id,ok:true,bytes:value.bytes,pages:value.pages,capturedHead:value.capturedHead})
        }).catch(error=>{
          if(this.child===child&&!this.stopping)child.postMessage({kind:'pdf-result',id:message.id,ok:false,error:controller.signal.aborted?'CANCELLED':error instanceof Error&&error.message==='PDF_EXPORT_FAILED'?'PDF_EXPORT_FAILED':'UNAVAILABLE'})
        }).finally(()=>this.prints.delete(message.id))
        return
      }
      if(record(message)&&message.kind==='pdf-cancel'&&exact(message,['kind','id'])&&isId(message.id)){this.prints.get(message.id)?.abort();return}
      if (record(message) && message.kind === 'file-changed' && exact(message, ['kind','status']) && isFileStatus(message.status)) { this.fileChanged(message.status); return }
      if (record(message) && message.kind === 'source-progress' && exact(message,['kind','progress']) && isSourceProgress(message.progress)) {this.sourceChanged(message.progress);return}
      if (record(message) && message.kind === 'file-consent' && exact(message, ['kind','id','challenge']) && isId(message.id) && isId(message.challenge)) { this.fileConsent(message.id, message.challenge); return }
      if (record(message) && message.kind === 'file-result' && exact(message, ['kind','result']) && record(message.result) && typeof message.result.requestId === 'string') {
        const id = message.result.requestId, pending = this.filePending.get(id)
        if (!pending) return
        if (!isProjectResult<FileStatus>(message.result, id, isFileStatus)) { this.unavailable(child); return }
        clearTimeout(pending.timer); this.filePending.delete(id); if(!message.result.ok)this.observeError(message.result.error.code);pending.resolve(message.result); return
      }
      if (record(message) && exact(message, ['kind', 'result']) && message.kind === 'project-result' && record(message.result) && typeof message.result.requestId === 'string') {
        const id = message.result.requestId
        const pending = this.pending.get(id)
        if (!pending) return // Late result after a timeout is not an acknowledgment to a different request.
        if (!isProjectResult<ProjectValue>(message.result, id, value => isProjectValue(pending.command.kind, value))) { this.unavailable(child); return }
        clearTimeout(pending.timer); this.pending.delete(id)
        if(message.result.ok)this.observe(pending.command,message.result.value)
        else this.observeError(message.result.error.code)
        pending.resolve(message.result)
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
      for(const controller of this.prints.values())controller.abort()
      this.prints.clear()
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

  async stop(onSlow: () => void = () => {}): Promise<void> {
    this.stopping = true
    for(const controller of this.prints.values())controller.abort()
    this.clearStartupTimer()
    this.rejectPending()
    const child = this.child
    if (!child) return
    await new Promise<void>((resolve, reject) => {
      // The notice is bounded; writer lifetime is not. Only cooperative exit releases ownership.
      const timer = setTimeout(onSlow, 30000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      try { child.postMessage({ kind: 'shutdown' }) }
      catch { clearTimeout(timer); reject(new Error('STORAGE_SHUTDOWN_PENDING')) }
    })
  }
}
