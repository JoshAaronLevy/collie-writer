import { Radio } from '@mantine/core'
import { useState } from 'react'
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
    title: 'Previous Save versions',
    label: 'previous Save version removal'
  },
  local: {
    key: 'collie.local-artifact-action.v1',
    title: 'Completed local artifacts',
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
  const scope = project ? { projectId: project.projectId, workspaceId: project.workspaceId } : null
  const owner = pendingValue?.scope ?? scope
  const current = !!scope && !!view && sameScope(scope, view.scope)
  const chosen = view?.files.find((f) => f.id === selected && f.state === 'eligible')
  const blocked = disabled || !active || busyValue || !!initial.issue
  async function send(input: RetentionInput): Promise<void> {
    if (busy.current) return
    setBusy(true)
    drafts.changed()
    setError('')
    try {
      const result = await window.collie[local ? 'localArtifacts' : 'retainedVersions'](input)
      if (!result.ok) {
        setError(
          `${result.error.message}${pending.current ? ' Check the original outcome before reviewing again.' : ''}`
        )
        if (input.kind === 'remove') {
          setView(null)
          setSelected(null)
        }
        return
      }
      setView(result.value)
      setSelected(null)
      if (input.kind !== 'preview' && result.value.phase !== 'preview') {
        localStorage.removeItem(config.key)
        setPending(null)
        refresh()
      }
    } catch {
      setError(
        pending.current
          ? 'The removal outcome is unconfirmed. Check outcome reads the original receipt and never repeats deletion.'
          : 'Retained files could not be reviewed. Files remain retained; retry when storage is available.'
      )
    } finally {
      setBusy(false)
      drafts.changed()
    }
  }
  function remove(): void {
    if (blocked || pending.current || !current || !view?.reviewId || !chosen) return
    const input: Pending = {
      kind: 'remove',
      scope: view.scope,
      id: view.id,
      reviewId: view.reviewId,
      artifactId: chosen.id
    }
    try {
      localStorage.setItem(config.key, JSON.stringify(input))
    } catch {
      setError(
        'The exact removal request could not be protected locally. No removal was requested.'
      )
      return
    }
    setPending(input)
    drafts.changed()
    void send(input)
  }
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
        {project ? `Current project: ${project.title}. ` : 'Open a project first. '}
        {local
          ? 'Review individual leftover files from completed snapshot and Save/Backup inspections. Successful operations normally remove these copies already; an empty review is normal.'
          : 'Review full previous copies created by ordinary Saves to the current destination. These are retained project versions, separate from rebuildable search cache.'}
      </p>
      <p>
        {local
          ? 'Only files proven redundant by their completed owner, released snapshot lease and verified destination are eligible. Select one exact file at a time; small operation receipts and empty folders stay retained.'
          : 'The newest previous copy, selected files, explicit backups and uncertain records stay protected. Choose one older verified copy at a time, preferably oldest first so its newer replacement remains available for review.'}{' '}
        Removal is permanent; there is no Undo.
      </p>
      {local ? (
        <details>
          <summary>What stays protected</summary>
          <ul>
            <li>Incoming files and inspection copies without a durable consumption receipt.</li>
            <li>
              Untransferred snapshots, provisional/exact leases, interrupted or unreadable journals,
              and changed destinations.
            </li>
            <li>Exports while publication and result recovery remain unresolved.</li>
            <li>
              Migration originals, reset recovery, managed assets, local writing/history, and AI
              output or recovery records.
            </li>
            <li>
              Unknown files, unsupported or oversized payloads, and unresolved or reappearing
              removals.
            </li>
          </ul>
          <p>
            These bytes remain in the storage breakdown and their existing recovery controls remain
            available. This review never reruns Save, import, export or AI work.
          </p>
        </details>
      ) : null}
      <div className={maintenanceStyles['storage-maintenance-actions']}>
        <AppButton
          variant="default"
          disabled={blocked || !scope || !!pendingValue}
          onClick={() => {
            if (scope) {
              setView(null)
              setSelected(null)
              void send({ kind: 'preview', scope, id: crypto.randomUUID(), offset: 0 })
            }
          }}
        >
          {local ? 'Review completed local artifacts' : 'Review previous Save versions'}
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
        ) : null}
      </div>
      {busyValue ? (
        <p role="status">
          {pendingValue
            ? 'Settling the reviewed removal…'
            : 'Reading local journals and verifying saved archives…'}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {pendingValue && !busyValue ? (
        <p role="status">
          The original removal still needs its outcome checked before another review, project change
          or close.
        </p>
      ) : null}
      {view ? (
        <>
          <p role="status">{view.message}</p>
          {view.phase === 'preview' ? (
            <div className={maintenanceStyles['storage-maintenance-actions']}>
              <AppButton
                variant="subtle"
                disabled={blocked || !!pendingValue || !current || view.offset === 0}
                onClick={() => {
                  if (scope)
                    void send({
                      kind: 'preview',
                      scope,
                      id: crypto.randomUUID(),
                      offset: Math.max(0, view.offset - 4)
                    })
                }}
              >
                {local ? 'Previous files' : 'Newer versions'}
              </AppButton>
              <AppButton
                variant="subtle"
                disabled={
                  blocked || !!pendingValue || !current || !view.hasOlder || view.offset >= 4096
                }
                onClick={() => {
                  if (scope)
                    void send({
                      kind: 'preview',
                      scope,
                      id: crypto.randomUUID(),
                      offset: view.offset + 4
                    })
                }}
              >
                {local ? 'More files' : 'Older versions'}
              </AppButton>
            </div>
          ) : null}
          {view.limited ? (
            <p>
              This bounded review is incomplete. Uninspected or unavailable files remain retained.
            </p>
          ) : null}
          <p>
            Sizes are file lengths. Physical space reclaimed can differ. Archive ownership and
            snapshot dates come from inspected content; unknown values are shown explicitly.
            {local ? ' Local artifacts must match the verified destination snapshot.' : null}
          </p>
          {view.files.length ? (
            <div className={maintenanceStyles['storage-maintenance-table']}>
              <table>
                <caption>
                  {local
                    ? 'Local artifact files and owning operations'
                    : 'Previous versions, oldest inspected first'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Choose / file</th>
                    <th scope="col">Snapshot</th>
                    <th scope="col">Size</th>
                    <th scope="col">Status and reason</th>
                  </tr>
                </thead>
                <tbody>
                  {view.files.map((file) => (
                    <tr key={file.id}>
                      <td>
                        {view.phase === 'preview' && file.state === 'eligible' ? (
                          <Radio
                            name={`${kind}-retention-selection`}
                            label={
                              local
                                ? `Select ${file.path}`
                                : `Select snapshot ${file.createdAt ? new Date(file.createdAt).toLocaleString() : 'with unknown date'}`
                            }
                            checked={selected === file.id}
                            onChange={() => setSelected(file.id)}
                            disabled={blocked || !!pendingValue || !current}
                          />
                        ) : null}
                        <span className={styles['retention-file-path']}>{file.path}</span>
                      </td>
                      <td>
                        {file.createdAt
                          ? new Date(file.createdAt).toLocaleString()
                          : 'Unknown date'}
                        <br />
                        {file.projectId === project?.projectId
                          ? 'Current project'
                          : file.projectId
                            ? 'Different project'
                            : 'Unverified project'}
                        <details>
                          <summary>Snapshot identity</summary>
                          <p>
                            Project: {file.projectId ?? 'Unknown'}
                            <br />
                            Snapshot: {file.snapshotId ?? 'Unknown'}
                            <br />
                            Revision: {file.head ?? 'Unknown'}
                          </p>
                        </details>
                      </td>
                      <td>{file.bytes === null ? 'Unknown' : storageBytes(file.bytes)}</td>
                      <td>
                        {file.state}
                        <br />
                        {file.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {local
                ? 'No leftover files are listed in this bounded review. Other recovery categories remain protected and visible in the storage breakdown.'
                : 'No previous versions are listed in this review.'}
            </p>
          )}
          {view.phase === 'preview' && !pendingValue ? (
            <>
              {chosen ? (
                <p className={styles['retention-file-path']}>
                  Selected for permanent removal: {chosen.path} (
                  {chosen.bytes === null ? 'unknown size' : storageBytes(chosen.bytes)}).
                </p>
              ) : null}
              <div className={maintenanceStyles['storage-maintenance-actions']}>
                <AppButton disabled={blocked || !current || !chosen} onClick={remove}>
                  {local
                    ? 'Permanently remove selected local file'
                    : 'Permanently remove selected previous version'}
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={busyValue}
                  onClick={() => {
                    setView(null)
                    setSelected(null)
                    setError('')
                  }}
                >
                  Cancel review
                </AppButton>
              </div>
              {!current ? (
                <p>
                  This review belongs to another project. Review the current project before removing
                  anything.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
