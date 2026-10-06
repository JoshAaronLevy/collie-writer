import { ContentError } from '../editor/schema'
import { isProjectCode, type ProjectCode } from '../../shared/projects'
export class ProjectError extends Error {
  constructor(readonly code: ProjectCode) {
    super(code)
  }
}
export function projectError(error: unknown): ProjectCode {
  if (error instanceof ProjectError) return error.code
  if (error instanceof ContentError) return 'VALIDATION'
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (isProjectCode(code)) return code
  if (code === 'ENOSPC' || code.startsWith('SQLITE_FULL')) return 'DISK_FULL'
  if (['EACCES', 'EPERM', 'EROFS'].includes(code) || code.startsWith('SQLITE_READONLY'))
    return 'DENIED'
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'PROJECT_LOCKED'
  if (code.startsWith('SQLITE_CORRUPT') || code.startsWith('SQLITE_NOTADB'))
    return 'CORRUPT_PROJECT'
  if (code === 'ENOENT') return 'NOT_FOUND'
  return 'UNAVAILABLE'
}
