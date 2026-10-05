import { isId } from '../../../../domain/editor/schema'
import { exact, record, type OpenInput } from '../../../../shared/projects'

const LAST_PROJECT_KEY = 'collie.last-project.v1'

export type LastProject = OpenInput & { documentId: string }

export function readLastProject(): { value: LastProject | null; issue: string | null } {
  try {
    const raw = localStorage.getItem(LAST_PROJECT_KEY)
    if (raw === null) return { value: null, issue: null }
    if (raw.length > 1000) throw new Error('INVALID_LAST_PROJECT')
    const parsed: unknown = JSON.parse(raw)
    if (
      !record(parsed) ||
      !exact(parsed, ['version', 'projectId', 'workspaceId', 'documentId']) ||
      parsed.version !== 1 ||
      !isId(parsed.projectId) ||
      !isId(parsed.workspaceId) ||
      !isId(parsed.documentId)
    )
      throw new Error('INVALID_LAST_PROJECT')
    return {
      value: {
        projectId: parsed.projectId,
        workspaceId: parsed.workspaceId,
        documentId: parsed.documentId
      },
      issue: null
    }
  } catch {
    return {
      value: null,
      issue: 'The previous writing location could not be read. Choose a project from this library.'
    }
  }
}

export function rememberLastProject(project: LastProject): boolean {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, JSON.stringify({ version: 1, ...project }))
    return true
  } catch {
    return false
  }
}

export function forgetLastProject(): void {
  try {
    localStorage.removeItem(LAST_PROJECT_KEY)
  } catch {
    /* An unreadable hint cannot affect project storage. */
  }
}
