import type Database from 'better-sqlite3'
import type { GraphRecord } from '../../shared/import-graph'
import type { ReviewChoice } from '../../shared/import-review'
import type { SourceMetadata } from '../../shared/sources'
import { hasControlCharacters } from '../../shared/control-characters'
import { ProjectError } from '../../domain/projects/errors'
import { requestDigest } from '../storage/digest'
import { acceptedIdentities, alreadyImportedReason, importIdentity } from './import-identities'
import type { Prepared } from './import-review'

export const outsideSelectionReason = 'Outside the selected import content.'

export const sourceKeys = (m: SourceMetadata): string[] =>
  (['DOI', 'URL', 'ISBN'] as const).flatMap((k) => (m[k] ? [`${k}:${m[k]}`] : []))
const present = (v: string | SourceMetadata['author']): boolean =>
  Array.isArray(v) ? v.length > 0 : !!v.trim()
const comparable = (v: string | SourceMetadata['author']): string =>
  (typeof v === 'string' ? v : JSON.stringify(v))
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

/** Strong identifiers establish a candidate match, never permission to overwrite conflicting facts. */
export function compatibleSourceMetadata(items: SourceMetadata[]): boolean {
  const fields = new Map<string, string>()
  for (const m of items)
    for (const [key, value] of Object.entries(m)) {
      if (!present(value)) continue
      const text = comparable(value),
        old = fields.get(key)
      if (old !== undefined && old !== text) return false
      fields.set(key, text)
    }
  return true
}

