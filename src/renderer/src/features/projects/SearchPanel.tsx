import { useEffect, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { SearchActivity, SearchHit, SearchInput, SearchKind, SearchView } from '../../../../shared/search'
import type { NoteLabel } from '../../../../shared/notes'

const scope=(p:OpenProject)=>({projectId:p.projectId,workspaceId:p.workspaceId})
function highlighted(value:string,query:string):React.JSX.Element {const at=value.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase());return at<0||!query.trim()?<>{value}</>:<>{value.slice(0,at)}<mark>{value.slice(at,at+query.trim().length)}</mark>{value.slice(at+query.trim().length)}</>}
export default function SearchPanel({project,navigate}:{project:OpenProject;navigate:(hit:SearchHit)=>void}):React.JSX.Element {
  const [query,setQuery]=useState(''),[kind,setKind]=useState<SearchKind|'all'>('all'),[tag,setTag]=useState(''),[section,setSection]=useState(''),[source,setSource]=useState('')
  const [sources,setSources]=useState<{id:string;title:string}[]>([]),[tags,setTags]=useState<NoteLabel[]>([])
  const [view,setView]=useState<SearchView|null>(null),[activity,setActivity]=useState<SearchActivity|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0)
  useEffect(()=>{let live=true;void window.collie.readSources(scope(project)).then(r=>{if(live&&r.ok)setSources(r.value.sources.map(s=>({id:s.id,title:s.metadata.title})))});void window.collie.readNotes(scope(project)).then(r=>{if(live&&r.ok)setTags(r.value.labels.filter(l=>l.kind==='tag'&&l.state==='active'))});return()=>{live=false}},[project.projectId,project.workspaceId,project.headCommitId])
  useEffect(()=>{let live=true;const read=()=>{void window.collie.readSearchActivity(scope(project)).then(r=>{if(live){if(r.ok)setActivity(r.value);else setError(r.error.message)}})};read();const timer=setInterval(read,2000);return()=>{live=false;clearInterval(timer)}},[project.projectId,project.workspaceId])
  useEffect(()=>{setOffset(0)},[query,kind,tag,section,source])
  useEffect(()=>{let live=true;const timer=setTimeout(()=>{const input:SearchInput={...scope(project),query,kind,tagId:tag||null,documentId:section||null,sourceId:source||null,offset};void window.collie.search(input).then(r=>{if(!live)return;if(r.ok){setView(r.value);setActivity(r.value.activity);setError('')}else setError(r.error.message)})},250);return()=>{live=false;clearTimeout(timer)}},[project.projectId,project.workspaceId,query,kind,tag,section,source,offset,activity?.state,activity?.processed])
  async function act(action:'refresh'|'rebuild'|'cancel'):Promise<void>{setBusy(true);setError('');try{const r=await window.collie.changeSearch({...scope(project),action});if(r.ok)setActivity(r.value);else setError(r.error.message)}finally{setBusy(false)}}
  const a=activity??view?.activity
  return <section className="search-panel" aria-labelledby="local-search-title">
    <h2 id="local-search-title">Local search and indexing activity</h2>
    <p>Searches committed local content. Unsaved editor text and unextracted PDF pages are not searchable. Search results are a rebuildable index; your originals remain in the project.</p>
    <div className="search-filters">
      <label>Exact phrase <input type="search" value={query} maxLength={200} onChange={e=>setQuery(e.target.value)} placeholder="Search a phrase" /></label>
      <label>Type <select value={kind} onChange={e=>setKind(e.target.value as SearchKind|'all')}><option value="all">All</option>{(['draft','note','source','question','claim','page'] as const).map(type=><option key={type} value={type}>{type}</option>)}</select></label>
      <label>Tag <select value={tag} onChange={e=>setTag(e.target.value)}><option value="">Any</option>{tags.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Section <select value={section} onChange={e=>setSection(e.target.value)}><option value="">Any</option>{project.documents.filter(d=>d.kind==='text').map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
      <label>Source <select value={source} onChange={e=>setSource(e.target.value)}><option value="">Any</option>{sources.map(s=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    </div>
    {a?<div role="status"><p>Index: {a.state} · {a.processed} of {a.total} records examined · {a.indexed} entries for {a.expected} searchable records. {a.indexedHead!==a.currentHead?'The index has not caught up with the current project commit.':''}</p><p>Extracted pages with text: {a.pagesWithText}. Pages without searchable text or with extraction errors: {a.pagesWithoutText}. Active sources without fully indexed inspection: {a.uninspectedSources}.</p>{a.uninspected.length?<details><summary>Sources still needing inspection or extraction ({a.uninspectedSources})</summary><ul>{a.uninspected.map(s=><li key={s.id}>{s.title} · {s.status}</li>)}</ul>{a.uninspectedSources>a.uninspected.length?<p>Showing the first {a.uninspected.length} sources.</p>:null}</details>:null}{a.error?<p>{a.error}</p>:null}</div>:null}
    <div className="project-actions"><button type="button" disabled={busy||a?.state==='running'||a?.state==='queued'} onClick={()=>void act('refresh')}>Retry or refresh index</button><button type="button" disabled={busy||a?.state==='running'||a?.state==='queued'} onClick={()=>void act('rebuild')}>Rebuild local index</button><button type="button" disabled={busy||a?.state!=='running'&&a?.state!=='queued'} onClick={()=>void act('cancel')}>Cancel indexing</button></div>
    {query.trim()?<><p>{view?.hits.length??0} results on this page. {view?.hasMore?'More results are available.':''} A changed or removed result cannot be opened until the index catches up.</p><ol start={offset+1}>{view?.hits.map(hit=><li key={hit.key}><strong>{hit.kind}: {hit.title}</strong> · {hit.status.replace('_',' ')}{hit.kind==='page'&&hit.pageIndex===0?' · plain text':''}<p>{highlighted(hit.excerpt,query)}</p><button type="button" disabled={hit.status==='stale'||hit.status==='removed'} onClick={()=>navigate(hit)}>Open original location</button></li>)}</ol><div className="project-actions"><button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Previous</button><button type="button" disabled={!view?.hasMore||offset>=10000} onClick={()=>setOffset(offset+50)}>Next</button></div></>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>
}
