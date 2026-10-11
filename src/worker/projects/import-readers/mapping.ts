import { record } from '../../../shared/projects'
import type { ImportFile, ImportSettings } from '../../../shared/project-import'
import {
  GRAPH_LIMITS,
  type GraphRecord,
  type GraphRelation,
  type GraphFileCoverage
} from '../../../shared/import-graph'
import {
  isImportMapping,
  type ImportMapping,
  type MappingRule,
  type StructureProfile,
  isStructureProfile,
  type FieldPath
} from '../../../shared/import-mapping'
import { originalSourceMetadata } from '../import-source-metadata'
import { normalizeMetadata } from '../sources'
import { OriginalRecords, graphId } from './records'
import { InputError, type ParsedInput } from './json'
import {
  MappingWork,
  mappingField,
  mappingVariant,
  traverseMapping,
  type MappingValue
} from './mapping-profile'
import type { BuiltGraph } from './graph'

type Draft = {
  rule: MappingRule
  file: ImportFile
  record: GraphRecord
  originalId: string | null
  container: string
  context: Draft | null
  join: MappingValue | null
  rank: number | null
  nodeParent: MappingValue | null
  currents: Map<string, MappingValue | null>
  decision: GraphRelation['decision']
}
const identity = (v: unknown): string | null =>
  typeof v === 'string' && !!v && v.length <= 4000
    ? v
    : typeof v === 'number' && Number.isSafeInteger(v)
      ? String(v)
      : null
// Retained drafts keep only scalar join keys, never the containing JSON body.
const identityField = (value: unknown, path: FieldPath, base: string): MappingValue | null => {
  const found = mappingField(value, path, base)
  return found
    ? {
        ...found,
        value:
          found.value === null || typeof found.value === 'string' || typeof found.value === 'number'
            ? found.value
            : undefined
      }
    : null
}

