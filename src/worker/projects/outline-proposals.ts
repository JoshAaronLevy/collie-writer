import { withoutKeys } from '../../shared/objects'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { emptyDocument } from '../../domain/projects/templates'
import { isId } from '../../domain/editor/schema'
import { exact, record, isProjectValue, type CommitReceipt } from '../../shared/projects'
import {
  isMaterialLink,
  type MaterialLink,
  type MaterialTarget
} from '../../shared/chapter-material'
import {
  effectiveState,
  isOutlineDocument,
  type OutlineDocument,
  type RetainedDocument
} from '../../shared/outline'
import { isMaterialDisposition, type MaterialDisposition } from '../../shared/planning'
import { planningCoverageLabel, type PlanningScope } from '../../shared/planning-conversation'
import {
  isOutlineProposal,
  isOutlineProposalInput,
  isOutlineProposalVersion,
  materialKey,
  type OutlineProposal,
  type OutlineProposalInput,
  type OutlineProposalRequest,
  type OutlineProposalResult,
  type OutlineProposalVersion,
  type OutlineProposalView
} from '../../shared/outline-proposals'
import type { AiCaptureV7, ConversationTurn } from '../../shared/conversations'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { materialHead } from './chapter-material'
import {
  manuscript,
  checkpoint,
  freshRevisions,
  reconcileAnchors,
  validateManuscript,
  writeManuscript
} from './manuscript'
import { materialLinks, replaceMaterialLinks } from './material-links'
import { planningSnapshot } from './planning-data'
import { reconcileAnnotationAnchors } from './notes'
import { planningCorpus, type PlanningContext, type PlanningCorpus } from './planning-corpus'
import { readPlanningRun } from './planning-conversation'

function fail(): never {
  throw new ProjectError('CORRUPT_PROJECT')
}
const summary = (doc: RetainedDocument): OutlineDocument => withoutKeys(doc, ['payload'])
const same = (a: unknown, b: unknown): boolean => requestDigest(a) === requestDigest(b)
const linkKey = (l: MaterialLink): string => `${materialKey(l)}:${l.documentId}`
const siblings = (docs: OutlineDocument[], parentId: string | null): string[] =>
  docs
    .filter((d) => d.parentId === parentId)
    .sort((a, b) => a.position - b.position)
    .map((d) => d.id)