type Target = { id: string; revisionId: string; metadata: SourceMetadata; state: string }
function sourceTargets(db: Database.Database, projectId: string): Map<string, Target[]> {
  const rows = db
    .prepare(
      'SELECT id,revision_id,metadata,state,replacement_id FROM sources WHERE project_id=? LIMIT 100001'
    )
    .all(projectId) as Array<{
    id: string
    revision_id: string
    metadata: string
    state: string
    replacement_id: string | null
  }>
  if (rows.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
  const byId = new Map(rows.map((r) => [r.id, r])),
    result = new Map<string, Target[]>()
  for (const row of rows) {
    let current = row
    const seen = new Set<string>()
    while (current.state === 'merged') {
      if (seen.has(current.id) || seen.size >= 32 || !current.replacement_id)
        throw new ProjectError('CORRUPT_PROJECT')
      seen.add(current.id)
      const next = byId.get(current.replacement_id)
      if (!next) throw new ProjectError('CORRUPT_PROJECT')
      current = next
    }
    const metadata = JSON.parse(current.metadata) as SourceMetadata,
      target = { id: current.id, revisionId: current.revision_id, metadata, state: current.state }
    // Include the old identifier of a merged alias while freezing only its canonical target.
    for (const key of new Set([...sourceKeys(JSON.parse(row.metadata)), ...sourceKeys(metadata)])) {
      const found = result.get(key) ?? []
      if (!found.some((t) => t.id === target.id)) found.push(target)
      result.set(key, found)
    }
  }
  return result
}

/** System-owned defaults. No renderer choices, inference, accepted writes or mutable source metadata. */
export function automaticChoices(
  db: Database.Database,
  projectId: string,
  p: Prepared
): Map<string, ReviewChoice> {
  const choices = new Map<string, ReviewChoice>(),
    fixed = new Set<string>(),
    accepted = acceptedIdentities(db, projectId),
    acceptedLocations = new Set<string>(),
    rank = (r: GraphRecord): number => {
      const reader = p.content.manifest.files.find((f) => f.fileId === r.locator.fileId)?.reader
      return reader === 'raw-chat-v1' ? 0 : reader === 'curated-chat-v1' ? 1 : 2
    },
    supported = (r: GraphRecord): boolean =>
      r.eligible &&
      r.disposition === 'candidate' &&
      p.recognized.has(r.id) &&
      !p.automaticBlocked.has(r.id),
    title = (value: string, fallback: string, max = 500): string =>
      (hasControlCharacters(value) ? fallback : value.trim() || fallback).slice(0, max)
  if (accepted.size)
    for (const table of [
      'external_conversations',
      'external_messages',
      'imported_content_origins'
    ]) {
      const rows = db
        .prepare(
          `SELECT json_extract(body,'$.record.kind') AS kind,
        json_extract(body,'$.record.locator.sha256') AS sha,
        json_extract(body,'$.record.locator.pointer') AS pointer
        FROM ${table} WHERE project_id=? LIMIT 100001`
        )
        .all(projectId) as Array<{
        kind: string
        sha: string
        pointer: string
      }>
      if (rows.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
      for (const row of rows) acceptedLocations.add(requestDigest([row.kind, row.sha, row.pointer]))
    }
  const alreadyPresent = (r: GraphRecord, fingerprint: string): boolean =>
    fingerprint === importIdentity(r).fingerprint ||
    acceptedLocations.has(requestDigest([r.kind, r.locator.sha256, r.locator.pointer]))
  const exclude = (id: string, reason: string): void => {
    const c = choices.get(id)!
    choices.set(id, {
      ...c,
      state: 'exclude',
      reason,
      reuse: null,
      acknowledged: false,
      automatic: { version: 1, sourceItemId: null }
    })
  }
  for (const group of p.groups) {
    const saved = p.choices.get(group.id)!
    if (saved.state !== 'undecided' && !saved.automatic) {
      choices.set(group.id, saved)
      fixed.add(group.id)
      continue
    }
    const candidates = group.records
        .filter(supported)
        .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)),
      r = candidates[0] ?? group.records[0],
      row = p.contentRows.get(r.id)
    choices.set(group.id, {
      ...saved,
      recordId: r.id,
      state: 'exclude',
      reason:
        group.kind === 'retained' ||
        !group.records.some((r) => r.eligible && r.disposition === 'candidate')
          ? outsideSelectionReason
          : 'No supported, identified original was available.',
      title: title(
        row?.metadata?.title ?? r.label,
        group.kind === 'chat' ? 'Imported conversation' : 'Imported note',
        group.kind === 'chat' ? 160 : 500
      ),
      metadata: row?.metadata && JSON.stringify(row.metadata).length <= 40000 ? row.metadata : null,
      labels: row?.labels ?? [],
      reuse: null,
      acknowledged: false,
      automatic: { version: 1, sourceItemId: null }
    })
    if (!candidates.length || group.kind === 'retained') continue
    const old = accepted.get(importIdentity(r).key)
    if (old) {
      exclude(
        group.id,
        alreadyPresent(r, old)
          ? alreadyImportedReason
          : 'An existing imported identity has different content; the existing item was kept.'
      )
      continue
    }
    if (group.kind === 'source' && !row?.eligible) continue
    if (group.kind === 'note' && !p.content.notes.has(r.id)) continue
    if (group.kind === 'message') continue // Resolve together with its chosen conversation below.
    if (group.kind === 'chat') {
      const signature = (chat: GraphRecord): string =>
        requestDigest(
          (p.children.get(chat.id) ?? [])
            .map((id) => p.records.get(id)!)
            .filter((m) => m.eligible && ['selected', 'array-order'].includes(m.path))
            .sort((a, b) => a.order - b.order)
            .map((m) => ({
              identity: m.identityId,
              role: m.role,
              text: m.texts.map((t) => t.sha256)
            }))
        )
      const peers = candidates.filter((c) => rank(c) === rank(r))
      if (new Set(peers.map(signature)).size > 1) {
        exclude(group.id, 'Conflicting conversation representations were left out.')
        continue
      }
    }
    choices.set(group.id, { ...choices.get(group.id)!, state: 'include', reason: '' })
  }
  for (const group of p.groups.filter((g) => g.kind === 'message')) {
    if (fixed.has(group.id)) continue
    const candidates = group.records
      .filter((r) => {
        const parent = p.members.get(r.id)?.to,
          parentGroup = parent ? p.recordGroups.get(parent) : null,
          chosen = parentGroup ? choices.get(parentGroup.id) : null
        return (
          supported(r) &&
          chosen?.state === 'include' &&
          chosen.recordId === parent &&
          ['selected', 'array-order'].includes(r.path) &&
          ['user', 'assistant'].includes(r.role ?? '') &&
          r.order >= 0 &&
          r.texts.length > 0
        )
      })
      .sort((a, b) => a.id.localeCompare(b.id))
    const r = candidates[0]
    if (!r) continue
    if (
      candidates.some(
        (c) =>
          c.role !== r.role ||
          c.order !== r.order ||
          requestDigest(c.texts.map((t) => t.sha256)) !==
            requestDigest(r.texts.map((t) => t.sha256))
      )
    ) {
      exclude(group.id, 'Conflicting original messages were left out.')
      continue
    }
    const old = accepted.get(importIdentity(r).key)
    if (old) {
      exclude(
        group.id,
        alreadyPresent(r, old)
          ? alreadyImportedReason
          : 'An existing imported message has different content; the existing item was kept.'
      )
      continue
    }
    choices.set(group.id, {
      ...choices.get(group.id)!,
      recordId: r.id,
      state: 'include',
      reason: '',
      title: hasControlCharacters(r.label) ? '' : r.label.slice(0, 500)
    })
  }
  // Duplicate source occurrences share a destination while each keeps its own original and relation.
  const targets = sourceTargets(db, projectId),
    parent = new Map<string, string>(),
    byKey = new Map<string, string>()
  const root = (id: string): string => {
    let next = id
    while (parent.get(next) !== next) next = parent.get(next)!
    while (id !== next) {
      const previous = parent.get(id)!
      parent.set(id, next)
      id = previous
    }
    return next
  }
  for (const group of p.groups.filter((g) => g.kind === 'source')) {
    const c = choices.get(group.id)!
    if (c.state !== 'include' || !c.metadata) continue
    parent.set(c.itemId, c.itemId)
    for (const key of sourceKeys(c.metadata)) {
      const prior = byKey.get(key)
      if (prior) parent.set(root(c.itemId), root(prior))
      else byKey.set(key, c.itemId)
    }
  }
  const groups = new Map<string, Set<string>>()
  for (const id of parent.keys()) {
    const key = root(id),
      group = groups.get(key) ?? new Set<string>()
    group.add(id)
    groups.set(key, group)
  }
  for (const ids of new Set(groups.values())) {
    const members = [...ids].sort().map((id) => choices.get(id)!),
      matches = new Map(
        members
          .flatMap((c) => sourceKeys(c.metadata!).flatMap((k) => targets.get(k) ?? []))
          .map((t) => [t.id, t])
      ),
      existing = [...matches.values()]
    if (
      existing.length > 1 ||
      existing.some((t) => t.state !== 'active') ||
      !compatibleSourceMetadata([
        ...members.map((c) => c.metadata!),
        ...existing.map((t) => t.metadata)
      ])
    ) {
      for (const c of members)
        if (!fixed.has(c.itemId))
          exclude(
            c.itemId,
            'A conflicting or removed source was left out; existing Research was kept.'
          )
      continue
    }
    if (existing.length === 1) {
      const target = existing[0]
      for (const c of members)
        if (!fixed.has(c.itemId))
          choices.set(c.itemId, {
            ...c,
            reuse: {
              id: target.id,
              revisionId: target.revisionId,
              metadataDigest: requestDigest(target.metadata)
            }
          })
    } else {
      // Preserve an explicit manual choice as the canonical creation when there is one.
      const canonical = members.find((c) => fixed.has(c.itemId)) ?? members[0]
      if (canonical.reuse) {
        for (const c of members)
          if (!fixed.has(c.itemId)) choices.set(c.itemId, { ...c, reuse: canonical.reuse })
      } else {
        for (const c of members)
          if (c.itemId !== canonical.itemId && !fixed.has(c.itemId)) {
            if (!sourceKeys(c.metadata!).some((k) => sourceKeys(canonical.metadata!).includes(k)))
              exclude(c.itemId, 'An indirect source match was left out.')
            else
              choices.set(c.itemId, {
                ...c,
                automatic: { version: 1, sourceItemId: canonical.itemId }
              })
          }
      }
    }
  }
  // No empty chat destinations; duplicate sequence positions are essential conflicts.
  const byParent = new Map<string, ReviewChoice[]>()
  for (const g of p.groups.filter((g) => g.kind === 'message')) {
    const c = choices.get(g.id)!
    if (c.state !== 'include') continue
    const parent = p.members.get(c.recordId)?.to
    if (parent) {
      const list = byParent.get(parent) ?? []
      list.push(c)
      byParent.set(parent, list)
    }
  }
  for (const list of byParent.values()) {
    const positions = new Map<number, ReviewChoice[]>()
    for (const c of list) {
      const order = p.records.get(c.recordId)!.order
      const list = positions.get(order) ?? []
      list.push(c)
      positions.set(order, list)
    }
    for (const rows of positions.values())
      if (rows.length > 1)
        for (const c of rows)
          if (!fixed.has(c.itemId)) exclude(c.itemId, 'The original message order was ambiguous.')
  }
  for (const g of p.groups.filter((g) => g.kind === 'chat')) {
    const c = choices.get(g.id)!
    if (
      c.state === 'include' &&
      !fixed.has(c.itemId) &&
      !(byParent.get(c.recordId) ?? []).some((m) => choices.get(m.itemId)?.state === 'include')
    )
      exclude(c.itemId, 'No usable original messages were available for this conversation.')
  }
  return choices
}
