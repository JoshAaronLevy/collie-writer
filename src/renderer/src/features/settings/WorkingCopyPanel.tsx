import { useEffect, useEffectEvent, useState } from 'react'
import { AppDialog } from '../../components/ui/AppDialog'
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
      target: { kind: 'library' }
    })
  })
  return null
}
export default function WorkingCopyPanel(): React.JSX.Element {
  const session = useWorkspaceSession()
  const [initial] = useState(saved)
  const [pendingValue, setPending, pending] = useSynchronousState<Pending | null>(initial.pending)
  const [busyValue, setBusy, busy] = useSynchronousState(false)
  const [view, setView] = useState<WorkingCopyView | null>(null)
  const [error, setError] = useState(initial.issue)
  const [visible, setVisible] = useState(!!initial.pending)
  const scope = session.localCopyTarget
  const owner = pendingValue?.scope ?? scope ?? view?.scope
  const current = !!owner && !!view && sameScope(owner, view.scope)
  const anotherBusy = (): boolean =>
    session.drafts.states().some((d) => d.id !== 'working-copy-removal' && d.busy)
  const blocked =
    anotherBusy() ||
    !session.available ||
    session.busy ||
    session.acting ||
    session.fileActive ||
    session.closing ||
    session.navigating ||
    busyValue ||
    !!initial.issue
  function targetProtected(target: OpenInput): boolean {
    return (
      (!!session.project && sameScope(session.project, target)) ||
      session.drafts
        .states()
        .some(
          (d) =>
            d.id !== 'working-copy-removal' &&
            sameScope(d.scope, target) &&
            (d.dirty || d.composing || d.busy || d.pendingOperation !== null)
        )
    )
  }
  async function send(input: Exclude<WorkingCopyInput, { kind: 'history' }>): Promise<void> {
    if (blocked || busy.current || anotherBusy()) return
    if (input.kind !== 'status' && targetProtected(input.scope)) {
      setView(null)
      setError(
        session.project && sameScope(session.project, input.scope)
          ? 'Open another project before removing this local copy.'
          : 'This project has unfinished work. Resolve it before removing the local copy.'
      )
      return
    }
    setBusy(true)
    session.drafts.changed()
    setError('')
    try {
      const result = await window.collie.workingCopy(input)
      if (!result.ok) throw new Error(result.error.message)
      const next = result.value.view
      if (!next || !sameScope(next.scope, input.scope)) throw new Error('The project changed.')
      setView(next)
      if (input.kind !== 'preview') {
        localStorage.removeItem(key)
        setPending(null)
      }
    } catch (error) {
      setError(
        `${error instanceof Error ? error.message : 'Local-copy removal is unavailable.'}${pending.current ? ' Check the original outcome before trying again.' : ' No further removal was requested.'}`
      )
      if (input.kind === 'remove') setView(null)
    } finally {
      setBusy(false)
      session.drafts.changed()
      if (input.kind !== 'preview' && !pending.current) void session.refreshData()
    }
  }
  const load = useEffectEvent(() => {
    setVisible(true)
    if (scope && !pending.current) {
      setView(null)
      void send({ kind: 'preview', scope, id: crypto.randomUUID() })
    }
  })
  useEffect(() => {
    if (!scope) return
    const frame = requestAnimationFrame(() => load())
    return () => cancelAnimationFrame(frame)
  }, [scope])
  function close(): void {
    setVisible(false)
    setView(null)
    session.setLocalCopyTarget(null)
  }
  function remove(): void {
    if (
      blocked ||
      pending.current ||
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
      setError('The removal request could not be protected. The local copy was kept.')
      return
    }
    setPending(input)
    session.drafts.changed()
    void send(input)
  }
  const title = owner
    ? (session.list.projects.find((p) => sameScope(p, owner))?.title ?? view?.title ?? 'Project')
    : 'Project'
  return (
    <>
      {owner ? (
        <Protection scope={owner} read={() => ({ busy: busy.current, pending: pending.current })} />
      ) : null}
      <AppDialog
        opened={visible}
        title={`Remove local copy — ${title}`}
        dismissible={!busyValue}
        onClose={close}
      >
        {busyValue ? (
          <p role="status">
            {pendingValue ? 'Removing the local copy…' : 'Checking the saved project file…'}
          </p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {current && view ? (
          <>
            {view.savedPath ? (
              <p className={styles['working-copy-path']}>Saved project: {view.savedPath}</p>
            ) : null}
            {view.phase === 'preview' && view.eligible ? (
              <p>
                Remove this project from this computer and delete {storageBytes(view.bytes!)} of
                verified local files? You will need the saved .collie file to reopen it. That file
                is kept. Removal cannot be undone; small local records are retained.
              </p>
            ) : (
              <p role="status">{view.reason}</p>
            )}
            {view.phase !== 'preview' && view.phase !== 'not-started' ? (
              <p role="status">
                {view.removedFiles} of {view.files ?? 'an unknown number of'} local files confirmed
                removed ({storageBytes(view.removedBytes)}).
              </p>
            ) : null}
          </>
        ) : null}
        <div className={maintenanceStyles['storage-maintenance-actions']}>
          <AppButton variant="default" disabled={busyValue} onClick={close}>
            {pendingValue
              ? 'Close'
              : view?.phase === 'preview' && view.eligible
                ? 'Cancel'
                : 'Done'}
          </AppButton>
          {pendingValue ? (
            <AppButton
              disabled={blocked}
              onClick={() =>
                void send({ kind: 'status', scope: pendingValue.scope, id: pendingValue.id })
              }
            >
              Check removal outcome
            </AppButton>
          ) : current && view?.phase === 'preview' && view.eligible ? (
            <AppButton disabled={blocked} onClick={remove}>
              Remove local copy
            </AppButton>
          ) : scope && !view && !busyValue ? (
            <AppButton
              variant="subtle"
              disabled={blocked}
              onClick={() => void send({ kind: 'preview', scope, id: crypto.randomUUID() })}
            >
              Check again
            </AppButton>
          ) : null}
        </div>
      </AppDialog>
    </>
  )
}
