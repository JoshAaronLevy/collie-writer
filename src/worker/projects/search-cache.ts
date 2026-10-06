import Database from 'better-sqlite3'
import { constants, lstatSync, unlinkSync, type BigIntStats } from 'node:fs'
import { lstat, open, opendir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record, isOpenInput, type OpenInput } from '../../shared/projects'
import { isId } from '../../domain/editor/schema'
import {
  isSearchCacheView,
  isCacheFileView,
  type SearchCacheView,
  type SearchCacheInput,
  type CacheFileView
} from '../../shared/search-cache'
import { directory, syncDirectory, writeJson } from '../storage/files'
import { searchProjection } from './search-schema'
import type { LocalSearch } from './search'

type Identity = { dev: string; ino: string; size: number; mtime: string; ctime: string }
type File = { view: CacheFileView; identity: Identity | null }
export type CacheOwner = {
  workspace: string
  db: Database.Database
  operations: Database.Database
  search: LocalSearch | null
  stopSearch: () => void
}
type Review = {
  view: SearchCacheView
  files: File[]
  mapping: string
  directory: string
  expires: number
}
type Receipt = { version: 1; view: SearchCacheView; files: File[] }
const identity = (s: BigIntStats): Identity => {
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1n ||
    s.ino === 0n ||
    s.size < 0n ||
    s.size > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new ProjectError('DENIED')
  return {
    dev: String(s.dev),
    ino: String(s.ino),
    size: Number(s.size),
    mtime: String(s.mtimeNs),
    ctime: String(s.ctimeNs)
  }
}
const equal = (a: Identity | null, b: Identity | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
const objectId = (s: BigIntStats): string => `${s.dev}:${s.ino}`
const base = (name: string): string | null => {
  const b = name.replace(/-(wal|shm|journal)$/, '')
  return b === 'search.sqlite' ||
    (b.startsWith('search.sqlite.retained-') && isId(b.slice('search.sqlite.retained-'.length)))
    ? b
    : null
}
/** No redirected ancestors, links, hard links or special files enter a deletion proof. */
function guard(path: string): void {
  let current = path
  for (let i = 0; i < 128; i++) {
    const s = lstatSync(current)
    if (!s.isDirectory() || s.isSymbolicLink()) throw new ProjectError('DENIED')
    const parent = dirname(current)
    if (parent === current) return
    current = parent
  }
  throw new ProjectError('DENIED')
}
function observe(path: string): Identity | null {
  guard(dirname(path))
  try {
    return identity(lstatSync(path, { bigint: true }))
  } catch (error) {
    if (record(error) && error.code === 'ENOENT') return null
    throw error
  }
}
async function bytes(path: string, maximum: number): Promise<Buffer> {
  const before = observe(path)
  if (!before || before.size > maximum) throw new ProjectError('LIMIT_EXCEEDED')
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    if (!equal(before, identity(await fd.stat({ bigint: true }))))
      throw new ProjectError('EXTERNAL_CHANGE')
    const buffer = Buffer.alloc(before.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const read = await fd.read(buffer, offset, buffer.length - offset, offset)
      if (!read.bytesRead) break
      offset += read.bytesRead
    }
    if (
      offset !== before.size ||
      !equal(before, identity(await fd.stat({ bigint: true }))) ||
      !equal(before, observe(path))
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return buffer.subarray(0, offset)
  } finally {
    await fd.close()
  }
}
function isIdentity(v: unknown): v is Identity {
  return (
    record(v) &&
    exact(v, ['dev', 'ino', 'size', 'mtime', 'ctime']) &&
    ['dev', 'ino', 'mtime', 'ctime'].every(
      (k) => typeof v[k] === 'string' && /^-?\d{1,30}$/.test(v[k] as string)
    ) &&
    Number.isSafeInteger(v.size) &&
    Number(v.size) >= 0
  )
}
/** All callers hold ProjectRepository.serial and the active project's exclusive lock. */
export class SearchCache {
  private reviews = new Map<string, Review>()
  constructor(
    private readonly root: string,
    private readonly nativeBinding?: string
  ) {}
  private workspace(scope: OpenInput): string {
    return join(this.root, 'workspaces', scope.projectId, scope.workspaceId)
  }
  private async mapping(owner: CacheOwner): Promise<string> {
    guard(owner.workspace)
    const db = observe(owner.db.name)
    if (!db) throw new ProjectError('NOT_FOUND')
    const path = join(owner.workspace, 'active.json')
    const pointer = observe(path) ? await bytes(path, 4096) : Buffer.from('default')
    return `${db.dev}:${db.ino}:${createHash('sha256').update(pointer).digest('hex')}`
  }
  private async list(workspace: string): Promise<{ files: File[]; limited: boolean }> {
    guard(workspace)
    const files: File[] = []
    let visited = 0,
      limited = false
    const dir = await opendir(workspace)
    for await (const entry of dir) {
      if (++visited > 2000 || files.length >= 128) {
        limited = true
        break
      }
      if (!entry.name.startsWith('search.sqlite')) continue
      let proof: Identity | null = null
      try {
        proof = observe(join(workspace, entry.name))
      } catch {
        /* Retain unsafe entries. */
      }
      if (
        !isCacheFileView({
          name: entry.name,
          bytes: proof?.size ?? null,
          status: 'retained',
          reason: ''
        })
      ) {
        limited = true
        continue
      }
      files.push({
        identity: proof,
        view: {
          name: entry.name,
          bytes: proof?.size ?? null,
          status: 'retained',
          reason: 'Cache identity is unverified; retained.'
        }
      })
    }
    return { files: files.sort((a, b) => a.view.name.localeCompare(b.view.name)), limited }
  }
  private async projection(path: string, owner: CacheOwner): Promise<boolean> {
    // Inspect a bounded, sidecar-free copy entirely in memory. No SQLite connection touches the file.
    const image = await bytes(path, 32 * 1024 ** 2)
    if (image.length < 100 || image.subarray(0, 16).toString('binary') !== 'SQLite format 3\0')
      return false
    image[18] = image[19] = 1 // SQLite's documented deserialize WAL-header conversion, in memory only.
    const db = new Database(image, {
      readonly: true,
      ...(this.nativeBinding ? { nativeBinding: this.nativeBinding } : {})
    })
    try {
      db.pragma('trusted_schema=OFF')
      return searchProjection(db, owner.operations, true)
    } finally {
      db.close()
    }
  }
  async preview(owner: CacheOwner, input: SearchCacheInput): Promise<SearchCacheView> {
    const prior = await this.status(input.scope, input.id)
    if (prior.phase !== 'not-started') return prior
    const { files, limited } = await this.list(owner.workspace)
    let inspected = 0
    for (const file of files) {
      const name = file.view.name,
        family = base(name)
      if (!file.identity || !family) continue
      if (family === 'search.sqlite') {
        const main = files.find((f) => f.view.name === family)
        const siblings = files.filter((f) => base(f.view.name) === family)
        if (
          !limited &&
          owner.search &&
          main?.identity &&
          `${main.identity.dev}:${main.identity.ino}` === owner.search.identity &&
          owner.search.disposable(owner.operations) &&
          siblings.every(
            (f) =>
              !!f.identity &&
              owner.search!.ownsFile(f.view.name, `${f.identity.dev}:${f.identity.ino}`)
          )
        ) {
          file.view.status = 'eligible'
          file.view.reason =
            name === family
              ? 'Current verified search projection; rebuilt from committed project content.'
              : 'Managed by the verified search connection; SQLite closes these sidecars before file removal.'
        } else
          file.view.reason =
            'Current cache could not be proven through its search owner. Open Search to load it, then review again; uncertain files stay retained.'
      } else if (
        name === family &&
        !files.some((f) => f.view.name !== name && base(f.view.name) === family) &&
        !limited
      ) {
        if (++inspected > 4 || file.identity.size > 32 * 1024 ** 2) {
          file.view.reason = 'Retained copy exceeds the bounded inspection allowance; kept.'
          continue
        }
        try {
          if (
            (await this.projection(join(owner.workspace, name), owner)) &&
            equal(file.identity, observe(join(owner.workspace, name)))
          ) {
            file.view.status = 'eligible'
            file.view.reason =
              'Verified retained search schema and a search job belonging to this workspace.'
          }
        } catch {
          /* Invalid, changed or unreadable copies remain retained. */
        }
      } else
        file.view.reason =
          'Sidecar-bearing or unrecognized retained copy; complete cache identity cannot be established without recovery. Kept.'
    }
    const view: SearchCacheView = {
      id: input.id,
      scope: input.scope,
      reviewId: randomUUID(),
      head: (
        owner.db
          .prepare('SELECT head_commit_id FROM projects WHERE id=?')
          .get(input.scope.projectId) as { head_commit_id: string }
      ).head_commit_id,
      phase: 'preview',
      path: owner.workspace,
      at: new Date().toISOString(),
      limited,
      files: files.map((f) => ({ ...f.view }))
    }
    this.reviews.set(input.id, {
      view: structuredClone(view),
      files,
      mapping: await this.mapping(owner),
      directory: objectId(await lstat(owner.workspace, { bigint: true })),
      expires: Date.now() + 5 * 60_000
    })
    if (this.reviews.size > 16) this.reviews.delete(this.reviews.keys().next().value!)
    return view
  }
  async status(scope: OpenInput, id: string): Promise<SearchCacheView> {
    const workspace = this.workspace(scope),
      path = join(workspace, 'cache-actions', `${id}.json`)
    const empty: SearchCacheView = {
      id,
      scope,
      reviewId: null,
      head: null,
      phase: 'not-started',
      path: workspace,
      at: new Date().toISOString(),
      limited: false,
      files: []
    }
    guard(workspace)
    {
      try {
        guard(dirname(path))
      } catch (error) {
        if (record(error) && error.code === 'ENOENT') return empty
        throw error
      }
      if (!observe(path)) return empty
      const v: unknown = JSON.parse((await bytes(path, 256 * 1024)).toString('utf8'))
      if (
        !record(v) ||
        !exact(v, ['version', 'view', 'files']) ||
        v.version !== 1 ||
        !isSearchCacheView(v.view) ||
        v.view.id !== id ||
        v.view.path !== workspace ||
        !isOpenInput(v.view.scope) ||
        v.view.scope.projectId !== scope.projectId ||
        v.view.scope.workspaceId !== scope.workspaceId ||
        !['interrupted', 'complete'].includes(v.view.phase) ||
        !Array.isArray(v.files) ||
        v.files.length !== v.view.files.length ||
        !v.files.every(
          (f, i) =>
            record(f) &&
            exact(f, ['view', 'identity']) &&
            JSON.stringify(f.view) === JSON.stringify((v.view as SearchCacheView).files[i]) &&
            (f.identity === null || isIdentity(f.identity))
        )
      )
        throw new ProjectError('CORRUPT_PROJECT')
      return {
        ...v.view,
        files: v.view.files.map((f) =>
          f.status === 'eligible'
            ? {
                ...f,
                status: 'unknown',
                reason:
                  'Interrupted outcome. This receipt will not repeat deletion; review remaining files separately.'
              }
            : f
        )
      }
    }
  }
  async clear(
    owner: CacheOwner,
    input: Extract<SearchCacheInput, { kind: 'clear' }>
  ): Promise<SearchCacheView> {
    const prior = await this.status(input.scope, input.id)
    if (prior.phase !== 'not-started') return prior // Replays only report. Never unlink a replacement.
    const review = this.reviews.get(input.id)
    if (
      !review ||
      review.expires < Date.now() ||
      review.view.reviewId !== input.reviewId ||
      review.view.scope.projectId !== input.scope.projectId ||
      review.view.scope.workspaceId !== input.scope.workspaceId
    )
      throw new ProjectError('STALE_REVISION')
    const head = (
      owner.db
        .prepare('SELECT head_commit_id FROM projects WHERE id=?')
        .get(input.scope.projectId) as { head_commit_id: string }
    ).head_commit_id
    const fresh = await this.list(owner.workspace)
    if (
      review.view.head !== head ||
      review.mapping !== (await this.mapping(owner)) ||
      review.directory !== objectId(await lstat(owner.workspace, { bigint: true })) ||
      fresh.limited ||
      JSON.stringify(fresh.files.map((f) => [f.view.name, f.identity])) !==
        JSON.stringify(review.files.map((f) => [f.view.name, f.identity]))
    )
      throw new ProjectError('STALE_REVISION')
    if (!review.files.some((f) => f.view.status === 'eligible')) throw new ProjectError('DENIED')
    const current = review.files.filter(
      (f) => base(f.view.name) === 'search.sqlite' && f.view.status === 'eligible'
    )
    if (current.length && (!owner.search || !owner.search.disposable(owner.operations)))
      throw new ProjectError('STALE_REVISION')
    const folder = join(owner.workspace, 'cache-actions')
    await directory(this.root, folder)
    guard(folder)
    const receiptDirectory = objectId(lstatSync(folder, { bigint: true }))
    let count = 0
    const dir = await opendir(folder)
    for await (const entry of dir) {
      if (entry.name && ++count >= 128) throw new ProjectError('LIMIT_EXCEEDED')
    }
    const receipt: Receipt = {
      version: 1,
      view: { ...structuredClone(review.view), phase: 'interrupted' },
      files: structuredClone(review.files)
    }
    const persist = async (): Promise<void> => {
      guard(folder)
      if (objectId(lstatSync(folder, { bigint: true })) !== receiptDirectory)
        throw new ProjectError('EXTERNAL_CHANGE')
      receipt.view.files = receipt.files.map((f) => ({ ...f.view }))
      await writeJson(join(folder, `${input.id}.json`), receipt)
    }
    await persist() // A durable exact reviewed set precedes any index cancellation/close/removal.
    this.reviews.delete(input.id)
    if (review.mapping !== (await this.mapping(owner))) throw new ProjectError('STALE_REVISION')
    if (current.length) {
      guard(owner.workspace)
      if (objectId(lstatSync(owner.workspace, { bigint: true })) !== review.directory)
        throw new ProjectError('EXTERNAL_CHANGE')
      for (const f of current)
        if (!equal(f.identity, observe(join(owner.workspace, f.view.name))))
          throw new ProjectError('STALE_REVISION')
      owner.stopSearch()
      const sidecarsRemain = ['-wal', '-shm', '-journal'].some((s) => {
        try {
          return observe(join(owner.workspace, `search.sqlite${s}`)) !== null
        } catch {
          return true
        }
      })
      for (const f of receipt.files.filter(
        (f) => base(f.view.name) === 'search.sqlite' && f.view.status === 'eligible'
      )) {
        const observed = observe(join(owner.workspace, f.view.name))
        if (!observed) {
          f.view.status = 'absent'
          f.view.reason =
            'No longer present after the search connection closed; no separate unlink counted.'
        } else if (
          f.view.name !== 'search.sqlite' ||
          sidecarsRemain ||
          observed.dev !== f.identity?.dev ||
          observed.ino !== f.identity?.ino
        ) {
          f.view.status = 'retained'
          f.view.reason = 'Identity changed or sidecars remained after close; retained.'
        } else {
          f.identity = observed
          f.view.bytes = observed.size
        }
      }
      await persist() // Checkpoint-induced changes become a new proof only under the same live owner.
    }
    for (const f of receipt.files) {
      if (f.view.status !== 'eligible') continue
      try {
        guard(owner.workspace)
        if (objectId(lstatSync(owner.workspace, { bigint: true })) !== review.directory)
          throw new ProjectError('EXTERNAL_CHANGE')
        const path = join(owner.workspace, f.view.name),
          observed = observe(path)
        if (!observed) {
          f.view.status = 'absent'
          f.view.reason = 'Already absent; no removal claimed.'
        } else if (!equal(observed, f.identity)) {
          f.view.status = 'retained'
          f.view.reason = 'Changed after review; retained.'
        } else if (['-wal', '-shm', '-journal'].some((s) => observe(path + s) !== null)) {
          f.view.status = 'retained'
          f.view.reason = 'A sidecar is now present; retained for a new review.'
        } else {
          // No asynchronous gap between final identity check and unlink under the repository owner.
          unlinkSync(path)
          f.view.status = 'removed'
          f.view.reason =
            'Verified search file removed. File length does not guarantee reclaimed physical bytes.'
          await syncDirectory(owner.workspace)
        }
      } catch {
        f.view.status = 'unknown'
        f.view.reason =
          'Removal or directory synchronization could not be confirmed. Review the inventory; this operation will not retry deletion.'
      }
      await persist()
    }
    receipt.view.phase = 'complete'
    receipt.view.at = new Date().toISOString()
    await persist()
    return receipt.view
  }
}
