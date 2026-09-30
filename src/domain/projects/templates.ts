import type { DocumentPayload } from '../editor/schema'

export const templateSections = {
  blank: ['Draft'],
  book: ['Front matter', 'Chapter 1', 'Back matter'],
  article: ['Draft', 'Notes'],
  research: ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion', 'References'],
  report: ['Summary', 'Findings', 'Recommendations', 'Appendix']
} as const
export type ProjectTemplate = keyof typeof templateSections
export const templateNames: Record<ProjectTemplate, string> = {
  blank: 'Blank project', book: 'Book', article: 'Article', research: 'Research paper', report: 'Report'
}
export function isProjectTemplate(value: unknown): value is ProjectTemplate {
  return typeof value === 'string' && Object.hasOwn(templateSections, value)
}
export function emptyDocument(id: () => string): DocumentPayload {
  return { schemaVersion: 1, ast: { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: id() } }] }, footnotesById: {} }
}
