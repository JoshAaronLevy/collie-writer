import { retiredWorkspace } from './working-copy-records'
import { intentionallyRemovedPrevious } from './retention-receipts'
import { constants, type BigIntStats } from 'node:fs'
import { lstat, open, opendir, realpath, statfs } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { storageConditions, type InventoryVolume } from '../../shared/storage-advice'
import { setImmediate as yieldTurn } from 'node:timers/promises'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record, type OpenInput } from '../../shared/projects'
import { hasControlCharacters } from '../../shared/control-characters'
import {
  INVENTORY_GROUP_LIMIT,
  INVENTORY_PAGE_SIZE,
  type InventoryCommand,
  type InventoryAiOwner,
  type InventoryCount,
  type InventoryGroup,
  type InventoryRegion,
  type InventoryReport,
  type StorageCategory
} from '../../shared/storage-inventory'
import { isSavedLocation } from './file-state'
import { isSaveIntent } from './save-intent'

type WorkspaceHint = { scope: OpenInput; title: string; database: string | null }
type ExternalHint = {
  path: string
  kind: 'selected' | 'previous' | 'backup' | 'unclassified'
  scope: OpenInput | null
}
type Scan = {
  id: string
  state: InventoryReport['state']
  startedAt: string
  asOf: string
  controller: AbortController
  visited: number
  duplicates: number
  deadline: number
  groups: Map<string, InventoryGroup>
  files: Set<string>
  directories: Set<string>
  volumes: Map<string, string>
  capacity: Map<string, InventoryVolume>
  workspaces: Map<string, WorkspaceHint>
  external: Map<string, ExternalHint>
  bytes: number
  aiOwners: Map<string, OpenInput>
  stopReason: 'cancelled' | 'limited' | null
}
const count = (): InventoryCount => ({ bytes: 0, files: 0, unknown: 0 })
const within = (root: string, path: string): boolean => {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}
const pathKey = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path)
const sqliteBase = (name: string): string => name.replace(/-(wal|shm|journal)$/, '')
const searchFile = (name: string): boolean => {
  const base = sqliteBase(name)
  return (
    base === 'search.sqlite' ||
    (base.startsWith('search.sqlite.retained-') &&
      isId(base.slice('search.sqlite.retained-'.length)))
  )
}

