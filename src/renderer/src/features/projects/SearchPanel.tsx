import { isEditableKind } from '../../../../shared/outline'
import { TextInput } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type {
  SearchActivity,
  SearchHit,
  SearchInput,
  SearchKind,
  SearchView
} from '../../../../shared/search'
import type { NoteLabel } from '../../../../shared/notes'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader } from '../research/ResearchLayout'
import { sectionPath } from '../research/usage'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import './SearchPanel.css'

const labels: Record<SearchKind, string> = {
  draft: 'Writing',
  note: 'Note',
  source: 'Source',
  question: 'Question',
  claim: 'Claim',
  page: 'Extracted source text'
}
function highlighted(value: string, query: string): React.JSX.Element {
  const at = value.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
  return at < 0 || !query.trim() ? (
    <>{value}</>
  ) : (
    <>
      {value.slice(0, at)}
      <mark>{value.slice(at, at + query.trim().length)}</mark>
      {value.slice(at + query.trim().length)}
    </>
  )
}
export default function SearchPanel({
  project,
  active,
  navigate
}: {
  project: OpenProject
  active: boolean
  navigate: (hit: SearchHit) => void
}): React.JSX.Element {
  const session = useWorkspaceSession()
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState<SearchKind | 'all'>('all'),
    [tag, setTag] = useState(''),
    [section, setSection] = useState(''),
    [source, setSource] = useState('')
  const [sources, setSources] = useState<{ id: string; title: string }[]>([]),
    [tags, setTags] = useState<NoteLabel[]>([])
  const [view, setView] = useState<SearchView | null>(null),
    [activity, setActivity] = useState<SearchActivity | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(0),
    [searching, setSearching] = useState(false),
    [indexProblem, setIndexProblem] = useState(false)
  const [submitted, setSubmitted] = useState(''),
    [retry, setRetry] = useState(0)
  const resultSummary = useRef<HTMLParagraphElement | null>(null),
    focusNextPage = useRef(false)
  const requestKey = JSON.stringify([
    project.headCommitId,
    query,
    kind,
    tag,
    section,
    source,
    offset
  ])
  useEffect(() => {
    if (active && focusNextPage.current && submitted === requestKey && !searching) {
      focusNextPage.current = false
      resultSummary.current?.focus()
    }
  }, [active, submitted, requestKey, searching])
  useEffect(() => {
    if (!active) return
    let live = true
    const scope = { projectId: project.projectId, workspaceId: project.workspaceId }
    void Promise.all([window.collie.readSources(scope), window.collie.readNotes(scope)])
      .then(([sources, notes]) => {
        if (!live) return
        if (sources.ok)
          setSources(
            sources.value.sources.map((row) => ({ id: row.id, title: row.metadata.title }))
          )
        else setError(sources.error.message)
        if (notes.ok)
          setTags(notes.value.labels.filter((row) => row.kind === 'tag' && row.state === 'active'))
        else setError(notes.error.message)
      })
      .catch(() => {
        if (live) setError('Search filters could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [active, project.projectId, project.workspaceId, project.headCommitId, retry])
  useEffect(() => {
    let live = true
    // Search activation and saved edits use the existing incremental owner; polling only observes.
    if (active) {
      void window.collie
        .changeSearch({
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          action: 'activate'
        })
        .then((result) => {
          if (!live) return
          if (result.ok) {
            setActivity(result.value)
            setIndexProblem(false)
            setError('')
          } else {
            setIndexProblem(result.error.code === 'UNAVAILABLE')
            setError(result.error.message)
          }
        })
        .catch(() => {
          if (live) {
            setIndexProblem(true)
            setError('Search could not be opened. Your project content is kept.')
          }
        })
    }
    return () => {
      live = false
    }
  }, [active, project.projectId, project.workspaceId, project.headCommitId, retry])
  const observingWork = activity?.state === 'queued' || activity?.state === 'running'
  useEffect(() => {
    if (!active && !observingWork) return
    let live = true
    const read = (): void => {
      void window.collie
        .readSearchActivity({ projectId: project.projectId, workspaceId: project.workspaceId })
        .then((result) => {
          if (live) {
            if (result.ok) setActivity(result.value)
            else {
              if (result.error.code === 'UNAVAILABLE') {
                setActivity(null)
                setView(null)
              }
              if (active) setError(result.error.message)
            }
          }
        })
        .catch(() => {
          if (live)
            setError(
              'Index activity is unavailable. Your content is retained; retry when storage is available.'
            )
        })
    }
    read()
    const timer = setInterval(read, 2000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [active, observingWork, project.projectId, project.workspaceId, retry])
  const [lastRequestKey, setLastRequestKey] = useState(requestKey)
  if (lastRequestKey !== requestKey) {
    setLastRequestKey(requestKey)
    setSearching(!!query.trim())
  }
  useEffect(() => {
    if (!active) return
    let live = true
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setView(null)
        setSubmitted(requestKey)
        setSearching(false)
        return
      }
      const input: SearchInput = {
        ...{ projectId: project.projectId, workspaceId: project.workspaceId },
        query,
        kind,
        tagId: tag || null,
        documentId: section || null,
        sourceId: source || null,
        offset
      }
      void window.collie
        .search(input)
        .then((result) => {
          if (!live) return
          if (result.ok) {
            setView(result.value)
            setActivity(result.value.activity)
            setSubmitted(requestKey)
            setError('')
          } else setError(result.error.message)
        })
        .catch(() => {
          if (live) setError('Search could not finish. Retry to search saved local content.')
        })
        .finally(() => {
          if (live) setSearching(false)
        })
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [
    active,
    project.projectId,
    project.workspaceId,
    project.headCommitId,
    kind,
    offset,
    query,
    section,
    source,
    tag,
    requestKey,
    activity?.state,
    activity?.processed,
    activity?.indexedHead,
    activity?.currentHead,
    retry
  ])
  async function act(action: 'refresh' | 'rebuild' | 'cancel'): Promise<void> {
    setBusy(true)
    setError('')
    try {
      const result = await window.collie.changeSearch({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId },
        action
      })
      if (result.ok) {
        setActivity(result.value)
        setIndexProblem(false)
      } else setError(result.error.message)
    } catch {
      setError('Search updating could not be confirmed. Retry to check its saved status.')
    } finally {
      setBusy(false)
    }
  }
  const a = activity ?? view?.activity,
    indexing = a?.state === 'running' || a?.state === 'queued',
    current = submitted === requestKey
  const complete = (status: SearchActivity | null | undefined): boolean =>
    status?.state === 'completed' &&
    status.indexedHead === project.headCommitId &&
    status.currentHead === project.headCommitId &&
    status.indexed === status.expected
  const incomplete = !complete(a) || !complete(view?.activity)
  const missingOriginals = !!a && (a.pagesWithoutText > 0 || a.uninspectedSources > 0)
  const indexAction = indexing
    ? 'cancel'
    : a?.state === 'cancelled'
      ? 'refresh'
      : a?.state === 'failed' ||
          indexProblem ||
          (a?.state === 'completed' && a.indexedHead === a.currentHead && a.indexed !== a.expected)
        ? 'rebuild'
        : null
  const indexNotice = indexing
    ? `Updating search… ${a?.processed} of ${a?.total} items checked. Results may be incomplete.`
    : indexAction === 'refresh'
      ? 'Search updating stopped. Results may be incomplete; your writing and originals are kept.'
      : `${a?.error || error || 'Local search data is incomplete or unavailable.'} Rebuilding keeps your project content.`
  useRetainedDraft('search-index-operation', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'search-index',
      entityId: null,
      label: 'local search index',
      dirty: false,
      composing: false,
      busy: busy || indexing,
      pendingOperation: null,
      policy: 'operation',
      status: indexing ? `${a?.processed ?? 0} of ${a?.total ?? 0} records examined` : undefined,
      issue: a?.error ?? undefined,
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'search'
      }
    })
  })
  return (
    <section className="search-panel" aria-label="Search this project">
      <ResearchHeader title="Search">
        Find a phrase in saved writing, notes, research, and extracted source text.
      </ResearchHeader>
      <TextInput
        label="Exact phrase"
        type="search"
        value={query}
        maxLength={200}
        onChange={(event) => {
          setQuery(event.target.value)
          setOffset(0)
        }}
        placeholder="Search this project"
      />
      <details className="research-disclosure">
        <summary>
          Filter results{kind !== 'all' || tag || section || source ? ' · filters applied' : ''}
        </summary>
        <div className="search-filters">
          <SelectField
            label="Content type"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as SearchKind | 'all')
              setOffset(0)
            }}
          >
            <option value="all">All content</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Tag"
            value={tag}
            onChange={(event) => {
              setTag(event.target.value)
              setOffset(0)
            }}
          >
            <option value="">Any tag</option>
            {tags.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Section"
            value={section}
            onChange={(event) => {
              setSection(event.target.value)
              setOffset(0)
            }}
          >
            <option value="">Any section</option>
            {project.documents
              .filter((row) => isEditableKind(row.kind))
              .map((row) => (
                <option key={row.id} value={row.id}>
                  {sectionPath(project.documents, row.id)} · {row.state}
                </option>
              ))}
          </SelectField>
          <SelectField
            label="Source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setOffset(0)
            }}
          >
            <option value="">Any source</option>
            {sources.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </SelectField>
        </div>
        <AppButton
          variant="subtle"
          onClick={() => {
            setKind('all')
            setTag('')
            setSection('')
            setSource('')
            setOffset(0)
          }}
        >
          Clear filters
        </AppButton>
      </details>
      <p className="research-state">
        Search uses locally saved content; edits still being saved are not included.
      </p>
      {error && indexAction !== 'rebuild' ? (
        <p role="alert">
          {error}{' '}
          <AppButton variant="subtle" onClick={() => setRetry((value) => value + 1)}>
            Retry search
          </AppButton>
        </p>
      ) : null}
      {indexAction ? (
        <div className="research-actions">
          <p role={indexAction === 'rebuild' ? 'alert' : 'status'}>{indexNotice}</p>
          <AppButton
            variant={indexing ? 'subtle' : 'default'}
            disabled={busy}
            onClick={() => void act(indexAction)}
          >
            {indexing
              ? 'Stop updating search'
              : indexAction === 'refresh'
                ? 'Continue updating search'
                : 'Rebuild local search'}
          </AppButton>
        </div>
      ) : null}
      {missingOriginals ? (
        <details className="research-disclosure">
          <summary>Some originals are not searchable yet</summary>
          <p>
            {a?.pagesWithoutText ?? 0} pages have no searchable text. {a?.uninspectedSources ?? 0}{' '}
            originals need text preparation or could not be read.
          </p>
          <p>
            Read original prepares supported local text. Image-only or unsupported originals may
            still have no searchable text.
          </p>
          <ul>
            {a?.uninspected.map((row) => (
              <li key={row.id}>
                <AppButton
                  variant="subtle"
                  onClick={() => session.research({ kind: 'inspector', sourceId: row.id })}
                >
                  Read original: {row.title}
                </AppButton>
              </li>
            ))}
          </ul>
          {a && a.uninspectedSources > a.uninspected.length ? (
            <p>Showing the first {a.uninspected.length} originals needing attention.</p>
          ) : null}
          <AppButton variant="subtle" onClick={() => session.research({ kind: 'sources' })}>
            Open sources
          </AppButton>
        </details>
      ) : null}
      <p ref={resultSummary} tabIndex={-1} aria-live="polite">
        {searching
          ? 'Searching…'
          : query.trim() && current && view
            ? `${view.hits.length} results on this page.${incomplete ? ' Search is incomplete.' : ''}${view.hasMore ? ' More results are available.' : ''}`
            : ''}
      </p>
      {!query.trim() ? (
        <EmptyState title="Find the original context">
          Enter a phrase to search within this project. Opening a result keeps your search here for
          the Back action.
        </EmptyState>
      ) : current && view ? (
        <>
          {!view.hits.length ? (
            <EmptyState
              title={
                incomplete
                  ? 'Search is not complete yet'
                  : offset
                    ? 'No more results on this page'
                    : missingOriginals
                      ? 'No matches in searchable content'
                      : 'No matching results'
              }
            >
              {incomplete
                ? 'No matches in the results available so far. More content may match when search finishes updating.'
                : offset
                  ? 'Go back to the previous results or change the phrase.'
                  : 'Try a shorter phrase or clear the filters.'}
              {missingOriginals ? ' Originals without prepared text are not included.' : ''}
            </EmptyState>
          ) : (
            <ol
              className="search-results"
              start={offset + 1}
              tabIndex={0}
              aria-label="Search results"
            >
              {view.hits.map((hit) => (
                <li key={hit.key}>
                  <p className="research-state">
                    {labels[hit.kind]} · {hit.status.replace('_', ' ')}
                    {hit.kind === 'page'
                      ? hit.pageIndex === 0
                        ? ' · plain text'
                        : hit.pageIndex !== null
                          ? ` · PDF page ${hit.pageIndex}`
                          : ' · page unavailable'
                      : ''}
                  </p>
                  <h2>{hit.title}</h2>
                  <p className="search-excerpt">{highlighted(hit.excerpt, query)}</p>
                  <AppButton
                    variant="light"
                    disabled={hit.status === 'stale' || hit.status === 'removed' || searching}
                    onClick={() => navigate(hit)}
                  >
                    Open
                  </AppButton>
                  {hit.status === 'stale' || hit.status === 'removed' ? (
                    <p className="research-state">
                      This result changed or was removed and cannot be opened from here.
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          <div className="research-actions">
            <AppButton
              variant="default"
              disabled={searching || offset === 0}
              onClick={() => {
                focusNextPage.current = true
                setOffset(Math.max(0, offset - 50))
              }}
            >
              Previous results
            </AppButton>
            <AppButton
              variant="default"
              disabled={searching || !view.hasMore || offset >= 10000}
              onClick={() => {
                focusNextPage.current = true
                setOffset(offset + 50)
              }}
            >
              Next results
            </AppButton>
          </div>
        </>
      ) : null}
    </section>
  )
}
