import { readableWriting } from './readableWriting'
import { ProofreadingPanel } from '../ai/proofreading/ProofreadingPanel'
import { useEffect, useMemo, useState } from 'react'
import { SelectField, AppButton } from '../../components/ui/Controls'
import type { Note } from '../../../../shared/notes'
import type { SourceRecord } from '../../../../shared/sources'
import type { InspectionView } from '../../../../shared/inspection'
import { SectionSources } from '../research/SourceUsage'
import { useResearchData } from '../research/researchContext'
import { useWorkspaceSession } from './workspaceContext'
import { ConversationPanel } from '../ai/conversations/ConversationPanel'
import type { SecondaryPanel } from './useWritingPreferences'
import styles from './WritingWorkspace.module.css'

export function WritingSidePanel({
  mode,
  active
}: {
  mode: SecondaryPanel
  active: boolean
}): React.JSX.Element {
  const { project, research, writingView } = useWorkspaceSession()
  const researchData = useResearchData()
  const [notes, setNotes] = useState<Note[]>([]),
    [sources, setSources] = useState<SourceRecord[]>([])
  const [noteId, setNoteId] = useState(''),
    [sourceId, setSourceId] = useState(''),
    [inspection, setInspection] = useState<InspectionView | null>(null)
  const [issue, setIssue] = useState(''),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0)
  const projectId = project?.projectId,
    workspaceId = project?.workspaceId
  const scope = useMemo(
    () => (projectId && workspaceId ? { projectId, workspaceId } : null),
    [projectId, workspaceId]
  )
  const loadKey = `${projectId}:${workspaceId}:${mode}:${revision}:${active}:${project?.headCommitId}`
  const [lastLoadKey, setLastLoadKey] = useState('')
  if (lastLoadKey !== loadKey) {
    setLastLoadKey(loadKey)
    setLoading(active && !!scope && (mode === 'notes' || mode === 'source'))
    setIssue('')
  }
  const inspectionKey = `${loadKey}:${sourceId}`
  const [lastInspectionKey, setLastInspectionKey] = useState(inspectionKey)
  if (lastInspectionKey !== inspectionKey) {
    setLastInspectionKey(inspectionKey)
    setInspection(null)
  }
  useEffect(() => {
    if (!active || !scope || !['notes', 'source'].includes(mode)) return
    let current = true
    if (mode === 'notes')
      void window.collie
        .readNotes(scope)
        .then((result) => {
          if (!current) return
          if (result.ok) setNotes(result.value.notes.filter((note) => note.state === 'active'))
          else setIssue(result.error.message)
        })
        .catch(() => {
          if (current)
            setIssue(
              'Saved content could not be loaded. Your writing is unchanged; try Refresh saved content.'
            )
        })
        .finally(() => {
          if (current) setLoading(false)
        })
    else
      void window.collie
        .readSources(scope)
        .then((result) => {
          if (!current) return
          if (result.ok)
            setSources(result.value.sources.filter((source) => source.state === 'active'))
          else setIssue(result.error.message)
        })
        .catch(() => {
          if (current)
            setIssue(
              'Saved content could not be loaded. Your writing is unchanged; try Refresh saved content.'
            )
        })
        .finally(() => {
          if (current) setLoading(false)
        })
    return () => {
      current = false
    }
  }, [scope, mode, revision, active, project?.headCommitId])
  useEffect(() => {
    if (!active || !scope || mode !== 'source' || !sourceId) return
    let current = true
    void window.collie
      .readInspection({ ...scope, sourceId })
      .then((result) => {
        if (current) {
          if (result.ok) setInspection(result.value)
          else setIssue(result.error.message)
        }
      })
      .catch(() => {
        if (current) setIssue('Saved excerpts could not be loaded. Try Refresh saved content.')
      })
    return () => {
      current = false
    }
  }, [scope, sourceId, mode, revision, active, project?.headCommitId])
  const note = notes.find((item) => item.id === noteId),
    source = sources.find((item) => item.id === sourceId)
  return (
    <div className={styles['writing-side-content']}>
      <h2>{mode === 'notes' ? 'Notes' : mode === 'source' ? 'Sources' : 'AI assistance'}</h2>
      <div hidden={mode !== 'ai'} inert={mode !== 'ai'}>
        <SelectField
          label="AI assistance"
          value={writingView.aiTool}
          onChange={(event) =>
            writingView.setAiTool(event.currentTarget.value as 'conversation' | 'proofreading')
          }
        >
          <option value="conversation">Conversations</option>
          <option value="proofreading">Proofreading</option>
        </SelectField>
        <div
          hidden={writingView.aiTool !== 'conversation'}
          inert={writingView.aiTool !== 'conversation'}
        >
          <ConversationPanel />
        </div>
        <div
          hidden={writingView.aiTool !== 'proofreading'}
          inert={writingView.aiTool !== 'proofreading'}
        >
          <ProofreadingPanel />
        </div>
      </div>
      {mode !== 'ai' ? (
        <>
          <p>
            Saved content alongside your manuscript. Open Research to edit or inspect the original.
          </p>
          {loading ? (
            <p role="status">Loading saved {mode === 'notes' ? 'notes' : 'sources'}…</p>
          ) : null}
          {issue ? <p role="alert">{issue}</p> : null}
          {mode === 'notes' ? (
            <>
              <SelectField
                label="Saved note"
                value={noteId}
                onChange={(event) => setNoteId(event.currentTarget.value)}
              >
                <option value="">Choose a note</option>
                {notes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || 'Untitled note'}
                  </option>
                ))}
              </SelectField>
              {note ? (
                <>
                  <h3>{note.title || 'Untitled note'}</h3>
                  <div className={styles['writing-reference-text']}>
                    {readableWriting(note.body.ast) || 'This note is empty.'}
                  </div>
                  <AppButton
                    variant="default"
                    onClick={() => research({ kind: 'notes', noteId: note.id })}
                  >
                    Edit note in Research
                  </AppButton>
                </>
              ) : (
                <p>{notes.length ? 'Choose a saved note to read here.' : 'No saved notes yet.'}</p>
              )}
              <h3>Questions & claims for this section</h3>
              {researchData.view ? (
                [
                  ...researchData.view.questions.map((item) => ({
                    item,
                    kind: 'question' as const
                  })),
                  ...researchData.view.claims.map((item) => ({ item, kind: 'claim' as const }))
                ]
                  .filter(({ item }) => item.documentId === project?.documentId)
                  .map(({ item, kind }) => (
                    <AppButton
                      key={item.id}
                      variant="subtle"
                      className={styles['writing-related-item']}
                      onClick={() => research({ kind: 'evidence', item: { kind, id: item.id } })}
                    >
                      {item.text} · {item.state}
                    </AppButton>
                  ))
              ) : (
                <p>{researchData.error || 'Research connections are loading.'}</p>
              )}
              <AppButton variant="subtle" onClick={() => research({ kind: 'evidence' })}>
                Open questions & claims
              </AppButton>
              <AppButton variant="subtle" onClick={() => research({ kind: 'notes' })}>
                Open notes and annotations
              </AppButton>
            </>
          ) : (
            <>
              <SectionSources chooseSource={setSourceId} />
              <SelectField
                label="Read excerpts from a source"
                value={sourceId}
                onChange={(event) => setSourceId(event.currentTarget.value)}
              >
                <option value="">Choose a source</option>
                {sources.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.metadata.title}
                  </option>
                ))}
              </SelectField>
              {source ? (
                <>
                  <h3>{source.metadata.title}</h3>
                  <p>
                    {source.metadata.author
                      .map((author) => author.literal || `${author.given} ${author.family}`.trim())
                      .join(', ')}{' '}
                    {source.metadata.issued}
                  </p>
                  <p>{source.verified ? 'Metadata reviewed' : 'Metadata needs review'}</p>
                  <AppButton
                    variant="default"
                    onClick={() => research({ kind: 'inspector', sourceId: source.id })}
                  >
                    Inspect original in Research
                  </AppButton>
                  <h3>Retained excerpts</h3>
                  {inspection?.sourceId === source.id ? (
                    inspection.excerpts.length ? (
                      inspection.excerpts.slice(0, 20).map((excerpt) => (
                        <blockquote className={styles['writing-source-excerpt']} key={excerpt.id}>
                          <p>{excerpt.quote}</p>
                          <p className={styles['writing-excerpt-origin']}>
                            {excerpt.kind}
                            {excerpt.versionId === inspection.activeVersionId
                              ? ' · Active source version'
                              : ' · Earlier source version'}
                          </p>
                          <AppButton
                            variant="subtle"
                            onClick={() =>
                              research({
                                kind: 'inspector',
                                sourceId: source.id,
                                excerptId: excerpt.id
                              })
                            }
                          >
                            {excerpt.label || 'Open excerpt'}
                            {excerpt.pageLabel ? ` · ${excerpt.pageLabel}` : ''}
                          </AppButton>
                        </blockquote>
                      ))
                    ) : (
                      <p>No retained excerpts for this source.</p>
                    )
                  ) : (
                    <p>
                      {issue ? 'Excerpts unavailable. Use Refresh to retry.' : 'Loading excerpts…'}
                    </p>
                  )}
                  {inspection && inspection.excerpts.length > 20 ? (
                    <p>Showing the first 20 excerpts. Open Research to see all.</p>
                  ) : null}
                </>
              ) : (
                <p>
                  {sources.length
                    ? 'Choose a source to read its saved excerpts.'
                    : 'Add a source in Research to begin.'}
                </p>
              )}
              <AppButton variant="subtle" onClick={() => research({ kind: 'sources' })}>
                Open Sources
              </AppButton>
            </>
          )}
          <AppButton variant="subtle" onClick={() => setRevision((value) => value + 1)}>
            Refresh saved content
          </AppButton>
        </>
      ) : null}
    </div>
  )
}