/** Metadata reporting only. Never acquire a project, open SQLite, reconcile or write a journal. */
export class StorageInventory {
  private scan: Scan | null = null
  private task: Promise<void> | null = null
  private starting = false
  private stopped = false
  constructor(
    private readonly working: string,
    private readonly application: string
  ) {}
  cancel(): void {
    if (this.scan?.state === 'running') {
      this.scan.stopReason = 'cancelled'
      this.scan.state = 'cancelled'
      this.scan.controller.abort()
    }
  }
  stop(): void {
    this.stopped = true
    this.cancel()
  }
  async command(
    command: InventoryCommand,
    owners: InventoryAiOwner[] = []
  ): Promise<InventoryReport> {
    if (this.stopped) throw new ProjectError('UNAVAILABLE')
    if (command.kind === 'start' && this.scan?.id !== command.id) {
      if (this.starting) throw new ProjectError('PROJECT_LOCKED')
      this.starting = true
      this.cancel()
      try {
        await this.task
      } finally {
        this.starting = false
      }
      if (this.stopped) throw new ProjectError('UNAVAILABLE')
      const startedAt = new Date().toISOString()
      const scan: Scan = {
        id: command.id,
        state: 'running',
        startedAt,
        asOf: startedAt,
        controller: new AbortController(),
        visited: 0,
        duplicates: 0,
        deadline: Date.now() + 30_000,
        groups: new Map(),
        files: new Set(),
        directories: new Set(),
        volumes: new Map(),
        capacity: new Map(),
        workspaces: new Map(),
        external: new Map(),
        bytes: 0,
        aiOwners: new Map(owners.map((o) => [o.operationId, { ...o.scope }])),
        stopReason: null
      }
      this.scan = scan
      this.task = this.run(scan)
    }
    const scan = this.scan
    if (!scan || scan.id !== command.id) throw new ProjectError('NOT_FOUND')
    if (command.kind === 'cancel' && scan.state === 'running') {
      scan.stopReason = 'cancelled'
      scan.controller.abort()
      scan.state = 'cancelled'
    }
    const totals = { working: count(), application: count(), external: count() }
    for (const group of scan.groups.values())
      for (const item of group.categories) {
        const total = totals[group.region]
        total.bytes += item.bytes
        total.files += item.files
        total.unknown += item.unknown
      }
    const offset = command.kind === 'page' ? command.offset : 0
    const groups = Array.from(scan.groups.values())
    const volumes = Array.from(scan.capacity.values()).map((v) => ({ ...v }))
    const advice = storageConditions(groups, volumes, scan.state === 'complete')
    return {
      id: scan.id,
      state: scan.state,
      startedAt: scan.startedAt,
      asOf: scan.asOf,
      visited: scan.visited,
      duplicates: scan.duplicates,
      totals,
      offset,
      totalGroups: scan.groups.size,
      volumes,
      ...advice,
      groups: groups
        .slice(offset, offset + INVENTORY_PAGE_SIZE)
        .map((g) => ({ ...g, categories: g.categories.map((c) => ({ ...c })) }))
    }
  }
  private check(scan: Scan): void {
    if (scan.controller.signal.aborted) throw new Error('cancelled')
    if (
      scan.visited >= 200_000 ||
      Date.now() >= scan.deadline ||
      scan.groups.size >= INVENTORY_GROUP_LIMIT
    )
      throw new Error('limited')
  }
  private group(
    scan: Scan,
    key: string,
    path: string,
    region: InventoryRegion,
    scope: OpenInput | null = null
  ): InventoryGroup {
    let group = scan.groups.get(key)
    if (!group) {
      this.check(scan)
      group = {
        id: randomUUID(),
        scope,
        path,
        region,
        categories: [],
        note: 'none',
        title: scope
          ? 'Project data (local title unavailable)'
          : region === 'application'
            ? 'Shared application storage'
            : region === 'external'
              ? 'Recorded external file'
              : 'Shared working data and recovery'
      }
      scan.groups.set(key, group)
    }
    return group
  }
  private add(
    scan: Scan,
    group: InventoryGroup,
    kind: StorageCategory,
    info: BigIntStats | null,
    path = group.path
  ): void {
    this.check(scan)
    let volume: string | null = null
    if (info) {
      const device = String(info.dev)
      this.volume(scan, device, group.region === 'external' ? dirname(path) : path)
      volume = scan.volumes.get(device)!
    }
    let item = group.categories.find(
      (c) => c.kind === kind && c.volume === volume && c.path === path
    )
    if (!item) {
      if (group.categories.length >= 128) throw new Error('limited')
      item = { kind, volume, path, ...count() }
      group.categories.push(item)
    }
    const bytes = info ? Number(info.size) : null
    if (bytes === null || !Number.isSafeInteger(bytes) || bytes < 0) item.unknown++
    else {
      if (!Number.isSafeInteger(scan.bytes + bytes)) throw new Error('limited')
      scan.bytes += bytes
      item.bytes += bytes
      item.files++
    }
    if (!Number.isSafeInteger(item.bytes)) throw new Error('limited')
    scan.asOf = new Date().toISOString()
  }
  private volume(scan: Scan, device: string, path: string): void {
    this.check(scan)
    if (scan.volumes.has(device)) return
    if (scan.volumes.size >= 64) throw new Error('limited')
    const label = `Volume ${scan.volumes.size + 1}`
    scan.volumes.set(device, label)
    scan.capacity.set(device, {
      key: createHash('sha256').update(`collie-volume:${device}`).digest('hex'),
      label,
      path,
      available: null,
      total: null,
      asOf: scan.asOf
    })
  }
  private async capacities(scan: Scan): Promise<void> {
    for (const [device, v] of scan.capacity) {
      this.check(scan)
      try {
        await this.safePath(scan, v.path)
        const before = await lstat(v.path, { bigint: true })
        if (!before.isDirectory() || String(before.dev) !== device) throw new Error('volume')
        const info = await statfs(v.path, { bigint: true })
        const after = await lstat(v.path, { bigint: true })
        this.check(scan)
        const available = Number(info.bavail * info.bsize),
          total = Number(info.blocks * info.bsize)
        if (
          after.dev !== before.dev ||
          after.ino !== before.ino ||
          info.bsize <= 0n ||
          !Number.isSafeInteger(available) ||
          !Number.isSafeInteger(total) ||
          available < 0 ||
          total < available
        )
          throw new Error('capacity')
        v.available = available
        v.total = total
      } catch {
        this.check(scan)
        v.available = v.total = null
      }
      v.asOf = new Date().toISOString()
    }
  }
  /** Reject redirected ancestors, including links that remain inside the root. */
  private async safePath(scan: Scan, path: string): Promise<void> {
    let parent = path
    for (let depth = 0; depth < 128; depth++) {
      this.check(scan)
      const info = await lstat(parent)
      if (info.isSymbolicLink()) throw new Error('redirected')
      const next = dirname(parent)
      if (parent === next) return
      parent = next
    }
    throw new Error('deep')
  }
  private async json(scan: Scan, root: string, path: string): Promise<unknown> {
    await this.safePath(scan, path)
    if (!within(await realpath(root), await realpath(path))) throw new Error('outside')
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      this.check(scan)
      const before = await file.stat()
      if (!before.isFile() || before.nlink !== 1 || before.size > 32768) throw new Error('metadata')
      const buffer = Buffer.alloc(before.size + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      const after = await file.stat()
      this.check(scan)
      if (
        bytesRead !== before.size ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs
      )
        throw new Error('changed')
      return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown
    } finally {
      await file.close()
    }
  }
  private async workspace(scan: Scan, path: string, scope: OpenInput): Promise<WorkspaceHint> {
    const cached = scan.workspaces.get(path)
    if (cached) return cached
    const group = this.group(scan, path, path, 'working', scope)
    const hint: WorkspaceHint = { scope, title: group.title, database: 'working.sqlite' }
    scan.workspaces.set(path, hint)
    try {
      const v = await this.json(scan, this.working, join(path, 'recovery.json'))
      if (
        !record(v) ||
        !exact(v, ['version', 'projectId', 'workspaceId', 'headCommitId', 'title', 'updatedAt']) ||
        v.version !== 1 ||
        v.projectId !== scope.projectId ||
        v.workspaceId !== scope.workspaceId ||
        !isId(v.headCommitId) ||
        typeof v.title !== 'string' ||
        v.title.length > 500 ||
        typeof v.updatedAt !== 'string'
      )
        throw new Error('metadata')
      hint.title = v.title
      group.title = v.title
    } catch {
      group.note = 'metadata-unavailable'
    }
    try {
      const v = await this.json(scan, this.working, join(path, 'active.json'))
      if (
        !record(v) ||
        !exact(v, ['file']) ||
        typeof v.file !== 'string' ||
        !/^working(?:-v\d+-[a-f0-9-]{36})?\.sqlite$/.test(v.file)
      )
        throw new Error('metadata')
      hint.database = v.file
    } catch (error) {
      if (!(record(error) && error.code === 'ENOENT')) {
        hint.database = null
        group.note = 'metadata-unavailable'
      }
    }
    try {
      const v = await this.json(scan, this.working, join(path, 'destination-v1.json'))
      if (
        !record(v) ||
        !exact(v, ['version', 'destination']) ||
        v.version !== 1 ||
        !isSavedLocation(v.destination)
      )
        throw new Error('metadata')
      this.external(scan, { path: v.destination.path, kind: 'selected', scope })
    } catch (error) {
      if (!(record(error) && error.code === 'ENOENT')) {
        group.note = 'metadata-unavailable'
        this.add(scan, group, 'selected', null)
      }
    }
    try {
      if (retiredWorkspace(this.working, scope)) {
        hint.title = `${hint.title.slice(0, 440)} (retired local copy: retained data)`
        group.title = hint.title
      }
    } catch {
      group.note = 'metadata-unavailable'
    }
    return hint
  }
  private external(scan: Scan, hint: ExternalHint): void {
    if (!isAbsolute(hint.path) || hint.path.length > 4000 || hasControlCharacters(hint.path))
      throw new Error('metadata')
    const key = pathKey(hint.path)
    const prior = scan.external.get(key)
    if (prior) {
      if (JSON.stringify(prior.scope) !== JSON.stringify(hint.scope)) prior.scope = null
      if (prior.kind !== hint.kind) {
        prior.kind = 'unclassified'
        prior.scope = null
      }
      return
    }
    if (scan.external.size >= INVENTORY_GROUP_LIMIT) throw new Error('limited')
    scan.external.set(key, hint)
  }
  private async journal(scan: Scan, path: string): Promise<void> {
    try {
      const intent = await this.json(scan, this.working, path)
      if (!isSaveIntent(intent) || intent.id !== basename(dirname(path)))
        throw new Error('metadata')
      if (basename(path) === 'backup.json')
        this.external(scan, { path: intent.path, kind: 'backup', scope: null })
      if (
        intent.expected &&
        !intentionallyRemovedPrevious(
          this.working,
          intent.id,
          join(dirname(intent.path), `.collie-${intent.id}.previous.collie`)
        )
      )
        this.external(scan, {
          path: join(dirname(intent.path), `.collie-${intent.id}.previous.collie`),
          kind: 'previous',
          scope: null
        })
    } catch {
      this.add(
        scan,
        this.group(scan, 'working-shared', this.working, 'working'),
        'unclassified',
        null
      )
    }
  }
  private async classify(
    scan: Scan,
    root: string,
    path: string,
    region: InventoryRegion
  ): Promise<{ group: InventoryGroup; kind: StorageCategory }> {
    if (region === 'application')
      return {
        group: this.group(scan, 'application-shared', this.application, 'application'),
        kind: ['profile', 'session', 'logs', 'crashes'].includes(relative(root, path).split(sep)[0])
          ? 'application'
          : 'unclassified'
      }
    const parts = relative(root, path).split(sep)
    if (parts[0] === 'workspaces' && isId(parts[1]) && isId(parts[2])) {
      const workspace = join(root, ...parts.slice(0, 3))
      const scope = { projectId: parts[1], workspaceId: parts[2] }
      const hint = await this.workspace(scan, workspace, scope)
      const name = parts[3] ?? ''
      let kind: StorageCategory = 'unclassified'
      if (name === 'blobs' && parts.length === 5 && /^[a-f0-9]{64}$/.test(parts[4])) kind = 'assets'
      else if (
        name === 'cache-actions' &&
        parts.length === 5 &&
        parts[4].endsWith('.json') &&
        isId(parts[4].slice(0, -5))
      )
        kind = 'operations'
      else if (name === 'citation-assets') kind = 'citations'
      else if (
        name === 'snapshots' &&
        parts.length === 7 &&
        isId(parts[4]) &&
        parts[5] === 'payload-removals-v1' &&
        /^[a-f0-9]{64}\.json$/.test(parts[6])
      )
        kind = 'operations'
      else if (name === 'snapshots' || name === 'migrations') kind = 'recovery'
      else if (parts.length === 4) {
        if (hint.database && sqliteBase(name) === hint.database) kind = 'database'
        else if (searchFile(name)) kind = 'search'
        else if (
          hint.database &&
          /^working(?:-v\d+-[a-f0-9-]{36})?\.sqlite(?:-(?:wal|shm|journal))?$/.test(name)
        )
          kind = 'recovery'
        else if (
          sqliteBase(name) === 'operations.sqlite' ||
          ['active.json', 'destination-v1.json', 'recovery.json', 'organization-v1.json'].includes(
            name
          )
        )
          kind = 'operations'
      }
      return { group: this.group(scan, workspace, workspace, region, scope), kind }
    }
    if (parts[0] === 'ai') {
      const knownName =
        parts.length === 3 && parts[1] === 'operations'
          ? parts[2]
          : parts.length === 4 &&
              parts[1] === 'retained-v1' &&
              ['records', 'receipts'].includes(parts[2])
            ? parts[3]
            : null
      const operationId = knownName?.endsWith('.json') ? knownName.slice(0, -5) : null
      const scope = operationId && isId(operationId) ? scan.aiOwners.get(operationId) : undefined
      if (scope) {
        const workspace = join(root, 'workspaces', scope.projectId, scope.workspaceId)
        const group = this.group(scan, workspace, workspace, region, scope)
        if (group.note === 'none') group.note = 'known-ai'
        return { group, kind: 'ai' }
      }
      const group = this.group(scan, 'shared-ai', join(root, 'ai'), region)
      group.title = 'Shared AI storage (not attributed to projects)'
      group.note = 'shared-ai'
      return { group, kind: 'ai' }
    }
    const group = this.group(scan, 'working-shared', root, region)
    if (parts[0] === 'reset-recovery') return { group, kind: 'recovery' }
    if (parts[0] === 'file-operations') {
      if (parts.length === 3 && isId(parts[1]) && ['save.json', 'backup.json'].includes(parts[2]))
        await this.journal(scan, path)
      const name = basename(path)
      return {
        group,
        kind:
          ['save.json', 'backup.json', 'previous-removal-v1.json'].includes(name) ||
          (parts.length === 4 &&
            isId(parts[1]) &&
            parts[2] === 'payload-removals-v1' &&
            /^[a-f0-9]{64}\.json$/.test(parts[3]))
            ? 'operations'
            : name === 'incoming.collie'
              ? 'recovery'
              : 'unclassified'
      }
    }
    if (
      ['retention-actions', 'working-copy-locators', 'workspace-retirements'].includes(parts[0]) &&
      parts.length === 2 &&
      parts[1].endsWith('.json') &&
      isId(parts[1].slice(0, -5))
    )
      return { group, kind: 'operations' }
    if (parts[0] === 'settings' || /^\.lock/.test(basename(path)))
      return { group, kind: 'operations' }
    return { group, kind: 'unclassified' }
  }
  private async walk(
    scan: Scan,
    root: string,
    path: string,
    region: InventoryRegion,
    depth = 0
  ): Promise<void> {
    this.check(scan)
    if (region === 'application' && within(this.working, path)) return
    if (
      region === 'working' &&
      pathKey(this.application) !== pathKey(this.working) &&
      within(this.working, this.application) &&
      within(this.application, path)
    )
      return
    if (path.length > 4096 || depth > 48) {
      this.add(scan, this.group(scan, `${region}-shared`, root, region), 'unclassified', null)
      return
    }
    scan.visited++
    if (scan.visited % 32 === 0) await yieldTurn()
    let info: BigIntStats
    try {
      await this.safePath(scan, path)
      info = await lstat(path, { bigint: true })
      if (!within(await realpath(root), await realpath(path))) throw new Error('outside')
      if (!info.isFile() && !info.isDirectory()) throw new Error('special')
    } catch {
      this.add(scan, this.group(scan, `${region}-shared`, root, region), 'unclassified', null)
      return
    }
    const identity = info.ino ? `${info.dev}:${info.ino}` : pathKey(path)
    if (info.isDirectory()) {
      if (scan.directories.has(identity)) return
      scan.directories.add(identity)
      if (region === 'working') {
        const parts = relative(root, path).split(sep)
        if (parts.length === 3 && parts[0] === 'workspaces' && isId(parts[1]) && isId(parts[2]))
          await this.workspace(scan, path, { projectId: parts[1], workspaceId: parts[2] })
      }
      try {
        const directory = await opendir(path)
        for await (const entry of directory)
          await this.walk(scan, root, join(path, entry.name), region, depth + 1)
      } catch (error) {
        if (
          scan.controller.signal.aborted ||
          (error instanceof Error && error.message === 'limited')
        )
          throw error
        this.add(scan, this.group(scan, `${region}-shared`, root, region), 'unclassified', null)
      }
    } else {
      if (scan.files.has(identity)) {
        scan.duplicates++
        return
      }
      scan.files.add(identity)
      const { group, kind } =
        info.nlink > 1n
          ? {
              group: this.group(scan, `${region}-shared`, root, region),
              kind: 'unclassified' as const
            }
          : await this.classify(scan, root, path, region)
      this.add(
        scan,
        group,
        kind,
        !info.ino && info.nlink > 1n ? null : info,
        kind === 'ai' && group.scope ? join(root, 'ai') : group.path
      )
    }
  }
  private async run(scan: Scan): Promise<void> {
    const expiry = setTimeout(() => {
      if (scan.stopReason) return
      scan.stopReason = 'limited'
      scan.state = 'limited'
      scan.controller.abort()
      scan.asOf = new Date().toISOString()
    }, 30_000)
    try {
      for (const root of [this.working, this.application]) {
        try {
          await this.safePath(scan, root)
          const info = await lstat(root, { bigint: true })
          if (info.isDirectory()) this.volume(scan, String(info.dev), root)
        } catch {
          this.check(scan)
        }
      }
      await this.walk(scan, this.working, this.working, 'working')
      await this.walk(scan, this.application, this.application, 'application')
      for (const hint of scan.external.values()) {
        this.check(scan)
        scan.visited++
        let info: BigIntStats | null = null
        try {
          await this.safePath(scan, hint.path)
          const observed = await lstat(hint.path, { bigint: true })
          if (!observed.isFile() || observed.nlink !== 1n) throw new Error('unavailable')
          const identity = observed.ino ? `${observed.dev}:${observed.ino}` : pathKey(hint.path)
          if (scan.files.has(identity)) {
            scan.duplicates++
            continue
          }
          scan.files.add(identity)
          info = observed
        } catch {
          this.check(scan)
        }
        const group = this.group(
          scan,
          `external:${pathKey(hint.path)}`,
          hint.path,
          'external',
          hint.scope
        )
        group.title =
          hint.kind === 'selected'
            ? 'Recorded selected project file'
            : hint.kind === 'previous'
              ? 'Recorded previous file (ownership unverified)'
              : hint.kind === 'backup'
                ? 'Recorded backup file (ownership unverified)'
                : 'Recorded external file (multiple associations; ownership unverified)'
        if (hint.scope) {
          const project = scan.groups.get(
            join(this.working, 'workspaces', hint.scope.projectId, hint.scope.workspaceId)
          )
          if (project) group.title = `${group.title} · ${project.title}`.slice(0, 500)
        }
        group.note = 'recorded-location'
        this.add(scan, group, hint.kind, info)
      }
      await this.capacities(scan)
      this.check(scan)
      scan.state = 'complete'
    } catch (error) {
      scan.state = scan.stopReason
        ? scan.stopReason
        : error instanceof Error && error.message === 'limited'
          ? 'limited'
          : 'failed'
    } finally {
      clearTimeout(expiry)
      scan.asOf = new Date().toISOString()
    }
  }
}
