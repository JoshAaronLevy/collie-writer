import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import {
  isRetentionInput,
  type RetentionInput,
  type RetentionView
} from '../../../../shared/retained-versions'
import { sameScope } from '../../../../shared/project-files'
import type { OpenInput } from '../../../../shared/projects'
import { storageBytes } from '../../../../shared/storage-space'
import styles from './RetentionReviewPanel.module.css'
import maintenanceStyles from './StorageMaintenance.module.css'

type Pending = Extract<RetentionInput, { kind: 'remove' }>
type ReviewKind = 'previous' | 'local'
const reviews = {
  previous: {
    key: 'collie.retained-version-action.v1',
    title: 'Older saved versions',
    label: 'previous Save version removal'
  },
  local: {
    key: 'collie.local-artifact-action.v1',
    title: 'Temporary files',
    label: 'completed local artifact removal'
  }
} as const
function saved(key: string): { pending: Pending | null; issue: string } {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return { pending: null, issue: '' }
    if (raw.length > 2048) throw new Error('limit')
    const input: unknown = JSON.parse(raw)
    if (!isRetentionInput(input) || input.kind !== 'remove') throw new Error('invalid')
    return { pending: input, issue: '' }
  } catch {
    return {
      pending: null,
      issue:
        'The saved removal action could not be read. It remains retained; new removal is unavailable in this session.'
    }
  }
}
function Protection({
  scope,
  read,
  kind
}: {
  kind: ReviewKind
  scope: OpenInput
  read: () => { busy: boolean; pending: Pending | null }
}): null {
  useRetainedDraft(`${kind}-retention-action`, {
    read: () => ({
      scope,
      kind: `${kind}-retention`,
      entityId: null,
      label: reviews[kind].label,
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
export default function RetentionReviewPanel({
  kind,
  active,
  disabled,
  refresh
}: {
  kind: ReviewKind
  active: boolean
  disabled: boolean
  refresh: () => void
}): React.JSX.Element {
  const { project, drafts } = useWorkspaceSession()
  const config = reviews[kind]
  const local = kind === 'local'
  const [initial] = useState(() => saved(config.key))
  const [pendingValue, setPending, pending] = useSynchronousState<Pending | null>(initial.pending)
  const [busyValue, setBusy, busy] = useSynchronousState(false)
  const [view, setView] = useState<RetentionView | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState(initial.issue)
  const projectId = project?.projectId
  const workspaceId = project?.workspaceId
  const scope = project ? { projectId: project.projectId, workspaceId: project.workspaceId } : null
  const owner = pendingValue?.scope ?? scope
  const current = !!scope && !!view && sameScope(scope, view.scope)
  const chosen = view?.files.find((f) => f.id === selected && f.state === 'eligible')
  const [message, setMessage] = useState('')
  const stop = useRef(false)
  const inspected = useRef<string | null>(null)
  const anotherBusy = (): boolean =>
    drafts.states().some((d) => d.id !== `${kind}-retention-action` && d.busy)
  const waiting = anotherBusy()
  const blocked = disabled || !active || waiting || busyValue || !!initial.issue
  async function send(input: RetentionInput): Promise<RetentionView> {
    const result = await window.collie[local ? 'localArtifacts' : 'retainedVersions'](input)
    if (!result.ok) throw new Error(result.error.message)
    if (!sameScope(input.scope, result.value.scope)) throw new Error('The project changed.')
    setView(result.value)
    if (input.kind !== 'preview' && result.value.phase !== 'preview') {
      localStorage.removeItem(config.key)
      setPending(null)
    }
    return result.value
  }
  async function preview(target: OpenInput, offset: number): Promise<RetentionView> {
    let next = await send({ kind: 'preview', scope: target, id: crypto.randomUUID(), offset })
    // Temporary files have no per-file decisions. Find the first eligible page internally.
    while (
      local &&
      !stop.current &&
      next.hasOlder &&
      !next.files.some((f) => f.state === 'eligible')
    ) {
      next = await send({
        kind: 'preview',
        scope: target,
        id: crypto.randomUUID(),
        offset: next.offset + 4
      })
    }
    return next
  }
  async function removeFile(next: RetentionView, artifactId: string): Promise<RetentionView> {
    if (!next.reviewId) throw new Error('The file needs to be checked again.')
    const input: Pending = {
      kind: 'remove',
      scope: next.scope,
      id: next.id,
      reviewId: next.reviewId,
      artifactId
    }
    localStorage.setItem(config.key, JSON.stringify(input))
    setPending(input)
    drafts.changed()
    return send(input)
  }
  async function run(action: 'preview' | 'remove' | 'clean' | 'status', offset = 0): Promise<void> {
    if (blocked || busy.current || anotherBusy() || (action !== 'status' && pending.current)) return
    const target = action === 'status' ? pending.current?.scope : scope
    if (!target) return
    setBusy(true)
    stop.current = false
    drafts.changed()
    setError('')
    setMessage('')
    setSelected(null)
    let removed = 0
    try {
      if (action === 'status' && pending.current) {
        const outcome = await send({ kind: 'status', scope: target, id: pending.current.id })
        setMessage(
          outcome.phase === 'not-started'
            ? 'No deletion was recorded. You can check the remaining files again.'
            : 'The original deletion outcome was checked. No deletion was repeated.'
        )
      } else if (action === 'preview') {
        setView(null)
        await preview(target, offset)
      } else if (action === 'remove' && current && chosen && view) {
        const outcome = await removeFile(view, chosen.id)
        const deleted = outcome.files.some((f) => f.id === chosen.id && f.state === 'removed')
        if (deleted) await preview(target, view.offset)
        setMessage(
          deleted
            ? 'Older saved version deleted.'
            : 'Deletion could not be fully confirmed. Check the remaining versions again.'
        )
      } else if (action === 'clean' && current && view) {
        let next = view
        // Each exact file keeps its existing receipt; a settled result precedes the next request.
        for (let attempts = 0; attempts < 4096 && !stop.current; attempts++) {
          const file = next.files.find((f) => f.state === 'eligible')
          if (!file) break
          const outcome = await removeFile(next, file.id)
          if (!outcome.files.some((f) => f.id === file.id && f.state === 'removed')) {
            setMessage(
              `${removed} temporary files cleaned. The last deletion could not be fully confirmed; cleanup stopped.`
            )
            return
          }
          removed++
          if (!stop.current) next = await preview(target, 0)
        }
        setMessage(
          `${removed} temporary file${removed === 1 ? '' : 's'} cleaned.${stop.current ? ' Cleanup stopped; remaining files were kept.' : next.files.some((f) => f.state === 'eligible') ? ' More files remain; clean again when ready.' : ' Project content and recovery were kept.'}`
        )
      }
    } catch (error) {
      setError(
        `${error instanceof Error ? error.message : 'Storage maintenance is unavailable.'}${pending.current ? ' Check the original outcome before trying again.' : ' Remaining files were kept.'}${removed ? ` ${removed} temporary files were cleaned before cleanup stopped.` : ''}`
      )
    } finally {
      setBusy(false)
      drafts.changed()
      if (action !== 'preview' && !pending.current) refresh()
    }
  }
  const load = useEffectEvent(() => {
    const identity = `${projectId}:${workspaceId}`
    if (
      inspected.current === identity ||
      anotherBusy() ||
      pending.current ||
      busy.current ||
      initial.issue
    )
      return
    inspected.current = identity
    void run('preview')
  })
  useEffect(() => {
    if (!active) {
      inspected.current = null
      stop.current = true
      return
    }
    if (disabled || waiting || !projectId) return
    const frame = requestAnimationFrame(() => load())
    return () => {
      cancelAnimationFrame(frame)
      stop.current = true
    }
  }, [active, disabled, waiting, projectId, workspaceId])
  const files =
    current && view?.phase === 'preview' ? view.files.filter((f) => f.state === 'eligible') : []
  return (
    <section
      className={styles['retention-review-panel']}
      aria-labelledby={`${kind}-retention-heading`}
    >
      {owner ? (
        <Protection
          kind={kind}
          scope={owner}
          read={() => ({ busy: busy.current, pending: pending.current })}
        />
      ) : null}
      <h3 id={`${kind}-retention-heading`}>{config.title}</h3>
      <p>
        {project ? `For ${project.title}. ` : 'Open a project first. '}
        {local
          ? 'Only redundant files from completed Save or Backup operations can be cleaned. Project content and recovery are kept.'
          : 'The newest previous version is kept. Deleting an older version is permanent.'}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {busyValue ? (
        <p role="status">
          {pendingValue ? 'Deleting the selected file…' : 'Checking retained files…'}
        </p>
      ) : null}
      {pendingValue ? (
        <AppButton disabled={blocked} onClick={() => void run('status')}>
          Check deletion outcome
        </AppButton>
      ) : local ? (
        <div className={maintenanceStyles['storage-maintenance-actions']}>
          {files.length ? (
            <AppButton variant="default" disabled={blocked} onClick={() => void run('clean')}>
              Clean temporary files
            </AppButton>
          ) : null}
          {!busyValue ? (
            <AppButton
              variant="subtle"
              disabled={blocked || !scope}
              onClick={() => void run('preview')}
            >
              Check temporary files
            </AppButton>
          ) : null}
        </div>
      ) : (
        <>
          {files.length ? (
            <ul className={styles['retention-version-list']}>
              {files.map((file) => (
                <li key={file.id}>
                  <div>
                    <strong>{project?.title}</strong>
                    <p>
                      {file.createdAt ? new Date(file.createdAt).toLocaleString() : 'Date unknown'}{' '}
                      · {file.bytes === null ? 'Size unknown' : storageBytes(file.bytes)}
                    </p>
                  </div>
                  <AppButton
                    variant="default"
                    disabled={blocked || !!pendingValue}
                    onClick={() => setSelected(file.id)}
                  >
                    Delete version…
                  </AppButton>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={maintenanceStyles['storage-maintenance-actions']}>
            <AppButton
              variant="subtle"
              disabled={blocked || !scope}
              onClick={() => void run('preview')}
            >
              Refresh versions
            </AppButton>
            {current && view?.hasOlder ? (
              <AppButton
                variant="subtle"
                disabled={blocked}
                onClick={() => void run('preview', view.offset + 4)}
              >
                More older versions
              </AppButton>
            ) : null}
          </div>
        </>
      )}
      {local && busyValue ? (
        <AppButton
          variant="subtle"
          onClick={() => {
            stop.current = true
          }}
        >
          Stop
        </AppButton>
      ) : null}
      {!busyValue && current && view?.phase === 'preview' && !files.length ? (
        <p>
          {view.limited
            ? 'Some files could not be checked. They remain protected.'
            : local
              ? 'No verified temporary files are available to clean.'
              : 'No deletable older versions on this page. Newest, changed or unverified copies are kept.'}
        </p>
      ) : null}
      {!local ? (
        <AppDialog
          opened={!!chosen && current && !pendingValue}
          title="Delete older saved version"
          onClose={() => setSelected(null)}
        >
          {chosen ? (
            <>
              <p>
                Permanently delete the version of {project?.title} from{' '}
                {chosen.createdAt ? new Date(chosen.createdAt).toLocaleString() : 'an unknown date'}
                ? This cannot be undone.
              </p>
              <p className={styles['retention-review-path']}>{chosen.path}</p>
              <div className={maintenanceStyles['storage-maintenance-actions']}>
                <AppButton variant="default" onClick={() => setSelected(null)}>
                  Cancel
                </AppButton>
                <AppButton disabled={blocked} onClick={() => void run('remove')}>
                  Delete selected version
                </AppButton>
              </div>
            </>
          ) : null}
        </AppDialog>
      ) : null}
    </section>
  )
}
