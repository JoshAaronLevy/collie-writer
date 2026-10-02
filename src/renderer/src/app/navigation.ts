import type { OpenInput } from '../../../shared/projects'

export type ResearchTarget =
  | { kind: 'sources'; sourceId?: string; page?: 'details' | 'usage' | 'files' }
  | { kind: 'notes'; noteId?: string; annotationId?: string }
  | { kind: 'evidence'; item?: { kind: 'question' | 'claim' | 'link'; id: string }; sourceId?: string }
  | { kind: 'inspector'; sourceId: string; versionId?: string; excerptId?: string; pageIndex?: number }

export type WorkspaceView = 'write' | 'research' | 'search' | 'export' | 'history' | 'details'
export type AppDestination =
  | { kind: 'setup' }
  | { kind: 'library' }
  | { kind: 'settings'; page: 'appearance' | 'data' | 'access' }
  | { kind: 'help'; page: 'about' | 'tutorial' }
  | { kind: 'workspace'; scope: OpenInput; view: 'research'; target: ResearchTarget }
  | { kind: 'workspace'; scope: OpenInput; view: Exclude<WorkspaceView, 'research'>; documentId?: string; anchorId?: string }

// These keys identify presentation regions, never filesystem authority or domain entities.
export function destinationRegion(destination: AppDestination): string {
  if (destination.kind === 'workspace') return destination.view === 'research'
    ? `research-${destination.target.kind}` : destination.view
  if (destination.kind === 'settings' || destination.kind === 'help') return `${destination.kind}-${destination.page}`
  return destination.kind
}

export function writingDestination(scope: OpenInput, documentId: string): AppDestination {
  return { kind: 'workspace', scope: { projectId: scope.projectId, workspaceId: scope.workspaceId }, view: 'write', documentId }
}
