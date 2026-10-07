import { isId } from '../../../../domain/editor/schema'
import { projectText, requiredProjectName } from '../../../../domain/projects/details'
import { isProjectTemplate, type ProjectTemplate } from '../../../../domain/projects/templates'
import {
  exact,
  isCreateInput,
  isOpenInput,
  record,
  type OpenInput,
  type CreateInput
} from '../../../../shared/projects'

const LEGACY_KEY = 'collie.project-setup.v1'
const PREVIOUS_KEY = 'collie.project-setup.v2'
const DRAFT_KEY = 'collie.project-setup.v3'
const AUTHOR_KEY = 'collie.project-author.v1'
export const AUTHOR_CHANGED = 'collie-project-author-changed'

export type SetupReceipt = { projectId: string; workspaceId: string; documentId: string }
export type SetupStep = 'type' | 'details' | 'creating' | 'opening' | 'completed'
export type SetupEditingIntent = {
  mode: 'keep' | 'designate'
  expectedRevision: string
  freeProject: OpenInput | null
}
export type SetupCompletion = { ok: true } | { ok: false; message: string }

export type SetupDraft = {
  version: 3
  step: SetupStep
  template: ProjectTemplate | null
  title: string
  subtitle: string
  byline: string
  description: string
  rememberAuthor: boolean
  request: CreateInput | null
  receipt: SetupReceipt | null
  editingIntent: SetupEditingIntent | null
  completion: 'write' | 'read' | null
}

export function readAuthorPreference(): { byline: string; issue: string | null } {
  try {
    const raw = localStorage.getItem(AUTHOR_KEY)
    if (raw === null) return { byline: '', issue: null }
    const value: unknown = JSON.parse(raw)
    if (
      !record(value) ||
      !exact(value, ['version', 'byline']) ||
      value.version !== 1 ||
      !requiredProjectName(value.byline)
    )
      throw new Error('INVALID_AUTHOR')
    return { byline: value.byline, issue: null }
  } catch {
    return {
      byline: '',
      issue: 'The remembered author could not be read. Review it in Settings before relying on it.'
    }
  }
}

export function writeAuthorPreference(byline: string): boolean {
  try {
    if (byline && !requiredProjectName(byline)) return false
    if (byline) localStorage.setItem(AUTHOR_KEY, JSON.stringify({ version: 1, byline }))
    else localStorage.removeItem(AUTHOR_KEY)
    window.dispatchEvent(new Event(AUTHOR_CHANGED))
    return true
  } catch {
    return false
  }
}

export function emptySetupDraft(): SetupDraft {
  const author = readAuthorPreference().byline
  return {
    version: 3,
    step: 'type',
    template: null,
    title: '',
    subtitle: '',
    byline: author,
    description: '',
    rememberAuthor: !!author,
    request: null,
    receipt: null,
    editingIntent: null,
    completion: null
  }
}

function isReceipt(value: unknown): value is SetupReceipt {
  return (
    record(value) &&
    exact(value, ['projectId', 'workspaceId', 'documentId']) &&
    [value.projectId, value.workspaceId, value.documentId].every(isId)
  )
}

function validIntent(value: unknown): value is SetupEditingIntent {
  return (
    record(value) &&
    exact(value, ['mode', 'expectedRevision', 'freeProject']) &&
    (value.mode === 'keep' || value.mode === 'designate') &&
    isId(value.expectedRevision) &&
    (value.freeProject === null || isOpenInput(value.freeProject))
  )
}

