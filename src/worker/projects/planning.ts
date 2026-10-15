import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { effectiveState } from '../../shared/outline'
import {
  MATERIAL_KINDS,
  MATERIAL_PAGE_SIZE,
  type ChapterMaterialResult
} from '../../shared/chapter-material'
import {
  TOPIC_LIMIT,
  PLANNING_RECORD_LIMIT,
  type PlanningReadInput,
  type PlanningView,
  type PlanningCount,
  type PlanningChangeInput,
  type PlanningDestination
} from '../../shared/planning'
import { isProjectValue, type CommitReceipt } from '../../shared/projects'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { materialHead, materialScopes, materialDocuments } from './chapter-material'
import { materialItem, materialSql, type MaterialRow } from './material-reader'
import { setMaterialLink, materialLinks, replaceMaterialLinks } from './material-links'
import { requirePlanningMaterial, planningSnapshot } from './planning-data'
import { changeOutline } from './outline'

const dispositionJoin = (kind: string): string =>
  `LEFT JOIN planning_dispositions pd ON pd.project_id=t.project_id AND pd.material_kind='${kind}' AND pd.material_id=t.id`
const activeDocuments = `WITH RECURSIVE active_documents(id) AS (
  SELECT d.id FROM documents d JOIN outline_state o ON o.project_id=d.project_id AND o.document_id=d.id WHERE d.project_id=@project AND d.parent_id IS NULL AND o.state='active'
  UNION ALL SELECT d.id FROM documents d JOIN outline_state o ON o.project_id=d.project_id AND o.document_id=d.id JOIN active_documents a ON a.id=d.parent_id WHERE d.project_id=@project AND o.state='active'
)`
function counts(db: Database.Database, p: string, topics: boolean): PlanningCount[] {
  const union = MATERIAL_KINDS.map((kind) => {
    const { from, links, column } = materialSql(kind)
    const relation = topics ? 'planning_topic_members' : links
    const id = topics ? 'topic_id' : 'document_id'
    const match = topics ? `l.material_kind='${kind}' AND l.material_id=t.id` : `l.${column}=t.id`
    return `SELECT l.${id} AS id,sum(CASE WHEN pd.state='aside' THEN 0 ELSE 1 END) AS count,sum(CASE WHEN pd.state='develop' THEN 1 ELSE 0 END) AS developCount,sum(CASE WHEN pd.state='aside' THEN 1 ELSE 0 END) AS asideCount FROM ${from} JOIN ${relation} l ON l.project_id=t.project_id AND ${match} ${dispositionJoin(kind)} WHERE t.project_id=@project GROUP BY l.${id}`
  }).join(' UNION ALL ')
  return db
    .prepare(
      `SELECT id,sum(count) AS count,sum(developCount) AS developCount,sum(asideCount) AS asideCount FROM (${union}) GROUP BY id ORDER BY id`
    )
    .all({ project: p }) as PlanningCount[]
}
export function readPlanning(db: Database.Database, input: PlanningReadInput): PlanningView {
  const p = input.projectId,
    location = input.location
  const scopes = location.kind === 'chapter' ? materialScopes(db, p, location.id) : []
  if (
    location.kind === 'topic' &&
    !db.prepare('SELECT 1 FROM planning_topics WHERE project_id=? AND id=?').get(p, location.id)
  )
    throw new ProjectError('NOT_FOUND')
  const params: Record<string, string | number> = { project: p, query: input.query.trim() }
  if (input.target) params.target = input.target.id
  if (location.kind === 'topic') params.topic = location.id
  scopes.forEach((scope, i) => {
    params[`scope${i}`] = scope.id
  })
  const union = (
    input.target ? [input.target.kind] : input.kind === 'all' ? MATERIAL_KINDS : [input.kind]
  )
    .map((kind) => {
      const { from, title, state, links, column } = materialSql(kind)
      const filters = [
        't.project_id=@project',
        `instr(lower(${title}),lower(@query))>0`,
        ...(input.target
          ? ['t.id=@target']
          : [input.filter === 'aside' ? "pd.state='aside'" : "coalesce(pd.state,'keep')<>'aside'"])
      ]
      if (input.status === 'develop') filters.push("pd.state='develop'")
      if (location.kind === 'pool') {
        filters.push(`${state}='active'`)
        if (input.filter === 'unplaced')
          filters.push(
            `NOT EXISTS (SELECT 1 FROM ${links} l JOIN active_documents a ON a.id=l.document_id JOIN documents doc ON doc.project_id=l.project_id AND doc.id=a.id WHERE l.project_id=t.project_id AND l.${column}=t.id AND doc.kind IN ('chapter','text'))`
          )
      } else if (location.kind === 'topic')
        filters.push(
          `EXISTS (SELECT 1 FROM planning_topic_members m WHERE m.project_id=t.project_id AND m.material_kind='${kind}' AND m.material_id=t.id AND m.topic_id=@topic)`
        )
      else
        filters.push(
          `EXISTS (SELECT 1 FROM ${links} l WHERE l.project_id=t.project_id AND l.${column}=t.id AND l.document_id IN (${scopes.map((_, i) => `@scope${i}`).join(',')}))`
        )
      const rank = scopes.length
        ? `CASE ${scopes.map((_, i) => `WHEN EXISTS (SELECT 1 FROM ${links} l WHERE l.project_id=t.project_id AND l.${column}=t.id AND l.document_id=@scope${i}) THEN ${i}`).join(' ')} ELSE 8 END`
        : '0'
      return `SELECT '${kind}' AS kind,t.id,${title} AS title,${state} AS state,coalesce(pd.state,'keep') AS disposition,coalesce(pd.reason,'') AS reason,${rank} AS rank FROM ${from} ${dispositionJoin(kind)} WHERE ${filters.join(' AND ')}`
    })
    .join(' UNION ALL ')
  const total = (
    db.prepare(`${activeDocuments} SELECT count(*) AS n FROM (${union})`).get(params) as {
      n: number
    }
  ).n
  const rows = db
    .prepare(
      `${activeDocuments} SELECT kind,id,title,state,disposition,reason FROM (${union}) ORDER BY rank,lower(title),kind,id LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit: MATERIAL_PAGE_SIZE, offset: input.offset }) as (MaterialRow & {
    disposition: PlanningView['items'][number]['disposition']
    reason: string
  })[]
  const items = rows.map(({ disposition, reason, ...row }) => ({
    material: materialItem(db, p, row),
    disposition,
    reason,
    topicIds: (
      db
        .prepare(
          'SELECT topic_id AS id FROM planning_topic_members WHERE project_id=? AND material_kind=? AND material_id=? ORDER BY topic_id'
        )
        .all(p, row.kind, row.id) as { id: string }[]
    ).map((r) => r.id)
  }))
  const topicCounts = new Map(counts(db, p, true).map((c) => [c.id, c]))
  const topics = (
    db
      .prepare(
        'SELECT id,title,position FROM planning_topics WHERE project_id=? ORDER BY position,id'
      )
      .all(p) as PlanningView['topics']
  ).map((t) => ({ ...t, count: 0, developCount: 0, asideCount: 0, ...topicCounts.get(t.id) }))
  const libraryTotal = MATERIAL_KINDS.reduce((n, kind) => {
    const { from, state } = materialSql(kind)
    return (
      n +
      (
        db
          .prepare(`SELECT count(*) AS n FROM ${from} WHERE t.project_id=? AND ${state}='active'`)
          .get(p) as { n: number }
      ).n
    )
  }, 0)
  return {
    headCommitId: materialHead(db, p),
    scopes,
    topics,
    chapters: counts(db, p, false),
    items,
    total,
    libraryTotal,
    offset: input.offset
  }
}
function topicIds(db: Database.Database, p: string): string[] {
  return (
    db.prepare('SELECT id FROM planning_topics WHERE project_id=? ORDER BY position,id').all(p) as {
      id: string
    }[]
  ).map((r) => r.id)
}
function orderTopics(db: Database.Database, p: string, ids: string[]): void {
  ids.forEach((id, i) =>
    db.prepare('UPDATE planning_topics SET position=? WHERE project_id=? AND id=?').run(i, p, id)
  )
}
export function changePlanning(
  db: Database.Database,
  input: PlanningChangeInput
): ChapterMaterialResult {
  const p = input.projectId,
    digest = requestDigest({ ...input, action: 'set' })
  const prior = (): CommitReceipt | null => {
    const row = db
      .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(p, input.operationId) as { digest: string; result: string } | undefined
    if (!row) return null
    if (row.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
    const receipt: unknown = JSON.parse(row.result)
    if (!isProjectValue('commit', receipt)) throw new ProjectError('CORRUPT_PROJECT')
    return receipt as CommitReceipt
  }
  if (input.action === 'status') return { receipt: prior() }
  return inWriteTransaction(db, () => {
    const recorded = prior()
    if (recorded) return { receipt: recorded }
    if (materialHead(db, p) !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    const documents = materialDocuments(db, p),
      selected = documents.find((d) => d.id === input.documentId)
    if (!selected) throw new ProjectError('NOT_FOUND')
    const c = input.change
    const requireTopic = (id: string): { title: string } => {
      const row = db
        .prepare('SELECT title FROM planning_topics WHERE project_id=? AND id=?')
        .get(p, id) as { title: string } | undefined
      if (!row) throw new ProjectError('NOT_FOUND')
      return row
    }
    const destination = (target: PlanningDestination | null): void => {
      if (!target) return
      if (target.kind === 'topic') requireTopic(target.id)
      else {
        const doc = documents.find((d) => d.id === target.id)
        if (!doc || effectiveState(doc, documents) !== 'active')
          throw new ProjectError('STALE_REVISION')
      }
    }
    let documentId = input.documentId
    if (c.type === 'disposition') {
      for (const target of c.targets) {
        requirePlanningMaterial(db, p, target)
        if (c.state === 'keep')
          db.prepare(
            'DELETE FROM planning_dispositions WHERE project_id=? AND material_kind=? AND material_id=?'
          ).run(p, target.kind, target.id)
        else
          db.prepare(
            'INSERT INTO planning_dispositions VALUES (?,?,?,?,?) ON CONFLICT(project_id,material_kind,material_id) DO UPDATE SET state=excluded.state,reason=excluded.reason'
          ).run(p, target.kind, target.id, c.state, c.reason)
      }
    } else if (c.type === 'assign') {
      destination(c.to)
      destination(c.from)
      for (const target of c.targets) {
        requirePlanningMaterial(db, p, target, !!c.to)
        for (const [place, linked] of [
          [c.from, false],
          [c.to, true]
        ] as const) {
          if (!place) continue
          if (place.kind === 'chapter')
            setMaterialLink(db, p, { ...target, documentId: place.id }, linked)
          else if (linked)
            db.prepare('INSERT OR IGNORE INTO planning_topic_members VALUES (?,?,?,?)').run(
              p,
              place.id,
              target.kind,
              target.id
            )
          else
            db.prepare(
              'DELETE FROM planning_topic_members WHERE project_id=? AND topic_id=? AND material_kind=? AND material_id=?'
            ).run(p, place.id, target.kind, target.id)
        }
      }
    } else if (c.type === 'topic-create') {
      const ids = topicIds(db, p)
      if (ids.length >= TOPIC_LIMIT) throw new ProjectError('LIMIT_EXCEEDED')
      if (ids.includes(c.id)) throw new ProjectError('OPERATION_CONFLICT')
      db.prepare('INSERT INTO planning_topics VALUES (?,?,?,?)').run(
        p,
        c.id,
        c.title.trim(),
        ids.length
      )
    } else {
      const topic = requireTopic(c.id)
      if (c.type === 'topic-rename')
        db.prepare('UPDATE planning_topics SET title=? WHERE project_id=? AND id=?').run(
          c.title.trim(),
          p,
          c.id
        )
      else if (c.type === 'topic-move') {
        const ids = topicIds(db, p).filter((id) => id !== c.id)
        if (c.position > ids.length) throw new ProjectError('VALIDATION')
        ids.splice(c.position, 0, c.id)
        orderTopics(db, p, ids)
      } else {
        if (c.type === 'topic-chapter') {
          const docs = db
            .prepare('SELECT id,revision_id FROM documents WHERE project_id=?')
            .all(p) as { id: string; revision_id: string }[]
          documentId = changeOutline(db, {
            hierarchyVersion: 2,
            projectId: p,
            workspaceId: input.workspaceId,
            operationId: randomUUID(),
            expectedHead: input.expectedHead,
            expectedRevisions: Object.fromEntries(docs.map((d) => [d.id, d.revision_id])),
            selectedId: input.documentId,
            change: { type: 'create', kind: c.kind, title: topic.title, parentId: c.parentId }
          })
          const members = db
            .prepare(
              'SELECT material_kind AS kind,material_id AS id FROM planning_topic_members WHERE project_id=? AND topic_id=?'
            )
            .all(p, c.id) as Parameters<typeof requirePlanningMaterial>[2][]
          for (const member of members) requirePlanningMaterial(db, p, member)
          replaceMaterialLinks(db, p, [
            ...materialLinks(db, p),
            ...members.map((member) => ({ ...member, documentId }))
          ])
        }
        db.prepare('DELETE FROM planning_topic_members WHERE project_id=? AND topic_id=?').run(
          p,
          c.id
        )
        db.prepare('DELETE FROM planning_topics WHERE project_id=? AND id=?').run(p, c.id)
        orderTopics(db, p, topicIds(db, p))
      }
    }
    for (const table of ['planning_topic_members', 'planning_dispositions'])
      if (
        (
          db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id=?`).get(p) as {
            n: number
          }
        ).n > PLANNING_RECORD_LIMIT
      )
        throw new ProjectError('LIMIT_EXCEEDED')
    if (Buffer.byteLength(JSON.stringify(planningSnapshot(db, p))) > 32 * 1024 ** 2 - 1024)
      throw new ProjectError('LIMIT_EXCEEDED')
    let headCommitId = materialHead(db, p)
    if (c.type !== 'topic-chapter') {
      headCommitId = randomUUID()
      const now = new Date().toISOString()
      db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(
        p,
        headCommitId,
        input.expectedHead,
        now
      )
      db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
        headCommitId,
        now,
        p
      )
    }
    const doc = db
      .prepare('SELECT revision_id AS revisionId FROM documents WHERE project_id=? AND id=?')
      .get(p, documentId) as { revisionId: string }
    const receipt = { projectId: p, documentId, revisionId: doc.revisionId, headCommitId }
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      p,
      input.operationId,
      digest,
      JSON.stringify(receipt)
    )
    return { receipt }
  })
}
