import { randomUUID } from 'node:crypto'
import { lstatSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import type { OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import type { RetainedVersion, RetentionInput, RetentionView } from '../../shared/retained-versions'
import { requestDigest } from '../storage/digest'
import { directory, syncDirectory, writeJson } from '../storage/files'
import { entriesFor } from './manifest'
import { selectedPath } from './file-state'
import { isSaveIntent, type SaveIntent } from './save-intent'
import type { SnapshotJob } from './snapshot-jobs'
import type { RetentionContext } from './retained-versions'
import {
  inspectRetentionArchive,
  RETENTION_ARCHIVE_LIMIT,
  type ArchiveProof
} from './retention-archive'
import {
  boundedJson,
  inspectRetentionPayload,
  namedStamp,
  parentStamp,
  retentionNames,
  sameStamp,
  type PayloadProof
} from './retention-files'
import type { RetentionProof } from './retention-receipts'
import {
  artifactPath,
  artifactMarker,
  localArtifactOutcome,
  localArtifactRemovalState,
  readLocalArtifactReceipt,
  LOCAL_ARTIFACT_CLASSES,
  type LocalArtifact,
  type LocalArtifactReceipt
} from './local-artifact-receipts'

type ReadJob = (id: string) => SnapshotJob
type Item = { path: string; artifact: LocalArtifact | null; reason: string }
type Proof = {
  artifact: LocalArtifact
  target: PayloadProof
  replacement: RetentionProof
  context: string
}
type Review = { view: RetentionView; candidates: Map<string, Proof>; expires: number }
type Owner = { intent: SaveIntent; job: SnapshotJob; digest: string }
class Retained extends Error {}
function requireProof(value: unknown, reason: string): asserts value {
  if (!value) throw new Retained(reason)
}
function exists(path: string): boolean {
  parentStamp(path)
  return !!lstatSync(path, { throwIfNoEntry: false })
}
/** Runs only inside ProjectFiles, repository and SnapshotJobs retention owners. */
export class LocalArtifacts {
  private reviews = new Map<string, Review>()
  constructor(
    private readonly root: string,
    private readonly nativeBinding?: string
  ) {}

  private owner(
    context: RetentionContext,
    scope: OpenInput,
    a: LocalArtifact,
    readJob: ReadJob
  ): Owner {
    const folder = join(this.root, 'file-operations', a.operationId)
    const records = ['save.json', 'backup.json'].filter((name) => namedStamp(join(folder, name)))
    requireProof(
      records.length === 1,
      'An exact Save or Backup record is unavailable or ambiguous.'
    )
    const raw = boundedJson(join(folder, records[0]), 32768)
    requireProof(
      isSaveIntent(raw) && raw.id === a.operationId && sameScope(raw.scope, scope),
      'The owning operation could not be verified for this project.'
    )
    requireProof(
      raw.phase === 'acknowledged' && raw.snapshotJob === a.snapshotJob && raw.candidateHash,
      'No durable destination acknowledgment proves this payload was transferred.'
    )
    const job = readJob(a.snapshotJob)
    requireProof(
      job.id === a.snapshotJob &&
        job.projectId === scope.projectId &&
        job.manifest &&
        job.manifest.snapshotId === raw.snapshotId &&
        job.capturedHead === raw.head &&
        job.operations.length === 1 &&
        job.operations[0].id === a.operationId,
      'Snapshot ownership or other consumers are uncertain; this payload remains recovery data.'
    )
    const op = job.operations[0]
    requireProof(
      op.digest ===
        requestDigest({
          operationId: op.id,
          minimumHeadCommitId: op.minimumHead,
          parentSnapshotId: job.parentSnapshotId,
          ...(records[0] === 'backup.json' ? { expectedHeadCommitId: op.minimumHead } : {})
        }),
      'The snapshot request does not match its owning Save or Backup.'
    )
    // Exact disk metadata participates even if the in-memory destination has not changed.
    const destination = join(context.workspace, 'destination-v1.json')
    const saved = namedStamp(destination) ? boundedJson(destination, 16384) : null
    if (records[0] === 'save.json') {
      const d = context.destination
      requireProof(
        d &&
          d.generationId === raw.id &&
          d.grantId === raw.grantId &&
          d.path === raw.path &&
          d.snapshotId === raw.snapshotId &&
          d.headCommitId === raw.head &&
          d.fingerprint.sha256 === raw.candidateHash &&
          requestDigest(saved) === requestDigest({ version: 1, destination: d }),
        'This Save is not the currently acknowledged destination. Keep its retained payloads.'
      )
    }
    return { intent: raw, job, digest: requestDigest([context, saved, records[0], raw, job]) }
  }

  private async discover(
    context: RetentionContext,
    scope: OpenInput
  ): Promise<{ items: Item[]; limited: boolean }> {
    const items: Item[] = [],
      intents = new Map<string, SaveIntent>(),
      links = new Map<string, SaveIntent[]>()
    let limited = false,
      visited = 0
    const add = (path: string, artifact: LocalArtifact | null, reason = ''): void => {
      if (items.length >= 4096 || path.length > 4096) {
        limited = true
        return
      }
      items.push({ path, artifact, reason })
    }
    const children = async (path: string): Promise<string[]> => {
      const result = await retentionNames(path, 4096)
      visited += result.length
      if (visited > 16384) throw new ProjectError('LIMIT_EXCEEDED')
      return result
    }
    const inspection = async (folder: string, a: LocalArtifact | null): Promise<void> => {
      if (!exists(folder)) return
      try {
        for (const name of await children(folder)) {
          const path = join(folder, name)
          if (name === 'blobs' || name === 'citation-assets') {
            for (const leaf of await children(path)) {
              const relativePath = `${name}/${leaf}`
              add(
                join(path, leaf),
                a && /^[a-f0-9]{64}$/.test(leaf) ? { ...a, relativePath } : null,
                'Inspection ownership or entry is unverified; retained.'
              )
            }
          } else
            add(
              path,
              a && ['project.sqlite', 'manifest.json'].includes(name)
                ? { ...a, relativePath: name }
                : null,
              'Inspection ownership, entry or database sidecar is unverified; retained.'
            )
        }
      } catch {
        limited = true
        add(folder, null, 'This inspection folder could not be fully enumerated; retained.')
      }
    }
    try {
      const operations = join(this.root, 'file-operations')
      for (const id of await children(operations)) {
        if (!isId(id)) {
          if (id !== '.DS_Store') limited = true
          continue
        }
        try {
          for (const name of ['save.json', 'backup.json']) {
            const path = join(operations, id, name)
            if (!namedStamp(path)) continue
            const raw = boundedJson(path, 32768)
            if (!isSaveIntent(raw) || raw.id !== id) {
              limited = true
              continue
            }
            if (!sameScope(raw.scope, scope)) continue
            if (intents.has(id)) {
              limited = true
              continue
            }
            intents.set(id, raw)
            if (raw.snapshotJob)
              links.set(raw.snapshotJob, [...(links.get(raw.snapshotJob) ?? []), raw])
          }
        } catch {
          limited = true
        }
      }
      const snapshots = join(context.workspace, 'snapshots')
      for (const id of await children(snapshots)) {
        if (!isId(id)) {
          if (id !== '.DS_Store') limited = true
          continue
        }
        const linked = links.get(id),
          operationId = linked?.length === 1 ? linked[0].id : null
        const folder = join(snapshots, id)
        try {
          for (const [kind, name] of [
            ['candidate', 'candidate.collie'],
            ['capture', 'capture.sqlite']
          ] as const) {
            const path = join(folder, name)
            if (exists(path))
              add(
                path,
                operationId
                  ? { class: kind, operationId, snapshotJob: id, relativePath: name }
                  : null,
                `Snapshot job ${id} has no unique acknowledged transfer owner; retained.`
              )
          }
          await inspection(
            join(folder, 'inspection'),
            operationId
              ? {
                  class: 'inspection',
                  operationId,
                  snapshotJob: id,
                  relativePath: ''
                }
              : null
          )
          for (const name of await children(folder)) {
            if (
              ![
                'job.json',
                'candidate.collie',
                'capture.sqlite',
                'inspection',
                'payload-removals-v1'
              ].includes(name)
            )
              add(
                join(folder, name),
                null,
                `Untransferred or unrecognized snapshot entry for job ${id}; retained.`
              )
          }
        } catch {
          limited = true
          add(folder, null, 'Snapshot files or their identities are unavailable; retained.')
        }
      }
      for (const intent of intents.values()) {
        for (const [kind, name] of [
          ['stage', 'stage-inspection'],
          ['final', 'final-inspection']
        ] as const)
          await inspection(join(operations, intent.id, name), {
            class: kind,
            operationId: intent.id,
            snapshotJob: intent.snapshotJob ?? intent.id,
            relativePath: ''
          })
      }
    } catch {
      limited = true
    }
    return { items: items.sort((a, b) => a.path.localeCompare(b.path)), limited }
  }

  private async prove(
    context: RetentionContext,
    scope: OpenInput,
    a: LocalArtifact,
    readJob: ReadJob,
    archives = new Map<string, ArchiveProof>()
  ): Promise<Proof> {
    requireProof(
      ['none', 'retryable'].includes(localArtifactRemovalState(this.root, scope, a)),
      'An earlier removal is unresolved, or this file reappeared after removal; retained.'
    )
    const owner = this.owner(context, scope, a, readJob),
      path = artifactPath(this.root, scope, a)
    requireProof(
      (await selectedPath(this.root, owner.intent.path)) === owner.intent.path,
      'The acknowledged destination authority is unavailable.'
    )
    let archive = archives.get(owner.intent.path)
    if (!archive) {
      archive = await inspectRetentionArchive(owner.intent.path, this.nativeBinding)
      archives.set(owner.intent.path, archive)
    }
    requireProof(
      archive.sha256 === owner.intent.candidateHash &&
        requestDigest(archive.manifest) === requestDigest(owner.job.manifest),
      'The destination no longer contains this exact snapshot. Its payload remains protected.'
    )
    const target = await inspectRetentionPayload(
      path,
      a.relativePath === 'manifest.json'
        ? 1024 ** 2
        : a.relativePath.endsWith('.sqlite')
          ? 32 * 1024 ** 2
          : RETENTION_ARCHIVE_LIMIT
    )
    if (a.class === 'candidate')
      requireProof(
        target.sha256 === archive.sha256 && target.identity.size === archive.identity.size,
        'The retained candidate differs from the verified destination.'
      )
    else if (a.relativePath === 'manifest.json')
      requireProof(
        requestDigest(boundedJson(path, 1024 ** 2)) === requestDigest(archive.manifest),
        'The inspection manifest differs from the verified snapshot.'
      )
    else {
      const ref = entriesFor(archive.manifest).get(
        a.class === 'capture' ? 'project.sqlite' : a.relativePath
      )
      requireProof(
        ref && target.sha256 === ref.sha256 && target.identity.size === ref.bytes,
        'This file is not an exact payload from the verified snapshot.'
      )
      if (a.relativePath.endsWith('.sqlite'))
        requireProof(
          ['-wal', '-shm', '-journal'].every((suffix) => !exists(path + suffix)),
          'Database sidecars remain beside this copy; it stays protected.'
        )
    }
    requireProof(
      owner.digest === this.owner(context, scope, a, readJob).digest,
      'Owner records changed during inspection; review again.'
    )
    return {
      artifact: a,
      target,
      context: owner.digest,
      replacement: {
        path: owner.intent.path,
        identity: archive.identity,
        parent: archive.parent,
        sha256: archive.sha256,
        projectId: archive.manifest.projectId,
        snapshotId: archive.manifest.snapshotId,
        head: archive.manifest.headCommitId,
        createdAt: archive.manifest.createdAt
      }
    }
  }

  async preview(
    context: RetentionContext,
    input: Extract<RetentionInput, { kind: 'preview' }>,
    readJob: ReadJob
  ): Promise<RetentionView> {
    const discovery = await this.discover(context, input.scope),
      candidates = new Map<string, Proof>()
    const view: RetentionView = {
      id: input.id,
      scope: input.scope,
      reviewId: randomUUID(),
      head: context.head,
      at: new Date().toISOString(),
      phase: 'preview',
      limited: discovery.limited,
      offset: input.offset,
      hasOlder: input.offset + 4 < discovery.items.length,
      message:
        'Review individual leftover files from completed local operations. Normal successful work usually removes these copies already. No selection is automatic.',
      files: []
    }
    const archives = new Map<string, ArchiveProof>()
    for (const item of discovery.items.slice(input.offset, input.offset + 4)) {
      const row: RetainedVersion = {
        id: randomUUID(),
        path: item.path,
        bytes: null,
        createdAt: null,
        projectId: null,
        snapshotId: null,
        head: null,
        state: 'protected',
        reason: item.reason || 'Completion and destination proof are unavailable; retained.'
      }
      try {
        row.bytes = namedStamp(item.path)?.size ?? null
      } catch {
        /* Unknown stays visible. */
      }
      if (item.artifact && !discovery.limited) {
        try {
          const proof = await this.prove(context, input.scope, item.artifact, readJob, archives)
          candidates.set(row.id, proof)
          Object.assign(row, {
            bytes: proof.target.identity.size,
            projectId: proof.replacement.projectId,
            snapshotId: proof.replacement.snapshotId,
            head: proof.replacement.head,
            createdAt: proof.replacement.createdAt,
            state: 'eligible',
            reason:
              'Completed snapshot and released lease verified. Exact destination remains; operation receipts stay retained.'
          })
        } catch (error) {
          row.reason =
            error instanceof Retained
              ? error.message
              : 'Completed owner, released lease, file identity or bounded archive inspection is unavailable; retained.'
        }
      } else if (discovery.limited)
        row.reason =
          'Discovery is incomplete or contains unreadable records. No cleanup is authorized.'
      if (item.artifact)
        row.reason = `${LOCAL_ARTIFACT_CLASSES[item.artifact.class]}. Operation ${item.artifact.operationId}; snapshot job ${item.artifact.snapshotJob}. ${row.reason}`
      view.files.push(row)
    }
    this.reviews.set(input.id, {
      view: structuredClone(view),
      candidates,
      expires: Date.now() + 5 * 60_000
    })
    if (this.reviews.size > 8) this.reviews.delete(this.reviews.keys().next().value!)
    return view
  }

  async remove(
    context: RetentionContext,
    recheck: () => RetentionContext,
    input: Extract<RetentionInput, { kind: 'remove' }>,
    readJob: ReadJob
  ): Promise<RetentionView> {
    const prior = localArtifactOutcome(this.root, input.scope, input.id)
    if (prior.phase !== 'not-started') {
      if (prior.reviewId !== input.reviewId || prior.files[0]?.id !== input.artifactId)
        throw new ProjectError('OPERATION_CONFLICT')
      return prior
    }
    const review = this.reviews.get(input.id),
      proof = review?.candidates.get(input.artifactId)
    if (
      !review ||
      !proof ||
      review.expires < Date.now() ||
      review.view.reviewId !== input.reviewId ||
      !sameScope(review.view.scope, input.scope)
    )
      throw new ProjectError('STALE_REVISION')
    const fresh = await this.prove(context, input.scope, proof.artifact, readJob)
    if (requestDigest(fresh) !== requestDigest(proof)) throw new ProjectError('EXTERNAL_CHANGE')
    const folder = join(this.root, 'retention-actions')
    await directory(this.root, folder)
    await syncDirectory(this.root)
    if ((await retentionNames(folder, 1024)).length >= 1024)
      throw new ProjectError('LIMIT_EXCEEDED')
    const receipt: LocalArtifactReceipt = {
      version: 2,
      kind: 'local-artifact',
      view: {
        ...review.view,
        phase: 'interrupted',
        files: [structuredClone(review.view.files.find((f) => f.id === input.artifactId)!)]
      },
      selected: input.artifactId,
      ...proof
    }
    const receiptPath = join(folder, `${input.id}.json`),
      receiptParent = parentStamp(receiptPath)
    const persist = async (): Promise<void> => {
      if (receiptParent !== parentStamp(receiptPath)) throw new ProjectError('EXTERNAL_CHANGE')
      await writeJson(receiptPath, receipt)
    }
    await persist()
    this.reviews.delete(input.id)
    const marker = artifactMarker(this.root, input.scope, proof.artifact),
      row = receipt.view.files[0]
    let attempted = false
    try {
      if (
        proof.context !== this.owner(recheck(), input.scope, proof.artifact, readJob).digest ||
        !['none', 'retryable'].includes(
          localArtifactRemovalState(this.root, input.scope, proof.artifact)
        )
      )
        throw new ProjectError('STALE_REVISION')
      await directory(this.root, dirname(marker))
      await syncDirectory(dirname(dirname(marker)))
      const markerParent = parentStamp(marker)
      if ((await retentionNames(dirname(marker), 4096)).length >= 4096)
        throw new ProjectError('LIMIT_EXCEEDED')
      await writeJson(marker, { version: 1, actionId: input.id })
      if (
        markerParent !== parentStamp(marker) ||
        receiptParent !== parentStamp(receiptPath) ||
        requestDigest(boundedJson(marker, 1024)) !==
          requestDigest({ version: 1, actionId: input.id }) ||
        requestDigest(readLocalArtifactReceipt(this.root, input.id)) !== requestDigest(receipt)
      )
        throw new ProjectError('EXTERNAL_CHANGE')
      if (proof.context !== this.owner(recheck(), input.scope, proof.artifact, readJob).digest)
        throw new ProjectError('STALE_REVISION')
      for (const file of [proof.target, proof.replacement])
        if (
          parentStamp(file.path) !== file.parent ||
          !sameStamp(namedStamp(file.path), file.identity)
        )
          throw new ProjectError('EXTERNAL_CHANGE')
      if (
        proof.target.path.endsWith('.sqlite') &&
        ['-wal', '-shm', '-journal'].some((s) => exists(proof.target.path + s))
      )
        throw new ProjectError('EXTERNAL_CHANGE')
      // Single exact file, no recursive deletion and no async gap after final identity checks.
      attempted = true
      unlinkSync(proof.target.path)
      await syncDirectory(dirname(proof.target.path))
      row.state = 'removed'
      row.reason =
        'Confirmed removed. Owning operation records and verified destination remain retained. File length is not guaranteed physical space reclaimed.'
    } catch {
      row.state = attempted ? 'unknown' : 'changed'
      row.reason = attempted
        ? 'Removal or directory persistence is unconfirmed. Checking outcome never retries deletion.'
        : 'Identity or owner proof changed or became unavailable. No removal was attempted; request a fresh review.'
    }
    row.reason = `Operation ${proof.artifact.operationId}; snapshot job ${proof.artifact.snapshotJob}. ${row.reason}`
    receipt.view.phase = 'complete'
    receipt.view.at = new Date().toISOString()
    receipt.view.message =
      'Local artifact outcome recorded. Empty folders and operation receipts remain; no automatic cleanup or Undo follows.'
    await persist()
    return receipt.view
  }
}
