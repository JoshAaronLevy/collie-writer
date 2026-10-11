import { useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import {
  isSearchCacheInput,
  type SearchCacheInput,
  type SearchCacheView
} from '../../../../shared/search-cache'
import { sameScope } from '../../../../shared/project-files'
import type { OpenInput } from '../../../../shared/projects'
import styles from './SearchCachePanel.module.css'
import maintenanceStyles from './StorageMaintenance.module.css'

type Pending = Extract<SearchCacheInput, { kind: 'clear' }>
const KEY = 'collie.search-cache-action.v1'
function saved(): { pending: Pending | null; issue: string } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return { pending: null, issue: '' }
    if (raw.length > 2048) throw new Error('limit')
    const input: unknown = JSON.parse(raw)
    if (!isSearchCacheInput(input) || input.kind !== 'clear') throw new Error('invalid')
    return { pending: input, issue: '' }
  } catch {
    return {
      pending: null,
      issue:
        'The saved cache action could not be read. It has been retained; new clearing is unavailable in this session.'
    }
  }
}
function Protection({
  scope,
  read
}: {
  scope: OpenInput
  read: () => { busy: boolean; pending: Pending | null }
}): null {
  useRetainedDraft('search-cache-action', {
    read: () => ({
      scope,
      kind: 'search-cache',
      entityId: null,
      label: 'search cache clearing',
      dirty: false,
      composing: false,
      busy: read().busy,
      pendingOperation: read().pending,
      policy: 'operation',
      target: { kind: 'settings', page: 'data' }
    })
  })
  return null
}
export default function SearchCachePanel({
  active,
  disabled,
  refresh
}: {
  active: boolean
  disabled: boolean
  refresh: () => void
}): React.JSX.Element {
  const { project, drafts } = useWorkspaceSession()
  const [initial] = useState(saved)
  const [pendingValue, setPending, pending] = useSynchronousState<Pending | null>(initial.pending)
  const [busyValue, setBusy, busy] = useSynchronousState(false)
  const [view, setView] = useState<SearchCacheView | null>(null)
  const [error, setError] = useState(initial.issue)
  const scope = project ? { projectId: project.projectId, workspaceId: project.workspaceId } : null
  const owner = pendingValue?.scope ?? scope
  const anotherBusy = (): boolean =>
    drafts.states().some((d) => d.id !== 'search-cache-action' && d.busy)
  const blocked = anotherBusy() || disabled || !active || busyValue || !!initial.issue
  async function send(input: SearchCacheInput): Promise<SearchCacheView> {
    const result = await window.collie.searchCache(input)
    if (!result.ok) throw new Error(result.error.message)
    if (!sameScope(input.scope, result.value.scope)) throw new Error('The project changed.')
    setView(result.value)
    if (input.kind !== 'preview' && result.value.phase !== 'preview') {
      localStorage.removeItem(KEY)
      setPending(null)
      refresh()
    }
    return result.value
  }
  async function clear(): Promise<void> {
    if (blocked || busy.current || anotherBusy() || pending.current || !scope) return
    setBusy(true)
    drafts.changed()
    setError('')
    try {
      const preview = await send({ kind: 'preview', scope, id: crypto.randomUUID() })
      if (!preview.reviewId || !preview.files.some((f) => f.status === 'eligible')) return
      const input: Pending = {
        kind: 'clear',
        scope,
        id: preview.id,
        reviewId: preview.reviewId
      }
      localStorage.setItem(KEY, JSON.stringify(input))
      setPending(input)
      drafts.changed()
      await send(input)
    } catch (error) {
      setError(
        `${error instanceof Error ? error.message : 'Search cache clearing is unavailable.'}${pending.current ? ' Check the outcome before trying again.' : ' No further clearing was requested.'}`
      )
    } finally {
      setBusy(false)
      drafts.changed()
    }
  }
  async function check(): Promise<void> {
    if (blocked || busy.current || anotherBusy() || !pending.current) return
    setBusy(true)
    drafts.changed()
    setError('')
    try {
      await send({ kind: 'status', scope: pending.current.scope, id: pending.current.id })
    } catch {
      setError(
        'The outcome is still unavailable. The original request stays retained; checking never repeats deletion.'
      )
    } finally {
      setBusy(false)
      drafts.changed()
    }
  }
  const removed = view?.files.filter((f) => f.status === 'removed').length ?? 0
  const unresolved = view?.files.some((f) => f.status === 'unknown')
  return (
    <section
      className={styles['search-cache-panel']}
      aria-labelledby="search-cache-heading"
      id="storage-cache-breakdown"
      tabIndex={-1}
    >
      {owner ? (
        <Protection scope={owner} read={() => ({ busy: busy.current, pending: pending.current })} />
      ) : null}
      <h3 id="search-cache-heading">Search cache</h3>
      <p>
        {project ? `For ${project.title}. ` : 'Open a project to clear its search cache. '}Search
        data rebuilds when needed. Your project content and history are kept.
      </p>
      <div className={maintenanceStyles['storage-maintenance-actions']}>
        {pendingValue ? (
          <AppButton disabled={blocked} onClick={() => void check()}>
            Check clearing outcome
          </AppButton>
        ) : (
          <AppButton variant="default" disabled={blocked || !scope} onClick={() => void clear()}>
            Clear search cache
          </AppButton>
        )}
      </div>
      {busyValue ? (
        <p role="status">{pendingValue ? 'Clearing search cache…' : 'Checking search data…'}</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {!busyValue && view && !!owner && sameScope(owner, view.scope) ? (
        <p role="status">
          {view.phase === 'preview'
            ? view.files.length
              ? 'No verified search cache can be cleared. Unverified files are kept.'
              : 'There is no search cache to clear.'
            : view.phase === 'not-started'
              ? 'No clearing was recorded. You can try again.'
              : view.phase === 'interrupted' || unresolved
                ? 'Clearing could not be fully confirmed. Unverified files are kept.'
                : `${removed} search file${removed === 1 ? '' : 's'} cleared. Project content was kept.`}
          {view.limited ? ' Some files could not be checked.' : ''}
        </p>
      ) : null}
    </section>
  )
}
