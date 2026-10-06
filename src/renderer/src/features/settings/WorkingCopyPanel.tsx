import { Checkbox, NativeSelect } from '@mantine/core'
import { useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { sameScope } from '../../../../shared/project-files'
import type { OpenInput } from '../../../../shared/projects'
import {
  isWorkingCopyInput,
  type WorkingCopyInput,
  type WorkingCopyView
} from '../../../../shared/working-copy'
import { storageBytes } from '../../../../shared/storage-space'
import styles from './WorkingCopyPanel.module.css'
import maintenanceStyles from './StorageMaintenance.module.css'

type Pending = Extract<WorkingCopyInput, { kind: 'remove' }>
const key = 'collie.working-copy-removal.v1'
function saved(): { pending: Pending | null; issue: string } {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return { pending: null, issue: '' }
    if (raw.length > 2048) throw new Error('limit')
    const value: unknown = JSON.parse(raw)
    if (!isWorkingCopyInput(value) || value.kind !== 'remove') throw new Error('invalid')
    return { pending: value, issue: '' }
  } catch {
    return {
      pending: null,
      issue:
        'The saved removal request is unreadable. It stays retained; new removal is unavailable in this session.'
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
  useRetainedDraft('working-copy-removal', {
    read: () => ({
      scope,
      kind: 'working-copy-removal',
      entityId: null,
      label: 'local working copy removal',
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
function Outcome({ view }: { view: WorkingCopyView }): React.JSX.Element {
  return (
    <div className={styles['working-copy-outcome']}>
      <p>
        <strong>{view.title ?? 'Local working copy'}</strong>
        {view.retired ? ' · retired from local library' : ''}
      </p>
      <p>{view.reason}</p>
      {view.savedPath ? (
        <p>
          Saved project: <span className={styles['working-copy-path']}>{view.savedPath}</span>
        </p>
      ) : null}
      {view.workspace ? (
        <p>
          Original working folder:{' '}
          <span className={styles['working-copy-path']}>{view.workspace}</span>
        </p>
      ) : null}
      {view.phase === 'preview' && view.eligible ? (
        <p>
          Remove {view.files} verified files ({storageBytes(view.bytes!)}): local project database,
          managed originals, citation files and any verified search cache. Keep{' '}
          {storageBytes(view.retainedBytes!)} of original metadata and operation records, plus
          removal receipts and empty folders.
        </p>
      ) : null}
      {view.phase === 'complete' || view.phase === 'interrupted' ? (
        <p>
          Confirmed removed: {view.removedFiles} of {view.files} files (
          {storageBytes(view.removedBytes)}). These are file lengths; physical space reclaimed may
          differ.
        </p>
      ) : null}
    </div>
  )
}
export default function WorkingCopyPanel({
  active,
  disabled,
  refresh
}: {
  active: boolean
  disabled: boolean
  refresh: () => void
}): React.JSX.Element {
  const session = useWorkspaceSession()
  const [initial] = useState(saved)
  const [pendingValue, setPending, pending] = useSynchronousState<Pending | null>(initial.pending)
  const [busyValue, setBusy, busy] = useSynchronousState(false)
  const [selected, setSelected] = useState('')
  const [view, setView] = useState<WorkingCopyView | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState(initial.issue)
  const [history, setHistory] = useState<WorkingCopyView[]>([])
  const [historyOffset, setHistoryOffset] = useState(0)
  const [more, setMore] = useState(false)
  const [historyRead, setHistoryRead] = useState(false)
  const choices = session.list.projects.filter(
    (p) => !session.project || p.projectId !== session.project.projectId
  )
  const chosen = choices.find((p) => p.workspaceId === selected)
  const scope = chosen ? { projectId: chosen.projectId, workspaceId: chosen.workspaceId } : null
  const owner = pendingValue?.scope ?? scope
  const blocked = disabled || !active || busyValue || !!initial.issue
  const current = !!scope && !!view && sameScope(scope, view.scope)
  function targetProtected(target: OpenInput): boolean {
    return session.drafts
      .states()
      .some(
        (d) =>
          d.id !== 'working-copy-removal' &&
          sameScope(d.scope, target) &&
          (d.dirty || d.composing || d.busy || d.pendingOperation !== null)
      )
  }
  async function send(input: WorkingCopyInput): Promise<void> {
    if (busy.current) return
    if ((input.kind === 'preview' || input.kind === 'remove') && targetProtected(input.scope)) {
      setError(
        'This project still has a retained draft or operation. Resolve it before removing local work.'
      )
      return
    }
    setBusy(true)
    session.drafts.changed()
    setError('')
    setConfirmed(false)
    try {
      const result = await window.collie.workingCopy(input)
      if (!result.ok) {
        setError(
          `${result.error.message}${pending.current ? ' Check outcome before reviewing again.' : ''}`
        )
        if (input.kind === 'remove') setView(null)
        return
      }
      if (input.kind === 'history') {
        setHistoryRead(true)
        setHistory(result.value.history)
        setHistoryOffset(input.offset)
        setMore(result.value.more)
      } else {
        if (!result.value.view || !sameScope(result.value.view.scope, input.scope))
          throw new Error('scope')
        setView(result.value.view)
        if (input.kind !== 'preview') {
          localStorage.removeItem(key)
          setPending(null)
          refresh()
        }
      }
    } catch {
      setError(
        pending.current
          ? 'The outcome is unconfirmed. Check outcome reads the original record and never repeats deletion.'
          : 'The review is unavailable. Files remain retained; try again when storage is available.'
      )
    } finally {
      setBusy(false)
      session.drafts.changed()
    }
  }
  function remove(): void {
    if (
      blocked ||
      pending.current ||
      !confirmed ||
      !current ||
      !view?.eligible ||
      !view.reviewId ||
      targetProtected(view.scope)
    )
      return
    const input: Pending = {
      kind: 'remove',
      id: view.id,
      scope: view.scope,
      reviewId: view.reviewId
    }
    try {
      localStorage.setItem(key, JSON.stringify(input))
    } catch {
      setError('The exact removal request could not be protected. No removal was requested.')
      return
    }
    setPending(input)
    session.drafts.changed()
    void send(input)
  }
  return (
    <section className={styles['working-copy-panel']} aria-labelledby="working-copy-heading">
      {owner ? (
        <Protection scope={owner} read={() => ({ busy: busy.current, pending: pending.current })} />
      ) : null}
      <h3 id="working-copy-heading">Remove local working copy</h3>
      <p>
        Permanently remove eligible local content after checking its saved .collie file. Switch to
        another project first. AI-linked work, migration originals and independent recovery copies
        stay protected. This is separate from cache clearing and Archive.
      </p>
      <NativeSelect
        label="Inactive local project"
        value={chosen ? selected : ''}
        disabled={blocked || !!pendingValue}
        data={[
          { value: '', label: 'Choose a project' },
          ...choices.map((p) => ({
            value: p.workspaceId,
            label: `${p.title}${p.archived ? ' (archived)' : ''}`
          }))
        ]}
        onChange={(event) => {
          setSelected(event.currentTarget.value)
          setView(null)
          setConfirmed(false)
        }}
      />
      {!choices.length ? (
        <p>No inactive projects are available. Open another project, then return here.</p>
      ) : null}
      <div className={maintenanceStyles['storage-maintenance-actions']}>
        <AppButton
          disabled={blocked || !!pendingValue || !scope}
          onClick={() => scope && void send({ kind: 'preview', scope, id: crypto.randomUUID() })}
        >
          Review local copy
        </AppButton>
        {view?.phase === 'preview' && !pendingValue ? (
          <AppButton
            variant="subtle"
            disabled={blocked}
            onClick={() => {
              setView(null)
              setConfirmed(false)
            }}
          >
            Cancel review
          </AppButton>
        ) : null}
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
      {error ? <p role="alert">{error}</p> : null}
      {busyValue ? <p role="status">Reading or protecting the removal outcome…</p> : null}
      {view ? (
        <div role="status">
          <Outcome view={view} />
        </div>
      ) : null}
      {current && view?.eligible && !pendingValue ? (
        <>
          <Checkbox
            checked={confirmed}
            disabled={blocked}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            label="I understand this removes local project content. I will need the saved file to reopen this project."
          />
          <AppButton color="red" disabled={blocked || !confirmed} onClick={remove}>
            Remove local working copy
          </AppButton>
        </>
      ) : null}
      <div className={maintenanceStyles['storage-maintenance-actions']}>
        <AppButton
          variant="default"
          disabled={blocked || !!pendingValue}
          onClick={() => void send({ kind: 'history', id: crypto.randomUUID(), offset: 0 })}
        >
          Show removal history
        </AppButton>
        <AppButton
          variant="default"
          disabled={blocked || !!pendingValue}
          onClick={() => session.run(() => session.openFile())}
        >
          Open project file…
        </AppButton>
      </div>
      {historyRead && !history.length ? <p>No recorded removals on this page.</p> : null}
      {history.length ? (
        <details open>
          <summary>Recorded removals</summary>
          <p>
            Locations are reminders, not file access grants. Open project file asks you to select
            and validate the file. Reset may have moved the original folder into reset recovery.
          </p>
          {history.map((item) => (
            <Outcome key={item.id} view={item} />
          ))}
          <div className={maintenanceStyles['storage-maintenance-actions']}>
            <AppButton
              variant="subtle"
              disabled={blocked || historyOffset === 0 || !!pendingValue}
              onClick={() =>
                void send({
                  kind: 'history',
                  id: crypto.randomUUID(),
                  offset: Math.max(0, historyOffset - 8)
                })
              }
            >
              Previous page
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={blocked || !more || !!pendingValue}
              onClick={() =>
                void send({ kind: 'history', id: crypto.randomUUID(), offset: historyOffset + 8 })
              }
            >
              Next page
            </AppButton>
          </div>
        </details>
      ) : null}
    </section>
  )
}
