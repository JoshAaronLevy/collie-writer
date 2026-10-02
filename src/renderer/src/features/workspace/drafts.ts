import type { OpenInput } from '../../../../shared/projects'
import type { AppDestination } from '../../app/navigation'

export type FlushMode = 'navigate' | 'save' | 'replace' | 'close' | 'access'
export type DraftState = {
  scope: OpenInput
  kind: string
  entityId: string | null
  label: string
  dirty: boolean
  composing: boolean
  busy: boolean
  pendingOperation: unknown | null
  policy: 'flush' | 'explicit' | 'retain' | 'operation'
  explicitSave?: boolean
  issue?: string
  status?: string
  target: AppDestination
}
export type DraftHandle = {
  read: () => DraftState
  flush?: (mode: FlushMode) => Promise<boolean>
  focus?: () => void
}
export type DraftBlocker = { id: string; label: string; message: string; target: AppDestination; focus?: () => void }
export type FlushOutcome = 'untouched' | 'protecting' | 'protected' | 'blocked' | 'failed'

/** Registrations refer to retained owners; they never copy an editor, payload or retry request. */
export class DraftRegistry {
  private entries = new Map<string, DraftHandle>()
  private outcomes = new Map<string, FlushOutcome>()
  private listeners = new Set<() => void>()
  private revision = 0
  private signature = ''
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  version = (): number => this.revision
  register(id: string, handle: DraftHandle): () => void {
    this.entries.set(id, handle)
    this.changed()
    return () => {
      if (this.entries.get(id) === handle) { this.entries.delete(id); this.outcomes.delete(id); this.changed() }
    }
  }
  states(): Array<DraftState & { id: string; outcome: FlushOutcome }> {
    return [...this.entries].map(([id, handle]) => ({ ...handle.read(), id, outcome: this.outcomes.get(id) ?? 'untouched' }))
  }
  hasUnprotected(): boolean {
    return this.states().some(state => state.composing || state.dirty && state.policy !== 'retain' || state.pendingOperation !== null)
  }
  changed = (): void => {
    // Only lightweight state enters the notification key. Exact payloads stay with their owners.
    const signature = JSON.stringify(this.states().map(s => [s.id, s.entityId, s.dirty, s.composing, s.busy,
      s.pendingOperation !== null, s.explicitSave, s.issue, s.status, s.outcome]))
    if (signature === this.signature) return
    this.signature = signature; this.revision += 1
    for (const listener of this.listeners) listener()
  }
  private blocker(id: string, handle: DraftHandle, message: string): DraftBlocker {
    const state = handle.read()
    this.outcomes.set(id, 'blocked'); this.changed()
    return { id, label: state.label, message, target: state.target, focus: handle.focus }
  }
  async protect(mode: FlushMode, exclude: string[] = []): Promise<DraftBlocker | null> {
    const priority = (id: string): number => id === 'sources' ? 0 : id === 'notes' ? 1 : 2
    const entries = [...this.entries].filter(([id]) => !exclude.includes(id)).sort(([a], [b]) => priority(a) - priority(b))
    // Reject explicit drafts before any automatic flush. Access-only annotation draining is deliberate.
    for (const [id, handle] of entries) {
      const s = handle.read()
      if (s.composing) return this.blocker(id, handle, `Finish composing in ${s.label} before continuing.`)
      if (s.busy && s.policy === 'explicit') return this.blocker(id, handle, `Wait for ${s.label} to finish, then try again.`)
      if (s.policy === 'operation' && (s.busy || s.pendingOperation) && ['replace', 'close', 'access'].includes(mode))
        return this.blocker(id, handle, `Finish or reconcile ${s.label} before changing projects or closing.`)
      if (s.policy === 'retain' && s.dirty && mode === 'replace')
        return this.blocker(id, handle, `Save or clear ${s.label} before changing projects.`)
      if (s.dirty && (s.policy === 'explicit' || s.explicitSave && mode !== 'access'))
        return this.blocker(id, handle, `Save or explicitly clear ${s.label} before continuing.`)
      if (s.policy === 'flush' && s.busy && (s.dirty || s.pendingOperation))
        return this.blocker(id, handle, `Wait for ${s.label} to finish, then try again.`)
    }
    for (const [id, handle] of entries) {
      const s = handle.read()
      if (s.policy !== 'flush' || (!s.dirty && !s.pendingOperation) || !handle.flush) continue
      this.outcomes.set(id, 'protecting'); this.changed()
      let ok = false
      try { ok = await handle.flush(mode) } catch { /* A rejected IPC leaves the exact owner/request intact. */ }
      this.outcomes.set(id, ok ? 'protected' : 'failed'); this.changed()
      if (!ok) return { id, label: s.label, message: `${s.label} could not be protected. Your draft is retained; return to it to resolve or retry.`, target: s.target, focus: handle.focus }
    }
    return null
  }
}
