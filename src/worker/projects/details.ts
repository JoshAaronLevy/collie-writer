import type Database from 'better-sqlite3'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { projectText, requiredProjectName } from '../../domain/projects/details'
import { isProjectKind, isProjectTemplate, kindForTemplate, type ProjectKind } from '../../domain/projects/templates'

export type StoredDetails = { byline: string; description: string; projectKind: ProjectKind; detailsRevisionId: string }
export function readProjectDetails(db: Database.Database, projectId: string): StoredDetails {
  const rows = db.prepare('SELECT d.*,p.template FROM project_details d JOIN projects p ON p.id=d.project_id').all() as Record<string, unknown>[]
  if (rows.length !== 1) throw new ProjectError('CORRUPT_PROJECT')
  const d = rows[0]
  if (d.project_id !== projectId || !(d.byline === '' || requiredProjectName(d.byline)) || !projectText(d.description, 10000) || !isProjectKind(d.kind) || !isProjectTemplate(d.template) || kindForTemplate(d.template) !== d.kind || !isId(d.revision_id) || !db.prepare('SELECT 1 FROM commits WHERE project_id=? AND id=?').get(projectId,d.revision_id)) throw new ProjectError('CORRUPT_PROJECT')
  return { byline: d.byline as string, description: d.description, projectKind: d.kind, detailsRevisionId: d.revision_id }
}
