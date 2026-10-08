import { BrowserWindow, dialog, ipcMain, powerMonitor, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { isId } from '../domain/editor/schema'
import { exact, record, projectFailure, type ProjectResult } from '../shared/projects'
import { WINDOW_RECOVERY } from '../shared/commands'
import { CLOSE_REPLY, fileBusy } from '../shared/project-files'
import { isTrustedSender } from './ipc'
import type { ProjectFileIpc } from './project-files-ipc'
import type { AiService } from './ai/service'

/** Close never races a buffer flush, file replacement, or a still-pending local acknowledgment. */
export class ProjectLifecycle {
  private request: Promise<boolean> | undefined
  private intent: 'close' | 'restart' | 'update' | undefined
  private lostOwners = new WeakMap<WebContents, number>()
  private recoveryClose: { owner: WebContents; generation: number } | undefined
  private restarting: WebContents | undefined
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
    ipcMain.handle(
      WINDOW_RECOVERY,
      async (event, value: unknown): Promise<ProjectResult<boolean>> => {
        const owner = this.owner()
        if (!isTrustedSender(event, owner, this.devOrigin)) return projectFailure('', 'DENIED')
        if (
          !record(value) ||
          !exact(value, ['requestId', 'input']) ||
          !isId(value.requestId) ||
          (value.input !== 'owner-lost' && value.input !== 'restart')
        )
          return projectFailure('', 'VALIDATION')
        if (value.input === 'owner-lost') {
          this.rendererLost(owner!)
          return { ok: true, requestId: value.requestId, value: true }
        }
        try {
          return { ok: true, requestId: value.requestId, value: await this.settle('restart') }
        } catch {
          return projectFailure(value.requestId, 'UNAVAILABLE')
        }
      }
    )
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
    return this.settle('close')
  }
  closeForUpdate(): Promise<boolean> {
    return this.settle('update')
  }
  /** Losing a renderer owner is not evidence that its drafts were protected. */
  rendererLost(owner: WebContents): void {
    this.lostOwners.set(owner, (this.lostOwners.get(owner) ?? 0) + 1)
    if (this.restarting === owner) this.restarting = undefined
    this.pending?.resolve('failed')
  }
  rendererLoaded(owner: WebContents): void {
    if (this.restarting !== owner) return
    this.restarting = undefined
    this.ai?.resume()
    this.files.action('close-cancelled')
  }
  rendererLoadFailed(owner: WebContents): void {
    if (this.restarting === owner) this.rendererLost(owner)
  }
  private settle(intent: 'close' | 'restart' | 'update'): Promise<boolean> {
    // A native close/update and a recovery request must never share permission
    // to perform two different destructive transitions.
    if (this.restarting) return Promise.resolve(false)
    if (this.request)
      return intent === 'close' && this.intent === 'close' ? this.request : Promise.resolve(false)
    const owner = this.owner()
    this.intent = intent
    this.request = this.closeOnce(intent)
      .then((allowed) => {
        const acknowledgedLoss =
          intent === 'close' &&
          owner &&
          this.recoveryClose?.owner === owner &&
          this.recoveryClose.generation === this.lostOwners.get(owner)
        if (
          owner &&
          (owner.isDestroyed() ||
            owner !== this.owner() ||
            (this.lostOwners.has(owner) && !acknowledgedLoss))
        )
          allowed = false
        if (allowed && intent === 'restart') {
          if (!owner || owner.isDestroyed() || owner !== this.owner() || this.lostOwners.has(owner))
            allowed = false
          else {
            // Keep the outgoing renderer locked until the replacement loads.
            this.restarting = owner
            owner.reload()
          }
        }
        if (!allowed) {
          this.ai?.resume()
          this.files.action('close-cancelled')
        }
        return allowed
      })
      .catch((error: unknown) => {
        this.restarting = undefined
        this.ai?.resume()
        this.files.action('close-cancelled')
        throw error
      })
      .finally(() => {
        this.request = undefined
        this.intent = undefined
        this.recoveryClose = undefined
      })
    return this.request
  }
  private hasFileWork(): boolean {
    const job = this.files.current().job
    return fileBusy(job) && job?.kind !== 'check'
  }
  private async closeOnce(intent: 'close' | 'restart' | 'update'): Promise<boolean> {
    const owner = this.owner(),
      window = owner ? BrowserWindow.fromWebContents(owner) : null
    // Establish the barrier before a native dialog can yield to other IPC.
    // Keeping the window open must not implicitly stop an active request.
    this.ai?.beginClose()
    const lostGeneration = owner ? this.lostOwners.get(owner) : undefined
    if (lostGeneration !== undefined) {
      const options = {
        type: 'warning' as const,
        title: 'Recovery needs attention',
        message: 'The workspace stopped. Some unsaved changes may be missing.',
        detail:
          'Copy any unsaved text you can still see before closing. Closing keeps existing local recovery data and saved project files, but does not save changes that exist only in this window. Automatic restart is paused.',
        buttons:
          intent === 'close'
            ? ['Keep window open', 'Close and keep local recovery']
            : ['Keep window open'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      }
      const answer =
        window && !window.isDestroyed()
          ? await dialog.showMessageBox(window, options)
          : await dialog.showMessageBox(options)
      if (
        intent !== 'close' ||
        answer.response !== 1 ||
        !owner ||
        owner !== this.owner() ||
        owner.isDestroyed() ||
        this.lostOwners.get(owner) !== lostGeneration
      )
        return false
    }
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
    if (owner && lostGeneration !== undefined) {
      if (this.hasFileWork()) {
        const options = {
          type: 'warning' as const,
          title: 'Finishing local work',
          message: 'A project file operation is still running.',
          detail: 'Wait for it to finish or cancel it, then try closing again.',
          buttons: ['Keep window open'],
          noLink: true
        }
        if (window && !window.isDestroyed()) await dialog.showMessageBox(window, options)
        else await dialog.showMessageBox(options)
        return false
      }
      // Native consent acknowledges uncertain window-only state, never a successful Save.
      // AI/content settlement above still applies; a newer loss invalidates this consent.
      this.recoveryClose = { owner, generation: lostGeneration }
      return true
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
    if (window.isDestroyed() || owner !== this.owner() || this.lostOwners.has(owner)) return false
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
