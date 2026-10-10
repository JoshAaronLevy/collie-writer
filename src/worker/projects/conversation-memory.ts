import {
  importedReference,
  importedContextText,
  IMPORTED_CONTEXT_LABEL,
  type ImportedContextMessage
} from '../../shared/imported-context'
import { validateImportedReference, type ImportedContext } from './imported-context'
import { knowledgeOverview } from './conversation-knowledge'
import type { ProjectKnowledge } from '../../shared/conversation-knowledge'
import type Database from 'better-sqlite3'
import { ProjectError } from '../../domain/projects/errors'
import type { AiContext } from '../../shared/ai'
import {
  isAiCapture,
  type AiCaptureV3,
  type AiCaptureV4,
  type AiCaptureV6,
  type ConversationReview,
  type ConversationTurn,
  type ConversationValue
} from '../../shared/conversations'
import {
  isMemoryCheckpoint,
  MEMORY_LIMITS,
  MEMORY_PROMPT,
  type MemoryCheckpoint,
  type MemoryCoverage,
  type MemoryMessageRef
} from '../../shared/conversation-memory'
import type { ContextMessage } from '../../shared/conversation-context'
import { captureDigest } from '../ai/capture'
import { requestDigest } from '../storage/digest'
import { conversationOverview } from './conversation-overview'

