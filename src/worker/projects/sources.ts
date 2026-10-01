import Database from 'better-sqlite3'
import { Cite, type CSL } from '@citation-js/core'
import '@citation-js/plugin-bibtex'
import '@citation-js/plugin-ris'
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { open, lstat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import type { BibliographyFormat, SourceAttachment, SourceChangeInput, SourceExportReceipt, SourceImportPreview, SourceImportRow, SourceMetadata, SourceRecord, SourcesView, WorkerSourceAttachment, WorkerSourceExport, WorkerSourceImport, WorkerSourcePreview } from '../../shared/sources'
import { isSourceMetadata, isSourcesView, SOURCE_TYPES } from '../../shared/sources'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { contained, syncDirectory } from '../storage/files'
import { stageBlob } from './blobs'
import { fileHash, requireSpace, transfer } from './streams'
import { LIMITS } from './manifest'

export type SourceContext = { root: string; workspace: string; projectId: string; db: Database.Database }
type Row = { id: string; revision_id: string; metadata: string; state: SourceRecord['state']; replacement_id: string | null; verified: number; provenance: string; raw_import: string | null; unknown_fields: string; created_at: string; updated_at: string }
const IMPORT_LIMIT = 8 * 1024 * 1024
const formatOf = (name: string): BibliographyFormat => { const extension = name.toLowerCase().split('.').pop(); if (extension === 'json') return 'csl-json'; if (extension === 'bib' || extension === 'bibtex') return 'bibtex'; if (extension === 'ris') return 'ris'; throw new ProjectError('VALIDATION') }
const norm = (value: string): string => value.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ')
const clean = (value: unknown, max = 2000): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max) : ''
const numericText = (value:unknown):string => typeof value==='number'&&Number.isFinite(value)?String(value):clean(value)
const doi = (value: string): string => clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase()
const url = (value: string): string => { const text = clean(value); if (!text) return ''; try { const parsed = new URL(text); if (!['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) return ''; return parsed.toString() } catch { return '' } }
export function normalizeMetadata(m: SourceMetadata): SourceMetadata {
  if (!isSourceMetadata(m)) throw new ProjectError('VALIDATION')
  const result = { ...m, title: clean(m.title), author: m.author.map(a => ({ family:clean(a.family,300), given:clean(a.given,300), literal:clean(a.literal,600) })), issued:clean(m.issued,100), containerTitle:clean(m.containerTitle), publisher:clean(m.publisher), edition:clean(m.edition,100), volume:clean(m.volume,100), issue:clean(m.issue,100), page:clean(m.page,100), DOI:doi(m.DOI), URL:url(m.URL), ISBN:clean(m.ISBN,100).replace(/[\s-]/g,'').toUpperCase(), ISSN:clean(m.ISSN,100).toUpperCase() }
  if (!result.title || m.URL && !result.URL || result.DOI && !/^10\.\d{4,9}\/.+/.test(result.DOI) || result.issued && !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(result.issued)) throw new ProjectError('VALIDATION')
  if (result.issued) { const [,month,day]=result.issued.split('-').map(Number);if(month!==undefined&&(month<1||month>12)||day!==undefined&&(day<1||day>31))throw new ProjectError('VALIDATION') }
  return result
}
const cslKeys = new Set(['id','type','title','author','issued','container-title','publisher','edition','volume','issue','page','DOI','URL','ISBN','ISSN'])
function fromCsl(value: unknown): { metadata: SourceMetadata; externalId: string; unknownFields: string[]; losses: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Record is not an object')
  const c = value as Record<string, unknown>
  if (!SOURCE_TYPES.includes(c.type as SourceMetadata['type'])) throw new Error(`Unsupported work type: ${String(c.type ?? 'missing')}`)
  if (Array.isArray(c.author) && c.author.length>100) throw new Error('More than 100 creators')
  for(const key of ['title','container-title','publisher','edition','volume','issue','page','DOI','URL','ISBN','ISSN','id'])if(typeof c[key]==='string'&&c[key].length>(key==='id'?500:2000))throw new Error(`Field ${key} exceeds the supported length`)
  const names = Array.isArray(c.author) ? c.author.slice(0,100).map(a => { const n = a && typeof a === 'object' ? a as Record<string,unknown> : {}; return { family:clean(n.family,300), given:clean(n.given,300), literal:clean(n.literal,600) } }) : []
  const date = c.issued && typeof c.issued === 'object' ? c.issued as { 'date-parts'?: unknown; literal?: unknown } : undefined
  const rawParts=date?.['date-parts']
  const parts = Array.isArray(rawParts) && Array.isArray(rawParts[0]) ? rawParts[0] as unknown[] : []
  const issued = parts.length ? parts.slice(0,3).map((p,i) => String(p).padStart(i ? 2 : 4,'0')).join('-') : clean(date?.literal,100)
  const metadata = normalizeMetadata({ type:c.type as SourceMetadata['type'], title:clean(c.title), author:names, issued, containerTitle:clean(c['container-title']), publisher:clean(c.publisher), edition:numericText(c.edition), volume:numericText(c.volume), issue:numericText(c.issue), page:numericText(c.page), DOI:clean(c.DOI), URL:clean(c.URL), ISBN:clean(c.ISBN), ISSN:clean(c.ISSN) })
  const unknownFields = Object.keys(c).filter(k => !cslKeys.has(k) && !k.startsWith('_')).slice(0,20).map(k=>clean(k,200))
  const losses = unknownFields.map(k => `Field ${k} is retained in raw import but not in canonical metadata or export.`)
  return { metadata, externalId:clean(c.id,500), unknownFields, losses }
}
function toCsl(id: string, m: SourceMetadata): CSL {
  const entry: Record<string,unknown> = { id, type:m.type, title:m.title }
  if (m.author.length) entry.author = m.author.map(a => a.literal ? { literal:a.literal } : { family:a.family, given:a.given })
  if (m.issued) entry.issued = { 'date-parts':[m.issued.split('-').map(Number)] }
  for (const [from,to] of [['containerTitle','container-title'],['publisher','publisher'],['edition','edition'],['volume','volume'],['issue','issue'],['page','page'],['DOI','DOI'],['URL','URL'],['ISBN','ISBN'],['ISSN','ISSN']] as const) if (m[from]) entry[to] = m[from]
  return entry as unknown as CSL
}
function bibtexRecords(value: string): string[] {
  const rows: string[] = []; let cursor = 0
  while (cursor < value.length) {
    const start = value.indexOf('@',cursor)
    if (start < 0) { if (value.slice(cursor).trim()) rows.push(value.slice(cursor)); break }
    if (value.slice(cursor,start).trim()) rows.push(value.slice(cursor,start))
    const opener = value.indexOf('{',start), paren = value.indexOf('(',start)
    const begin = paren >= 0 && (opener < 0 || paren < opener) ? paren : opener
    if (begin < 0 || begin-start > 32) { rows.push(value.slice(start)); break }
    const close = value[begin] === '{' ? '}' : ')'; let depth = 1, quoted = false, escaped = false, pos = begin+1
    for (;pos<value.length;pos++) { const ch=value[pos]; if (escaped) { escaped=false; continue } if (ch==='\\') { escaped=true; continue } if (ch==='"') { quoted=!quoted; continue } if (!quoted) { if (ch===value[begin]) depth++; else if (ch===close && --depth===0) { pos++; break } } }
    rows.push(value.slice(start,pos)); cursor=pos
  }
  return rows.filter(Boolean)
}
function risRecords(value: string): string[] { const rows: string[] = []; let current = ''; for (const line of value.split(/\r?\n/)) { if (/^TY  - /.test(line) && current.trim()) { rows.push(current); current='' } current += `${line}\n`; if (/^ER  -/.test(line)) { rows.push(current); current='' } } if (current.trim()) rows.push(current); return rows }
function rawUnsupported(raw:unknown,format:BibliographyFormat):string[] {
  if (typeof raw!=='string') return []
  if (format==='bibtex') {const supported=new Set(['title','author','year','date','month','journal','journaltitle','booktitle','publisher','edition','volume','number','issue','pages','doi','url','isbn','issn']);return [...new Set([...raw.matchAll(/\b([A-Za-z][A-Za-z0-9_-]*)\s*=/g)].map(m=>m[1].toLowerCase()).filter(k=>!supported.has(k)))].slice(0,20).map(k=>k.slice(0,200))}
  if (format==='ris') {const supported=new Set(['TY','ID','TI','T1','AU','A1','PY','Y1','JO','JF','JA','BT','PB','ET','VL','IS','SP','EP','DO','UR','SN','ER']);return [...new Set([...raw.matchAll(/^([A-Z][A-Z0-9])  -/gm)].map(m=>m[1]).filter(k=>!supported.has(k)))].slice(0,20)}
  return []
}
async function selectedFile(path: string, maximum: number): Promise<Buffer> {
  const before = await lstat(path)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > maximum) throw new ProjectError('LIMIT_EXCEEDED')
  const file = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try { const opened = await file.stat(); if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw new ProjectError('VALIDATION'); const data = await file.readFile(); const after = await file.stat(); if (data.length !== before.size || after.size !== before.size || after.mtimeMs !== opened.mtimeMs) throw new ProjectError('VALIDATION'); return data } finally { await file.close() }
}
function parseRows(value: string, format: BibliographyFormat): SourceImportRow[] {
  let raws: unknown[]
  if (format === 'csl-json') { const parsed: unknown = JSON.parse(value); if (!Array.isArray(parsed)) throw new ProjectError('VALIDATION'); raws = parsed }
  else raws = format === 'bibtex' ? bibtexRecords(value) : risRecords(value)
  if (raws.length > 2000) throw new ProjectError('LIMIT_EXCEEDED')
  return raws.map((raw,index) => {
    try {
      if (JSON.stringify(raw).length > 300000) throw new Error('Record exceeds 300 KB')
      if (typeof raw === 'string' && /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(raw)) throw new Error('Record contains unsupported control characters')
      const parsed: unknown = format === 'csl-json' ? raw : new Cite(raw as string,{ forceType:format === 'bibtex' ? '@bibtex/text' : '@ris/file', generateGraph:false,strict:true,maxChainLength:10,target:'@csl/list+object' }).data[0]
      if (!parsed) throw new Error('No bibliography record found')
      const item = fromCsl(parsed)
      const extra=rawUnsupported(raw,format)
      item.unknownFields=[...new Set([...item.unknownFields,...extra])].slice(0,20)
      item.losses=item.unknownFields.map(k=>`Field ${k} is retained in the original record but omitted from canonical metadata and export.`)
      return { index, ...item, error:null, candidates:[] }
    } catch (error) { return { index, metadata:null, externalId:'', unknownFields:[], losses:[], error:error instanceof Error ? clean(error.message,1000) : 'Unsupported record', candidates:[] } }
  })
}
function candidateRows(db: Database.Database, projectId: string, metadata: SourceMetadata, externalId: string): { id:string; reason:string }[] {
  const existing = db.prepare("SELECT id,metadata FROM sources WHERE project_id=? AND state='active'").all(projectId) as { id:string; metadata:string }[]
  const found: {id:string;reason:string}[] = []
  for (const row of existing) {
    const m = JSON.parse(row.metadata) as SourceMetadata
    const reason = metadata.DOI && m.DOI === metadata.DOI ? 'Exact DOI' : metadata.ISBN && m.ISBN === metadata.ISBN ? 'Exact ISBN' : metadata.URL && m.URL === metadata.URL ? 'Exact URL' : norm(m.title) === norm(metadata.title) && norm(m.author[0]?.family || m.author[0]?.literal || '') === norm(metadata.author[0]?.family || metadata.author[0]?.literal || '') ? 'Similar title and author' : ''
    if (reason) found.push({id:row.id,reason})
    if (found.length >= 12) break
  }
  if (externalId) { const alias = db.prepare('SELECT source_id FROM source_aliases WHERE project_id=? AND alias=?').get(projectId,externalId) as {source_id:string}|undefined; const canonical=getOptional(db,projectId,externalId);const id=alias?.source_id??(canonical?.state==='active'?canonical.id:null);if (id && !found.some(c=>c.id===id)) found.unshift({id,reason:'Exact imported identifier'}) }
  return found.slice(0,12)
}
export function readSources(db: Database.Database, projectId: string): SourcesView {
  const sources = (db.prepare('SELECT * FROM sources WHERE project_id=? ORDER BY updated_at DESC LIMIT 100000').all(projectId) as Row[]).map(r => {
    const attachments = (db.prepare('SELECT a.id,a.state,m.original_name name,m.media_type mediaType,m.byte_size bytes,m.sha256 FROM source_attachments a JOIN managed_assets m ON m.project_id=a.project_id AND m.id=a.asset_id WHERE a.project_id=? AND a.source_id=?').all(projectId,r.id) as SourceAttachment[])
    const documentIds = (db.prepare('SELECT document_id FROM source_links WHERE project_id=? AND source_id=?').all(projectId,r.id) as {document_id:string}[]).map(x=>x.document_id)
    const aliases=(db.prepare('SELECT alias FROM source_aliases WHERE project_id=? AND source_id=? LIMIT 1000').all(projectId,r.id) as {alias:string}[]).map(x=>x.alias)
    return { id:r.id, revisionId:r.revision_id, metadata:JSON.parse(r.metadata) as SourceMetadata, state:r.state, replacementId:r.replacement_id, verified:!!r.verified, provenance:r.provenance, rawImport:r.raw_import, unknownFields:JSON.parse(r.unknown_fields) as string[], aliases, documentIds, attachments, createdAt:r.created_at, updatedAt:r.updated_at }
  })
  const reports = (db.prepare('SELECT * FROM source_import_reports WHERE project_id=? ORDER BY created_at DESC LIMIT 100').all(projectId) as {id:string;format:BibliographyFormat;report:string;created_at:string}[]).map(r=>({id:r.id,format:r.format,...JSON.parse(r.report) as { imported:number;skipped:number;errors:string[];losses:string[] },createdAt:r.created_at}))
  const headCommitId = (db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as {head_commit_id:string}).head_commit_id
  return { sources,reports,headCommitId }
}
function oldRevision(db:Database.Database, projectId:string, row:Row, now:string): void { const snapshot={metadata:row.metadata,state:row.state,replacementId:row.replacement_id,verified:row.verified,provenance:row.provenance,rawImport:row.raw_import,unknownFields:row.unknown_fields,createdAt:row.created_at,updatedAt:row.updated_at};db.prepare('INSERT OR IGNORE INTO source_revisions VALUES (?,?,?,?,?)').run(projectId,row.id,row.revision_id,JSON.stringify(snapshot),now) }
function commit(db:Database.Database, projectId:string, operationId:string, digest:string, now:string): void {
  const before = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as {head_commit_id:string}
  const head = randomUUID(); db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(projectId,head,before.head_commit_id,now)
  db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head,now,projectId)
  const doc = db.prepare('SELECT id,revision_id FROM documents WHERE project_id=? ORDER BY rowid LIMIT 1').get(projectId) as {id:string;revision_id:string}
  db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(projectId,operationId,digest,JSON.stringify({projectId,documentId:doc.id,revisionId:doc.revision_id,headCommitId:head}))
}
function priorOperation(db:Database.Database, projectId:string, operationId:string, digest:string): boolean { const row=db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(projectId,operationId) as {digest:string}|undefined; if (row && row.digest!==digest) throw new ProjectError('OPERATION_CONFLICT'); return !!row }
function linkDocuments(db:Database.Database,projectId:string,sourceId:string,ids:string[]): void { db.prepare('DELETE FROM source_links WHERE project_id=? AND source_id=?').run(projectId,sourceId); for (const id of ids) { if (!db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(projectId,id)) throw new ProjectError('VALIDATION'); db.prepare('INSERT INTO source_links VALUES (?,?,?)').run(projectId,sourceId,id) } }
export function changeSource(context:SourceContext,input:SourceChangeInput): SourcesView {
  const { db,projectId }=context, c=input.change, digest=requestDigest(input)
  inWriteTransaction(db,()=>{
    if (priorOperation(db,projectId,input.operationId,digest)) return
    const now=new Date().toISOString(), revision=randomUUID()
    const get=(id:string):Row=>{ const row=db.prepare('SELECT * FROM sources WHERE project_id=? AND id=?').get(projectId,id) as Row|undefined; if (!row) throw new ProjectError('NOT_FOUND'); return row }
    if (c.type==='create') {
      const metadata=normalizeMetadata(c.metadata)
      if ((db.prepare('SELECT count(*) count FROM sources WHERE project_id=?').get(projectId) as {count:number}).count>=100000) throw new ProjectError('LIMIT_EXCEEDED')
      if (getOptional(db,projectId,c.id)) throw new ProjectError('OPERATION_CONFLICT')
      db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(projectId,c.id,revision,JSON.stringify(metadata),'active',null,c.verified?1:0,'manual',null,'[]',now,now)
      linkDocuments(db,projectId,c.id,c.documentIds)
    } else {
      const row=get(c.id); if (row.revision_id!==c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      if (c.type==='update') { if (row.state!=='active') throw new ProjectError('VALIDATION'); oldRevision(db,projectId,row,now); db.prepare('UPDATE sources SET metadata=?,verified=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(JSON.stringify(normalizeMetadata(c.metadata)),c.verified?1:0,revision,now,projectId,c.id); linkDocuments(db,projectId,c.id,c.documentIds) }
      if (c.type==='state') { if (row.state==='merged') throw new ProjectError('VALIDATION'); oldRevision(db,projectId,row,now); db.prepare('UPDATE sources SET state=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(c.state,revision,now,projectId,c.id) }
      if (c.type==='merge') {
        const target=get(c.targetId); if (row.state!=='active' || target.state!=='active') throw new ProjectError('VALIDATION')
        if ((db.prepare('SELECT count(*) count FROM source_attachments WHERE project_id=? AND source_id IN (?,?)').get(projectId,c.id,c.targetId) as {count:number}).count>1000) throw new ProjectError('LIMIT_EXCEEDED')
        oldRevision(db,projectId,row,now); oldRevision(db,projectId,target,now)
        db.prepare('INSERT OR IGNORE INTO source_links SELECT project_id,?,document_id FROM source_links WHERE project_id=? AND source_id=?').run(c.targetId,projectId,c.id)
        db.prepare('DELETE FROM source_links WHERE project_id=? AND source_id=?').run(projectId,c.id)
        db.prepare('UPDATE source_attachments SET source_id=? WHERE project_id=? AND source_id=?').run(c.targetId,projectId,c.id)
        const existingAlias=db.prepare('SELECT source_id FROM source_aliases WHERE project_id=? AND alias=?').get(projectId,c.id) as {source_id:string}|undefined
        if (existingAlias && existingAlias.source_id!==c.id) throw new ProjectError('OPERATION_CONFLICT')
        db.prepare('UPDATE source_aliases SET source_id=? WHERE project_id=? AND source_id=?').run(c.targetId,projectId,c.id)
        db.prepare('INSERT OR REPLACE INTO source_aliases VALUES (?,?,?)').run(projectId,c.id,c.targetId)
        db.prepare("UPDATE sources SET state='merged',replacement_id=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?").run(c.targetId,revision,now,projectId,c.id)
        db.prepare('UPDATE sources SET revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(randomUUID(),now,projectId,c.targetId)
      }
      if (c.type==='removeAttachment') { const attachment=db.prepare("SELECT 1 FROM source_attachments WHERE project_id=? AND source_id=? AND id=? AND state='active'").get(projectId,c.id,c.attachmentId); if (!attachment) throw new ProjectError('NOT_FOUND'); oldRevision(db,projectId,row,now); db.prepare("UPDATE source_attachments SET state='removed' WHERE project_id=? AND id=?").run(projectId,c.attachmentId); db.prepare('UPDATE sources SET revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(revision,now,projectId,c.id) }
    }
    commit(db,projectId,input.operationId,digest,now)
  })
  return readSources(db,projectId)
}
function getOptional(db:Database.Database,projectId:string,id:string):Row|undefined { return db.prepare('SELECT * FROM sources WHERE project_id=? AND id=?').get(projectId,id) as Row|undefined }
export async function previewImport(context:SourceContext,input:WorkerSourcePreview):Promise<SourceImportPreview> {
  const format=formatOf(input.sourcePath); if (format!==input.format) throw new ProjectError('VALIDATION')
  const bytes=await selectedFile(input.sourcePath,IMPORT_LIMIT); let rows:SourceImportRow[]
  try {const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);rows=parseRows(text,format)} catch (error) {if(error instanceof ProjectError)throw error;throw new ProjectError('VALIDATION')}
  for (const row of rows) if (row.metadata) row.candidates=candidateRows(context.db,context.projectId,row.metadata,row.externalId)
  return {token:input.token,digest:createHash('sha256').update(bytes).digest('hex'),format,rows,count:rows.length}
}
export async function commitImport(context:SourceContext,input:WorkerSourceImport):Promise<SourcesView> {
  const preview=await previewImport(context,input)
  if (preview.digest!==input.digest || new Set(input.choices.map(c=>c.index)).size!==input.choices.length || input.choices.length!==preview.rows.length) throw new ProjectError('EXTERNAL_CHANGE')
  const rawBytes=await selectedFile(input.sourcePath,IMPORT_LIMIT)
  if (createHash('sha256').update(rawBytes).digest('hex')!==preview.digest) throw new ProjectError('EXTERNAL_CHANGE')
  const rawText=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes)
  const rawRecords:unknown[]=preview.format==='csl-json' ? JSON.parse(rawText) as unknown[] : preview.format==='bibtex' ? bibtexRecords(rawText) : risRecords(rawText)
  const {db,projectId}=context, digest=requestDigest({kind:'sourceImport',format:preview.format,sha256:preview.digest,choices:input.choices})
  inWriteTransaction(db,()=>{
    if (priorOperation(db,projectId,input.operationId,digest)) return
    const now=new Date().toISOString(), report:{imported:number;skipped:number;errors:string[];losses:string[]}={imported:0,skipped:0,errors:[],losses:[]}
    for (const row of preview.rows) {
      const choice=input.choices.find(c=>c.index===row.index)!
      const raw=typeof rawRecords[row.index]==='string' ? rawRecords[row.index] as string : JSON.stringify(rawRecords[row.index])
      if (row.error) { report.errors.push(`Record ${row.index+1}: ${row.error}`); if (choice.action!=='skip') throw new ProjectError('VALIDATION'); report.skipped++;db.prepare('INSERT INTO source_import_records VALUES (?,?,?,?,?,?,?,?)').run(projectId,input.operationId,row.index,raw,'[]','skip',null,row.error);continue }
      if (choice.action==='skip') {report.skipped++;db.prepare('INSERT INTO source_import_records VALUES (?,?,?,?,?,?,?,?)').run(projectId,input.operationId,row.index,raw,JSON.stringify(row.unknownFields),'skip',null,null);continue}
      if (!row.metadata) throw new ProjectError('VALIDATION')
      let acceptedId:string
      if (choice.action==='create') {
        if (choice.targetId!==null) throw new ProjectError('VALIDATION')
        if ((db.prepare('SELECT count(*) count FROM sources WHERE project_id=?').get(projectId) as {count:number}).count>=100000) throw new ProjectError('LIMIT_EXCEEDED')
        const id=randomUUID();acceptedId=id
        db.prepare('INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(projectId,id,randomUUID(),JSON.stringify(row.metadata),'active',null,0,`import:${preview.format}`,raw,JSON.stringify(row.unknownFields),now,now)
        if (row.externalId) {if (!db.prepare('SELECT 1 FROM source_aliases WHERE project_id=? AND alias=?').get(projectId,row.externalId)&&!getOptional(db,projectId,row.externalId)) db.prepare('INSERT INTO source_aliases VALUES (?,?,?)').run(projectId,row.externalId,id);else report.losses.push(`Record ${row.index+1}: imported identifier already belongs to another source; kept in raw record, not aliased.`)}
        report.imported++
      } else {
        if (!choice.targetId || !row.candidates.some(c=>c.id===choice.targetId)) throw new ProjectError('VALIDATION')
        const target=getOptional(db,projectId,choice.targetId); if (!target || target.state!=='active') throw new ProjectError('STALE_REVISION')
        acceptedId=target.id
        if (row.externalId) { const old=db.prepare('SELECT source_id FROM source_aliases WHERE project_id=? AND alias=?').get(projectId,row.externalId) as {source_id:string}|undefined; const canonical=getOptional(db,projectId,row.externalId);if (old && old.source_id!==target.id || canonical && canonical.id!==target.id) throw new ProjectError('OPERATION_CONFLICT'); if (!canonical) db.prepare('INSERT OR IGNORE INTO source_aliases VALUES (?,?,?)').run(projectId,row.externalId,target.id) }
        if (choice.action==='merge') { oldRevision(db,projectId,target,now); const existing=JSON.parse(target.metadata) as SourceMetadata; const combined={...row.metadata,...Object.fromEntries(Object.entries(existing).filter(([,v])=>Array.isArray(v) ? v.length : !!v))} as SourceMetadata; db.prepare('UPDATE sources SET metadata=?,revision_id=?,updated_at=?,raw_import=?,unknown_fields=? WHERE project_id=? AND id=?').run(JSON.stringify(normalizeMetadata(combined)),randomUUID(),now,raw,JSON.stringify([...new Set([...JSON.parse(target.unknown_fields) as string[],...row.unknownFields])]),projectId,target.id) }
        report.imported++
      }
      db.prepare('INSERT INTO source_import_records VALUES (?,?,?,?,?,?,?,?)').run(projectId,input.operationId,row.index,raw,JSON.stringify(row.unknownFields),choice.action,acceptedId,null)
      report.losses.push(...row.losses.map(loss=>`Record ${row.index+1}: ${loss}`))
    }
    db.prepare('INSERT INTO source_import_reports VALUES (?,?,?,?,?)').run(projectId,input.operationId,preview.format,JSON.stringify(report),now)
    commit(db,projectId,input.operationId,digest,now)
  })
  return readSources(db,projectId)
}
export async function attachSourceFile(context:SourceContext,input:WorkerSourceAttachment,progress?:(transferred:number,total:number)=>void):Promise<SourcesView> {
  const {db,projectId}=context, source=getOptional(db,projectId,input.sourceId)
  if (!source || source.state!=='active') throw new ProjectError('NOT_FOUND')
  if ((db.prepare('SELECT count(*) count FROM source_attachments WHERE project_id=? AND source_id=?').get(projectId,input.sourceId) as {count:number}).count>=1000) throw new ProjectError('LIMIT_EXCEEDED')
  const fileInfo=await lstat(input.sourcePath), size=fileInfo.size
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.nlink!==1 || size<1 || size>LIMITS.blob) throw new ProjectError('LIMIT_EXCEEDED')
  if (input.originalName.toLowerCase().endsWith('.txt') && size>IMPORT_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
  const probe=size<=IMPORT_LIMIT ? await selectedFile(input.sourcePath,IMPORT_LIMIT) : null
  const head=probe ? probe.subarray(0,16) : await (async()=>{const file=await open(input.sourcePath,constants.O_RDONLY | (constants.O_NOFOLLOW??0));try {const b=Buffer.alloc(16); await file.read(b,0,16,0);return b}finally{await file.close()}})()
  const name=input.originalName.toLowerCase(); const mediaType=head.subarray(0,5).toString()==='%PDF-' && name.endsWith('.pdf') ? 'application/pdf' : head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && name.endsWith('.png') ? 'image/png' : head[0]===255 && head[1]===216 && name.match(/\.jpe?g$/) ? 'image/jpeg' : name.endsWith('.txt') && !head.includes(0) ? 'text/plain' : null
  if (!mediaType) throw new ProjectError('VALIDATION')
  if (mediaType==='text/plain') {try{new TextDecoder('utf-8',{fatal:true}).decode(probe!)}catch{throw new ProjectError('VALIDATION')}}
  let transferred=0,last=0
  const blob=await stageBlob(context.root,context.workspace,input.sourcePath,undefined,bytes=>{transferred+=bytes;if(transferred===size||transferred-last>=1024*1024){last=transferred;progress?.(transferred,size)}})
  const digest=requestDigest({kind:'sourceAttachment',sourceId:input.sourceId,sha256:blob.sha256,name:input.originalName})
  inWriteTransaction(db,()=>{
    if (priorOperation(db,projectId,input.operationId,digest)) return
    const now=new Date().toISOString(), current=getOptional(db,projectId,input.sourceId)
    if (!current || current.state!=='active') throw new ProjectError('STALE_REVISION')
    oldRevision(db,projectId,current,now)
    db.prepare('INSERT INTO managed_assets VALUES (?,?,?,?,?,?)').run(projectId,input.operationId,input.originalName,mediaType,blob.bytes,blob.sha256)
    db.prepare('INSERT INTO source_attachments VALUES (?,?,?,?,?,?)').run(projectId,input.operationId,input.sourceId,input.operationId,'active',now)
    db.prepare('UPDATE sources SET revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(randomUUID(),now,projectId,input.sourceId)
    commit(db,projectId,input.operationId,digest,now)
  })
  return readSources(db,projectId)
}
export async function exportSources(context:SourceContext,input:WorkerSourceExport):Promise<SourceExportReceipt> {
  const {db,projectId}=context
  const chosen=input.sourceIds.length ? input.sourceIds : (db.prepare("SELECT id FROM sources WHERE project_id=? AND state='active'").all(projectId) as {id:string}[]).map(r=>r.id)
  const records=chosen.map(id=>getOptional(db,projectId,id)).filter((r):r is Row=>!!r && r.state==='active')
  if (records.length!==chosen.length) throw new ProjectError('VALIDATION')
  const losses=['Project-only provenance, verification status, section links, attachments, raw imports and revision history are omitted from bibliography exports.',...records.flatMap(r=>(JSON.parse(r.unknown_fields) as string[]).map(f=>`${r.id}: ${f} retained in source, omitted from ${input.format} export`))]
  const entries=records.map(r=>toCsl(r.id,JSON.parse(r.metadata) as SourceMetadata))
  let content:string
  if (input.format==='csl-json') content=JSON.stringify(entries,null,2)+'\n'
  else content=String(new Cite(entries,{forceType:'@csl/list+object',generateGraph:false,strict:true,maxChainLength:10,target:'@csl/list+object'}).format(input.format==='bibtex'?'bibtex':'ris'))
  if (Buffer.byteLength(content)>64*1024*1024) throw new ProjectError('LIMIT_EXCEEDED')
  await requireSpace(dirname(input.destinationPath),Buffer.byteLength(content))
  const file=await open(input.destinationPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600).catch(error=>{if(error?.code==='EEXIST')throw new ProjectError('DESTINATION_EXISTS');throw error})
  try { await file.writeFile(content); await file.sync() } catch (error) { await file.close(); await unlink(input.destinationPath).catch(()=>{}); throw error } finally { await file.close().catch(()=>{}) }
  await syncDirectory(dirname(input.destinationPath))
  return {path:input.destinationPath,count:records.length,losses}
}
export async function exportSourceAttachment(context:SourceContext,attachmentId:string,destinationPath:string):Promise<SourceExportReceipt> {
  const row=context.db.prepare("SELECT m.sha256,m.byte_size FROM source_attachments a JOIN managed_assets m ON m.project_id=a.project_id AND m.id=a.asset_id WHERE a.project_id=? AND a.id=? AND a.state='active'").get(context.projectId,attachmentId) as {sha256:string;byte_size:number}|undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  const path=join(context.workspace,'blobs',row.sha256); await contained(context.root,path,false)
  const digest=await fileHash(path,LIMITS.blob); if (digest.sha256!==row.sha256 || digest.bytes!==row.byte_size) throw new ProjectError('CORRUPT_PROJECT')
  await requireSpace(dirname(destinationPath),row.byte_size)
  const copied=await transfer(createReadStream(path),destinationPath,LIMITS.blob).catch(async error=>{if(error?.code==='EEXIST') throw new ProjectError('DESTINATION_EXISTS');await unlink(destinationPath).catch(()=>{});throw error})
  if (copied.sha256!==row.sha256 || copied.bytes!==row.byte_size) { await unlink(destinationPath).catch(()=>{}); throw new ProjectError('CORRUPT_PROJECT') }
  await syncDirectory(dirname(destinationPath))
  return {path:destinationPath,count:1,losses:[]}
}
export function validatePortableSources(db:Database.Database,projectId:string,assetIds:Set<string>):void {
  for (const table of ['sources','source_revisions','source_aliases','source_links','source_attachments','source_import_reports','source_import_records']) if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId)) throw new ProjectError('CORRUPT_PROJECT')
  for(const table of ['sources','source_revisions','source_aliases','source_links','source_attachments','source_import_reports','source_import_records']) {const row=db.prepare(`SELECT count(*) count FROM ${table} WHERE project_id=?`).get(projectId) as {count:number};if(row.count>1000000)throw new ProjectError('CORRUPT_PROJECT')}
  const view=readSources(db,projectId); if (!isSourcesView(view)) throw new ProjectError('CORRUPT_PROJECT')
  for (const s of view.sources) { if (!isId(s.id)||!isId(s.revisionId)||!isSourceMetadata(s.metadata)||s.metadata.title.length===0||s.rawImport && s.rawImport.length>300000||s.attachments.some(a=>!assetIds.has(a.id))) throw new ProjectError('CORRUPT_PROJECT'); if (s.state==='merged' && (!s.replacementId || !view.sources.some(t=>t.id===s.replacementId))) throw new ProjectError('CORRUPT_PROJECT');if(JSON.stringify(normalizeMetadata(s.metadata))!==JSON.stringify(s.metadata))throw new ProjectError('CORRUPT_PROJECT') }
  for(const alias of db.prepare('SELECT alias,source_id FROM source_aliases WHERE project_id=?').iterate(projectId) as Iterable<{alias:string;source_id:string}>)if(!alias.alias||alias.alias.length>500||!view.sources.some(s=>s.id===alias.source_id&&s.state!=='merged'))throw new ProjectError('CORRUPT_PROJECT')
  for(const revision of db.prepare('SELECT source_id,revision_id,snapshot,created_at FROM source_revisions WHERE project_id=?').iterate(projectId) as Iterable<{source_id:string;revision_id:string;snapshot:string;created_at:string}>){if(!isId(revision.source_id)||!isId(revision.revision_id)||revision.snapshot.length>400000||!Number.isFinite(Date.parse(revision.created_at)))throw new ProjectError('CORRUPT_PROJECT');const value:unknown=JSON.parse(revision.snapshot);if(!value||typeof value!=='object'||!('metadata' in value)||typeof value.metadata!=='string'||!isSourceMetadata(JSON.parse(value.metadata)))throw new ProjectError('CORRUPT_PROJECT')}
  for(const report of db.prepare('SELECT report FROM source_import_reports WHERE project_id=?').iterate(projectId) as Iterable<{report:string}>){if(report.report.length>32*1024*1024)throw new ProjectError('CORRUPT_PROJECT');const value:unknown=JSON.parse(report.report);if(!value||typeof value!=='object'||!('errors' in value)||!Array.isArray(value.errors)||!('losses' in value)||!Array.isArray(value.losses))throw new ProjectError('CORRUPT_PROJECT')}
  for(const record of db.prepare('SELECT record_index,raw_record,unknown_fields,action,source_id,error FROM source_import_records WHERE project_id=?').iterate(projectId) as Iterable<{record_index:number;raw_record:string;unknown_fields:string;action:string;source_id:string|null;error:string|null}>){if(!Number.isSafeInteger(record.record_index)||record.record_index<0||record.record_index>=2000||record.raw_record.length>48*1024*1024||!['skip','create','merge','link'].includes(record.action)||record.source_id!==null&&!isId(record.source_id)||record.error!==null&&record.error.length>2000||!Array.isArray(JSON.parse(record.unknown_fields)))throw new ProjectError('CORRUPT_PROJECT')}
}
