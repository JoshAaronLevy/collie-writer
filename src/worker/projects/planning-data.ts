import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import {
  isPlanningSnapshot,
  TOPIC_LIMIT,
  PLANNING_RECORD_LIMIT,
  type PlanningSnapshot
} from '../../shared/planning'
import type { MaterialTarget } from '../../shared/chapter-material'
import { materialSql } from './material-reader'

export function requirePlanningMaterial(
  db: Database.Database,
  p: string,
  target: MaterialTarget,
  active = false
): void {
  const { from, state } = materialSql(target.kind)
  const row = db
    .prepare(`SELECT ${state} AS state FROM ${from} WHERE t.project_id=? AND t.id=?`)
    .get(p, target.id) as { state: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  if (active && row.state !== 'active') throw new ProjectError('STALE_REVISION')
}
export function planningSnapshot(db: Database.Database, p: string): PlanningSnapshot {
  return {
    topics: db
      .prepare(
        'SELECT id,title,position FROM planning_topics WHERE project_id=? ORDER BY position,id'
      )
      .all(p) as PlanningSnapshot['topics'],
    memberships: db
      .prepare(
        'SELECT material_kind AS kind,material_id AS id,topic_id AS topicId FROM planning_topic_members WHERE project_id=? ORDER BY topic_id,material_kind,material_id'
      )
      .all(p) as PlanningSnapshot['memberships'],
    dispositions: db
      .prepare(
        'SELECT material_kind AS kind,material_id AS id,state,reason FROM planning_dispositions WHERE project_id=? ORDER BY material_kind,material_id'
      )
      .all(p) as PlanningSnapshot['dispositions']
  }
}
export function validatePlanningSnapshot(
  db: Database.Database,
  p: string,
  value: unknown
): asserts value is PlanningSnapshot {
  if (
    !isPlanningSnapshot(value) ||
    Buffer.byteLength(JSON.stringify(value)) > 32 * 1024 ** 2 - 1024
  )
    throw new ProjectError('CORRUPT_PROJECT')
  for (const target of [...value.memberships, ...value.dispositions])
    requirePlanningMaterial(db, p, target)
}
export function restorePlanningSnapshot(
  db: Database.Database,
  p: string,
  value: PlanningSnapshot
): void {
  validatePlanningSnapshot(db, p, value)
  db.prepare('DELETE FROM planning_topic_members WHERE project_id=?').run(p)
  db.prepare('DELETE FROM planning_topics WHERE project_id=?').run(p)
  db.prepare('DELETE FROM planning_dispositions WHERE project_id=?').run(p)
  for (const t of value.topics)
    db.prepare('INSERT INTO planning_topics VALUES (?,?,?,?)').run(p, t.id, t.title, t.position)
  for (const m of value.memberships)
    db.prepare('INSERT INTO planning_topic_members VALUES (?,?,?,?)').run(
      p,
      m.topicId,
      m.kind,
      m.id
    )
  for (const d of value.dispositions)
    db.prepare('INSERT INTO planning_dispositions VALUES (?,?,?,?,?)').run(
      p,
      d.kind,
      d.id,
      d.state,
      d.reason
    )
}
export function validatePortablePlanning(db: Database.Database, p: string): void {
  for (const table of ['planning_topics', 'planning_topic_members', 'planning_dispositions'])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(p))
      throw new ProjectError('CORRUPT_PROJECT')
  for (const [table, limit] of [
    ['planning_topics', TOPIC_LIMIT],
    ['planning_topic_members', PLANNING_RECORD_LIMIT],
    ['planning_dispositions', PLANNING_RECORD_LIMIT]
  ] as const)
    if (
      (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`).get(p) as { n: number })
        .n > limit
    )
      throw new ProjectError('CORRUPT_PROJECT')
  validatePlanningSnapshot(db, p, planningSnapshot(db, p))
}
