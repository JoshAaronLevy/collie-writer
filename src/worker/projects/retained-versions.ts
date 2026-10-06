import { randomUUID, createHash } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { opendir } from 'node:fs/promises'
import { join, dirname, isAbsolute } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { exact, record } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import type { RetentionInput, RetentionView, RetainedVersion } from '../../shared/retained-versions'
import { directory, writeJson, syncDirectory } from '../storage/files'
import { isSavedLocation, selectedPath, type SavedLocation } from './file-state'
import { isSaveIntent, type SaveIntent } from './save-intent'
import { boundedJson, parentStamp, namedStamp, sameStamp } from './retention-files'
import { inspectRetentionArchive, RETENTION_ARCHIVE_LIMIT } from './retention-archive'
import {
  intentionallyRemovedPrevious,
  previousRemovalState,
  receiptView,
  type RetentionProof,
  type RetentionReceipt
} from './retention-receipts'

export type RetentionContext = {
  workspace: string
  destination: SavedLocation | null
  head: string
  mapping: string
}
type Metadata = {
  digest: string
  saves: Map<string, SaveIntent>
  protectedPaths: Set<string>
  protectedObjects: Set<string>
  complete: boolean
}
type Candidate = { target: RetentionProof; replacement: RetentionProof; current: RetentionProof }
type Review = {
  view: RetentionView
  context: string
  candidates: Map<string, Candidate>
  expires: number
}
const hash = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const previousPath = (s: SaveIntent): string =>
  join(dirname(s.path), `.collie-${s.id}.previous.collie`)
