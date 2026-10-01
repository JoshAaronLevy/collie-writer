import { isId } from '../domain/editor/schema'
import type { Run } from '../domain/compilation/model'
import type { OpenInput } from './projects'

export type CitationStyle = 'apa' | 'chicago'
export type CitationStyleInput = OpenInput & { operationId: string; expectedHead: string; style: CitationStyle }
export type CitationIssue = { kind: 'reference' | 'metadata'; documentId: string; citationId: string; sourceId: string; message: string }
export type CitationsView = {
  headCommitId: string; style: CitationStyle; profile: 'csl-v1'; issues: CitationIssue[]
  occurrences: { documentId: string; citationId: string; sourceIds: string[]; footnoteId: string | null; state: 'active' | 'archived' | 'trashed' }[]
  labels: { id: string; text: string }[]
  notes: { id: string; number: number; paragraphs: Run[][] }[]
  bibliography: Run[][]; hangingIndent: boolean; error: string | null
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 1_000_000
export function isCitationStyleInput(v: unknown): v is CitationStyleInput {
  return record(v) && Object.keys(v).length === 5 && [v.projectId,v.workspaceId,v.operationId,v.expectedHead].every(isId) && (v.style === 'apa' || v.style === 'chicago')
}
function runs(v: unknown): v is Run[] {
  return Array.isArray(v) && v.length <= 100000 && v.every(r => record(r) && (r.kind === 'break' || r.kind === 'note' && Number.isSafeInteger(r.number) && Number(r.number) > 0 || r.kind === 'text' && text(r.text) && Array.isArray(r.marks) && r.marks.every(m => record(m) && ['bold','italic','underline','strike','link'].includes(String(m.type))) && ['superscript','subscript','smallCaps'].every(k => r[k] === undefined || typeof r[k] === 'boolean')))
}
export function isCitationsView(v: unknown): v is CitationsView {
  return record(v) && isId(v.headCommitId) && (v.style === 'apa' || v.style === 'chicago') && v.profile === 'csl-v1' && typeof v.hangingIndent === 'boolean' && (v.error === null || text(v.error)) && Array.isArray(v.issues) && v.issues.length <= 100000 && v.issues.every(i => record(i) && ['reference','metadata'].includes(String(i.kind)) && [i.documentId,i.citationId,i.sourceId].every(isId) && text(i.message)) && Array.isArray(v.occurrences) && v.occurrences.length <= 100000 && v.occurrences.every(o => record(o) && isId(o.documentId) && isId(o.citationId) && (o.footnoteId === null || isId(o.footnoteId)) && ['active','archived','trashed'].includes(String(o.state)) && Array.isArray(o.sourceIds) && o.sourceIds.length > 0 && o.sourceIds.length <= 100 && o.sourceIds.every(isId)) && Array.isArray(v.labels) && v.labels.length <= 100000 && v.labels.every(l => record(l) && isId(l.id) && text(l.text)) && Array.isArray(v.notes) && v.notes.length <= 100000 && v.notes.every(n => record(n) && isId(n.id) && Number.isSafeInteger(n.number) && Number(n.number) > 0 && Array.isArray(n.paragraphs) && n.paragraphs.every(runs)) && Array.isArray(v.bibliography) && v.bibliography.length <= 100000 && v.bibliography.every(runs)
}
