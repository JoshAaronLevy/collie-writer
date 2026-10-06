import { randomUUID } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput } from '../../shared/projects'
import { sameScope } from '../../shared/project-files'
import type {
  WorkingCopyInput,
  WorkingCopyReply,
  WorkingCopyView,
  WorkspaceAiEvidence
} from '../../shared/working-copy'
import { requestDigest } from '../storage/digest'
import { directory, writeJson, syncDirectory } from '../storage/files'
import { boundedJson, namedStamp, parentStamp, retentionNames, sameStamp } from './retention-files'
import {
  readWorkingCopyReceipt,
  workingCopyOutcome,
  emptyWorkingCopy,
  removalMarker,
  workspacePath,
  retiredWorkspace,
  type WorkingCopyReceipt
} from './working-copy-records'
import {
  proveWorkingCopy,
  workingTree,
  requireCopy,
  WorkingCopyProtected,
  type WorkingCopyProof
} from './working-copy-proof'

export class WorkingCopyRemoval {
  private reviews = new Map<
    string,
    { view: WorkingCopyView; proof: WorkingCopyProof; expires: number }
  >()
  constructor(
    private readonly root: string,
    private readonly nativeBinding?: string
  ) {}
  async history(id: string, offset: number): Promise<WorkingCopyReply> {
    const folder = join(this.root, 'working-copy-locators')
    let names: string[]
    try {
      names = await retentionNames(folder, 1024)
    } catch (error) {
      if (record(error) && error.code === 'ENOENT')
        return { id, view: null, history: [], more: false }
      throw error
    }
    const history: WorkingCopyView[] = []
    for (const name of names.slice(offset, offset + 8)) {
      requireCopy(
        name.endsWith('.json') && isId(name.slice(0, -5)),
        'Removal history contains unrecognized records; originals stay retained.'
      )
      const v = boundedJson(join(folder, name), 1024)
      requireCopy(
        record(v) &&
          exact(v, ['version', 'id', 'scope']) &&
          v.version === 1 &&
          v.id === name.slice(0, -5) &&
          isOpenInput(v.scope),
        'Removal history is unreadable; originals stay retained.'
      )
      history.push(workingCopyOutcome(this.root, v.scope, v.id))
    }
    return { id, view: null, history, more: offset + 8 < names.length }
  }
  status(scope: OpenInput, id: string): WorkingCopyView {
    return workingCopyOutcome(this.root, scope, id)
  }
  refusal(scope: OpenInput, id: string, error: unknown): WorkingCopyView {
    return emptyWorkingCopy(
      scope,
      id,
      'preview',
      error instanceof WorkingCopyProtected
        ? error.message
        : 'The inactive working copy, saved file or required ownership proof is unavailable. Open the project, review recovery and Save before trying again.'
    )
  }
  async preview(
    input: Extract<WorkingCopyInput, { kind: 'preview' | 'status' }>,
    ai: WorkspaceAiEvidence
  ): Promise<WorkingCopyView> {
    try {
      requireCopy(
        ai === 'clear',
        ai === 'linked'
          ? 'Original AI operations or recovery records refer to this workspace. Keep this local copy; AI-linked removal is unavailable.'
          : 'AI recovery ownership could not be fully verified. Keep this local copy until the original records are available.'
      )
      const proof = await proveWorkingCopy(this.root, input.scope, this.nativeBinding)
      const view: WorkingCopyView = {
        ...emptyWorkingCopy(
          input.scope,
          input.id,
          'preview',
          'The saved file matches the exact committed content, history and managed assets. Only the listed local content classes will be removed. Small operation records stay at the working folder; external files stay intact.'
        ),
        reviewId: randomUUID(),
        title: proof.title,
        workspace: workspacePath(this.root, input.scope),
        savedPath: proof.saved.path,
        head: proof.head,
        bytes: proof.bytes,
        retainedBytes: proof.retainedBytes,
        files: proof.payloads.length,
        eligible: true
      }
      this.reviews.set(input.id, {
        view: structuredClone(view),
        proof,
        expires: Date.now() + 300000
      })
      if (this.reviews.size > 8) this.reviews.delete(this.reviews.keys().next().value!)
      return view
    } catch (error) {
      return this.refusal(input.scope, input.id, error)
    }
  }
  async remove(
    input: Extract<WorkingCopyInput, { kind: 'remove' }>,
    ai: WorkspaceAiEvidence
  ): Promise<WorkingCopyView> {
    const prior = readWorkingCopyReceipt(this.root, input.id)
    if (prior) {
      requireCopy(
        sameScope(prior.view.scope, input.scope) && prior.view.reviewId === input.reviewId,
        'This action belongs to a different review.'
      )
      return this.status(input.scope, input.id)
    }
    const review = this.reviews.get(input.id)
    requireCopy(
      review &&
        review.view.reviewId === input.reviewId &&
        sameScope(review.view.scope, input.scope) &&
        review.expires >= Date.now(),
      'This review is stale. Request a new review; no removal was started.'
    )
    requireCopy(
      ai === 'clear',
      'AI ownership is no longer clear. The original working copy stays retained.'
    )
    const proof = await proveWorkingCopy(this.root, input.scope, this.nativeBinding)
    requireCopy(
      requestDigest(proof) === requestDigest(review.proof),
      'Local content or the saved file changed. Request a new review; no removal was started.'
    )
    const registry = join(this.root, 'retention-actions'),
      locators = join(this.root, 'working-copy-locators')
    await directory(this.root, registry)
    await directory(this.root, locators)
    await directory(this.root, join(this.root, 'workspace-retirements'))
    await syncDirectory(this.root)
    requireCopy(
      (await retentionNames(registry, 1024)).length < 1024 &&
        (await retentionNames(locators, 1024)).length < 1024 &&
        (await retentionNames(join(this.root, 'workspace-retirements'), 1024)).length < 1024,
      'Removal record capacity is full. No original records or working files were deleted.'
    )
    const r: WorkingCopyReceipt = {
      version: 3,
      kind: 'working-copy',
      view: { ...review.view, phase: 'interrupted', eligible: false },
      tree: proof.tree,
      saved: proof.saved,
      retained: proof.retained,
      payloads: proof.payloads
    }
    const receiptPath = join(registry, `${input.id}.json`),
      receiptParent = parentStamp(receiptPath),
      marker = removalMarker(this.root, input.scope)
    const persist = async (): Promise<void> => {
      requireCopy(parentStamp(receiptPath) === receiptParent, 'Removal receipt location changed.')
      requireCopy(
        Buffer.byteLength(JSON.stringify(r)) <= 4 * 1024 ** 2,
        'Removal record exceeds its bounded size; remaining files stay retained.'
      )
      await writeJson(receiptPath, r)
    }
    requireCopy(
      Buffer.byteLength(JSON.stringify(r)) <= 4 * 1024 ** 2 - 4096,
      'This review exceeds the bounded removal record; no content was removed.'
    )
    await persist()
    this.reviews.delete(input.id)
    await writeJson(join(locators, `${input.id}.json`), {
      version: 1,
      id: input.id,
      scope: input.scope
    })
    requireCopy(
      requestDigest(workingTree(r.view.workspace!)) === proof.tree &&
        !retiredWorkspace(this.root, input.scope),
      'Working copy changed before retirement; retained.'
    )
    await writeJson(marker, { version: 1, actionId: input.id, scope: input.scope })
    r.view.retired = true
    await persist()
    let attempted: WorkingCopyReceipt['payloads'][number] | null = null,
      changed = false
    try {
      for (const file of r.payloads) {
        const expectedFiles = [...r.retained, ...r.payloads.filter((f) => f.state !== 'removed')]
          .map(({ path, identity, parent }) => ({ path, identity, parent }))
          .sort((a, b) => a.path.localeCompare(b.path))
        const current = workingTree(r.view.workspace!)
        requireCopy(
          requestDigest(current.files) === requestDigest(expectedFiles),
          'Local files changed during removal.'
        )
        const originalFiles = [...r.retained, ...r.payloads]
          .map(({ path, identity, parent }) => ({ path, identity, parent }))
          .sort((a, b) => a.path.localeCompare(b.path))
        requireCopy(
          requestDigest({ ...current, files: originalFiles }) === r.tree,
          'Local folders changed during removal.'
        )
        requireCopy(
          retiredWorkspace(this.root, input.scope)?.view.id === input.id,
          'Retirement reference changed.'
        )
        requireCopy(
          parentStamp(r.saved.path) === r.saved.parent &&
            sameStamp(namedStamp(r.saved.path), r.saved.identity),
          'Saved replacement changed during removal.'
        )
        requireCopy(
          parentStamp(file.path) === file.parent && sameStamp(namedStamp(file.path), file.identity),
          'Local file identity changed.'
        )
        // Owners remain held. No recursive deletion and no async gap after final identities.
        attempted = file
        unlinkSync(file.path)
        await syncDirectory(dirname(file.path))
        file.state = 'removed'
        r.view.removedFiles++
        r.view.removedBytes += file.identity.size
        await persist()
        attempted = null
      }
    } catch {
      changed = true
      if (attempted?.state === 'pending') attempted.state = 'unknown'
      for (const f of r.payloads) if (f.state === 'pending') f.state = 'retained'
    }
    r.view.phase = 'complete'
    r.view.reason = changed
      ? 'The copy is retired, but some removal could not be confirmed. Remaining files and original records stay at the displayed folder. Nothing will be retried automatically. Use Open project file to validate and reopen the saved project.'
      : 'The local content copy was removed. Small original records and empty folders remain at the displayed working folder. The saved file and backups are unchanged. Use Open project file to validate and create a new local copy. File lengths are not guaranteed reclaimed physical space.'
    await persist()
    return r.view
  }
}