/** Finite original-field interpreter. No provider, path fetch, executable operator or inferred body. */
export class MappingInterpreter extends OriginalRecords {
  private drafts: Draft[] = []
  private locations = new Set<string>()
  private omissions = new Map<string, GraphRecord>()
  readonly files: GraphFileCoverage[] = []
  constructor(
    settings: ImportSettings,
    private readonly mapping: ImportMapping,
    private readonly profiles: StructureProfile[],
    private readonly work = new MappingWork()
  ) {
    super(settings)
    if (
      !isImportMapping(mapping) ||
      profiles.length !== mapping.profiles.length ||
      profiles.some((p, i) => !isStructureProfile(p) || p.id !== mapping.profiles[i])
    )
      throw new InputError('unsupported', 'Invalid import mapping or original profile bindings.')
  }
  private unresolved(r: GraphRecord, reason: string): void {
    r.eligible = false
    if (r.disposition !== 'internal') r.disposition = 'unresolved'
    r.path = 'unresolved'
    this.issue(r, reason)
  }
  private omission(path: string, reason: string): void {
    const key = `${this.file.id}:${path}`,
      existing = this.omissions.get(key)
    const r = existing ?? this.add('unclassified', path, 'Unresolved mapped content')
    r.disposition = 'unsupported'
    this.issue(r, reason)
    this.omissions.set(key, r)
  }
  private optional(
    value: unknown,
    path: FieldPath | null,
    base: string,
    r: GraphRecord,
    name: string
  ): MappingValue | null {
    if (!path) return null
    const found = mappingField(value, path, base)
    if (!found || found.value === null) return null
    this.fact(r, `mapped.original.${name}`, found.value, found.pointer)
    return found
  }
  private async emit(rule: MappingRule, item: MappingValue, context: Draft | null): Promise<Draft> {
    const r = this.add(
      rule.kind,
      item.pointer,
      rule.kind === 'conversation'
        ? 'Untitled external conversation'
        : rule.kind === 'note'
          ? 'Imported note'
          : rule.kind === 'source'
            ? 'External reference'
            : 'External message'
    )
    r.path = rule.kind === 'message' ? 'array-order' : 'none'
    this.fact(r, 'mapping.rule', rule.id, item.pointer)
    const idField = rule.identity ? mappingField(item.value, rule.identity, item.pointer) : null,
      originalId = identity(idField?.value)
    if (idField && idField.value !== null && !originalId)
      this.unresolved(r, 'The declared original identity has an unsupported type.')
    r.externalId = originalId
    r.identityId = graphId([
      originalId === null ? 'mapped-pointer-identity-v1' : 'mapped-original-identity-v1',
      this.file.sha256,
      rule.kind,
      originalId ?? item.pointer
    ])
    if (idField) this.fact(r, 'mapped.original.id', idField.value, idField.pointer)
    const title = this.optional(item.value, rule.title, item.pointer, r, 'title'),
      time = rule.time ? mappingField(item.value, rule.time, item.pointer) : null
    if (typeof title?.value === 'string' && title.value.trim()) r.label = title.value.slice(0, 256)
    else if (title)
      this.issue(r, 'The original title is not a supported string; a destination fallback is used.')
    if (time) this.date(r, time.value, time.pointer)
    const d: Draft = {
      rule,
      file: this.file,
      record: r,
      originalId,
      container: item.pointer.slice(0, item.pointer.lastIndexOf('/')),
      context,
      join: null,
      rank: null,
      nodeParent: null,
      currents: new Map(),
      decision: null
    }
    if (rule.kind === 'conversation') {
      r.externalConversationId = originalId ?? `mapped:${r.identityId}`
      r.eligible = r.disposition === 'candidate' && this.settings.categories.includes('chats')
      for (const child of this.mapping.rules)
        if (
          child.kind === 'message' &&
          child.parent.rule === rule.id &&
          child.order.kind === 'parent-chain'
        )
          d.currents.set(child.id, identityField(item.value, child.order.current, item.pointer))
    } else if (rule.kind === 'message' || rule.kind === 'note') {
      if (rule.kind === 'message') {
        const role = mappingField(item.value, rule.role, item.pointer),
          mapped = rule.aliases.find((a) => a.original === role?.value)?.role,
          channel = rule.channel ? mappingField(item.value, rule.channel, item.pointer) : null
        r.role = mapped ?? null
        r.contentType = 'mapped-text-v1'
        if (role) this.fact(r, 'role', role.value, role.pointer)
        if (channel) this.fact(r, 'channel', channel.value, channel.pointer)
        const internal =
          mapped === 'internal' ||
          ['analysis', 'reasoning', 'thoughts', 'reasoning_recap'].includes(String(channel?.value))
        if (internal) {
          r.disposition = 'internal'
          r.eligible = false
        } else if (!['user', 'assistant'].includes(mapped ?? '')) {
          r.disposition = 'unsupported'
          r.eligible = false
          this.issue(r, 'The original role has no supported visible-message alias.')
        }
        d.join = rule.parent.key ? identityField(item.value, rule.parent.key, item.pointer) : null
        if (rule.order.kind === 'number') {
          const order = mappingField(item.value, rule.order.field, item.pointer)
          if (order && Number.isSafeInteger(order.value) && Number(order.value) >= 0) {
            d.rank = Number(order.value)
            this.fact(r, 'mapped.original.order', order.value, order.pointer)
          } else
            this.unresolved(
              r,
              'The declared message order is missing or not a nonnegative integer.'
            )
        } else if (rule.order.kind === 'parent-chain') {
          d.nodeParent = identityField(item.value, rule.order.parent, item.pointer)
          r.nodeId = originalId
        }
      } else {
        for (const name of ['tags', 'categories', 'authorship'] as const)
          this.optional(item.value, rule[name], item.pointer, r, name)
      }
      if (r.disposition !== 'internal') {
        try {
          let parts = 0
          for await (const body of traverseMapping(
            item.value,
            rule.body,
            item.pointer,
            this.work
          )) {
            if (typeof body.value !== 'string')
              throw new InputError('unsupported', 'A mapped original body part is not text.')
            this.text(r, body.value, body.pointer)
            parts++
          }
          if (!parts) this.unresolved(r, 'The mapped original body is empty or missing.')
        } catch (error) {
          if (!(error instanceof InputError) || error.kind === 'limited') throw error
          this.unresolved(r, error.message)
        }
      }
      r.eligible =
        r.disposition === 'candidate' &&
        r.texts.length > 0 &&
        r.texts.reduce((n, t) => n + t.units, 0) <= GRAPH_LIMITS.text &&
        this.settings.categories.includes(rule.kind === 'note' ? 'notes' : 'chats')
    } else {
      const fields: Record<string, unknown> = Object.create(null),
        losses: string[] = []
      for (const f of rule.fields) {
        const original = mappingField(item.value, f.path, item.pointer)
        if (!original || original.value === null) continue
        fields[f.name] = original.value
        this.fact(r, `mapped.original.${f.name}`, original.value, original.pointer)
      }
      const metadata = originalSourceMetadata(fields, losses)
      if (metadata) {
        const normalized = normalizeMetadata(metadata)
        r.label = normalized.title.slice(0, 256) || r.label
        if (
          ![normalized.title, normalized.DOI, normalized.ISBN, normalized.URL].some((v) => v.trim())
        )
          this.unresolved(r, 'No original title or supported source identifier was supplied.')
      } else
        this.unresolved(r, 'The mapped source fields do not form supported bibliography metadata.')
      for (const loss of losses) this.issue(r, loss)
      const originalDecision =
        typeof rule.decision === 'string'
          ? null
          : mappingField(item.value, rule.decision.path, item.pointer)
      d.decision =
        typeof rule.decision === 'string'
          ? rule.decision
          : (rule.decision.aliases.find((a) => a.original === originalDecision?.value)?.decision ??
            null)
      if (originalDecision)
        this.fact(r, 'mapped.original.decision', originalDecision.value, originalDecision.pointer)
      if (d.decision === null)
        this.unresolved(r, 'The original source decision is missing or has no declared alias.')
      if (d.decision === 'rejected') r.disposition = 'rejected'
      if (d.decision === 'search') r.disposition = 'search'
      this.fact(r, 'occurrence.decision', d.decision, originalDecision?.pointer ?? item.pointer)
      if (rule.parent)
        d.join = rule.parent.key ? identityField(item.value, rule.parent.key, item.pointer) : null
      r.eligible =
        r.disposition === 'candidate' && !!metadata && this.settings.categories.includes('sources')
    }
    this.drafts.push(d)
    return d
  }
  async fileInput(file: ImportFile, parsed: ParsedInput, bom: boolean): Promise<void> {
    const profile = this.profiles.find((p) => p.fileId === file.id && p.sha256 === file.sha256)
    if (!profile) throw new InputError('unsupported', 'This original has no bound mapping profile.')
    this.file = file
    this.numbers = parsed.numbers
    const start = this.records.length,
      relations = this.relations.length,
      units = this.units,
      drafts = this.drafts.length,
      coverage: GraphFileCoverage = {
        fileId: file.id,
        sha256: file.sha256,
        reader: 'generic-json-v1',
        status: 'read',
        bom,
        records: 0,
        issues: []
      },
      contexts = new Map<string, Array<{ item: MappingValue; draft: Draft }>>()
    this.files.push(coverage)
    try {
      for (const rule of this.mapping.rules) {
        if (!rule.from.profiles.includes(profile.id)) continue
        const parents = rule.from.parent
            ? (contexts.get(rule.from.parent) ?? [])
            : [{ item: { value: parsed.value, pointer: '' }, draft: null }],
          produced: Array<{ item: MappingValue; draft: Draft }> = []
        for (const parent of parents) {
          try {
            for await (const item of traverseMapping(
              parent.item.value,
              rule.from.path,
              parent.item.pointer,
              this.work
            )) {
              if (!record(item.value)) {
                this.omission(item.pointer, 'A mapped record is not an object.')
                continue
              }
              if (rule.variants.length && !rule.variants.includes(mappingVariant(item.value))) {
                this.omission(
                  item.pointer,
                  'This original variant was not covered by the supplied mapping.'
                )
                continue
              }
              const location = `${file.id}:${item.pointer}`
              if (this.locations.has(location))
                throw new InputError(
                  'unsupported',
                  'Mapping rules overlap the same original record.'
                )
              this.locations.add(location)
              produced.push({ item, draft: await this.emit(rule, item, parent.draft) })
            }
          } catch (error) {
            if (!(error instanceof InputError) || error.kind === 'limited') throw error
            this.omission(parent.item.pointer, error.message)
          }
        }
        contexts.set(rule.id, produced)
      }
      if (this.records.length === start)
        this.omission('', 'The mapping did not identify applicable original records.')
      coverage.records = this.records.length - start
      if (this.records.slice(start).some((r) => JSON.stringify(r).length > 48000))
        throw new InputError('limited', 'A mapped record exceeds the descriptor budget.')
    } catch (error) {
      if (!(error instanceof InputError)) throw error
      this.records.splice(start)
      this.relations.splice(relations)
      this.drafts.splice(drafts)
      this.units = units
      coverage.status = error.kind
      coverage.issues = [error.message]
      coverage.records = 0
    }
  }
  async finish(): Promise<BuiltGraph> {
    // Duplicate exporter identities are unresolved; sampling never proves uniqueness.
    const ids = new Map<string, Draft[]>()
    for (const d of this.drafts)
      if (d.originalId) {
        const key = JSON.stringify([d.rule.kind, d.file.id, d.originalId]),
          found = ids.get(key) ?? []
        found.push(d)
        ids.set(key, found)
      }
    for (const found of ids.values())
      if (found.length > 1)
        for (const d of found)
          this.unresolved(d.record, 'Duplicate original identities prevent an unambiguous mapping.')
    const parentsById = new Map<string, Draft[]>(),
      localParentsById = new Map<string, Draft[]>()
    for (const d of this.drafts)
      if (d.originalId) {
        for (const [index, key] of [
          [parentsById, JSON.stringify([d.rule.id, d.originalId])],
          [localParentsById, JSON.stringify([d.rule.id, d.file.id, d.originalId])]
        ] as const) {
          const rows = index.get(key) ?? []
          rows.push(d)
          index.set(key, rows)
        }
      }
    const members = new Map<string, Draft>()
    for (const d of this.drafts) {
      await this.work.step()
      if (d.rule.kind !== 'message' && d.rule.kind !== 'source') continue
      const parent = d.rule.parent
      if (!parent) continue
      const join = identity(d.join?.value),
        targets =
          parent.key === null
            ? d.context?.rule.id === parent.rule
              ? [d.context]
              : []
            : join === null
              ? []
              : parent.scope === 'selection'
                ? (parentsById.get(JSON.stringify([parent.rule, join])) ?? [])
                : (localParentsById.get(JSON.stringify([parent.rule, d.file.id, join])) ?? [])
      const p = targets.length === 1 ? targets[0] : null
      if (!p || ['unresolved', 'unsupported'].includes(p.record.disposition)) {
        this.unresolved(d.record, 'The mapped parent is missing, ambiguous or unresolved.')
        continue
      }
      if (d.rule.kind === 'message') {
        d.record.externalConversationId = p.record.externalConversationId
        d.record.conversationIdentityId = p.record.identityId
        members.set(d.record.id, p)
        this.relation(
          'member',
          d.record,
          p.record,
          d.join
            ? { fileId: d.file.id, sha256: d.file.sha256, pointer: d.join.pointer }
            : d.record.locator
        )
      } else
        this.relation(
          'reference',
          p.record,
          d.record,
          d.join
            ? { fileId: d.file.id, sha256: d.file.sha256, pointer: d.join.pointer }
            : d.record.locator,
          d.decision
        )
    }
    const groups = new Map<string, Draft[]>()
    for (const d of this.drafts)
      if (d.rule.kind === 'message' && members.has(d.record.id)) {
        const key = d.record.conversationIdentityId!,
          rows = groups.get(key) ?? []
        rows.push(d)
        groups.set(key, rows)
      }
    const ordered: Draft[] = []
    for (const rows of groups.values()) {
      const rule = rows[0].rule as Extract<MappingRule, { kind: 'message' }>
      if (rows.some((d) => d.rule.id !== rule.id)) {
        for (const d of rows)
          this.unresolved(d.record, 'Multiple message rules have no proven combined order.')
        continue
      }
      if (rule.order.kind === 'array') {
        if (new Set(rows.map((d) => `${d.file.id}:${d.container}`)).size !== 1) {
          for (const d of rows)
            this.unresolved(d.record, 'Separate arrays have no proven combined message order.')
          continue
        }
        ordered.push(...rows)
      } else if (rule.order.kind === 'number') {
        if (
          rows.some((d) => d.rank === null) ||
          new Set(rows.map((d) => d.rank)).size !== rows.length
        ) {
          for (const d of rows)
            this.unresolved(d.record, 'Message order values are missing or duplicated.')
          continue
        }
        ordered.push(...rows.sort((a, b) => a.rank! - b.rank!))
      } else {
        const nodes = new Map(rows.map((d) => [d.originalId, d])),
          parent = members.get(rows[0].record.id)!,
          current = parent.currents.get(rule.id),
          selected: Draft[] = [],
          seen = new Set<string>()
        let cursor = identity(current?.value),
          valid = !!cursor
        while (cursor !== null) {
          await this.work.step()
          const node = nodes.get(cursor)
          if (
            !node ||
            seen.has(cursor) ||
            !node.nodeParent ||
            !(node.nodeParent.value === null || identity(node.nodeParent.value))
          ) {
            valid = false
            break
          }
          seen.add(cursor)
          selected.push(node)
          cursor = node.nodeParent.value === null ? null : identity(node.nodeParent.value)
        }
        if (!valid || nodes.size !== rows.length || nodes.has(null)) {
          for (const d of rows)
            this.unresolved(d.record, 'The selected parent chain is missing, cyclic or ambiguous.')
          continue
        }
        const checked = new Set<string>(),
          broken = new Set<string>()
        for (const d of rows) {
          const chain: string[] = [],
            seenBranch = new Set<string>()
          let node: Draft | undefined = d,
            bad = false
          while (node && !checked.has(node.originalId!)) {
            await this.work.step()
            const id = node.originalId!
            if (seenBranch.has(id)) {
              bad = true
              break
            }
            seenBranch.add(id)
            chain.push(id)
            const next = node.nodeParent
            if (!next || (next.value !== null && identity(next.value) === null)) {
              bad = true
              break
            }
            if (next.value === null) {
              node = undefined
              break
            }
            node = nodes.get(identity(next.value)!)
            if (!node) bad = true
          }
          bad ||= !!node && broken.has(node.originalId!)
          for (const id of chain) {
            checked.add(id)
            if (bad) broken.add(id)
          }
        }
        for (const d of rows) {
          d.record.path = seen.has(d.originalId!) ? 'selected' : 'alternate'
          d.record.eligible &&= d.record.path === 'selected'
          if (broken.has(d.originalId!))
            this.unresolved(d.record, 'The alternate parent chain is missing or cyclic.')
          const next = d.nodeParent?.value,
            target = identity(next) === null ? null : nodes.get(identity(next)!)
          this.relation(
            'parent',
            d.record,
            target?.record ?? null,
            d.nodeParent
              ? { fileId: d.file.id, sha256: d.file.sha256, pointer: d.nodeParent.pointer }
              : d.record.locator,
            null,
            null,
            target || next === null ? null : 'Parent is missing from admitted mapped records.'
          )
        }
        ordered.push(...selected.reverse(), ...rows.filter((d) => !seen.has(d.originalId!)))
      }
    }
    // Keep the proven witness order while retaining every unresolved representation.
    const messageOrder = new Map(ordered.map((d, i) => [d.record.id, i]))
    this.records.sort((a, b) =>
      a.kind === 'message' && b.kind === 'message'
        ? (messageOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (messageOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        : a.kind === 'message'
          ? 1
          : b.kind === 'message'
            ? -1
            : 0
    )
    this.records.forEach((r, i) => {
      r.order = i
    })
    const index = new Map(this.records.map((r) => [r.id, r]))
    for (const link of this.relations)
      if (link.kind === 'reference') {
        const message = index.get(link.from)!,
          source = index.get(link.to!)!
        source.eligible &&=
          message.disposition === 'candidate' &&
          ['selected', 'array-order'].includes(message.path) &&
          !!message.conversationIdentityId
        if (message.disposition === 'unresolved' && source.disposition === 'candidate')
          this.unresolved(
            source,
            'The original source occurrence belongs to an unresolved message.'
          )
      }
    return {
      records: this.records,
      relations: this.relations,
      files: this.files,
      textUnits: this.units
    }
  }
}
