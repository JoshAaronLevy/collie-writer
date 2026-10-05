import { useSynchronousState } from '../../hooks/useSynchronousState'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import styles from './InterchangeImportPanel.module.css'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { ImportPick, ImportPreview, ImportCommitInput } from '../../../../shared/interchange'

type Props = {
  project: OpenProject
  disabled: boolean
  flush: () => Promise<OpenProject | null>
  onProject: (project: OpenProject) => void
}
export default function InterchangeImportPanel({
  project,
  disabled,
  flush,
  onProject
}: Props): React.JSX.Element {
  const scope = { projectId: project.projectId, workspaceId: project.workspaceId }
  const [pick, setPick] = useState<ImportPick | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null)
  const [preserve, setPreserve] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [pendingValue, setPendingValue, pending] = useSynchronousState<ImportCommitInput | null>(
    null
  )
  async function choose(): Promise<void> {
    setBusy(true)
    setError('')
    setPreview(null)
    setPick(null)
    setPendingValue(null)
    try {
      const chosen = await window.collie.pickInterchange(scope)
      if (!chosen.ok) {
        setError(chosen.error.message)
        return
      }
      if (!chosen.value) return
      setPick(chosen.value)
      const result = await window.collie.previewInterchange({ ...scope, token: chosen.value.token })
      if (result.ok) setPreview(result.value)
      else setError(result.error.message)
    } catch {
      setError('The selected file could not be previewed.')
    } finally {
      setBusy(false)
    }
  }
  async function commit(): Promise<void> {
    if (!pick || !preview) return
    setBusy(true)
    setError('')
    try {
      if (!pending.current) {
        const saved = await flush()
        if (!saved) {
          setError('Protect pending writing before importing.')
          return
        }
        setPendingValue({
          ...scope,
          token: pick.token,
          operationId: crypto.randomUUID(),
          expectedHead: saved.headCommitId,
          digest: preview.digest,
          preserveOriginal: preserve
        })
      }
      const input = pending.current
      if (!input) throw new Error('Import request was not retained')
      const result = await window.collie.importInterchange(input)
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') setPendingValue(null)
        setError(
          result.error.code === 'UNAVAILABLE'
            ? 'The import result is unknown. Leave this selection open and retry; a completed import will not be repeated.'
            : result.error.message
        )
        return
      }
      onProject(result.value)
      setPick(null)
      setPreview(null)
      setPendingValue(null)
    } catch {
      setError(
        'The import result is unknown. Leave this selection open and retry; a completed import will not be repeated.'
      )
    } finally {
      setBusy(false)
    }
  }
  useRetainedDraft('writing-import', {
    read: () => ({
      scope,
      kind: 'writing-import',
      entityId: pending.current?.operationId ?? null,
      label: 'writing import',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: pending.current,
      policy: 'operation',
      issue: error || undefined,
      status: busy ? 'Preparing or importing…' : undefined,
      target: { kind: 'workspace', scope, view: 'details' }
    })
  })
  return (
    <section className={styles['writing-import']} aria-labelledby="interchange-import-heading">
      <h2 id="interchange-import-heading">Import writing</h2>
      <p>
        Import UTF-8 text or Markdown as a new section in this project. Existing drafts are never
        matched or replaced by filename. HTML is rejected.
      </p>
      <AppButton
        variant="default"
        type="button"
        disabled={disabled || busy || !!pendingValue}
        onClick={() => {
          void choose()
        }}
      >
        Choose text or Markdown file
      </AppButton>
      {preview ? (
        <div role="status">
          <p>
            {pick?.name}: {preview.blocks} blocks, {preview.bytes} bytes. New section:{' '}
            {preview.title}.
          </p>
          {preview.losses.length ? (
            <ul>
              {preview.losses.map((loss, i) => (
                <li key={i}>{loss}</li>
              ))}
            </ul>
          ) : (
            <p>No mapped-structure losses reported for this file.</p>
          )}
          <p>Preview: {preview.excerpt}</p>
          <ChoiceField
            label="Keep the exact original bytes in this project"
            checked={preserve}
            disabled={!!pendingValue || busy}
            onChange={(e) => setPreserve(e.currentTarget.checked)}
          />
          <AppButton
            variant="default"
            type="button"
            disabled={disabled || busy}
            onClick={() => {
              void commit()
            }}
          >
            Add as new section
          </AppButton>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