export function proposalInput(
  db: Database.Database,
  p: string,
  corpus: PlanningCorpus,
  baseVersionId: string | null,
  scope: PlanningScope
): OutlineProposalInput {
  const overview = JSON.parse(corpus.structure) as {
    overview?: { outline: { id: string }[] }
    outline?: { id: string }[]
  }
  const visible = new Set((overview.overview?.outline ?? overview.outline ?? []).map((d) => d.id))
  const all = manuscript(db, p).documents.map(summary)
  // Only metadata already in the explicit planning overview is eligible for a model edit.
  const documents = scopedDocuments(
    all.filter((d) => visible.has(d.id)),
    scope
  )
  const parents = new Set<string | null>([
    null,
    ...documents.map((d) => d.parentId),
    ...documents.map((d) => d.id)
  ])
  let base: OutlineProposal | null = null
  if (baseVersionId) base = readVersion(db, p, baseVersionId).body
  const materials = new Set(corpus.chunks.flat().map(materialKey))
  const input: OutlineProposalInput = {
    version: 1,
    documents,
    links: materialLinks(db, p).filter(
      (l) => documents.some((d) => d.id === l.documentId) && materials.has(materialKey(l))
    ),
    orders: [...parents].map((parentId) => ({
      parentId,
      digest: requestDigest(siblings(all, parentId))
    })),
    baseVersionId,
    base
  }
  if (!isOutlineProposalInput(input) || JSON.stringify(input).length > 30000)
    throw new ProjectError('LIMIT_EXCEEDED', 'outline-input-limit')
  return input
}
function readVersion(db: Database.Database, p: string, id: string): OutlineProposalVersion {
  const row = db
    .prepare('SELECT body FROM outline_proposal_versions WHERE project_id=? AND id=?')
    .get(p, id) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  const v: unknown = JSON.parse(row.body)
  if (!isOutlineProposalVersion(v)) fail()
  return v
}
function capture(
  db: Database.Database,
  p: string,
  attemptId: string
): AiCaptureV7 & { planning: Extract<AiCaptureV7['planning'], { version: 2 }> } {
  const row = db
    .prepare(
      "SELECT c.body FROM conversation_attempts a JOIN ai_captures c ON c.project_id=a.project_id AND c.id=a.capture_id WHERE a.project_id=? AND a.id=? AND json_extract(a.body,'$.state')='completed'"
    )
    .get(p, attemptId) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  const c = JSON.parse(row.body) as AiCaptureV7
  if (c.version !== 7 || c.purpose !== 'chat' || c.planning.version !== 2)
    throw new ProjectError('VALIDATION')
  return c as ReturnType<typeof capture>
}
function allowedMaterials(
  db: Database.Database,
  p: string,
  c: AiCaptureV7
): OutlineProposalView['materials'] {
  const r = readPlanningRun(db, p, c.planning.runId)
  return [
    ...new Map(
      r.corpus.chunks
        .slice(0, c.planning.coverage.done)
        .flat()
        .map((m) => [materialKey(m), { kind: m.kind, id: m.id, title: m.title }])
    ).values()
  ]
}
/** Exact model output; no guessed IDs, dropped invalid rows, or automatic repair requests. */
function parseOutput(text: string): OutlineProposal | null {
  try {
    const trimmed = text.trim(),
      fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i)
    const v: unknown = JSON.parse(fence ? fence[1] : trimmed)
    return isOutlineProposal(v) && !v.dispositions.some((d) => d.selected) ? v : null
  } catch {
    return null
  }
}
function assistantText(db: Database.Database, p: string, attemptId: string): string {
  const row = db
    .prepare(
      "SELECT m.text FROM conversation_attempts a JOIN conversation_messages m ON m.project_id=a.project_id AND m.id=json_extract(a.body,'$.assistantMessageId') WHERE a.project_id=? AND a.id=?"
    )
    .get(p, attemptId) as { text: string } | undefined
  if (!row) fail()
  return row.text
}
function proposalIssue(
  body: OutlineProposal,
  input: OutlineProposalInput,
  materials: MaterialTarget[],
  links: MaterialLink[]
): string {
  const allowed = new Set(materials.map(materialKey)),
    docs = new Map(input.documents.map((d) => [d.id, d]))
  for (const c of body.chapters) {
    const d = c.documentId ? docs.get(c.documentId) : null
    if (
      c.documentId &&
      (!d || !['chapter', 'text'].includes(d.kind) || d.kind !== c.kind || d.state !== 'active')
    )
      return `“${c.title}” refers to an unavailable chapter. Keep this response and request a corrected proposal.`
    if (c.parentId && (!docs.has(c.parentId) || docs.get(c.parentId)!.state !== 'active'))
      return `The parent of “${c.title}” was not supplied to this proposal.`
    if (!c.documentId && c.remove.length)
      return `A new chapter cannot remove existing material links.`
    for (const t of [...c.add, ...c.remove])
      if (!allowed.has(materialKey(t)))
        return `“${c.title}” references material outside the analyzed input. Nothing was applied.`
    for (const t of c.remove)
      if (!links.some((l) => l.documentId === c.documentId && materialKey(l) === materialKey(t)))
        return `“${c.title}” removes a link that was not in its input.`
  }
  for (const d of body.dispositions)
    if (!allowed.has(materialKey(d)))
      return 'A disposition references material outside the analyzed input.'
  // Validate parent cycles/depth against the supplied hierarchy. Full manuscript validation also runs at apply.
  const parents = new Map(input.documents.map((d) => [d.id, d.parentId]))
  for (const c of body.chapters) if (c.documentId) parents.set(c.documentId, c.parentId)
  for (const c of body.chapters) {
    const seen = new Set<string>(c.documentId ? [c.documentId] : [])
    let parent = c.parentId,
      depth = 1
    while (parent) {
      if (seen.has(parent) || ++depth > 8) return `“${c.title}” would create an invalid hierarchy.`
      seen.add(parent)
      parent = parents.get(parent) ?? null
    }
  }
  return ''
}
function inputLinks(db: Database.Database, p: string, c: AiCaptureV7): MaterialLink[] {
  const run = readPlanningRun(db, p, c.planning.runId)
  return run.version === 2 ? run.proposal.links : []
}
export function retainOutlineProposal(db: Database.Database, p: string, t: ConversationTurn): void {
  const c = t.capture
  if (
    c.version !== 7 ||
    c.planning.version !== 2 ||
    c.purpose !== 'chat' ||
    t.attempt.state !== 'completed' ||
    !t.assistant
  )
    return
  if (
    db
      .prepare('SELECT 1 FROM outline_proposal_versions WHERE project_id=? AND id=?')
      .get(p, t.attempt.id)
  )
    return
  const body = parseOutput(t.assistant.text)
  if (
    !body ||
    proposalIssue(body, c.planning.proposal, allowedMaterials(db, p, c), inputLinks(db, p, c))
  )
    return
  // Oversized/invalid outputs remain protected conversation text, even when they cannot become cards.
  if (
    (
      db
        .prepare('SELECT count(*) AS n FROM outline_proposal_versions WHERE project_id=?')
        .get(p) as { n: number }
    ).n >= 10000
  )
    return
  const v: OutlineProposalVersion = {
    id: t.attempt.id,
    attemptId: t.attempt.id,
    parentId: null,
    createdAt: t.assistant.createdAt,
    body
  }
  db.prepare('INSERT INTO outline_proposal_versions VALUES (?,?,?,?)').run(
    p,
    v.id,
    v.attemptId,
    JSON.stringify(v)
  )
}
function readView(db: Database.Database, p: string, attemptId: string): OutlineProposalView {
  const c = capture(db, p, attemptId),
    materials = allowedMaterials(db, p, c),
    links = inputLinks(db, p, c)
  const versions = (
    db
      .prepare(
        'SELECT body FROM outline_proposal_versions WHERE project_id=? AND attempt_id=? ORDER BY rowid'
      )
      .all(p, attemptId) as { body: string }[]
  ).map((r) => JSON.parse(r.body) as OutlineProposalVersion)
  let issue = ''
  if (!versions.length) {
    const parsed = parseOutput(assistantText(db, p, attemptId))
    issue = parsed
      ? proposalIssue(parsed, c.planning.proposal, materials, links) ||
        'This response could not be retained as proposal cards. Its original text is kept.'
      : 'This response is not a valid outline proposal. Its original text is kept. Keep discussing to request a corrected proposal.'
  }
  const applications = db
    .prepare(
      'SELECT id,version_id AS versionId,undone_by IS NOT NULL AS undone FROM outline_proposal_applications WHERE project_id=? AND version_id IN (SELECT id FROM outline_proposal_versions WHERE project_id=? AND attempt_id=?) ORDER BY rowid'
    )
    .all(p, p, attemptId) as { id: string; versionId: string; undone: number }[]
  return {
    conversationId: c.conversationId,
    scope: c.planning.scope,
    versions,
    materials,
    documents: c.planning.proposal.documents,
    links,
    coverage: `${planningCoverageLabel(c.planning.coverage, c.planning.mode)} · ${c.planning.proposal.documents.length} existing outline items supplied; other chapters stay unchanged.`,
    issue,
    applications: applications.map((a) => ({ ...a, undone: !!a.undone }))
  }
}

