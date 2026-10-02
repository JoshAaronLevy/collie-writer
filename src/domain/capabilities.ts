import type { ProjectCommand, OpenInput } from '../shared/projects'

export type Capability = 'read' | 'edit' | 'recipes' | 'batch' | 'create'
/** Exhaustive classification: new commands must make an explicit policy decision. */
export function commandCapability(command: ProjectCommand): Capability {
  switch (command.kind) {
    case 'create': return 'create'
    case 'recipeChange': return 'recipes'
    case 'exportBatchStart': return command.input.formats.length>1 ? 'batch' : 'read'
    case 'commit': case 'meta': case 'details': case 'outline': case 'noteChange': case 'sourceChange':
    case 'sourceImport': case 'sourceAttach': case 'evidenceChange': case 'citationStyle':
    case 'importImage': case 'interchangeCommit': case 'rename': return 'edit'
    // Extraction is an inspection aid. Selecting a source version or creating human excerpts is editing.
    case 'inspectionChange': return ['ensure','start','page','finish'].includes(command.input.change.type) ? 'read' : 'edit'
    case 'exportPreview': case 'exportStart': case 'exportStatus': case 'exportCancel': case 'recipes':
    case 'interchangePreview': case 'list': case 'open': case 'section': case 'history': case 'notes':
    case 'sources': case 'sourcePreview': case 'sourceExport': case 'sourceExportAttachment':
    case 'inspection': case 'inspectionPage': case 'inspectionAsset': case 'citations': case 'evidence':
    case 'search': case 'searchActivity': case 'searchAction': case 'readImage': case 'archive':
    case 'data': case 'cleanup': case 'reset': case 'recoverReset': return 'read'
  }
}
export function commandScope(command: ProjectCommand): OpenInput | null {
  if (command.kind==='rename'||command.kind==='archive') return command.input.scope
  if ('input' in command && typeof command.input==='object' && 'projectId' in command.input && 'workspaceId' in command.input) return {projectId:command.input.projectId,workspaceId:command.input.workspaceId}
  return null
}
