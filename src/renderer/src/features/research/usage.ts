import type { EvidenceLink, EvidenceView } from '../../../../shared/evidence'
import type { OutlineDocument } from '../../../../shared/outline'

export function sectionsWithin(documents: OutlineDocument[], id: string): string[] {
  const root = documents.find((item) => item.id === id)
  if (!root) return []
  if (root.kind === 'text') return [root.id]
  const children = documents
    .filter((item) => item.parentId === id)
    .sort((a, b) => a.position - b.position)
  return children.flatMap((child) => sectionsWithin(documents, child.id))
}
export function containingChapter(
  documents: OutlineDocument[],
  id: string
): OutlineDocument | undefined {
  let item = documents.find((doc) => doc.id === id)
  const visited = new Set<string>()
  while (item && !visited.has(item.id)) {
    if (item.kind === 'chapter') return item
    visited.add(item.id)
    item = documents.find((doc) => doc.id === item?.parentId)
  }
  return undefined
}
export function sectionPath(documents: OutlineDocument[], id: string): string {
  let item = documents.find((doc) => doc.id === id)
  const titles: string[] = [],
    visited = new Set<string>()
  while (item && !visited.has(item.id)) {
    titles.unshift(item.title)
    visited.add(item.id)
    item = documents.find((doc) => doc.id === item?.parentId)
  }
  return titles.join(' / ') || 'Missing section'
}
export function linkDocument(view: EvidenceView, link: EvidenceLink): string | null {
  return (
    link.documentId ?? view.claims.find((claim) => claim.id === link.claimId)?.documentId ?? null
  )
}
export function linkWarnings(view: EvidenceView, link: EvidenceLink): string[] {
  const issues: string[] = []
  const source = view.sources.find((item) => item.id === link.sourceId)
  if (source?.state !== 'active') issues.push(`source ${source?.state ?? 'missing'}`)
  const target = link.claimId
    ? view.claims.find((item) => item.id === link.claimId)
    : view.sections.find((item) => item.id === link.documentId)
  if (!target) issues.push('target missing')
  else {
    if (target.state !== 'active') issues.push(`target ${target.state}`)
    if (target.revisionId !== link.targetRevisionId) issues.push('target changed since review')
  }
  const claim = view.claims.find((item) => item.id === link.claimId)
  if (claim?.documentId) {
    const section = view.sections.find((item) => item.id === claim.documentId)
    if (section?.state !== 'active') issues.push(`claim section ${section?.state ?? 'missing'}`)
    if (section && section.revisionId !== claim.documentRevisionId)
      issues.push('claim section changed')
  }
  if (link.excerptId) {
    const excerpt = view.excerpts.find((item) => item.id === link.excerptId)
    if (!excerpt) issues.push('excerpt missing')
    else if (
      excerpt.versionId !==
      view.sources.find((item) => item.id === excerpt.sourceId)?.activeVersionId
    )
      issues.push('excerpt from an earlier source version')
  }
  if (link.review === 'needs_review') issues.push('marked for review')
  return issues
}
export function sourceCounts(
  view: EvidenceView,
  sourceId: string
): { citations: number; sections: number; evidence: number; decisions: number } {
  const citations = view.citations.filter((item) => item.sourceId === sourceId)
  return {
    citations: new Set(citations.map((item) => `${item.documentId}:${item.citationId}`)).size,
    sections: view.sourceSections.filter((item) => item.sourceId === sourceId).length,
    evidence: view.links.filter((item) => item.sourceId === sourceId && item.state === 'active')
      .length,
    decisions: view.decisions.filter((item) => item.sourceId === sourceId).length
  }
}
