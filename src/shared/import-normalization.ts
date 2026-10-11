import { isSemanticSelection } from './import-semantic'
import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { importHash, isImportSettings, type ImportSettings } from './project-import'

/** Original records/text/relationships and omission details live in the referenced graph pages. */
export type LocalImportEvidence = {
  version: 1
  kind: 'local-reader'
  readerVersion: 1
  revisionId: string
  settings: ImportSettings
  pagesDigest: string
  recordsDigest: string
  relationsDigest: string
  coverage: {
    records: number
    candidates: number
    retained: number
    unreadFiles: number
    unresolvedRecords: number
  }
}
export function isLocalImportEvidence(v: unknown): v is LocalImportEvidence {
  const count = (n: unknown, max: number): boolean =>
    Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= max
  return (
    record(v) &&
    exact(v, [
      'version',
      'kind',
      'readerVersion',
      'revisionId',
      'settings',
      'pagesDigest',
      'recordsDigest',
      'relationsDigest',
      'coverage'
    ]) &&
    v.version === 1 &&
    v.kind === 'local-reader' &&
    v.readerVersion === 1 &&
    isId(v.revisionId) &&
    isImportSettings(v.settings) &&
    v.settings.categories.length > 0 &&
    !v.settings.instructions.trim() &&
    [v.pagesDigest, v.recordsDigest, v.relationsDigest].every(importHash) &&
    record(v.coverage) &&
    exact(v.coverage, ['records', 'candidates', 'retained', 'unreadFiles', 'unresolvedRecords']) &&
    count(v.coverage.records, 50000) &&
    count(v.coverage.candidates, 50000) &&
    count(v.coverage.retained, 50000) &&
    count(v.coverage.unreadFiles, 100) &&
    count(v.coverage.unresolvedRecords, 50000) &&
    Number(v.coverage.unresolvedRecords) <= Number(v.coverage.records) &&
    Number(v.coverage.candidates) + Number(v.coverage.retained) === v.coverage.records
  )
}

export type MappedImportEvidence = Omit<LocalImportEvidence, 'kind' | 'readerVersion'> & {
  kind: 'mapping-applied'
  readerVersion: 2
  sourceGraphId: string
  mappings: import('./import-graph').MappingSelection[]
}
export function isMappedImportEvidence(v: unknown): v is MappedImportEvidence {
  if (
    !record(v) ||
    v.kind !== 'mapping-applied' ||
    v.readerVersion !== 2 ||
    !isId(v.sourceGraphId) ||
    !Array.isArray(v.mappings) ||
    v.mappings.length < 1 ||
    v.mappings.length > 8 ||
    v.mappings.some(
      (m) =>
        !record(m) ||
        !exact(m, ['normalizationId', 'attemptId']) ||
        !isId(m.normalizationId) ||
        !isId(m.attemptId)
    ) ||
    new Set(v.mappings.map((m) => m.normalizationId)).size !== v.mappings.length
  )
    return false
  const { sourceGraphId: _, mappings: __, ...base } = v
  void _
  void __
  return isLocalImportEvidence({ ...base, kind: 'local-reader', readerVersion: 1 })
}

export type SemanticImportEvidence = Omit<LocalImportEvidence, 'kind' | 'readerVersion'> & {
  kind: 'ai-interpretation'
  readerVersion: 3
  sourceGraphId: string
  semantic: import('./import-semantic').SemanticSelection
  unresolvedTasks: number
}
export function isSemanticImportEvidence(v: unknown): v is SemanticImportEvidence {
  if (
    !record(v) ||
    v.kind !== 'ai-interpretation' ||
    v.readerVersion !== 3 ||
    !isId(v.sourceGraphId) ||
    !isSemanticSelection(v.semantic) ||
    !Number.isSafeInteger(v.unresolvedTasks) ||
    Number(v.unresolvedTasks) < 0 ||
    Number(v.unresolvedTasks) > 1025 ||
    !isImportSettings(v.settings)
  )
    return false
  const { sourceGraphId: _, semantic: __, unresolvedTasks: ___, ...base } = v
  void _
  void __
  void ___
  return isLocalImportEvidence({
    ...base,
    kind: 'local-reader',
    readerVersion: 1,
    settings: { ...v.settings, instructions: '' }
  })
}