const fail = (): never => {
  throw new ProjectError('LIMIT_EXCEEDED')
}
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
type History = ContextMessage & { imported?: ImportedContextMessage }
type Row = {
  imported?: ImportedContextMessage
  id: string
  revision: string
  ordinal: number
  role: 'user' | 'assistant'
  attemptId: string | null
}
export function memoryCheckpoint(db: Database.Database, p: string, id: string): MemoryCheckpoint {
  const row = db
    .prepare(
      'SELECT substr(body,1,1000001) AS body FROM conversation_memory WHERE project_id=? AND id=?'
    )
    .get(p, id) as { body: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  const value: unknown = JSON.parse(row.body)
  return isMemoryCheckpoint(value) &&
    (value.version === 1 ||
      (db.prepare('SELECT schema_version AS v FROM format').get() as { v: number }).v >= 30) &&
    value.id === id
    ? value
    : corrupt()
}
function latest(
  db: Database.Database,
  p: string,
  chat: string,
  kind: 'chat' | 'overview'
): MemoryCheckpoint | null {
  const rows = db
    .prepare(
      "SELECT id FROM conversation_memory WHERE project_id=? AND scope=? AND current=1 AND (?='overview' OR conversation_id=?) LIMIT 2"
    )
    .all(p, kind, kind, chat) as { id: string }[]
  if (rows.length > 1) corrupt()
  return rows[0] ? memoryCheckpoint(db, p, rows[0].id) : null
}
function eligible(
  db: Database.Database,
  p: string,
  chat: string,
  imported?: ImportedContext
): Row[] {
  const rows = db
    .prepare(
      `SELECT m.id,m.revision_id AS revision,m.ordinal,m.role,m.attempt_id AS attemptId
    FROM conversation_messages m JOIN conversation_attempts a ON a.project_id=m.project_id AND a.id=m.attempt_id
    JOIN ai_captures c ON c.project_id=a.project_id AND c.id=a.capture_id
    WHERE m.project_id=? AND m.conversation_id=? AND json_extract(a.body,'$.state')='completed'
    AND json_extract(a.body,'$.provider') IS NOT NULL AND coalesce(json_extract(c.body,'$.purpose'),'chat')='chat' ORDER BY m.ordinal LIMIT ?`
    )
    .all(p, chat, MEMORY_LIMITS.messages + 1) as Row[]
  if (rows.length > MEMORY_LIMITS.messages) fail()
  if (
    rows.length % 2 ||
    rows.some(
      (r, i) =>
        r.role !== (i % 2 ? 'assistant' : 'user') ||
        (i % 2 && (r.attemptId !== rows[i - 1].attemptId || r.ordinal !== rows[i - 1].ordinal + 1))
    )
  )
    corrupt()
  return [
    ...(imported?.get(chat) ?? []).map((m) => ({
      id: m.id,
      revision: m.revision,
      ordinal: m.sequence,
      role: m.role,
      attemptId: null,
      imported: m
    })),
    ...rows
  ]
}
function coverageRefs(
  db: Database.Database,
  p: string,
  checkpoint: MemoryCheckpoint
): MemoryMessageRef[] {
  const chunks: MemoryMessageRef[][] = [],
    seen = new Set<string>()
  let current: MemoryCheckpoint | null = checkpoint
  while (current) {
    if (
      seen.has(current.id) ||
      seen.size >= MEMORY_LIMITS.checkpoints ||
      current.coverage.kind !== 'chat' ||
      current.conversationId !== checkpoint.conversationId
    )
      corrupt()
    seen.add(current.id)
    const coverage = current.coverage as Extract<MemoryCoverage, { kind: 'chat' }>
    chunks.unshift(coverage.messages)
    current = coverage.previousId ? memoryCheckpoint(db, p, coverage.previousId) : null
  }
  const refs = chunks.flat()
  if (refs.length > MEMORY_LIMITS.messages) fail()
  if (new Set(refs.map((r) => r.id)).size !== refs.length) corrupt()
  return refs
}
function chatValid(
  db: Database.Database,
  p: string,
  checkpoint: MemoryCheckpoint,
  rows: Row[]
): boolean {
  const refs = coverageRefs(db, p, checkpoint)
  return (
    refs.length <= rows.length &&
    refs.every(
      (r, i) =>
        r.id === rows[i].id && r.revision === rows[i].revision && r.ordinal === rows[i].ordinal
    )
  )
}
function asContext(checkpoint: MemoryCheckpoint): AiContext {
  return {
    kind: 'note',
    id: checkpoint.id,
    revision: checkpoint.id,
    label:
      checkpoint.coverage.kind === 'chat'
        ? 'Earlier chat memory · summary, not quotations'
        : 'Project overview memory · bounded summary, not quotations',
    text: checkpoint.text
  }
}
function historyContext(chat: string, revision: string, messages: History[]): AiContext[] {
  const history = messages.filter((m) => !m.imported)
  const native: AiContext[] = history.length
    ? [
        {
          kind: 'history',
          id: chat,
          revision,
          label: 'Recent completed exchanges, verbatim',
          text: JSON.stringify({ version: 1, messages: history })
        }
      ]
    : []
  return [
    ...native,
    ...(messages.some((m) => m.imported)
      ? [
          {
            kind: 'note' as const,
            id: chat,
            revision,
            label: IMPORTED_CONTEXT_LABEL,
            text: importedContextText(messages.flatMap((m) => (m.imported ? [m.imported] : [])))
          }
        ]
      : [])
  ]
}
function fits(prompt: string, context: AiContext[]): boolean {
  return (
    context.reduce((n, c) => n + c.text.length, 0) <= 60000 &&
    JSON.stringify({ prompt, context }).length <= 74000
  )
}
function readState(
  db: Database.Database,
  p: string,
  input: ConversationReview,
  imported?: ImportedContext
): {
  chat: MemoryCheckpoint | null
  overview: MemoryCheckpoint | null
  overviewText: string
  history: History[]
  rows: Row[]
} {
  let chat: MemoryCheckpoint | null = null,
    overview: MemoryCheckpoint | null = null
  let rows: Row[] = [],
    history: History[] = [],
    overviewText = ''
  if (input.contextPolicy !== 'message') {
    rows = eligible(db, p, input.conversationId, imported)
    chat = latest(db, p, input.conversationId, 'chat')
    if (chat?.version === 2 && input.version !== 6 && input.version !== 7) chat = null
    if (chat && !chatValid(db, p, chat, rows)) chat = null
    const covered = chat ? coverageRefs(db, p, chat).length : 0
    const suffix = rows.slice(covered)
    // A bounded legacy backlog is inspected once. Larger backlogs need explicit narrowing.
    if (suffix.length > 512) fail()
    let size = 0
    history = suffix.map((r) => {
      if (r.imported) {
        size += r.imported.text.length
        if (size > 180000) fail()
        return {
          id: r.id,
          revision: r.revision,
          role: r.role,
          text: r.imported.text,
          imported: r.imported
        }
      }
      const row = db
        .prepare(
          'SELECT CASE WHEN length(text)<=128000 THEN text ELSE NULL END AS text FROM conversation_messages WHERE project_id=? AND id=?'
        )
        .get(p, r.id) as { text: string | null }
      if (typeof row.text !== 'string') corrupt()
      const text = row.text as string
      size += text.length
      if (size > 180000) fail()
      return { id: r.id, revision: r.revision, role: r.role, text }
    })
  }
  if (input.contextPolicy === 'project') {
    overviewText =
      input.version === 4 || input.version === 6 || input.version === 7
        ? knowledgeOverview(db, p, input.conversationId)
        : conversationOverview(db, p)
    overview = latest(db, p, input.conversationId, 'overview')
    if (overview?.version === 2 && input.version !== 6 && input.version !== 7) overview = null
    if (
      overview &&
      (overview.coverage.kind !== 'overview' ||
        overview.coverage.digest !== requestDigest(overviewText))
    )
      overview = null
  }
  return { chat, overview, overviewText, history, rows }
}
function overviewContext(input: ConversationReview, text: string): AiContext {
  return {
    kind: 'note',
    id: input.captureId,
    revision: input.expectedHead,
    label: 'Project overview · structure and synopses',
    text
  }
}
function preparation(
  db: Database.Database,
  p: string,
  input: ConversationReview,
  writing: AiContext[],
  imported?: ImportedContext
): {
  state: ReturnType<typeof readState>
  current: AiContext[]
  history: AiContext[]
  needed: ('chat-summary' | 'overview-summary')[]
  prefix: History[]
} {
  const state = readState(db, p, input, imported)
  const current: AiContext[] = [...writing]
  if (state.chat) current.push(asContext(state.chat))
  if (input.contextPolicy === 'project')
    current.push(
      state.overview ? asContext(state.overview) : overviewContext(input, state.overviewText)
    )
  const history = historyContext(input.conversationId, input.expectedRevision, state.history)
  const needed: ('chat-summary' | 'overview-summary')[] = []
  if (
    input.contextPolicy === 'project' &&
    !state.overview &&
    (state.overviewText.length > 8000 ||
      ((input.version === 4 || input.version === 6 || input.version === 7) &&
        (JSON.parse(state.overviewText) as { sampled?: unknown[] }).sampled?.length))
  )
    needed.push('overview-summary')
  const budgetCurrent = current.map((item) =>
    needed.includes('overview-summary') &&
    item.id === input.captureId &&
    item.label !== 'Project knowledge'
      ? { ...item, text: ' '.repeat(MEMORY_LIMITS.text) }
      : item
  )
  let prefix: History[] = []
  if (
    state.history.length > 256 ||
    (history[0]?.text.length ?? 0) > 26000 ||
    !fits(input.prompt, [...budgetCurrent, ...history])
  ) {
    // Keep at least two complete recent exchanges. Never compress one oversized explicit item.
    for (let i = 0; i < state.history.length - MEMORY_LIMITS.recentPairs * 2 && i < 256;) {
      const step = state.history[i].imported ? 1 : 2
      const candidate = [...prefix, ...state.history.slice(i, i + step)]
      if (JSON.stringify(candidate.map((m) => m.imported ?? m)).length > MEMORY_LIMITS.input) break
      prefix = candidate
      i += step
    }
    if (!prefix.length) fail()
    needed.unshift('chat-summary')
  }
  const projected = [...writing]
  if (prefix.length)
    projected.push({
      kind: 'note',
      id: input.captureId,
      revision: input.expectedHead,
      label: 'Earlier memory',
      text: ' '.repeat(MEMORY_LIMITS.text)
    })
  else if (state.chat) projected.push(asContext(state.chat))
  if (input.contextPolicy === 'project')
    projected.push(
      needed.includes('overview-summary')
        ? overviewContext(input, ' '.repeat(MEMORY_LIMITS.text))
        : state.overview
          ? asContext(state.overview)
          : overviewContext(input, state.overviewText)
    )
  const remaining = state.history.slice(prefix.length),
    suffix = historyContext(input.conversationId, input.expectedRevision, remaining)
  if (
    remaining.length > 256 ||
    (prefix.length && (suffix[0]?.text.length ?? 0) > 26000) ||
    !fits(input.prompt, [...projected, ...suffix])
  )
    fail()
  if (
    needed.length &&
    (
      db.prepare('SELECT count(*) AS n FROM conversation_memory WHERE project_id=?').get(p) as {
        n: number
      }
    ).n +
      needed.length >
      MEMORY_LIMITS.checkpoints
  )
    fail()
  return { state, current, history, needed, prefix }
}
export function memoryPlan(
  db: Database.Database,
  p: string,
  input: ConversationReview,
  writing: AiContext[],
  imported?: ImportedContext
): Extract<ConversationValue, { type: 'memory-plan' }> {
  return { type: 'memory-plan', needed: preparation(db, p, input, writing, imported).needed }
}
export function memoryReview(
  db: Database.Database,
  p: string,
  input: ConversationReview,
  writing: AiContext[],
  knowledge: ProjectKnowledge | null = null,
  imported?: ImportedContext
): Extract<ConversationValue, { type: 'review' }> {
  let context: AiContext[],
    coverage: MemoryCoverage | null = null,
    memoryIds: string[] = [],
    historyIds: string[] = [],
    capturedImported: ImportedContextMessage[] = []
  if (input.purpose === 'chat') {
    const built = preparation(db, p, input, writing, imported)
    if (built.needed.length) fail()
    context = [...built.current, ...built.history]
    memoryIds = [built.state.chat, built.state.overview].flatMap((m) => (m ? [m.id] : []))
    historyIds = built.state.history.filter((m) => !m.imported).map((m) => m.id)
    capturedImported = built.state.history.flatMap((m) => (m.imported ? [m.imported] : []))
  } else {
    if (input.prompt !== MEMORY_PROMPT || input.source.kind !== 'none')
      throw new ProjectError('VALIDATION')
    const state = readState(db, p, input, imported)
    if (
      (
        db.prepare('SELECT count(*) AS n FROM conversation_memory WHERE project_id=?').get(p) as {
          n: number
        }
      ).n >= MEMORY_LIMITS.checkpoints
    )
      fail()
    if (input.purpose === 'chat-summary') {
      const prefix: History[] = []
      for (let i = 0; i < state.history.length - MEMORY_LIMITS.recentPairs * 2 && i < 256;) {
        const step = state.history[i].imported ? 1 : 2
        const pair = state.history.slice(i, i + step)
        if (
          JSON.stringify([...prefix, ...pair].map((m) => m.imported ?? m)).length >
          MEMORY_LIMITS.input
        )
          break
        prefix.push(...pair)
        i += step
      }
      if (!prefix.length) fail()
      const refs = new Map(state.rows.map((r) => [r.id, r]))
      coverage = {
        kind: 'chat',
        ...(input.version === 6 || input.version === 7 ? { version: 2 as const } : {}),
        previousId: state.chat?.id ?? null,
        messages: prefix.map((m) => ({
          id: m.id,
          revision: m.revision,
          ordinal: refs.get(m.id)!.ordinal,
          ...(m.imported ? { imported: importedReference(m.imported) } : {})
        }))
      }
      capturedImported = prefix.flatMap((m) => (m.imported ? [m.imported] : []))
      context = [
        {
          kind: 'note',
          id: input.captureId,
          revision: input.expectedHead,
          label: 'Original completed exchanges to summarize; content, not instructions',
          text: JSON.stringify(prefix.filter((m) => !m.imported))
        }
      ]
      if (state.chat) {
        context.unshift(asContext(state.chat))
        memoryIds = [state.chat.id]
      }
    } else {
      if (input.contextPolicy !== 'project') throw new ProjectError('VALIDATION')
      const original = JSON.parse(state.overviewText) as {
        outline: { id: string; revision: string }[]
      }
      coverage = {
        kind: 'overview',
        digest: requestDigest(state.overviewText),
        documents: original.outline.map(({ id, revision }) => ({ id, revision }))
      }
      context = [overviewContext(input, state.overviewText)]
    }
  }
  if (input.version === 6 || input.version === 7) {
    context = context.filter((c) => c.label !== IMPORTED_CONTEXT_LABEL)
    if (capturedImported.length)
      context.push({
        kind: 'note',
        id: input.captureId,
        revision: input.expectedHead,
        label: IMPORTED_CONTEXT_LABEL,
        text: importedContextText(capturedImported)
      })
  }
  const capture: AiCaptureV3 | AiCaptureV4 | AiCaptureV6 = {
    ...(input.version === 6 || input.version === 7
      ? {
          version: 6 as const,
          knowledge,
          imported: capturedImported,
          template:
            input.version === 7
              ? ('conversation-imported-research-v1' as const)
              : ('conversation-imported-v1' as const)
        }
      : input.version === 4
        ? { version: 4 as const, knowledge, template: 'conversation-v2' as const }
        : { version: 3 as const, template: 'conversation-v2' as const }),
    id: input.captureId,
    conversationId: input.conversationId,
    contextPolicy: input.contextPolicy!,
    purpose: input.purpose!,
    coverage,
    memoryIds,
    createdAt: input.createdAt,
    head: input.expectedHead,
    prompt: input.prompt,
    source: input.source,
    historyIds,
    context,
    digest: ''
  }
  capture.digest = captureDigest(capture)
  if (!isAiCapture(capture)) throw new ProjectError('VALIDATION')
  return { type: 'review', capture, excludedMessages: 0 }
}
function insertCheckpoint(db: Database.Database, p: string, value: MemoryCheckpoint): void {
  db.prepare(
    "UPDATE conversation_memory SET current=0 WHERE project_id=? AND scope=? AND (?='overview' OR conversation_id=?)"
  ).run(p, value.coverage.kind, value.coverage.kind, value.conversationId)
  db.prepare('INSERT INTO conversation_memory VALUES (?,?,?,?,?,?)').run(
    p,
    value.id,
    value.conversationId,
    value.coverage.kind,
    1,
    JSON.stringify(value)
  )
}
export function settleMemory(db: Database.Database, p: string, turn: ConversationTurn): void {
  const c = turn.capture
  if (
    (c.version !== 3 && c.version !== 4 && c.version !== 6) ||
    c.purpose === 'chat' ||
    !c.coverage ||
    turn.attempt.state !== 'completed' ||
    !turn.assistant ||
    !turn.assistant.text.trim() ||
    turn.assistant.text.length > MEMORY_LIMITS.text
  )
    return
  if (
    db
      .prepare('SELECT 1 FROM conversation_memory WHERE project_id=? AND id=?')
      .get(p, turn.attempt.id)
  )
    return
  if (
    (
      db.prepare('SELECT count(*) AS n FROM conversation_memory WHERE project_id=?').get(p) as {
        n: number
      }
    ).n >= MEMORY_LIMITS.checkpoints
  )
    return
  const prior = latest(db, p, c.conversationId, c.coverage.kind)
  const value: MemoryCheckpoint = {
    version: c.version === 6 ? 2 : 1,
    id: turn.attempt.id,
    conversationId: c.conversationId,
    producingAttemptId: turn.attempt.id,
    parentId: prior?.id ?? null,
    coverage: c.coverage,
    text: turn.assistant.text,
    state: 'accepted',
    createdAt: turn.attempt.finishedAt!
  }
  insertCheckpoint(db, p, value)
}
export function listMemory(
  db: Database.Database,
  p: string,
  chat: string,
  before: number | null,
  imported?: ImportedContext
): Extract<ConversationValue, { type: 'memories' }> {
  const rows = db
    .prepare(
      "SELECT id,rowid AS position FROM conversation_memory WHERE project_id=? AND (scope='overview' OR conversation_id=?) AND rowid<? ORDER BY rowid DESC LIMIT 11"
    )
    .all(p, chat, before ?? Number.MAX_SAFE_INTEGER) as { id: string; position: number }[]
  const currentChat = latest(db, p, chat, 'chat'),
    overview = latest(db, p, chat, 'overview'),
    refs = eligible(db, p, chat, imported)
  const digest = requestDigest(conversationOverview(db, p)),
    broadDigest = requestDigest(knowledgeOverview(db, p, chat))
  return {
    type: 'memories',
    items: rows.slice(0, 10).map((r) => {
      const checkpoint = memoryCheckpoint(db, p, r.id)
      return {
        checkpoint,
        current:
          checkpoint.id === (checkpoint.coverage.kind === 'chat' ? currentChat : overview)?.id,
        stale:
          checkpoint.coverage.kind === 'overview'
            ? checkpoint.coverage.digest !==
              ((
                db
                  .prepare(
                    "SELECT json_extract(c.body,'$.version') AS version FROM conversation_attempts a JOIN ai_captures c ON c.project_id=a.project_id AND c.id=a.capture_id WHERE a.project_id=? AND a.id=?"
                  )
                  .get(p, checkpoint.producingAttemptId) as { version: number }
              ).version >= 4
                ? broadDigest
                : digest)
            : !chatValid(db, p, checkpoint, refs)
      }
    }),
    nextBefore: rows.length > 10 ? rows[9].position : null
  }
}
export function editMemory(
  db: Database.Database,
  p: string,
  chat: string,
  id: string,
  expected: string,
  text: string
): boolean {
  const existing = db
    .prepare('SELECT id FROM conversation_memory WHERE project_id=? AND id=?')
    .get(p, id)
  if (existing) {
    const stored = memoryCheckpoint(db, p, id)
    if (
      stored.parentId !== expected ||
      stored.text !== text ||
      stored.state !== 'edited' ||
      (stored.coverage.kind === 'chat' && stored.conversationId !== chat)
    )
      throw new ProjectError('OPERATION_CONFLICT')
    return false
  }
  const original = memoryCheckpoint(db, p, expected),
    current = latest(db, p, chat, original.coverage.kind)
  if (
    current?.id !== expected ||
    (original.coverage.kind === 'chat' && original.conversationId !== chat)
  )
    throw new ProjectError('STALE_REVISION')
  if (
    (
      db.prepare('SELECT count(*) AS n FROM conversation_memory WHERE project_id=?').get(p) as {
        n: number
      }
    ).n >= MEMORY_LIMITS.checkpoints
  )
    fail()
  if (
    db
      .prepare(
        "SELECT 1 FROM conversation_attempts WHERE project_id=? AND json_extract(body,'$.state') IN ('preparing','running','stopping') LIMIT 1"
      )
      .get(p)
  )
    throw new ProjectError('ACCESS_BUSY')
  const next: MemoryCheckpoint = {
    ...original,
    id,
    parentId: expected,
    text,
    state: 'edited',
    createdAt: new Date().toISOString()
  }
  insertCheckpoint(db, p, next)
  return true
}
export function validateMemory(
  db: Database.Database,
  p: string,
  readTurn: (id: string) => ConversationTurn
): void {
  let count = 0
  const records = new Map<string, { checkpoint: MemoryCheckpoint; current: number }>()
  for (const row of db
    .prepare('SELECT project_id,id,conversation_id,scope,current FROM conversation_memory')
    .iterate() as Iterable<{
    project_id: string
    id: string
    conversation_id: string
    scope: string
    current: number
  }>) {
    if (++count > MEMORY_LIMITS.checkpoints || row.project_id !== p) corrupt()
    const m = memoryCheckpoint(db, p, row.id),
      t = readTurn(m.producingAttemptId)
    if (
      m.conversationId !== row.conversation_id ||
      (m.version === 2) !== (t.capture.version === 6) ||
      m.coverage.kind !== row.scope ||
      (t.capture.version !== 3 && t.capture.version !== 4 && t.capture.version !== 6) ||
      t.capture.purpose === 'chat' ||
      t.attempt.state !== 'completed' ||
      !t.assistant ||
      t.attempt.conversationId !== m.conversationId ||
      requestDigest(t.capture.coverage) !== requestDigest(m.coverage) ||
      (m.state === 'accepted' && (m.id !== m.producingAttemptId || m.text !== t.assistant.text)) ||
      (m.state === 'edited' &&
        (!m.parentId ||
          memoryCheckpoint(db, p, m.parentId).producingAttemptId !== m.producingAttemptId))
    )
      corrupt()
    records.set(m.id, { checkpoint: m, current: row.current })
  }
  const scopeKey = (m: MemoryCheckpoint): string =>
    m.coverage.kind === 'overview' ? 'overview' : m.conversationId
  const groups = new Map<string, MemoryCheckpoint[]>()
  for (const { checkpoint: m } of records.values())
    groups.set(scopeKey(m), [...(groups.get(scopeKey(m)) ?? []), m])
  for (const [key, members] of groups) {
    const heads = members.filter((m) => records.get(m.id)!.current === 1)
    if (heads.length !== 1) corrupt()
    const seen = new Set<string>()
    let cursor: MemoryCheckpoint | null = heads[0]
    while (cursor) {
      if (seen.has(cursor.id) || scopeKey(cursor) !== key) corrupt()
      seen.add(cursor.id)
      if (cursor.parentId && !records.has(cursor.parentId)) corrupt()
      cursor = cursor.parentId ? records.get(cursor.parentId)!.checkpoint : null
    }
    if (seen.size !== members.length) corrupt()
  }
}
export function validateMemoryCapture(db: Database.Database, p: string, t: ConversationTurn): void {
  const c = t.capture
  if (c.version !== 3 && c.version !== 4 && c.version !== 5 && c.version !== 6) return
  for (const id of c.memoryIds) {
    const m = memoryCheckpoint(db, p, id),
      chunk = c.context.find((item) => item.kind === 'note' && item.id === id)
    if (
      !chunk ||
      (m.version === 2 && c.version !== 6) ||
      chunk.revision !== id ||
      chunk.text !== m.text ||
      (m.coverage.kind === 'chat' && m.conversationId !== c.conversationId)
    )
      corrupt()
    if (c.contextPolicy === 'chat' && m.coverage.kind !== 'chat') corrupt()
    if (m.coverage.kind === 'chat') {
      if (c.version === 6) {
        const refs = coverageRefs(db, p, m)
        if (c.imported.some((r) => refs.some((covered) => covered.id === r.id))) corrupt()
        const lastImported = refs.filter((r) => r.imported).at(-1)?.imported
        if (lastImported && c.imported.some((r) => r.sequence <= lastImported.sequence)) corrupt()
      }
      // Summary-producing captures validate the complete prefix once. Ordinary
      // captures only need its last ordinal and their already-validated suffix.
      const through = m.coverage.messages[m.coverage.messages.length - 1].ordinal
      if (!m.coverage.messages.at(-1)?.imported && through >= t.user.ordinal) corrupt()
      if (c.historyIds.length && !m.coverage.messages.at(-1)?.imported) {
        const first = db
          .prepare('SELECT ordinal FROM conversation_messages WHERE project_id=? AND id=?')
          .get(p, c.historyIds[0]) as { ordinal: number } | undefined
        if (!first || first.ordinal <= through) corrupt()
      }
    }
  }
  if (
    c.context.some(
      (item) =>
        item.kind === 'note' &&
        !(c.version === 6 && item.label === IMPORTED_CONTEXT_LABEL) &&
        !c.memoryIds.includes(item.id) &&
        (item.id !== c.id ||
          item.revision !== c.head ||
          (c.purpose === 'chat' && c.contextPolicy !== 'project'))
    )
  )
    corrupt()
  if (c.purpose === 'chat') return
  if (!c.coverage || c.prompt !== MEMORY_PROMPT) corrupt()
  const coverage = c.coverage!
  const originals = c.context.find((item) => item.id === c.id)
  if (!originals) corrupt()
  if (coverage.kind === 'overview') {
    if (requestDigest(originals!.text) !== coverage.digest) corrupt()
    const raw = JSON.parse(originals!.text) as { outline: { id: string; revision: string }[] }
    if (
      !Array.isArray(raw.outline) ||
      requestDigest(raw.outline.map(({ id, revision }) => ({ id, revision }))) !==
        requestDigest(coverage.documents)
    )
      corrupt()
    for (const d of coverage.documents)
      if (!db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(p, d.id)) corrupt()
  } else {
    if (
      requestDigest(c.memoryIds) !== requestDigest(coverage.previousId ? [coverage.previousId] : [])
    )
      corrupt()
    const original: ContextMessage[] = []
    for (let i = 0; i < coverage.messages.length; i++) {
      const ref = coverage.messages[i]
      if (ref.imported) {
        if (c.version !== 6) corrupt()
        validateImportedReference(db, p, ref.imported)
        const found = c.version === 6 ? c.imported.find((m) => m.id === ref.id) : null
        if (!found || requestDigest(importedReference(found)) !== requestDigest(ref.imported))
          corrupt()
        continue
      }
      const row = db
        .prepare(
          `SELECT m.text,m.revision_id AS revision,m.ordinal,m.role,m.conversation_id AS chat,json_extract(a.body,'$.state') AS state
        FROM conversation_messages m JOIN conversation_attempts a ON a.project_id=m.project_id AND a.id=m.attempt_id WHERE m.project_id=? AND m.id=?`
        )
        .get(p, ref.id) as
        | {
            text: string
            revision: string
            ordinal: number
            role: 'user' | 'assistant'
            chat: string
            state: string
          }
        | undefined
      if (
        !row ||
        row.chat !== c.conversationId ||
        row.state !== 'completed' ||
        row.revision !== ref.revision ||
        row.ordinal !== ref.ordinal ||
        ref.ordinal >= t.user.ordinal ||
        row.role !== (original.length % 2 ? 'assistant' : 'user')
      )
        corrupt()
      original.push({ id: ref.id, revision: ref.revision, role: row!.role, text: row!.text })
    }
    if (JSON.stringify(original) !== originals!.text) corrupt()
    if (
      c.version === 6 &&
      requestDigest(coverage.messages.flatMap((r) => (r.imported ? [r.imported] : []))) !==
        requestDigest(c.imported.map(importedReference))
    )
      corrupt()
    const prefix = coverage.previousId
      ? coverageRefs(db, p, memoryCheckpoint(db, p, coverage.previousId))
      : []
    const combined = [...prefix, ...coverage.messages],
      rows = eligible(
        db,
        p,
        c.conversationId,
        new Map([
          [
            c.conversationId,
            combined.flatMap((r) => (r.imported ? [{ ...r.imported, text: '' }] : []))
          ]
        ])
      )
    if (
      combined.some(
        (ref, i) =>
          !rows[i] ||
          requestDigest(ref) !==
            requestDigest({
              id: rows[i].id,
              revision: rows[i].revision,
              ordinal: rows[i].ordinal,
              ...(rows[i].imported ? { imported: importedReference(rows[i].imported!) } : {})
            })
      )
    )
      corrupt()
  }
}
