import { readProjectDetails } from './details'
import type Database from 'better-sqlite3'
import { readFile } from 'node:fs/promises'
import type { CitationStyleInput, CitationsView } from '../../shared/citations'
import type { OpenInput } from '../../shared/projects'
import { effectiveState, type RetainedDocument } from '../../shared/outline'
import { compileManuscript, type Run } from '../../domain/compilation/model'
import { ProjectError } from '../../domain/projects/errors'
import { createCitationFormatter } from '../citations/processor'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { manuscript, checkpoint } from './manuscript'
import { citationOccurrences } from './citation-occurrences'
import { projectCitationFiles } from './citation-assets'
import { readSources, toCsl, priorSourceOperation, commitSourceOperation } from './sources'

const plain = (runs: readonly Run[]): string => runs.map(r => r.kind === 'text' ? r.text : r.kind === 'note' ? String(r.number) : '\n').join('')
export function changeCitationStyle(db: Database.Database, input: CitationStyleInput): void {
  const digest = requestDigest({kind:'citationStyle',...input})
  inWriteTransaction(db,() => {
    if (priorSourceOperation(db,input.projectId,input.operationId,digest)) return
    const head = (db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }).head_commit_id
    if (head !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    checkpoint(db,input.projectId,head,manuscript(db,input.projectId),'manual','Before citation style change')
    db.prepare("INSERT INTO citation_settings VALUES (?,?,'csl-v1') ON CONFLICT(project_id) DO UPDATE SET style=excluded.style").run(input.projectId,input.style)
    commitSourceOperation(db,input.projectId,input.operationId,digest,new Date().toISOString())
  })
}
export async function readCitations(db: Database.Database, scope: OpenInput, workspace: string, resources: string): Promise<CitationsView> {
  const sources = readSources(db,scope.projectId), snapshot = manuscript(db,scope.projectId)
  const setting = db.prepare('SELECT style FROM citation_settings WHERE project_id=?').get(scope.projectId) as { style: 'apa' | 'chicago' } | undefined
  const view: CitationsView = {headCommitId:sources.headCommitId,style:setting?.style ?? 'apa',profile:'csl-v1',issues:[],occurrences:[],labels:[],notes:[],bibliography:[],hangingIndent:false,error:null}
  for (const d of snapshot.documents) {
    if (d.kind !== 'text' || d.state === 'merged') continue
    const state = effectiveState(d,snapshot.documents)
    if (state === 'merged') continue
    for (const c of citationOccurrences(d.payload)) view.occurrences.push({documentId:d.id,citationId:c.citationId,sourceIds:c.items.map(i=>i.sourceId),footnoteId:c.footnoteId,state})
    if (view.occurrences.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
  }
  const ordered: RetainedDocument[] = []
  const children = new Map<string | null, RetainedDocument[]>()
  for (const d of snapshot.documents) { const group=children.get(d.parentId)??[];group.push(d);children.set(d.parentId,group) }
  for (const group of children.values()) group.sort((a,b)=>a.position-b.position)
  const walk = (parent: string | null): void => {
    for (const d of children.get(parent)??[]) {
      if (effectiveState(d,snapshot.documents) !== 'active') continue
      if (d.kind === 'text') ordered.push(d)
      walk(d.id)
    }
  }
  walk(null)
  const records = new Map(sources.sources.map(s => [s.id,s]))
  for (const doc of ordered) for (const c of citationOccurrences(doc.payload)) for (const item of c.items) {
    const source = records.get(item.sourceId)
    if (!source || source.state !== 'active') {
      view.issues.push({kind:'reference',documentId:doc.id,citationId:c.citationId,sourceId:item.sourceId,message:!source ? 'Source is missing. Choose a replacement.' : source.state === 'merged' ? 'Source was merged. Choose its replacement explicitly in this citation.' : 'Source is in Trash. Restore it or choose a replacement.'})
      if (view.issues.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
      continue
    }
    const m = source.metadata, missing: string[] = []
    if (!m.author.length) missing.push('author')
    if (!m.issued) missing.push('date')
    if (['article-journal','chapter'].includes(m.type) && !m.containerTitle) missing.push('journal or book title')
    if (['book','chapter','report'].includes(m.type) && !m.publisher) missing.push('publisher')
    if (m.type === 'webpage' && !m.URL) missing.push('URL')
    if (!source.verified) missing.push('human metadata review')
    if (missing.length) view.issues.push({kind:'metadata',documentId:doc.id,citationId:c.citationId,sourceId:source.id,message:`${m.title}: review ${missing.join(', ')}. Correct the source or acknowledge the omission for this preview.`})
    if (view.issues.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
  }
  if (view.issues.some(i => i.kind === 'reference')) {
    view.error = 'Preview is blocked by unresolved source references. Your writing, locators, and footnotes are preserved.'
    if (JSON.stringify(view).length > 16_000_000) throw new ProjectError('LIMIT_EXCEEDED')
    return view
  }
  try {
    const assets = await projectCitationFiles(workspace,resources)
    const style = assets.find(a => a.ref.id === (view.style === 'apa' ? 'apa-7' : 'chicago-18-notes-bibliography'))!
    const locale = assets.find(a => a.ref.id === 'en-US')!
    const used = new Set(view.occurrences.filter(o=>o.state==='active').flatMap(o=>o.sourceIds))
    const formatter = await createCitationFormatter(resources,view.style,sources.sources.filter(s => used.has(s.id) && s.state === 'active').map(s => toCsl(s.id,s.metadata) as unknown as Record<string,unknown>),{xml:await readFile(style.path,'utf8'),locale:await readFile(locale.path,'utf8')})
    const details=readProjectDetails(db,scope.projectId)
    const title=(db.prepare('SELECT title FROM projects WHERE id=?').get(scope.projectId) as {title:string}).title
    const compiled = compileManuscript({metadata:{title,byline:details.byline,description:null},titlePage:false,capturedHead:view.headCommitId,style:view.style,paper:'Letter',sections:ordered.map(d => ({documentId:d.id,title:d.title,includeTitle:false,pageBreakBefore:false,payload:d.payload}))},formatter)
    view.labels = Object.entries(compiled.bibliography.citations).map(([id,runs]) => ({id,text:plain(runs as Run[])}))
    view.notes = compiled.footnotes.map(n => ({id:n.originId,number:n.number,paragraphs:n.paragraphs.map(p => structuredClone(p.runs) as Run[])}))
    const labelMap = new Map(view.labels.map(l=>[l.id,l]))
    for (const note of view.notes) {
      const label = labelMap.get(note.id)
      if (label) label.text = String(note.number)
      else view.labels.push({id:note.id,text:String(note.number)})
    }
    view.bibliography = structuredClone(compiled.bibliography.bibliography) as Run[][]
    view.hangingIndent = compiled.bibliography.hangingIndent
    if (view.labels.length > 100000 || view.notes.length > 100000 || JSON.stringify(view).length > 16_000_000) throw new ProjectError('LIMIT_EXCEEDED')
  } catch {
    view.labels=[];view.notes=[];view.bibliography=[]
    view.error='This preview could not be formatted with the retained offline citation profile. Your canonical writing and source data have been kept. Repair the source data or retained style assets before export.'
  }
  if (JSON.stringify(view).length > 16_000_000) throw new ProjectError('LIMIT_EXCEEDED')
  return view
}
