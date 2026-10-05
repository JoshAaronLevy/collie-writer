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
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { useRetainedDraft } from '../workspace/DraftOwner'
import './SearchPanel.css'

const scope = (project: OpenProject) => ({
  projectId: project.projectId,
  workspaceId: project.workspaceId
})
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
  navigate
}: {
  project: OpenProject
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
    [searching, setSearching] = useState(false)
  const [submitted, setSubmitted] = useState(''),
    [retry, setRetry] = useState(0)
  const resultSummary = useRef<HTMLParagraphElement | null>(null),
    focusNextPage = useRef(false)
  const requestKey = JSON.stringify([query, kind, tag, section, source, offset])
  useEffect(() => {
    if (focusNextPage.current && submitted === requestKey && !searching) {
      focusNextPage.current = false
      resultSummary.current?.focus()
    }
  }, [submitted, requestKey, searching])
  useEffect(() => {
    let live = true
    void window.collie
      .readSources(scope(project))
      .then((result) => {
        if (live && result.ok)
          setSources(result.value.sources.map((row) => ({ id: row.id, title: row.metadata.title })))
      })
      .catch(() => {
        if (live) setError('Source filters could not be loaded.')
      })
    void window.collie
      .readNotes(scope(project))
      .then((result) => {
        if (live && result.ok)
          setTags(result.value.labels.filter((row) => row.kind === 'tag' && row.state === 'active'))
      })
      .catch(() => {
        if (live) setError('Tag filters could not be loaded.')
      })
    return () => {
      live = false
    }
  }, [project.projectId, project.workspaceId, project.headCommitId, retry])
  useEffect(() => {
    let live = true
    const read = (): void => {
      void window.collie
        .readSearchActivity(scope(project))
        .then((result) => {
          if (live) {
            if (result.ok) setActivity(result.value)
            else setError(result.error.message)
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
  }, [project.projectId, project.workspaceId, retry])
  useEffect(() => {
    let live = true
    setSearching(!!query.trim())
    const timer = setTimeout(() => {
      if (!query.trim()) {
        setView(null)
        setSubmitted(requestKey)
        setSearching(false)
        return
      }
      const input: SearchInput = {
        ...scope(project),
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
    project.projectId,
    project.workspaceId,
    project.headCommitId,
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
      const result = await window.collie.changeSearch({ ...scope(project), action })
      if (result.ok) setActivity(result.value)
      else setError(result.error.message)
    } catch {
      setError('Index activity could not be updated. Refresh its status before retrying.')
    } finally {
      setBusy(false)
    }
  }
  const a = activity ?? view?.activity,
    indexing = a?.state === 'running' || a?.state === 'queued',
    current = submitted === requestKey
  useRetainedDraft('search-index-operation', {
    read: () => ({
      scope: scope(project),
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
      target: { kind: 'workspace', scope: scope(project), view: 'search' }
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
              .filter((row) => row.kind === 'text')
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
        Search uses saved content. Unsaved edits and PDF pages without extracted text are not
        included.
      </p>
      {error ? (
        <p role="alert">
          {error}{' '}
          <AppButton variant="subtle" onClick={() => setRetry((value) => value + 1)}>
            Retry search and status
          </AppButton>
        </p>
      ) : null}
      <p ref={resultSummary} tabIndex={-1} aria-live="polite">
        {searching
          ? 'Searching…'
          : query.trim() && current && view
            ? `${view.hits.length} results on this page.${view.hasMore ? ' More results are available.' : ''}`
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
            <EmptyState title="No matching results">
              Try a shorter phrase or clear the filters. If content was just saved, check indexing
              below.
            </EmptyState>
          ) : (
            <ol className="search-results" start={offset + 1}>
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
                    Open original context
                  </AppButton>
                  {hit.status === 'stale' || hit.status === 'removed' ? (
                    <p className="research-state">
                      This result changed or was removed. Refresh the index to resolve it; another
                      item will not be substituted.
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
      <details className="research-disclosure">
        <summary>
          Indexing and coverage
          {indexing
            ? ' · updating'
            : a && a.indexedHead !== a.currentHead
              ? ' · saved content not fully indexed'
              : ''}
        </summary>
        {a ? (
          <>
            <p role="status">
              {a.state} · {a.processed} of {a.total} records examined · {a.indexed} entries for{' '}
              {a.expected} searchable records.
            </p>
            <p>
              {a.pagesWithText} extracted pages with text; {a.pagesWithoutText} pages without
              searchable text or with extraction errors. {a.uninspectedSources} sources need
              inspection or extraction.
            </p>
            {a.error ? <p role="alert">{a.error}</p> : null}
            <ul>
              {a.uninspected.map((row) => (
                <li key={row.id}>
                  <AppButton
                    variant="subtle"
                    onClick={() => session.research({ kind: 'inspector', sourceId: row.id })}
                  >
                    {row.title}
                  </AppButton>{' '}
                  · {row.status}
                </li>
              ))}
            </ul>
            {a.uninspectedSources > a.uninspected.length ? (
              <p>Showing the first {a.uninspected.length} sources needing attention.</p>
            ) : null}
          </>
        ) : (
          <p>Loading index status…</p>
        )}
        <div className="research-actions">
          <AppButton
            variant="default"
            disabled={busy || indexing}
            onClick={() => void act('refresh')}
          >
            Refresh index
          </AppButton>
          <AppButton
            variant="subtle"
            disabled={busy || indexing}
            onClick={() => void act('rebuild')}
          >
            Rebuild index
          </AppButton>
          <AppButton
            variant="subtle"
            disabled={busy || !indexing}
            onClick={() => void act('cancel')}
          >
            Cancel indexing
          </AppButton>
        </div>
        <p>The local index can be rebuilt. Cancelling it keeps your writing and originals.</p>
      </details>
    </section>
  )
}
