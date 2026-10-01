import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'

export type ExportOptions = OpenInput & { documentIds: string[]; paper: 'Letter' | 'A4' }
export type ExportIssue = { kind: 'reference' | 'metadata' | 'asset' | 'content'; documentId: string; message: string }
export type ExportPreview = {
  headCommitId: string; digest: string; style: 'apa' | 'chicago'; paper: 'Letter' | 'A4';
  sections: { documentId: string; title: string; blocks: number }[];
  counts: { paragraphs: number; tables: number; images: number; footnotes: number; citations: number; bibliography: number };
  issues: ExportIssue[]; losses: string[]
}
export type ExportStartInput = ExportOptions & { expectedHead: string; previewDigest: string; acknowledgeMetadata: boolean }
export type DestinationFingerprint = { dev: number; ino: number; size: number; mtimeMs: number; sha256: string }
export type WorkerExportStart = ExportStartInput & { destinationPath: string; destinationFingerprint: DestinationFingerprint | null }
export type ExportJob = { id: string; state: 'rendering' | 'publishing' | 'complete' | 'cancelled' | 'failed' | 'interrupted'; headCommitId: string; destinationPath: string; phase: string; error: string | null; reportPath: string | null; counts: ExportPreview['counts']; losses: string[] }
export type ExportJobInput = OpenInput & { jobId: string }

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, expected: string[]): boolean => Object.keys(v).length === expected.length && expected.every(k => Object.hasOwn(v,k))
export function isExportOptions(v: unknown): v is ExportOptions {
  return object(v) && keys(v,['projectId','workspaceId','documentIds','paper']) && isId(v.projectId) && isId(v.workspaceId) && (v.paper === 'Letter' || v.paper === 'A4') && Array.isArray(v.documentIds) && v.documentIds.length > 0 && v.documentIds.length <= 10000 && v.documentIds.every(isId) && new Set(v.documentIds).size === v.documentIds.length
}
export function isExportStart(v: unknown): v is ExportStartInput {
  return object(v) && keys(v,['projectId','workspaceId','documentIds','paper','expectedHead','previewDigest','acknowledgeMetadata']) && isExportOptions({projectId:v.projectId,workspaceId:v.workspaceId,documentIds:v.documentIds,paper:v.paper}) && isId(v.expectedHead) && typeof v.previewDigest === 'string' && /^[a-f0-9]{64}$/.test(v.previewDigest) && typeof v.acknowledgeMetadata === 'boolean'
}
export function isExportJobInput(v: unknown): v is ExportJobInput { return object(v) && keys(v,['projectId','workspaceId','jobId']) && [v.projectId,v.workspaceId,v.jobId].every(isId) }
export function isWorkerExportStart(v: unknown): v is WorkerExportStart {
  if (!object(v) || !keys(v,['projectId','workspaceId','documentIds','paper','expectedHead','previewDigest','acknowledgeMetadata','destinationPath','destinationFingerprint']) || !isExportStart({projectId:v.projectId,workspaceId:v.workspaceId,documentIds:v.documentIds,paper:v.paper,expectedHead:v.expectedHead,previewDigest:v.previewDigest,acknowledgeMetadata:v.acknowledgeMetadata}) || typeof v.destinationPath !== 'string' || v.destinationPath.length > 4096) return false
  const f=v.destinationFingerprint
  return f===null || object(f) && keys(f,['dev','ino','size','mtimeMs','sha256']) && [f.dev,f.ino,f.size,f.mtimeMs].every(n=>typeof n==='number' && Number.isFinite(n) && n>=0) && typeof f.sha256==='string' && /^[a-f0-9]{64}$/.test(f.sha256)
}
export function isExportPreview(v: unknown): v is ExportPreview {
  return object(v) && keys(v,['headCommitId','digest','style','paper','sections','counts','issues','losses']) && isId(v.headCommitId) && typeof v.digest==='string' && /^[a-f0-9]{64}$/.test(v.digest) && ['apa','chicago'].includes(String(v.style)) && ['Letter','A4'].includes(String(v.paper)) && Array.isArray(v.sections) && v.sections.length>0 && v.sections.length<=10000 && v.sections.every(s=>object(s)&&keys(s,['documentId','title','blocks'])&&isId(s.documentId)&&typeof s.title==='string'&&s.title.length<=500&&Number.isSafeInteger(s.blocks)&&s.blocks>=0) && isExportCounts(v.counts) && Array.isArray(v.issues) && v.issues.length<=100000 && v.issues.every(i=>object(i)&&keys(i,['kind','documentId','message'])&&['reference','metadata','asset','content'].includes(String(i.kind))&&isId(i.documentId)&&typeof i.message==='string'&&i.message.length<=2000) && Array.isArray(v.losses) && v.losses.length<=10000 && v.losses.every(x=>typeof x==='string'&&x.length<=2000)
}
function isExportCounts(v: unknown): v is ExportPreview['counts'] { return object(v) && keys(v,['paragraphs','tables','images','footnotes','citations','bibliography']) && Object.values(v).every(n=>Number.isSafeInteger(n)&&Number(n)>=0&&Number(n)<=1000000) }
export function isExportJob(v: unknown): v is ExportJob {
  return object(v) && keys(v,['id','state','headCommitId','destinationPath','phase','error','reportPath','counts','losses']) && isId(v.id) && isId(v.headCommitId) && ['rendering','publishing','complete','cancelled','failed','interrupted'].includes(String(v.state)) && typeof v.destinationPath==='string' && v.destinationPath.length<=4096 && typeof v.phase==='string' && v.phase.length<=200 && (v.error===null || typeof v.error==='string'&&v.error.length<=2000) && (v.reportPath===null || typeof v.reportPath==='string'&&v.reportPath.length<=4096) && isExportCounts(v.counts) && Array.isArray(v.losses) && v.losses.length<=10000 && v.losses.every(x=>typeof x==='string'&&x.length<=2000)
}
