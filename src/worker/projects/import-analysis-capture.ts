import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import { type OpenInput } from '../../shared/projects'
import {
  IMPORT_ANALYSIS_INSTRUCTIONS,
  isAnalysisProposal,
  type AnalysisCaptureV1 as AnalysisCapture,
  type AnalysisPacket,
  type AnalysisProposal
} from '../../shared/import-analysis'
import { type GraphRecord, type GraphRelation } from '../../shared/import-graph'
import { requestDigest } from '../storage/digest'
import { captureDigest } from '../ai/capture'
import { parseInputJson } from './import-readers/json'
import { textDigest } from './import-readers/graph'
export type AnalysisContext = OpenInput & {
  db: Database.Database
  operations: Database.Database
  root: string
  workspace: string
}
export function packetDigest(packet: AnalysisPacket): string {
  const { captureDigest: _, ...rest } = packet
  void _
  return requestDigest({
    contract: 'import-analysis-packet-v1',
    packet: rest,
    instructions: IMPORT_ANALYSIS_INSTRUCTIONS
  })
}
const fields: Record<string, string[]> = {
  chat: ['title'],
  message: ['role', 'body', 'order'],
  source: [
    'type',
    'title',
    'author',
    'issued',
    'containerTitle',
    'publisher',
    'edition',
    'volume',
    'issue',
    'page',
    'DOI',
    'URL',
    'ISBN',
    'ISSN'
  ],
  note: ['title', 'body'],
  label: ['kind', 'name']
}
const factNames: Record<string, string[]> = {
  URL: ['URL', 'url'],
  containerTitle: ['containerTitle', 'container-title'],
  issued: ['issued', 'pub_date'],
  type: ['type']
}
/** Strict syntax plus evidence semantics. A model cannot turn invented text into original material. */
export function validateProposal(output: string, packet: AnalysisPacket): AnalysisProposal | null {
  try {
    if (output.length > 128000 || Buffer.byteLength(output) > 512000) return null
    const v = parseInputJson(output, 100000).value
    if (
      !isAnalysisProposal(v) ||
      v.partId !== packet.partId ||
      v.captureDigest !== packet.captureDigest
    )
      return null
    const records = new Map(packet.fragments.map((f) => [f.id, f.record])),
      ids = new Set(records.keys()),
      covered = new Set(v.coverage.map((c) => c.fragmentId))
    if (
      covered.size !== v.coverage.length ||
      covered.size !== ids.size ||
      v.coverage.some((c) => !ids.has(c.fragmentId))
    )
      return null
    const candidates = new Set(v.entities.map((e) => e.candidateId))
    if (candidates.size !== v.entities.length) return null
    for (const e of v.entities) {
      if (
        e.recordRefs.some((id) => !ids.has(id)) ||
        new Set(e.fields.map((f) => f.name)).size !== e.fields.length
      )
        return null
      if (
        e.kind !== 'label' &&
        e.recordRefs.some(
          (id) => records.get(id)!.kind !== (e.kind === 'chat' ? 'conversation' : e.kind)
        )
      )
        return null
      const required =
        e.kind === 'message'
          ? ['role', 'order', 'body']
          : e.kind === 'note'
            ? ['body']
            : e.kind === 'chat'
              ? ['title']
              : []
      if (required.some((name) => !e.fields.some((f) => f.name === name))) return null
      for (const f of e.fields) {
        if (
          !fields[e.kind].includes(f.name) ||
          f.evidenceRefs.some((id) => !e.recordRefs.includes(id))
        )
          return null
        if (f.suggestedValue !== null) {
          if (
            !f.inferred ||
            !f.evidenceRefs.length ||
            !(f.name === 'title' || (e.kind === 'label' && ['kind', 'name'].includes(f.name)))
          )
            return null
          continue
        }
        if (f.inferred || !f.valueRef) return null
        let resolved = false
        for (const id of e.recordRefs) {
          const r = records.get(id)!
          if (
            f.name === 'body' &&
            r.texts.length > 0 &&
            (f.valueRef === `record:${id}:body` ||
              (r.texts.length === 1 && f.valueRef === `text:${r.texts[0].id}`))
          )
            resolved = true
          if (
            ['title', 'role', 'order'].includes(f.name) &&
            f.valueRef === `record:${id}:${f.name}`
          )
            resolved = true
          for (const [i, fact] of r.facts.entries())
            if (
              f.valueRef === `record:${id}:fact:${i}` &&
              (e.kind === 'label'
                ? ['tags', 'categories', 'category', 'type'].includes(fact.name)
                : (factNames[f.name] ?? [f.name]).some(
                    (name) => fact.name === name || fact.name === `normalized.${name}`
                  ))
            )
              resolved = true
        }
        if (!resolved) return null
      }
    }
    for (const link of v.links) {
      if (!ids.has(link.from) && !packet.relations.some((r) => r.from === link.from)) return null
      if (
        !link.evidenceRefs.length ||
        !link.evidenceRefs.every((id) =>
          packet.relations.some(
            (r) => r.id === id && r.kind === link.kind && r.from === link.from && r.to === link.to
          )
        )
      )
        return null
    }
    if (v.issues.some((i) => i.recordRefs.some((id) => !ids.has(id)))) return null
    // Identified records must have a mapping; omissions remain visible coverage, never silent success.
    if (
      v.coverage.some(
        (c) =>
          c.outcome === 'identified' && !v.entities.some((e) => e.recordRefs.includes(c.fragmentId))
      )
    )
      return null
    return v
  } catch {
    return null
  }
}
export function validateAnalysisEvidence(
  records: GraphRecord[],
  relations: GraphRelation[],
  captures: AnalysisCapture[],
  graphDigest: string
): void {
  const byId = new Map(records.map((r) => [r.id, r])),
    refs = new Map(relations.map((r) => [r.id, r]))
  for (const capture of captures) {
    const p = capture.packet
    if (
      p.graphDigest !== graphDigest ||
      packetDigest(p) !== p.captureDigest ||
      captureDigest(capture) !== capture.digest
    )
      throw new ProjectError('CORRUPT_PROJECT')
    const expected = records.filter((r) => r.eligible && r.disposition === 'candidate')
    if (
      p.excluded !== records.length - expected.length ||
      expected.length !== p.fragments.length ||
      new Set(p.fragments.map((f) => f.id)).size !== expected.length
    )
      throw new ProjectError('CORRUPT_PROJECT')
    for (const f of p.fragments) {
      if (requestDigest(byId.get(f.id) ?? null) !== requestDigest(f.record))
        throw new ProjectError('CORRUPT_PROJECT')
      let at = 0
      for (const part of f.record.texts) {
        if (textDigest(f.text.slice(at, at + part.units)) !== part.sha256)
          throw new ProjectError('CORRUPT_PROJECT')
        at += part.units
      }
      if (at !== f.text.length) throw new ProjectError('CORRUPT_PROJECT')
    }
    const ids = new Set(expected.map((r) => r.id)),
      chosen = relations.filter((r) => ids.has(r.from) || (!!r.to && ids.has(r.to)))
    if (
      chosen.length !== p.relations.length ||
      new Set(p.relations.map((r) => r.id)).size !== chosen.length ||
      p.relations.some((r) => requestDigest(refs.get(r.id) ?? null) !== requestDigest(r))
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
}