type Inverse = {
  version: 1
  documentIds: string[]
  documents: { before: OutlineDocument | null; after: OutlineDocument }[]
  orders: { parentId: string | null; after: string[] }[]
  links: { link: MaterialLink; before: boolean; after: boolean }[]
  dispositions: {
    target: MaterialTarget
    before: MaterialDisposition | null
    after: MaterialDisposition | null
  }[]
}
class Conflict extends Error {}
function conflict(message: string): never {
  throw new Conflict(message)
}
function disposition(
  db: Database.Database,
  p: string,
  t: MaterialTarget
): MaterialDisposition | null {
  return (
    (db
      .prepare(
        'SELECT material_kind AS kind,material_id AS id,state,reason FROM planning_dispositions WHERE project_id=? AND material_kind=? AND material_id=?'
      )
      .get(p, t.kind, t.id) as MaterialDisposition | undefined) ?? null
  )
}
function setDisposition(
  db: Database.Database,
  p: string,
  t: MaterialTarget,
  value: MaterialDisposition | null
): void {
  if (!value)
    db.prepare(
      'DELETE FROM planning_dispositions WHERE project_id=? AND material_kind=? AND material_id=?'
    ).run(p, t.kind, t.id)
  else
    db.prepare(
      'INSERT INTO planning_dispositions VALUES (?,?,?,?,?) ON CONFLICT(project_id,material_kind,material_id) DO UPDATE SET state=excluded.state,reason=excluded.reason'
    ).run(p, t.kind, t.id, value.state, value.reason)
}
const structureFields = [
  'title',
  'synopsis',
  'parentId',
  'position',
  'state',
  'kind',
  'replacementId'
] as const
function applyProposal(
  db: Database.Database,
  p: string,
  version: OutlineProposalVersion,
  c: ReturnType<typeof capture>,
  currentCorpus: PlanningCorpus
): Inverse {
  const input = c.planning.proposal,
    body = version.body,
    run = readPlanningRun(db, p, c.planning.runId)
  const issue = proposalIssue(body, input, allowedMaterials(db, p, c), inputLinks(db, p, c))
  if (issue) conflict(issue)
  const before = manuscript(db, p),
    after = structuredClone(before),
    old = new Map(before.documents.map((d) => [d.id, d])),
    baseline = new Map(input.documents.map((d) => [d.id, d]))
  const touched = new Set(
    run.corpus.chunks.slice(0, c.planning.coverage.done).flat().map(materialKey)
  )
  const groupOrigins = (corpus: PlanningCorpus): Map<string, (typeof corpus.chunks)[number]> => {
    const result = new Map<string, (typeof corpus.chunks)[number]>()
    for (const ref of corpus.chunks.flat()) {
      const key = materialKey(ref),
        refs = result.get(key) ?? []
      refs.push(ref)
      result.set(key, refs)
    }
    return result
  }
  const capturedOrigins = groupOrigins(run.corpus),
    currentOrigins = groupOrigins(currentCorpus)
  for (const key of touched) {
    const previous = capturedOrigins.get(key) ?? [],
      current = currentOrigins.get(key) ?? []
    if (!previous.length || !same(previous, current))
      conflict(
        `“${previous[0]?.title ?? 'Referenced material'}” changed or is no longer available. Your proposal is kept; update it in discussion before applying.`
      )
  }
  const groups = new Set<string | null>()
  for (const ch of body.chapters) {
    const original = ch.documentId ? baseline.get(ch.documentId) : undefined,
      current = ch.documentId ? old.get(ch.documentId) : undefined
    if (
      ch.documentId &&
      (!original ||
        !current ||
        !same(original, summary(current)) ||
        effectiveState(current, before.documents) !== 'active')
    )
      conflict(
        `“${original?.title ?? ch.title}” changed after this proposal. Newer writing and structure were kept.`
      )
    if (ch.parentId) {
      const parent = old.get(ch.parentId),
        captured = baseline.get(ch.parentId)
      if (
        !parent ||
        !captured ||
        !same(captured, summary(parent)) ||
        effectiveState(parent, before.documents) !== 'active'
      )
        conflict(`The parent of “${ch.title}” changed. Update the proposal before applying.`)
    }
    if (!current || current.parentId !== ch.parentId || current.position !== ch.position) {
      groups.add(ch.parentId)
      if (current) groups.add(current.parentId)
    }
  }
  for (const parentId of groups)
    if (
      input.orders.find((o) => o.parentId === parentId)?.digest !==
      requestDigest(siblings(before.documents, parentId))
    )
      conflict(
        'The order or membership of an affected chapter group changed. Your proposal is kept; update its order before applying.'
      )
  const moved = new Set<string>(),
    changes: { id: string; parentId: string | null; position: number }[] = [],
    ids: string[] = []
  for (const ch of body.chapters) {
    let doc = ch.documentId ? after.documents.find((d) => d.id === ch.documentId)! : null
    if (!doc) {
      if (after.documents.length >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
      doc = {
        id: randomUUID(),
        parentId: ch.parentId,
        position: ch.position,
        kind: ch.kind,
        title: ch.title.trim(),
        status: 'draft',
        synopsis: ch.purpose,
        revisionId: randomUUID(),
        state: 'active',
        replacementId: null,
        payload: emptyDocument(randomUUID)
      }
      after.documents.push(doc)
    }
    doc.title = ch.title.trim()
    doc.synopsis = ch.purpose
    ids.push(doc.id)
    if (!ch.documentId || groups.has(ch.parentId) || groups.has(doc.parentId)) {
      moved.add(doc.id)
      changes.push({ id: doc.id, parentId: ch.parentId, position: ch.position })
    }
  }
  for (const parentId of groups) {
    const ordered = after.documents
      .filter((d) => d.parentId === parentId && !moved.has(d.id))
      .sort((a, b) => a.position - b.position)
    for (const move of changes
      .filter((d) => d.parentId === parentId)
      .sort((a, b) => a.position - b.position)) {
      if (move.position > ordered.length)
        conflict(
          'A proposed chapter position is outside its sibling group. Edit the order or request a corrected proposal.'
        )
      const doc = after.documents.find((d) => d.id === move.id)!
      doc.parentId = parentId
      ordered.splice(move.position, 0, doc)
    }
    ordered.forEach((d, i) => {
      d.position = i
    })
  }
  const originalLinks = materialLinks(db, p),
    next = new Map(originalLinks.map((l) => [linkKey(l), l]))
  body.chapters.forEach((ch, i) => {
    if (ch.documentId)
      for (const t of [...ch.add, ...ch.remove]) {
        const l = { ...t, documentId: ch.documentId }
        if (
          originalLinks.some((r) => linkKey(r) === linkKey(l)) !==
          input.links.some((r) => linkKey(r) === linkKey(l))
        )
          conflict(
            `A material link in “${ch.title}” changed. Update this proposal before applying.`
          )
      }
    for (const t of ch.remove) next.delete(linkKey({ ...t, documentId: ids[i] }))
    for (const t of ch.add) {
      const link = { ...t, documentId: ids[i] }
      next.set(linkKey(link), link)
    }
  })
  const oldLinks = new Set(originalLinks.map(linkKey))
  const inverse: Inverse = {
    version: 1,
    documentIds: ids,
    documents: [],
    orders: [],
    links: [
      ...originalLinks
        .filter((l) => !next.has(linkKey(l)))
        .map((link) => ({ link, before: true, after: false })),
      ...[...next.values()]
        .filter((l) => !oldLinks.has(linkKey(l)))
        .map((link) => ({ link, before: false, after: true }))
    ],
    dispositions: body.dispositions
      .filter((d) => d.selected)
      .map((item) => {
        const d = withoutKeys(item, ['selected'])
        return {
          target: { kind: d.kind, id: d.id },
          before: disposition(db, p, d),
          after: d
        }
      })
      .filter((d) => !same(d.before, d.after))
  }
  reconcileAnchors(after)
  freshRevisions(before, after)
  validateManuscript(after)
  inverse.documents = after.documents
    .filter((d) => !same(old.get(d.id) ? summary(old.get(d.id)!) : null, summary(d)))
    .map((d) => ({ before: old.has(d.id) ? summary(old.get(d.id)!) : null, after: summary(d) }))
  inverse.orders = [...groups].map((parentId) => ({
    parentId,
    after: siblings(after.documents, parentId)
  }))
  if (JSON.stringify(inverse).length > 16 * 1024 ** 2) throw new ProjectError('LIMIT_EXCEEDED')
  checkpoint(db, p, materialHead(db, p), before, 'structural', 'Before outline proposal')
  writeManuscript(db, p, after)
  reconcileAnnotationAnchors(db, p)
  replaceMaterialLinks(db, p, [...next.values()])
  for (const d of inverse.dispositions) setDisposition(db, p, d.target, d.after)
  return inverse
}
function undoProposal(db: Database.Database, p: string, inverse: Inverse): void {
  const before = manuscript(db, p),
    after = structuredClone(before),
    docs = new Map(after.documents.map((d) => [d.id, d])),
    currentLinks = materialLinks(db, p),
    links = new Map(currentLinks.map((l) => [linkKey(l), l]))
  for (const o of inverse.orders) {
    const parent = o.parentId ? docs.get(o.parentId) : null
    if (o.parentId && (!parent || effectiveState(parent, after.documents) !== 'active'))
      conflict(
        'A parent chapter changed state after this outline was applied. Undo was left unapplied.'
      )
    if (!same(siblings(before.documents, o.parentId), o.after))
      conflict(
        'An affected chapter group was reordered or gained material structure. Undo would replace newer organization, so nothing was changed.'
      )
  }
  for (const d of inverse.documents) {
    const actual = docs.get(d.after.id)
    if (
      !actual ||
      actual.state !== d.after.state ||
      actual.kind !== d.after.kind ||
      actual.replacementId !== d.after.replacementId
    )
      conflict(
        `“${d.after.title}” is no longer in the same outline state. Undo was left unapplied.`
      )
    if (!d.before) {
      if (
        actual.revisionId !== d.after.revisionId ||
        actual.payload.ast.content.length !== 1 ||
        actual.payload.ast.content[0].type !== 'paragraph' ||
        (actual.payload.ast.content[0].content?.length ?? 0) !== 0 ||
        Object.keys(actual.payload.footnotesById).length !== 0 ||
        after.documents.some((child) => child.parentId === actual.id) ||
        currentLinks.some(
          (l) =>
            l.documentId === actual.id &&
            !inverse.links.some((x) => x.after && linkKey(x.link) === linkKey(l))
        )
      )
        conflict(
          `“${d.after.title}” has newer writing, details, children or links. Undo cannot remove this new chapter safely.`
        )
      actual.state = 'trashed'
    } else {
      for (const key of structureFields)
        if (d.before[key] !== d.after[key] && actual[key] !== d.after[key])
          conflict(
            `“${d.after.title}” has a newer ${key === 'synopsis' ? 'purpose' : key}. Undo would overwrite it.`
          )
      for (const key of structureFields)
        if (d.before[key] !== d.after[key]) Object.assign(actual, { [key]: d.before[key] })
    }
  }
  // Newly created empty chapters are retained as trash, after the restored siblings.
  const created = new Set(inverse.documents.filter((d) => !d.before).map((d) => d.after.id))
  for (const o of inverse.orders) {
    const group = after.documents
      .filter((d) => d.parentId === o.parentId)
      .sort(
        (a, b) => Number(created.has(a.id)) - Number(created.has(b.id)) || a.position - b.position
      )
    group.forEach((d, i) => {
      d.position = i
    })
  }
  for (const l of inverse.links) {
    if (links.has(linkKey(l.link)) !== l.after)
      conflict(
        'A material assignment changed after this outline was applied. Undo would overwrite it.'
      )
    if (l.before) links.set(linkKey(l.link), l.link)
    else links.delete(linkKey(l.link))
  }
  for (const d of inverse.dispositions)
    if (!same(disposition(db, p, d.target), d.after))
      conflict(
        'An editorial disposition changed after this outline was applied. Undo would overwrite it.'
      )
  reconcileAnchors(after)
  freshRevisions(before, after)
  validateManuscript(after)
  checkpoint(db, p, materialHead(db, p), before, 'structural', 'Before undo outline proposal')
  writeManuscript(db, p, after)
  reconcileAnnotationAnchors(db, p)
  replaceMaterialLinks(db, p, [...links.values()])
  for (const d of inverse.dispositions) setDisposition(db, p, d.target, d.before)
}
export async function outlineProposalCommand(
  ctx: PlanningContext,
  input: OutlineProposalRequest
): Promise<OutlineProposalResult> {
  const { db, projectId: p } = ctx
  if (input.action === 'read') return { type: 'view', view: readView(db, p, input.attemptId) }
  const digest = requestDigest({ ...input, action: 'set' })
  const prior = (): CommitReceipt | null => {
    const row = db
      .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(p, input.operationId) as { digest: string; result: string } | undefined
    if (!row) return null
    if (row.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
    const value: unknown = JSON.parse(row.result)
    if (!isProjectValue('commit', value)) fail()
    return value as CommitReceipt
  }
  const recorded = prior()
  if (input.action === 'status' || recorded) return { type: 'change', receipt: recorded, issue: '' }
  const c = capture(db, p, input.attemptId),
    run = readPlanningRun(db, p, c.planning.runId)
  const currentCorpus =
    input.change.type === 'apply'
      ? await planningCorpus(ctx, c.conversationId, c.planning.scope, run.corpus)
      : null
  try {
    return inWriteTransaction(db, () => {
      if (materialHead(db, p) !== input.expectedHead)
        conflict(
          'The project changed while this action was prepared. The proposal is kept. Refresh and try the action again.'
        )
      const change = input.change
      if (change.type === 'save') {
        const parent = readVersion(db, p, change.parentId)
        if (parent.attemptId !== input.attemptId) throw new ProjectError('DENIED')
        const issue = proposalIssue(
          change.body,
          c.planning.proposal,
          allowedMaterials(db, p, c),
          inputLinks(db, p, c)
        )
        if (issue) conflict(issue)
        if (
          (
            db
              .prepare(
                'SELECT count(*) AS n FROM outline_proposal_versions WHERE project_id=? AND attempt_id=?'
              )
              .get(p, input.attemptId) as { n: number }
          ).n >= 100 ||
          (
            db
              .prepare('SELECT count(*) AS n FROM outline_proposal_versions WHERE project_id=?')
              .get(p) as { n: number }
          ).n >= 10000
        )
          throw new ProjectError('LIMIT_EXCEEDED')
        const v: OutlineProposalVersion = {
          id: change.id,
          parentId: change.parentId,
          attemptId: input.attemptId,
          createdAt: new Date().toISOString(),
          body: change.body
        }
        db.prepare('INSERT INTO outline_proposal_versions VALUES (?,?,?,?)').run(
          p,
          v.id,
          v.attemptId,
          JSON.stringify(v)
        )
      } else if (change.type === 'apply') {
        const v = readVersion(db, p, change.versionId)
        if (v.attemptId !== input.attemptId) throw new ProjectError('DENIED')
        if (
          db
            .prepare(
              'SELECT 1 FROM outline_proposal_applications WHERE project_id=? AND version_id IN (SELECT id FROM outline_proposal_versions WHERE project_id=? AND attempt_id=?)'
            )
            .get(p, p, input.attemptId)
        )
          conflict(
            'An outline from this response was already applied. Keep discussing to revise the current outline; existing chapters will not be created twice.'
          )
        const inverse = applyProposal(db, p, v, c, currentCorpus!)
        validateInverse(inverse, v, c.planning.proposal)
        db.prepare('INSERT INTO outline_proposal_applications VALUES (?,?,?,?,NULL)').run(
          p,
          input.operationId,
          v.id,
          JSON.stringify(inverse)
        )
      } else {
        const row = db
          .prepare(
            'SELECT version_id,body,undone_by FROM outline_proposal_applications WHERE project_id=? AND id=?'
          )
          .get(p, change.applicationId) as
          { version_id: string; body: string; undone_by: string | null } | undefined
        if (!row || readVersion(db, p, row.version_id).attemptId !== input.attemptId)
          throw new ProjectError('NOT_FOUND')
        if (row.undone_by) conflict('This outline change has already been undone.')
        const inverse = readInverse(row.body)
        validateInverse(inverse, readVersion(db, p, row.version_id), c.planning.proposal)
        undoProposal(db, p, inverse)
        db.prepare(
          'UPDATE outline_proposal_applications SET undone_by=? WHERE project_id=? AND id=?'
        ).run(input.operationId, p, change.applicationId)
      }
      const planning = planningSnapshot(db, p)
      if (
        planning.dispositions.length > 200000 ||
        Buffer.byteLength(JSON.stringify(planning)) > 32 * 1024 ** 2 - 1024
      )
        throw new ProjectError('LIMIT_EXCEEDED')
      const headCommitId = randomUUID(),
        now = new Date().toISOString()
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
      const doc = db
        .prepare('SELECT revision_id FROM documents WHERE project_id=? AND id=?')
        .get(p, input.documentId) as { revision_id: string } | undefined
      if (!doc) throw new ProjectError('NOT_FOUND')
      const receipt = {
        projectId: p,
        documentId: input.documentId,
        revisionId: doc.revision_id,
        headCommitId
      }
      db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
        p,
        input.operationId,
        digest,
        JSON.stringify(receipt)
      )
      return { type: 'change' as const, receipt, issue: '' }
    })
  } catch (error) {
    if (error instanceof Conflict) return { type: 'change', receipt: null, issue: error.message }
    throw error
  }
}
function readInverse(body: string): Inverse {
  if (Buffer.byteLength(body) > 16 * 1024 ** 2) fail()
  const v: unknown = JSON.parse(body)
  if (
    !record(v) ||
    !exact(v, ['version', 'documentIds', 'documents', 'orders', 'links', 'dispositions']) ||
    v.version !== 1 ||
    !Array.isArray(v.documentIds) ||
    !v.documentIds.length ||
    v.documentIds.length > 100 ||
    !v.documentIds.every(isId) ||
    new Set(v.documentIds).size !== v.documentIds.length ||
    !Array.isArray(v.documents) ||
    v.documents.length > 10000 ||
    !v.documents.every(
      (d) =>
        record(d) &&
        exact(d, ['before', 'after']) &&
        (d.before === null || isOutlineDocument(d.before)) &&
        isOutlineDocument(d.after) &&
        (d.before === null || d.before.id === d.after.id)
    ) ||
    !Array.isArray(v.orders) ||
    v.orders.length > 401 ||
    !v.orders.every(
      (o) =>
        record(o) &&
        exact(o, ['parentId', 'after']) &&
        (o.parentId === null || isId(o.parentId)) &&
        Array.isArray(o.after) &&
        o.after.length <= 10000 &&
        o.after.every(isId) &&
        new Set(o.after).size === o.after.length
    ) ||
    !Array.isArray(v.links) ||
    v.links.length > 1000 ||
    !v.links.every(
      (l) =>
        record(l) &&
        exact(l, ['link', 'before', 'after']) &&
        isMaterialLink(l.link) &&
        typeof l.before === 'boolean' &&
        typeof l.after === 'boolean' &&
        l.before !== l.after
    ) ||
    !Array.isArray(v.dispositions) ||
    v.dispositions.length > 100 ||
    !v.dispositions.every(
      (d) =>
        record(d) &&
        exact(d, ['target', 'before', 'after']) &&
        record(d.target) &&
        exact(d.target, ['kind', 'id']) &&
        (d.before === null || isMaterialDisposition(d.before)) &&
        isMaterialDisposition(d.after) &&
        same(d.target, { kind: d.after.kind, id: d.after.id }) &&
        (d.before === null || same(d.target, { kind: d.before.kind, id: d.before.id }))
    )
  )
    fail()
  const inverse = v as Inverse
  if (
    new Set(inverse.documents.map((d) => d.after.id)).size !== inverse.documents.length ||
    new Set(inverse.orders.map((o) => o.parentId)).size !== inverse.orders.length ||
    new Set(inverse.links.map((l) => linkKey(l.link))).size !== inverse.links.length ||
    new Set(inverse.dispositions.map((d) => materialKey(d.target))).size !==
      inverse.dispositions.length
  )
    fail()
  return inverse
}
export function validatePortableProposals(db: Database.Database, p: string): void {
  if ((db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v < 43) return
  let count = 0
  const versions = new Map<string, OutlineProposalVersion>(),
    perAttempt = new Map<string, number>()
  for (const row of db
    .prepare('SELECT project_id,id,attempt_id,body FROM outline_proposal_versions')
    .iterate() as Iterable<{ project_id: string; id: string; attempt_id: string; body: string }>) {
    if (row.project_id !== p || ++count > 10000 || Buffer.byteLength(row.body) > 1024 ** 2) fail()
    const v = readVersion(db, p, row.id)
    if (v.id !== row.id || v.attemptId !== row.attempt_id) fail()
    const n = (perAttempt.get(v.attemptId) ?? 0) + 1
    perAttempt.set(v.attemptId, n)
    if (n > 100) fail()
    const c = capture(db, p, v.attemptId)
    if (
      proposalIssue(v.body, c.planning.proposal, allowedMaterials(db, p, c), inputLinks(db, p, c))
    )
      fail()
    versions.set(v.id, v)
  }
  for (const v of versions.values()) {
    if (v.parentId) {
      const parent = versions.get(v.parentId)
      if (!parent || parent.attemptId !== v.attemptId || parent.id === v.id) fail()
    } else if (
      v.id !== v.attemptId ||
      !same(v.body, parseOutput(assistantText(db, p, v.attemptId)))
    )
      fail()
    const seen = new Set<string>()
    let cursor: OutlineProposalVersion | undefined = v
    while (cursor) {
      if (seen.has(cursor.id)) fail()
      seen.add(cursor.id)
      cursor = cursor.parentId ? versions.get(cursor.parentId) : undefined
    }
  }
  const used = new Set<string>(),
    usedAttempts = new Set<string>()
  for (const row of db
    .prepare('SELECT project_id,id,version_id,body,undone_by FROM outline_proposal_applications')
    .iterate() as Iterable<{
    project_id: string
    id: string
    version_id: string
    body: string
    undone_by: string | null
  }>) {
    if (
      row.project_id !== p ||
      !isId(row.id) ||
      !versions.has(row.version_id) ||
      used.has(row.version_id) ||
      (row.undone_by !== null && !isId(row.undone_by))
    )
      fail()
    const attemptId = versions.get(row.version_id)!.attemptId
    if (usedAttempts.has(attemptId)) fail()
    usedAttempts.add(attemptId)
    used.add(row.version_id)
    const inverse = readInverse(row.body)
    const version = versions.get(row.version_id)!
    validateInverse(inverse, version, capture(db, p, version.attemptId).planning.proposal)
    for (const d of inverse.documents)
      if (!db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(p, d.after.id))
        fail()
    for (const id of [row.id, ...(row.undone_by ? [row.undone_by] : [])]) {
      const receipt = db
        .prepare('SELECT result FROM domain_operations WHERE project_id=? AND operation_id=?')
        .get(p, id) as { result: string } | undefined
      if (!receipt || !isProjectValue('commit', JSON.parse(receipt.result))) fail()
    }
  }
}

export function validateProposalInput(
  db: Database.Database,
  p: string,
  input: OutlineProposalInput,
  corpus: PlanningCorpus,
  scope: PlanningScope
): void {
  if (!isOutlineProposalInput(input) || JSON.stringify(input).length > 30000) fail()
  const overview = JSON.parse(corpus.structure) as {
    overview?: { outline: { id: string }[] }
    outline?: { id: string }[]
  }
  const expected = new Set((overview.overview?.outline ?? overview.outline ?? []).map((d) => d.id))
  if (
    input.documents.some((d) => !expected.has(d.id)) ||
    (scope.kind !== 'chapter' && expected.size !== input.documents.length)
  )
    fail()
  if (
    scope.kind === 'chapter' &&
    !same(
      scopedDocuments(input.documents, scope).map((d) => d.id),
      input.documents.map((d) => d.id)
    )
  )
    fail()
  const documents = new Set(input.documents.map((d) => d.id)),
    materials = new Set(corpus.chunks.flat().map(materialKey))
  for (const d of input.documents)
    if (!db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(p, d.id)) fail()
  for (const l of input.links)
    if (!documents.has(l.documentId) || !materials.has(materialKey(l))) fail()
  const parents = [
    ...new Set([
      null,
      ...input.documents.map((d) => d.id),
      ...input.documents.map((d) => d.parentId)
    ])
  ].sort()
  if (!same(parents, input.orders.map((o) => o.parentId).sort())) fail()
  if (input.baseVersionId && !same(readVersion(db, p, input.baseVersionId).body, input.base)) fail()
}
function validateInverse(
  inverse: Inverse,
  version: OutlineProposalVersion,
  input: OutlineProposalInput
): void {
  const body = version.body
  if (inverse.documentIds.length !== body.chapters.length) fail()
  const pairs = new Map(body.chapters.map((c, i) => [inverse.documentIds[i], c]))
  const changes = new Map(inverse.documents.map((d) => [d.after.id, d]))
  for (const [id, c] of pairs) {
    const d = changes.get(id),
      captured = input.documents.find((d) => d.id === id)
    if (c.documentId) {
      if (c.documentId !== id || !captured || (d && !same(d.before, captured))) fail()
      const after = d?.after ?? captured
      if (
        after.title !== c.title.trim() ||
        after.synopsis !== c.purpose ||
        after.kind !== c.kind ||
        after.parentId !== c.parentId ||
        after.position !== c.position
      )
        fail()
    } else if (
      !d ||
      d.before !== null ||
      input.documents.some((d) => d.id === id) ||
      d.after.title !== c.title.trim() ||
      d.after.synopsis !== c.purpose ||
      d.after.kind !== c.kind ||
      d.after.parentId !== c.parentId ||
      d.after.position !== c.position ||
      d.after.state !== 'active' ||
      d.after.status !== 'draft' ||
      d.after.replacementId !== null
    )
      fail()
  }
  const orderParents = new Set(inverse.orders.map((o) => o.parentId))
  for (const d of inverse.documents) {
    if (
      (!d.before ||
        d.before.parentId !== d.after.parentId ||
        d.before.position !== d.after.position) &&
      (!orderParents.has(d.after.parentId) || (d.before && !orderParents.has(d.before.parentId)))
    )
      fail()
    if (!d.before) {
      if (!pairs.has(d.after.id)) fail()
      continue
    }
    if (
      d.before.status !== d.after.status ||
      d.before.kind !== d.after.kind ||
      d.before.state !== d.after.state ||
      d.before.replacementId !== d.after.replacementId
    )
      fail()
    if (
      !pairs.has(d.after.id) &&
      !same({ ...d.before, position: d.after.position, revisionId: d.after.revisionId }, d.after)
    )
      fail()
  }
  for (const l of inverse.links) {
    const ch = pairs.get(l.link.documentId)
    if (!ch || !(l.after ? ch.add : ch.remove).some((t) => materialKey(t) === materialKey(l.link)))
      fail()
    if (input.links.some((t) => linkKey(t) === linkKey(l.link)) !== l.before) fail()
  }
  const selected = body.dispositions.filter((d) => d.selected)
  for (const d of inverse.dispositions)
    if (!selected.some((s) => same(withoutKeys(s, ['selected']), d.after))) fail()
}

function scopedDocuments(documents: OutlineDocument[], scope: PlanningScope): OutlineDocument[] {
  if (scope.kind !== 'chapter') return documents
  const selected = documents.find((d) => d.id === scope.id),
    ancestors = new Set<string>()
  let current = selected
  while (current && !ancestors.has(current.id)) {
    ancestors.add(current.id)
    current = documents.find((d) => d.id === current!.parentId)
  }
  return documents.filter((d) => {
    if (ancestors.has(d.id)) return true
    let parent = d.parentId,
      depth = 0
    while (parent && depth++ < 8) {
      if (parent === scope.id) return true
      parent = documents.find((d) => d.id === parent)?.parentId ?? null
    }
    return false
  })
}
