import { BrowserWindow, dialog, ipcMain, powerMonitor, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { isId } from '../domain/editor/schema'
import { exact, record } from '../shared/projects'
import { CLOSE_REPLY, fileBusy } from '../shared/project-files'
import { isTrustedSender } from './ipc'
import type { ProjectFileIpc } from './project-files-ipc'
import type { AiService } from './ai/service'

/** Close never races a buffer flush, file replacement, or a still-pending local acknowledgment. */
export class ProjectLifecycle {
  private request: Promise<boolean> | undefined
  private pending: { id: string; resolve: (outcome: string) => void } | undefined
  constructor(private readonly owner: () => WebContents | undefined, private readonly files: ProjectFileIpc, private readonly dirty: () => boolean, private readonly devOrigin?: string, private readonly ai?: AiService, private readonly conversationPending:()=>boolean=()=>false) {}
  register(): void {
    ipcMain.on(CLOSE_REPLY, (event, value: unknown) => {
      const pending = this.pending
      if (!pending || !isTrustedSender(event, this.owner(), this.devOrigin) || !record(value) || !exact(value, ['id','outcome']) || !isId(value.id) || !['saved','local','failed','cancel'].includes(String(value.outcome)) || value.id !== pending.id) return
      pending.resolve(String(value.outcome))
    })
    powerMonitor.on('suspend', () => { this.ai?.suspend(); this.files.action('suspend') })
    powerMonitor.on('resume', () => { this.ai?.resume(); void this.files.recheck(); this.files.action('resume') })
  }
  close(): Promise<boolean> {
    if (this.request) return this.request
    this.request = this.closeOnce().then(allowed => {
      if (!allowed) { this.ai?.resume(); this.files.action('close-cancelled') }
      return allowed
    }, error => { this.ai?.resume(); this.files.action('close-cancelled'); throw error }).finally(() => { this.request = undefined })
    return this.request
  }
  private async closeOnce(): Promise<boolean> {
    const owner = this.owner(), window = owner ? BrowserWindow.fromWebContents(owner) : null
    if (this.conversationPending() || this.ai && !await this.ai.prepareClose()) {
      const options = { type: 'warning' as const, title: 'Finishing AI work', message: 'Closing has been paused while AI work is being protected.', detail: 'Finish or cancel the active request and resolve any local storage problem before closing. Writing remains open.', buttons: ['Keep window open'], noLink: true }
      if (window && !window.isDestroyed()) await dialog.showMessageBox(window, options)
      else await dialog.showMessageBox(options)
      return false
    }
    if (!owner || !window) return !this.dirty() && (!fileBusy(this.files.current().job) || this.files.current().job?.kind === 'check')
    const id = randomUUID()
    let timer: ReturnType<typeof setTimeout> | undefined
    const response = new Promise<string>(resolve => {
      this.pending = { id, resolve }
      timer = setTimeout(() => resolve('timeout'), 120000)
    })
    this.files.action('close', id)
    const outcome = await response
    if (timer) clearTimeout(timer)
    this.pending = undefined
    if (window.isDestroyed() || owner !== this.owner()) return false
    if (outcome === 'saved' && !this.dirty() && !fileBusy(this.files.current().job)) return true
    if (outcome === 'cancel') return false
    if (outcome !== 'local' || this.dirty() || fileBusy(this.files.current().job)) {
      await dialog.showMessageBox(window, { type: 'warning', title: 'Keep your writing open', message: 'Closing has been paused.', detail: 'Writing or a file operation has not finished safely. Keep this window open, finish any composition, and retry or copy unprotected text. You can cancel a file operation before replacement begins.', buttons: ['Keep window open'], noLink: true })
      return false
    }
    const answer = await dialog.showMessageBox(window, { type: 'warning', title: 'Writing protected locally', message: 'The chosen project file is not confirmed current.', detail: 'Your draft is protected in this computer’s working folder. You can retry Save, choose another file, or explicitly close with local recovery. Local recovery is not a portable file or cloud upload.', buttons: ['Keep window open','Retry Save','Save As…','Close with local recovery'], defaultId: 0, cancelId: 0, noLink: true })
    if (answer.response === 1 || answer.response === 2) this.files.action('close-cancelled')
    if (answer.response === 1) this.files.action('save')
    if (answer.response === 2) this.files.action('save-as')
    return answer.response === 3 && !this.dirty() && !fileBusy(this.files.current().job)
  }
}
