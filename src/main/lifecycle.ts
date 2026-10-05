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
  constructor(
    private readonly owner: () => WebContents | undefined,
    private readonly files: ProjectFileIpc,
    private readonly dirty: () => boolean,
    private readonly devOrigin?: string,
    private readonly ai?: AiService,
    private readonly conversationPending: () => boolean = () => false
  ) {}
  register(): void {
    ipcMain.on(CLOSE_REPLY, (event, value: unknown) => {
      const pending = this.pending
      if (
        !pending ||
        !isTrustedSender(event, this.owner(), this.devOrigin) ||
        !record(value) ||
        !exact(value, ['id', 'outcome']) ||
        !isId(value.id) ||
        !['saved', 'local', 'failed', 'cancel'].includes(String(value.outcome)) ||
        value.id !== pending.id
      )
        return
      pending.resolve(String(value.outcome))
    })
    powerMonitor.on('suspend', () => {
      this.ai?.suspend()
      this.files.action('suspend')
    })
    powerMonitor.on('resume', () => {
      this.ai?.resumeSession()
      void this.files.recheck()
      this.files.action('resume')
    })
  }
  close(): Promise<boolean> {
    if (this.request) return this.request
    this.request = this.closeOnce()
      .then(
        (allowed) => {
          if (!allowed) {
            this.ai?.resume()
            this.files.action('close-cancelled')
          }
          return allowed
        },
        (error) => {
          this.ai?.resume()
          this.files.action('close-cancelled')
          throw error
        }
      )
      .finally(() => {
        this.request = undefined
      })
    return this.request
  }
  private hasFileWork(): boolean {
    const job = this.files.current().job
    return fileBusy(job) && job?.kind !== 'check'
  }
  private async closeOnce(): Promise<boolean> {
    const owner = this.owner(),
      window = owner ? BrowserWindow.fromWebContents(owner) : null
    // Establish the barrier before a native dialog can yield to other IPC.
    // Keeping the window open must not implicitly stop an active request.
    this.ai?.beginClose()
    let stopProvider = false
    if (this.ai?.hasProviderWork()) {
      const options = {
        type: 'warning' as const,
        title: 'AI work is still active',
        message: 'Stop the active AI work before closing?',
        detail:
          'Stopping preserves any actual output. A stop request does not guarantee cancellation or restored usage. Your writing and drafts still need local protection.',
        buttons: ['Keep window open', 'Stop AI work and continue closing'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }
      const answer =
        window && !window.isDestroyed()
          ? await dialog.showMessageBox(window, options)
          : await dialog.showMessageBox(options)
      if (answer.response !== 1) return false
      stopProvider = true
    }
    if ((this.ai && !(await this.ai.prepareClose(stopProvider))) || this.conversationPending()) {
      const options = {
        type: 'warning' as const,
        title: 'Finishing AI work',
        message: 'Closing has been paused while AI work is being protected.',
        detail:
          'Finish or cancel the active request and resolve any local storage problem before closing. Writing remains open.',
        buttons: ['Keep window open'],
        noLink: true
      }
      if (window && !window.isDestroyed()) await dialog.showMessageBox(window, options)
      else await dialog.showMessageBox(options)
      return false
    }
    if (!owner || !window) return !this.dirty() && !this.hasFileWork()
    const id = randomUUID()
    let timer: ReturnType<typeof setTimeout> | undefined
    const response = new Promise<string>((resolve) => {
      this.pending = { id, resolve }
      timer = setTimeout(() => resolve('timeout'), 120000)
    })
    this.files.action('close', id)
    const outcome = await response
    if (timer) clearTimeout(timer)
    this.pending = undefined
    if (window.isDestroyed() || owner !== this.owner()) return false
    // A protected local draft is sufficient. Closing never requires a portable-file Save.
    if ((outcome === 'saved' || outcome === 'local') && !this.dirty() && !this.hasFileWork())
      return !this.conversationPending() && (!this.ai || (await this.ai.prepareClose()))
    if (outcome === 'cancel') return false
    await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Keep your writing open',
      message: 'Closing has been paused.',
      detail:
        'Writing or a file operation has not finished safely. Keep this window open, finish any composition, and retry or copy unprotected text. You can cancel a file operation before replacement begins.',
      buttons: ['Keep window open'],
      noLink: true
    })
    return false
  }
}
