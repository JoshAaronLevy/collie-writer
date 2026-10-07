import type { DocumentPayload } from '../editor/schema'

/** Stable portable IDs. Labels and new-project structure have one owner. */
export const projectTypes = {
  book: {
    kind: 'nonfiction-book',
    name: 'Nonfiction book',
    primary: true,
    sections: ['Introduction', 'Chapter 1']
  },
  essay: {
    kind: 'academic-essay',
    name: 'Academic essay',
    primary: true,
    sections: ['Introduction', 'Argument', 'Conclusion']
  },
  article: { kind: 'article', name: 'Article', primary: true, sections: ['Draft'] },
  report: {
    kind: 'report',
    name: 'Report',
    primary: true,
    sections: ['Summary', 'Findings', 'Recommendations']
  },
  critique: {
    kind: 'study-critique',
    name: 'Study critique',
    primary: true,
    sections: ['Study overview', 'Argument', 'Supporting research']
  },
  research: {
    kind: 'research-paper',
    name: 'Research paper',
    primary: false,
    sections: ['Abstract', 'Introduction', 'Methods', 'Results', 'Discussion']
  },
  blank: {
    kind: 'blank-nonfiction',
    name: 'Blank nonfiction project',
    primary: false,
    sections: ['Draft']
  }
} as const
export type ProjectTemplate = keyof typeof projectTypes
export type ProjectKind = (typeof projectTypes)[ProjectTemplate]['kind']
export const projectTemplates = Object.keys(projectTypes) as ProjectTemplate[]
export const templateSections = Object.fromEntries(
  projectTemplates.map((id): [ProjectTemplate, readonly string[]] => [
    id,
    projectTypes[id].sections
  ])
) as Record<ProjectTemplate, readonly string[]>
export const templateNames = Object.fromEntries(
  projectTemplates.map((id) => [id, projectTypes[id].name])
) as Record<ProjectTemplate, string>
export function isProjectTemplate(value: unknown): value is ProjectTemplate {
  return typeof value === 'string' && Object.hasOwn(projectTypes, value)
}
export function isProjectKind(value: unknown): value is ProjectKind {
  return projectTemplates.some((id) => projectTypes[id].kind === value)
}
export function templateForKind(kind: ProjectKind): ProjectTemplate {
  return projectTemplates.find((id) => projectTypes[id].kind === kind)!
}
export function kindForTemplate(template: ProjectTemplate): ProjectKind {
  return projectTypes[template].kind
}

export function emptyDocument(id: () => string): DocumentPayload {
  return {
    schemaVersion: 1,
    ast: { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: id() } }] },
    footnotesById: {}
  }
}

/** Omitted version keeps already submitted creation requests unchanged. */
export function templateItemKind(
  template: ProjectTemplate,
  position: number,
  version?: 2
): 'chapter' | 'text' {
  return version === 2 && template === 'book' && position === 1 ? 'chapter' : 'text'
}