const pathKey = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s)
async function names(folder: string, maximum: number): Promise<string[]> {
  parentStamp(join(folder, 'entry'))
  const out: string[] = [],
    dir = await opendir(folder)
  for await (const entry of dir) {
    if (out.length >= maximum) throw new ProjectError('LIMIT_EXCEEDED')
    out.push(entry.name)
  }
  return out.sort()
}
/** Called only while ProjectFiles maintenance and the repository serial boundary are held. */
export class RetainedVersions {
  private reviews = new Map<string, Review>()
  constructor(
    private readonly root: string,
    private readonly nativeBinding?: string
  ) {}
  private async metadata(omitMarker?: string): Promise<Metadata> {
    const saves = new Map<string, SaveIntent>(),
      protectedPaths = new Set<string>(),
      protectedObjects = new Set<string>(),
      evidence: unknown[] = []
    let complete = true
    const jobs = join(this.root, 'file-operations')
    for (const id of await names(jobs, 4096)) {
      if (!isId(id)) {
        if (id !== '.DS_Store') {
          complete = false
          evidence.push(id)
        }
        continue
      }
      try {
        const marker = join(jobs, id, 'previous-removal-v1.json')
        if (id !== omitMarker)
          evidence.push([
            id,
            'removal-marker',
            namedStamp(marker) ? boundedJson(marker, 1024) : null
          ])
      } catch {
        complete = false
        evidence.push([id, 'unreadable-removal-marker'])
      }
      for (const name of ['save.json', 'backup.json']) {
        const path = join(jobs, id, name)
        try {
          if (!namedStamp(path)) continue
          const raw = boundedJson(path, 32768)
          evidence.push([id, name, raw])
          if (!isSaveIntent(raw) || raw.id !== id) {
            complete = false
            continue
          }
          if (!isAbsolute(raw.path)) {
            complete = false
            continue
          }
          protectedPaths.add(pathKey(raw.path))
          if (name === 'save.json') saves.set(id, raw)
        } catch {
          complete = false
          evidence.push([id, name, 'unreadable'])
        }
      }
    }
    // Read destination records only. Do not acquire/migrate projects or reconcile their journals.
    const workspaces = join(this.root, 'workspaces')
    for (const projectId of await names(workspaces, 2048)) {
      if (!isId(projectId)) {
        if (projectId !== '.DS_Store') {
          complete = false
          evidence.push(projectId)
        }
        continue
      }
      try {
        for (const workspaceId of await names(join(workspaces, projectId), 32)) {
          if (!isId(workspaceId)) {
            if (
              workspaceId !== '.DS_Store' &&
              !/^owner\.sqlite(?:-(?:wal|shm|journal))?$/.test(workspaceId)
            )
              complete = false
            continue
          }
          const path = join(workspaces, projectId, workspaceId, 'destination-v1.json')
          let destination: SavedLocation | null = null
          if (namedStamp(path)) {
            const raw = boundedJson(path, 16384)
            if (
              !record(raw) ||
              !exact(raw, ['version', 'destination']) ||
              raw.version !== 1 ||
              !isSavedLocation(raw.destination)
            )
              throw new ProjectError('CORRUPT_PROJECT')
            destination = raw.destination
          }
          evidence.push([projectId, workspaceId, destination])
          if (destination) protectedPaths.add(pathKey(destination.path))
        }
      } catch {
        complete = false
        evidence.push([projectId, 'unreadable'])
      }
    }
    // Also protect aliases of selected and explicit output files on case-insensitive volumes.
    for (const path of protectedPaths) {
      try {
        const identity = namedStamp(path)
        evidence.push(['protected-path', path, identity])
        if (identity) protectedObjects.add(`${identity.dev}:${identity.ino}`)
      } catch {
        complete = false
        evidence.push(['protected-path', path, 'unavailable'])
      }
    }
    return { saves, protectedPaths, protectedObjects, complete, digest: hash([evidence, complete]) }
  }
  private context(context: RetentionContext, metadata: Metadata): string {
    return hash([context, metadata.digest])
  }
  private async proof(path: string): Promise<RetentionProof> {
    if ((await selectedPath(this.root, path)) !== path) throw new ProjectError('DENIED')
    const p = await inspectRetentionArchive(path, this.nativeBinding)
    return {
      path,
      identity: p.identity,
      parent: p.parent,
      sha256: p.sha256,
      projectId: p.manifest.projectId,
      snapshotId: p.manifest.snapshotId,
      head: p.manifest.headCommitId,
      createdAt: p.manifest.createdAt
    }
  }
  private matches(proof: RetentionProof, intent: SaveIntent): boolean {
    return (
      proof.sha256 === intent.candidateHash &&
      proof.projectId === intent.scope.projectId &&
      proof.snapshotId === intent.snapshotId &&
      proof.head === intent.head
    )
  }
  async preview(
    context: RetentionContext,
    input: Extract<RetentionInput, { kind: 'preview' }>
  ): Promise<RetentionView> {
    const prior = receiptView(this.root, input.scope, input.id)
    if (prior.phase !== 'not-started') return prior
    const view: RetentionView = {
      id: input.id,
      scope: input.scope,
      reviewId: randomUUID(),
      head: context.head,
      at: new Date().toISOString(),
      phase: 'preview',
      limited: false,
      offset: input.offset,
      hasOlder: false,
      message:
        'One previous Save version can be selected. The newest previous version and each selected version’s verified replacement stay protected. No Undo is available after removal.',
      files: []
    }
    const metadata = await this.metadata(),
      destination = context.destination
    const candidates = new Map<string, Candidate>()
    let budget = 3 * 1024 ** 3,
      inspections = 0
    const proofs = new Map<string, RetentionProof | null>()
    const inspect = async (path: string): Promise<RetentionProof | null> => {
      if (proofs.has(path)) return proofs.get(path)!
      try {
        const file = namedStamp(path)
        if (!file) {
          proofs.set(path, null)
          return null
        }
        if (file.size > RETENTION_ARCHIVE_LIMIT || file.size > budget || ++inspections > 6) {
          view.limited = true
          proofs.set(path, null)
          return null
        }
        budget -= file.size
        const proof = await this.proof(path)
        proofs.set(path, proof)
        return proof
      } catch (error) {
        if (error instanceof ProjectError && error.code === 'LIMIT_EXCEEDED') view.limited = true
        proofs.set(path, null)
        return null
      }
    }
    let current: RetentionProof | null = null
    if (destination) current = await inspect(destination.path)
    if (!destination)
      view.message = 'Save this project to a selected file before reviewing its previous versions.'
    else if (
      !current ||
      current.projectId !== input.scope.projectId ||
      current.sha256 !== destination.fingerprint.sha256 ||
      current.snapshotId !== destination.snapshotId ||
      current.head !== destination.headCommitId
    )
      view.message =
        'The selected file could not be verified against its acknowledgment. Previous versions remain protected.'
    if (!metadata.complete)
      view.message =
        'Some operation/destination records are unreadable or unrecognized. Previous versions remain protected.'
    let id = destination?.generationId ?? null,
      newer: SaveIntent | null = null,
      chain = true
    const seen = new Set<string>()
    let skipped = 0
    while (id && view.files.length < 4) {
      if (seen.has(id)) {
        view.limited = true
        break
      }
      seen.add(id)
      const intent = metadata.saves.get(id)
      if (!intent) {
        view.limited = true
        break
      }
      const within =
        sameScope(intent.scope, input.scope) &&
        intent.path === destination?.path &&
        intent.grantId === destination?.grantId &&
        intent.phase === 'acknowledged'
      chain =
        chain &&
        within &&
        (newer
          ? newer.expected?.sha256 === intent.candidateHash
          : !!current && this.matches(current, intent))
      if (intent.expected && skipped++ >= input.offset) {
        const path = previousPath(intent),
          row: RetainedVersion = {
            id: intent.id,
            path,
            bytes: null,
            createdAt: null,
            projectId: null,
            snapshotId: null,
            head: null,
            state: 'protected',
            reason: 'Ownership, acknowledgment or replacement could not be verified.'
          }
        if (intentionallyRemovedPrevious(this.root, intent.id, path)) {
          row.state = 'removed'
          row.reason = 'Intentionally removed by an earlier confirmed retention action.'
        } else if (
          !['none', 'retryable'].includes(previousRemovalState(this.root, intent.id, path))
        ) {
          row.reason =
            'An earlier removal is unresolved, or a file reappeared after removal. It stays protected; the old action cannot authorize deleting a replacement.'
        } else {
          let missing = false
          try {
            const file = namedStamp(path)
            missing = file === null
            row.bytes = file?.size ?? null
          } catch {
            /* Unknown identity stays protected. */
          }
          const target = await inspect(path)
          if (target) {
            row.bytes = target.identity.size
            row.createdAt = target.createdAt
            row.projectId = target.projectId
            row.snapshotId = target.snapshotId
            row.head = target.head
          }
          const replacement = newer ? await inspect(previousPath(newer)) : current
          if (!newer) row.reason = 'Newest previous version is protected.'
          else if (!chain)
            row.reason =
              'Save chain, acknowledged outcome or current destination grant is unverified; retained.'
          else if (
            metadata.protectedPaths.has(pathKey(path)) ||
            (target &&
              metadata.protectedObjects.has(`${target.identity.dev}:${target.identity.ino}`))
          )
            row.reason =
              'This path is a selected file or an explicit Save/Backup destination; retained.'
          else if (target && target.projectId !== input.scope.projectId)
            row.reason =
              'The archive belongs to a different project. The initiating Save does not grant project ownership.'
          else if (!metadata.complete)
            row.reason = 'Unknown operation/destination records prevent removal.'
          else if (
            target &&
            target.sha256 === intent.expected.sha256 &&
            target.identity.size === Number(intent.expected.size) &&
            replacement &&
            this.matches(replacement, intent) &&
            current &&
            destination &&
            current.projectId === input.scope.projectId &&
            current.sha256 === destination.fingerprint.sha256 &&
            current.snapshotId === destination.snapshotId &&
            current.head === destination.headCommitId &&
            target.projectId === input.scope.projectId
          ) {
            row.state = 'eligible'
            row.reason =
              'Verified previous Save version. Its newer replacement and current selected file remain retained.'
            candidates.set(intent.id, { target, replacement, current })
          } else
            row.reason =
              'Archive/hash inspection or the newer replacement proof is unavailable; retained.'
          if (!target && missing) {
            row.state = 'absent'
            row.reason =
              'No previous file is present at the recorded path; no intentional removal is confirmed.'
          }
        }
        view.files.push(row)
      }
      newer = intent
      id = intent.priorGeneration
    }
    view.hasOlder = !!id && view.files.length === 4 && !seen.has(id)
    if (id && !view.hasOlder) view.limited = true
    view.files.reverse() // Oldest inspected copies first; there is no automatic selection.
    this.reviews.set(input.id, {
      view: structuredClone(view),
      context: this.context(context, metadata),
      candidates,
      expires: Date.now() + 5 * 60_000
    })
    if (this.reviews.size > 8) this.reviews.delete(this.reviews.keys().next().value!)
    return view
  }
  async remove(
    context: RetentionContext,
    recheck: () => RetentionContext,
    input: Extract<RetentionInput, { kind: 'remove' }>
  ): Promise<RetentionView> {
    const prior = receiptView(this.root, input.scope, input.id)
    if (prior.phase !== 'not-started') return prior
    const review = this.reviews.get(input.id),
      candidate = review?.candidates.get(input.artifactId)
    if (
      !review ||
      !candidate ||
      review.expires < Date.now() ||
      review.view.reviewId !== input.reviewId ||
      !sameScope(review.view.scope, input.scope)
    )
      throw new ProjectError('STALE_REVISION')
    const metadata = await this.metadata()
    if (
      !metadata.complete ||
      review.context !== this.context(context, metadata) ||
      metadata.protectedPaths.has(pathKey(candidate.target.path)) ||
      metadata.protectedObjects.has(
        `${candidate.target.identity.dev}:${candidate.target.identity.ino}`
      )
    )
      throw new ProjectError('STALE_REVISION')
    // Fresh archive/hash proofs, with the file owner and repository held throughout.
    for (const expected of [candidate.target, candidate.replacement, candidate.current]) {
      const actual = await this.proof(expected.path)
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new ProjectError('EXTERNAL_CHANGE')
    }
    if (review.context !== this.context(context, await this.metadata()))
      throw new ProjectError('STALE_REVISION')
    if (
      !['none', 'retryable'].includes(
        previousRemovalState(this.root, input.artifactId, candidate.target.path)
      )
    )
      throw new ProjectError('STALE_REVISION')
    const folder = join(this.root, 'retention-actions')
    await directory(this.root, folder)
    if ((await names(folder, 1024)).length >= 1024) throw new ProjectError('LIMIT_EXCEEDED')
    const receipt: RetentionReceipt = {
      version: 1,
      view: {
        ...review.view,
        phase: 'interrupted',
        files: [structuredClone(review.view.files.find((f) => f.id === input.artifactId)!)]
      },
      selected: input.artifactId,
      context: review.context,
      ...candidate
    }
    const receiptPath = join(folder, `${input.id}.json`),
      receiptParent = parentStamp(receiptPath)
    const persist = async (): Promise<void> => {
      if (receiptParent !== parentStamp(receiptPath)) throw new ProjectError('EXTERNAL_CHANGE')
      await writeJson(receiptPath, receipt)
    }
    await persist()
    this.reviews.delete(input.id)
    // A discovery reference precedes unlink; it only hides a confirmed removed AND absent file.
    const baselineWithoutMarker = this.context(recheck(), await this.metadata(input.artifactId))
    if (review.context !== this.context(recheck(), await this.metadata()))
      throw new ProjectError('STALE_REVISION')
    const marker = join(this.root, 'file-operations', input.artifactId, 'previous-removal-v1.json')
    parentStamp(marker)
    await writeJson(marker, { version: 1, actionId: input.id })
    const row = receipt.view.files[0]
    let attempted = false
    try {
      if (baselineWithoutMarker !== this.context(recheck(), await this.metadata(input.artifactId)))
        throw new ProjectError('STALE_REVISION')
      for (const proof of [candidate.target, candidate.replacement, candidate.current]) {
        if (
          parentStamp(proof.path) !== proof.parent ||
          !sameStamp(namedStamp(proof.path), proof.identity)
        )
          throw new ProjectError('EXTERNAL_CHANGE')
      }
      // There is no asynchronous gap from the final identities to removal.
      attempted = true
      unlinkSync(candidate.target.path)
      await syncDirectory(dirname(candidate.target.path))
      row.state = 'removed'
      row.reason =
        'Confirmed removed. Recorded bytes are file length, not guaranteed reclaimed physical space.'
    } catch {
      row.state = attempted ? 'unknown' : 'changed'
      row.reason = attempted
        ? 'Removal or directory persistence was not confirmed. This action will never retry deletion.'
        : 'Identity or owner records changed or became unavailable. No removal was attempted; review again.'
    }
    receipt.view.phase = 'complete'
    receipt.view.at = new Date().toISOString()
    receipt.view.message =
      'Removal outcome recorded. Keep retained replacements; no automatic deletion or Undo follows.'
    await persist()
    return receipt.view
  }
}
