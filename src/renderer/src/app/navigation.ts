import type { OpenInput } from '../../../shared/projects'
import type { MaterialTarget } from '../../../shared/chapter-material'

/** Transient presentation intent, separate from a saved destination or writing hint. */
export type DestinationPresentation = {
  mode: 'top' | 'resume' | 'target'
  focus?: () => void
}

export function pageDestination(destination: AppDestination): AppDestination {
  return destination.kind === 'workspace' && destination.view === 'write'
    ? { ...destination, anchorId: undefined }
    : destination
}

export type ResearchTarget =
  | {
      kind: 'sources'
      sourceId?: string
      page?: 'details' | 'usage' | 'files'
      create?: { id: string; url?: string }
    }
  | { kind: 'notes'; noteId?: string; annotationId?: string; create?: string; text?: string }
  | {
      kind: 'evidence'
      create?: { id: string; text: string; documentId?: string }
      item?: { kind: 'question' | 'claim' | 'link'; id: string }
      sourceId?: string
    }
  | {
      kind: 'inspector'
      sourceId: string
      versionId?: string
      excerptId?: string
      pageIndex?: number
    }

export type WorkspaceView =
  'write' | 'plan' | 'research' | 'search' | 'export' | 'history' | 'details'
export type AppDestination =
  | { kind: 'setup' }
  | { kind: 'library' }
  | { kind: 'settings'; page: 'appearance' | 'data' | 'access' | 'ai' | 'updates' }
  | { kind: 'help'; page: 'about' | 'tutorial' }
  | { kind: 'workspace'; scope: OpenInput; view: 'research'; target: ResearchTarget }
  | {
      kind: 'workspace'
      scope: OpenInput
      view: Exclude<WorkspaceView, 'research'>
      documentId?: string
      anchorId?: string
      exportResultId?: string
      material?: MaterialTarget
      proposalAttemptId?: string
    }

// These keys identify presentation regions, never filesystem authority or domain entities.
export function destinationRegion(destination: AppDestination): string {
  if (destination.kind === 'workspace')
    return destination.view === 'research'
      ? `research-${destination.target.kind}`
      : destination.view
  if (destination.kind === 'settings' || destination.kind === 'help')
    return `${destination.kind}-${destination.page}`
  return destination.kind
}

export function writingDestination(scope: OpenInput, documentId: string): AppDestination {
  return {
    kind: 'workspace',
    scope: { projectId: scope.projectId, workspaceId: scope.workspaceId },
    view: 'write',
    documentId
  }
}
