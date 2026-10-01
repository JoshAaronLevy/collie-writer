import { BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join } from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { isId } from '../domain/editor/schema'
import { ProjectError, projectError } from '../domain/projects/errors'
import { exact, isOpenInput, projectFailure, record, type OpenInput, type ProjectResult } from '../shared/projects'
import { FILE_ACTION, FILE_CHANGED, FILE_CHANNELS, isFileChoice, isInspectInput, isLocateInput, isPickInput, isSaveInput, isSelectedInput, sameScope, type FileAction, type FileStatus, type PickInput } from '../shared/project-files'
import type { FileCommand, FileGrant } from '../shared/file-worker'
import { contained, writeJson } from '../worker/storage/files'
import type { StorageWorker } from './storage-worker'
import type { WorkingLocation } from './paths/working-root'
import { isTrustedSender } from './ipc'

type Grant = { value: FileGrant; owner: number; frame: number; process: number; expires: number; usedBy: string | null }
export class ProjectFileIpc {
  private grants = new Map<string, Grant>()
  private challenges = new Map<string, string>()
  private status: FileStatus = { scope: null, destination: null, state: 'unsaved', job: null }
  private choosing = false
  private consenting = false
  private shellPath: string | null = null
  constructor(private readonly owner: () => WebContents | undefined, private readonly location: WorkingLocation, private readonly storage: StorageWorker, private readonly devOrigin?: string) {}
  current(): FileStatus { return this.status }
  unavailable(): void {
    this.status = { ...this.status, state: 'interrupted', job: this.status.job ? { ...this.status.job, state: 'failed', error: 'JOB_INTERRUPTED', cancellable: false } : null }
    const owner = this.owner()
    if (owner && !owner.isDestroyed()) owner.send(FILE_CHANGED, this.status)
  }
  action(kind: FileAction['kind'], id = randomUUID()): string {
    const owner = this.owner()
    if (owner && !owner.isDestroyed()) owner.send(FILE_ACTION, { id, kind })
    return id
  }
  revoke(): void { this.grants.clear(); this.challenges.clear() }
  offerShellPath(path: string): void {
    if (!isAbsolute(path) || path.length > 4000 || !/\.collie$/i.test(path) || this.shellPath) return
    this.shellPath = path
    this.nudgeShellOpen()
  }
  nudgeShellOpen(): void { if (this.shellPath && this.storage.current().state === 'ready') this.action('open-shell') }
  register(): void {
    this.storage.onFiles(status => {
      this.status = status
      if (status.job?.state !== 'awaiting-consent') this.challenges.clear()
      const owner = this.owner()
      if (owner && !owner.isDestroyed()) owner.send(FILE_CHANGED, status)
    }, (id, challenge) => { if (this.status.job?.id === id && this.status.job.state === 'awaiting-consent') this.challenges.set(id, challenge) })
    for (const [kind, channel] of Object.entries(FILE_CHANNELS)) ipcMain.handle(channel, async (event, payload: unknown) => {
      if (!isTrustedSender(event, this.owner(), this.devOrigin) || !record(payload) || !exact(payload, ['requestId','input']) || !isId(payload.requestId)) return projectFailure('', 'DENIED')
      const requestId = payload.requestId, input = payload.input
      try {
        if (!this.location.path()) throw new ProjectError('STORAGE_LOCATION_REQUIRED')
        if(kind==='revealProject'){
          if(!isOpenInput(input)||!sameScope(input,this.status.scope)||!this.status.destination)throw new ProjectError('NOT_FOUND')
          const path=this.status.destination.path,info=await lstat(path)
          if(!info.isFile()||info.isSymbolicLink())throw new ProjectError('DESTINATION_UNAVAILABLE')
          shell.showItemInFolder(path)
          return {ok:true,requestId,value:true}
        }
        if(kind==='revealWorking'){
          if(input!==null)throw new ProjectError('VALIDATION')
          const path=this.location.path()!,info=await lstat(path)
          if(!info.isDirectory()||info.isSymbolicLink()||await shell.openPath(path))throw new ProjectError('UNAVAILABLE')
          return {ok:true,requestId,value:true}
        }
        if (kind === 'claimShell') {
          if (input !== null) throw new ProjectError('VALIDATION')
          const path = this.shellPath
          if (!path || !event.senderFrame) return { ok: true, requestId, value: null }
          let info
          try { info = await lstat(path) } catch { this.shellPath = null; throw new ProjectError('VALIDATION') }
          if (!info.isFile() || info.isSymbolicLink()) { this.shellPath = null; throw new ProjectError('VALIDATION') }
          for (const [id, grant] of this.grants) if (grant.expires < Date.now()) this.grants.delete(id)
          if (this.grants.size >= 32) throw new ProjectError('UNAVAILABLE')
          const token = randomUUID()
          this.grants.set(token, { value: { id: token, path, purpose: 'open', scope: null }, owner: event.sender.id, frame: event.senderFrame.routingId, process: event.senderFrame.processId, expires: Date.now() + 10 * 60 * 1000, usedBy: null })
          this.shellPath = null
          return { ok: true, requestId, value: { token, path } }
        }
        if (kind === 'pick') {
          if (!isPickInput(input)) throw new ProjectError('VALIDATION')
          return { ok: true, requestId, value: await this.pick(event, input) }
        }
        if (kind === 'consent') {
          if (!isId(input)) throw new ProjectError('VALIDATION')
          return this.consent(requestId, input)
        }
        let command: FileCommand
        if (kind === 'status' && (input === null || isOpenInput(input))) command = { kind: 'status', scope: input, recheck: false }
        else if ((kind === 'save' || kind === 'backup' || kind === 'move') && isSaveInput(input)) command = { kind, input, grant: input.token ? this.consume(event, input.token, kind, input.scope, input.operationId) : null }
        else if ((kind === 'open' || kind === 'restore') && isSelectedInput(input)) command = { kind, operationId: input.operationId, grant: this.consume(event, input.token, kind, null, input.operationId) }
        else if (kind === 'locate' && isLocateInput(input)) command = { kind: 'locate', scope: input.scope, operationId: input.operationId, grant: this.consume(event, input.token, 'locate', input.scope, input.operationId) }
        else if (kind === 'inspect' && isInspectInput(input)) command = { kind: 'inspect', ...input }
        else if (kind === 'duplicate' && record(input) && exact(input, ['scope','operationId','expectedHead']) && isOpenInput(input.scope) && isId(input.operationId) && isId(input.expectedHead)) command = { kind, scope: input.scope, operationId: input.operationId, expectedHead: input.expectedHead }
        else if (kind === 'recover' && record(input) && exact(input, ['operationId','artifactId']) && isId(input.operationId) && isId(input.artifactId)) command = { kind, operationId: input.operationId, artifactId: input.artifactId }
        else if (kind === 'cancel' && isId(input)) command = { kind: 'cancel', id: input }
        else if (kind === 'answer' && record(input) && exact(input, ['id','choice']) && isId(input.id) && isFileChoice(input.choice)) command = { kind: 'answer', id: input.id, choice: input.choice, challenge: null }
        else throw new ProjectError('VALIDATION')
        const result = await this.storage.requestFile(requestId, command)
        if (result.ok) this.status = result.value
        return result
      } catch (error) { return projectFailure(requestId, projectError(error)) }
    })
  }
  private consume(event: Electron.IpcMainInvokeEvent, token: string, purpose: FileGrant['purpose'], scope: OpenInput | null, operationId: string): FileGrant {
    const grant = this.grants.get(token)
    if (!grant || !event.senderFrame || grant.owner !== event.sender.id || grant.frame !== event.senderFrame.routingId || grant.process !== event.senderFrame.processId || grant.expires < Date.now() || grant.value.purpose !== purpose || !sameScope(grant.value.scope, scope) || grant.usedBy !== null && grant.usedBy !== operationId) throw new ProjectError('DENIED')
    grant.usedBy = operationId
    return grant.value
  }
  private async pick(event: Electron.IpcMainInvokeEvent, input: PickInput): Promise<{ token: string; path: string } | null> {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || this.choosing) throw new ProjectError('UNAVAILABLE')
    this.choosing = true
    try {
      const root = this.location.path()!, preference = join(root, 'settings/picker-v1.json')
      let hint: string | undefined
      try {
        await contained(root, preference, false)
        if ((await lstat(preference)).size <= 8192) {
          const value: unknown = JSON.parse(await readFile(preference, 'utf8'))
          if (record(value) && exact(value, ['version','directory']) && value.version === 1 && typeof value.directory === 'string' && value.directory.length <= 4096) hint = value.directory
        }
      } catch { /* A picker hint never establishes or changes a project destination. */ }
      const filters = [{ name: 'Collie Writer project', extensions: ['collie'] }]
      let path: string | undefined
      if (['save','backup','move'].includes(input.purpose)) {
        const filename = `Untitled-${input.scope!.projectId.slice(0, 8)}${input.purpose === 'backup' ? '-backup' : ''}.collie`
        const result = await dialog.showSaveDialog(window, { title: input.purpose === 'backup' ? 'Back up to a new file' : input.purpose === 'move' ? 'Move to a new file (keep original)' : 'Save Collie Writer project', defaultPath: hint ? join(hint, filename) : filename, filters, properties: ['createDirectory','showOverwriteConfirmation'], message: input.purpose === 'backup' ? 'Choose a new filename. Backup does not change the project’s save location.' : input.purpose === 'move' ? 'Choose a new filename. The old file will be retained after the move.' : 'Choose this project’s location. Cloud upload is managed by your storage provider.' })
        if (!result.canceled) path = result.filePath
      } else {
        const result = await dialog.showOpenDialog(window, { title: input.purpose === 'locate' ? 'Locate the saved project file' : input.purpose === 'restore' ? 'Restore a backup as an independent project' : 'Open Collie Writer project', defaultPath: hint, filters, properties: ['openFile','dontAddToRecent'] })
        if (!result.canceled && result.filePaths.length === 1) path = result.filePaths[0]
      }
      if (!path || window.isDestroyed() || event.sender !== this.owner() || !event.senderFrame) return null
      if (path.length > 4000 || !/\.collie$/i.test(path)) throw new ProjectError('VALIDATION')
      for (const [id, grant] of this.grants) if (grant.expires < Date.now()) this.grants.delete(id)
      if (this.grants.size >= 32) throw new ProjectError('UNAVAILABLE')
      const token = randomUUID()
      this.grants.set(token, { value: { id: token, path, purpose: input.purpose, scope: input.scope }, owner: event.sender.id, frame: event.senderFrame.routingId, process: event.senderFrame.processId, expires: Date.now() + 10 * 60 * 1000, usedBy: null })
      await writeJson(preference, { version: 1, directory: dirname(path) }).catch(() => {})
      return { token, path }
    } finally { this.choosing = false }
  }
  private async consent(requestId: string, id: string): Promise<ProjectResult<FileStatus>> {
    const challenge = this.challenges.get(id), owner = this.owner(), job = this.status.job
    const window = owner ? BrowserWindow.fromWebContents(owner) : null
    if (!window || !challenge || !job || job.id !== id || job.state !== 'awaiting-consent' || this.consenting) return projectFailure(requestId, 'STALE_REVISION')
    this.consenting = true
    try {
      const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Replace this project file?', message: 'Replace the file at the selected location?', detail: `${job.path}\n\nThe version just inspected will be retained beside the file. If the file changes again, this save stops.`, buttons: ['Cancel','Replace inspected version'], defaultId: 0, cancelId: 0, noLink: true })
      if (window.isDestroyed() || owner !== this.owner()) return projectFailure(requestId, 'DENIED')
      return await this.storage.requestFile(requestId, { kind: 'answer', id, choice: answer.response === 1 ? 'overwrite' : 'cancel', challenge })
    } finally { this.consenting = false }
  }
  async recheck(): Promise<void> {
    if (!this.choosing && !this.consenting && this.status.scope) await this.storage.requestFile(randomUUID(), { kind: 'status', scope: this.status.scope, recheck: true })
  }
}