function validDraft(value: unknown, version: 1 | 2 | 3): boolean {
  const legacy = version === 1
  if (
    !record(value) ||
    !exact(value, [
      'version',
      'step',
      'template',
      'title',
      ...(version === 3 ? ['subtitle'] : []),
      'byline',
      'description',
      'rememberAuthor',
      'request',
      'receipt',
      ...(legacy ? [] : ['editingIntent', 'completion'])
    ]) ||
    value.version !== version ||
    !(
      legacy
        ? ['type', 'details', 'creating', 'connection']
        : ['type', 'details', 'creating', 'opening', 'completed']
    ).includes(String(value.step)) ||
    (value.template !== null && !isProjectTemplate(value.template)) ||
    !projectText(value.title, 4000) ||
    (version === 3 && !projectText(value.subtitle, 4000)) ||
    !projectText(value.byline, 4000) ||
    !projectText(value.description, 12000) ||
    typeof value.rememberAuthor !== 'boolean' ||
    (value.request !== null && !isCreateInput(value.request)) ||
    (value.receipt !== null && !isReceipt(value.receipt)) ||
    (!legacy &&
      ((value.editingIntent !== null && !validIntent(value.editingIntent)) ||
        ![null, 'write', 'read'].includes(value.completion as string | null)))
  )
    return false
  if (!legacy && (value.step === 'completed') !== (value.completion !== null)) return false
  if (value.step !== 'type' && value.template === null) return false
  if (value.request === null)
    return (
      value.receipt === null &&
      (value.step === 'type' || value.step === 'details') &&
      (legacy || value.editingIntent === null)
    )
  const request = value.request as CreateInput
  if (
    (version !== 3 && Object.hasOwn(request, 'metadataVersion')) ||
    (version === 3 && value.subtitle !== (request.subtitle ?? '')) ||
    value.template !== request.template ||
    value.title !== request.title ||
    value.byline !== request.byline ||
    value.description !== request.description
  )
    return false
  return value.receipt === null
    ? value.step === 'creating'
    : legacy
      ? value.step === 'connection' || value.step === 'details'
      : value.step === 'opening' || value.step === 'completed'
}

export function readSetupDraft(): { draft: SetupDraft | null; issue: string | null } {
  try {
    // Never fall back past an unreadable higher version to a conflicting request.
    const current = localStorage.getItem(DRAFT_KEY)
    const previous = current === null ? localStorage.getItem(PREVIOUS_KEY) : null
    const version = current !== null ? 3 : previous !== null ? 2 : 1
    const raw = current ?? previous ?? localStorage.getItem(LEGACY_KEY)
    if (raw === null) return { draft: null, issue: null }
    if (raw.length > 40000) throw new Error('LIMIT')
    const parsed: unknown = JSON.parse(raw)
    if (!validDraft(parsed, version) || !record(parsed)) throw new Error('INVALID_DRAFT')
    if (current !== null) return { draft: parsed as SetupDraft, issue: null }
    // Conversion preserves the exact request and receipt, without inventing switch consent.
    return {
      draft: {
        ...parsed,
        version: 3,
        subtitle: '',
        step: version === 1 && parsed.receipt ? 'opening' : parsed.step,
        editingIntent: version === 1 ? null : parsed.editingIntent,
        completion: version === 1 ? null : parsed.completion
      } as SetupDraft,
      issue: null
    }
  } catch {
    return {
      draft: null,
      issue:
        'Saved project setup could not be read. Existing projects are still available. Retry reading it or explicitly discard this setup draft.'
    }
  }
}

export function hasResumableSetup(): boolean {
  const saved = readSetupDraft()
  return saved.draft !== null || saved.issue !== null
}

export function writeSetupDraft(draft: SetupDraft): boolean {
  if (!validDraft(draft, 3)) return false
  try {
    const serialized = JSON.stringify(draft)
    if (serialized.length > 40000) return false
    localStorage.setItem(DRAFT_KEY, serialized)
    localStorage.removeItem(LEGACY_KEY)
    localStorage.removeItem(PREVIOUS_KEY)
    return true
  } catch {
    return false
  }
}

export function discardSetupDraft(): boolean {
  try {
    // Keep the v3 completion tombstone until both old active keys are gone.
    localStorage.removeItem(LEGACY_KEY)
    localStorage.removeItem(PREVIOUS_KEY)
    localStorage.removeItem(DRAFT_KEY)
    return true
  } catch {
    return false
  }
}
