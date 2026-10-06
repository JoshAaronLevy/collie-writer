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
import { storageBytes } from '../../../../shared/storage-space'
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
  const eligible = view?.files.filter((f) => f.status === 'eligible') ?? []
  const current = !!scope && !!view && sameScope(scope, view.scope)
  const blocked = disabled || !active || busyValue || !!initial.issue
  async function send(input: SearchCacheInput): Promise<void> {
    if (busy.current) return
    setBusy(true)
    drafts.changed()
    setError('')
    try {
      const result = await window.collie.searchCache(input)
      if (!result.ok) {
        setError(
          `${result.error.message}${pending.current ? ' Check the outcome before starting another review.' : ''}`
        )
        if (input.kind === 'clear') setView(null)
        return
      }
      setView(result.value)
      if (input.kind !== 'preview') {
        // A status response runs behind the serialized owner; it never repeats removal.
        if (result.value.phase !== 'preview') {
          localStorage.removeItem(KEY)
          setPending(null)
          refresh()
        }
      }
    } catch {
      setError(
        pending.current
          ? 'The outcome is unconfirmed. Check outcome to read the original receipt; deletion will not be repeated.'
          : 'The search cache review is unavailable. Try again when storage is available.'
      )
    } finally {
      setBusy(false)
      drafts.changed()
    }
  }
  function confirm(): void {
    if (blocked || pending.current || !current || !view?.reviewId || !eligible.length) return
    const input: Pending = {
      kind: 'clear',
      scope: view.scope,
      id: view.id,
      reviewId: view.reviewId
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(input))
    } catch {
      setError('The exact action could not be protected locally. No clearing was requested.')
      return
    }
    setPending(input)
    drafts.changed()
    void send(input)
  }
  return (
    <section className={styles['search-cache-panel']} aria-labelledby="search-cache-heading">
      {owner ? (
        <Protection scope={owner} read={() => ({ busy: busy.current, pending: pending.current })} />
      ) : null}
      <h3 id="search-cache-heading">Clear search cache</h3>
      <p>
        {project
          ? `Current project: ${project.title}. `
          : 'Open a project to review its search cache. '}
        This removes verified search data. Writing, research, citations, saved chats and history
        stay in the project. Search recreates its index when you next open it.
      </p>
      <p>
        Open another project first to review its cache. Unverified files stay retained. If the
        current cache has not been loaded this session, open Search first, then return here.
      </p>
      <div className={maintenanceStyles['storage-maintenance-actions']}>
        <AppButton
          variant="default"
          disabled={blocked || !scope || !!pendingValue}
          onClick={() => {
            if (scope) {
              setView(null)
              void send({ kind: 'preview', scope, id: crypto.randomUUID() })
            }
          }}
        >
          Review search cache
        </AppButton>
        {pendingValue ? (
          <AppButton
            disabled={blocked}
            onClick={() =>
              void send({ kind: 'status', scope: pendingValue.scope, id: pendingValue.id })
            }
          >
            Check outcome
          </AppButton>
        ) : null}
      </div>
      {busyValue ? (
        <p role="status">
          {pendingValue ? 'Settling the reviewed cache action…' : 'Reviewing search files…'}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {pendingValue && !busyValue ? (
        <p role="status">
          A cache action still needs its outcome checked. Its original project and operation are
          retained.
        </p>
      ) : null}
      {view ? (
        <>
          <p className={styles['search-cache-path']}>Reviewed location: {view.path}</p>
          <p role="status">
            {view.phase === 'preview'
              ? `${eligible.length} eligible file(s), ${storageBytes(eligible.reduce((n, f) => n + (f.bytes ?? 0), 0))} in reviewed file lengths.`
              : view.phase === 'not-started'
                ? 'No durable clearing receipt was found for this action at this location. No removal can be confirmed; start a new review to inspect remaining files.'
                : view.phase === 'interrupted'
                  ? 'The earlier action was interrupted. Unknown outcomes remain unconfirmed; this receipt never repeats deletion.'
                  : `${view.files.filter((f) => f.status === 'removed').length} file(s) confirmed removed. Review retained, absent and unknown items below.`}
          </p>
          <p>
            Estimates are file lengths, including any listed SQLite sidecars. Closing SQLite can
            change those lengths or remove sidecars itself. Physical disk space reclaimed is not
            guaranteed.
          </p>
          {view.limited ? (
            <p>
              The review reached its limit. Files stay retained; this is not a complete directory
              listing.
            </p>
          ) : null}
          {view.files.length ? (
            <div className={maintenanceStyles['storage-maintenance-table']}>
              <table>
                <caption>Exact reviewed search files</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Size</th>
                    <th scope="col">Status</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {view.files.map((f) => (
                    <tr key={f.name}>
                      <th scope="row">{f.name}</th>
                      <td>{f.bytes === null ? 'Unknown' : storageBytes(f.bytes)}</td>
                      <td>{f.status}</td>
                      <td>{f.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No search files in this result.</p>
          )}
          {view.phase === 'preview' && !pendingValue ? (
            <div className={maintenanceStyles['storage-maintenance-actions']}>
              <AppButton disabled={blocked || !current || !eligible.length} onClick={confirm}>
                Clear reviewed search cache
              </AppButton>
              <AppButton
                variant="subtle"
                disabled={busyValue}
                onClick={() => {
                  setView(null)
                  setError('')
                }}
              >
                Cancel review
              </AppButton>
            </div>
          ) : null}
          {view.phase === 'preview' && !current ? (
            <p>
              This review belongs to a different project. Review the currently opened project before
              clearing.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
