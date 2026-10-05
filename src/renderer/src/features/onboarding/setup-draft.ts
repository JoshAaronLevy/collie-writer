import { isId } from '../../../../domain/editor/schema'
import { projectText, requiredProjectName } from '../../../../domain/projects/details'
import { isProjectTemplate, type ProjectTemplate } from '../../../../domain/projects/templates'
import { exact, isCreateInput, record, type CreateInput } from '../../../../shared/projects'

const DRAFT_KEY = 'collie.project-setup.v1'
const AUTHOR_KEY = 'collie.project-author.v1'
export const AUTHOR_CHANGED = 'collie-project-author-changed'

export type SetupReceipt = { projectId: string; workspaceId: string; documentId: string }
export type SetupStep = 'type' | 'details' | 'creating' | 'connection'
export type SetupDraft = {
  version: 1
  step: SetupStep
  template: ProjectTemplate | null
  title: string
  byline: string
  description: string
  rememberAuthor: boolean
  request: CreateInput | null
  receipt: SetupReceipt | null
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
    version: 1,
    step: 'type',
    template: null,
    title: '',
    byline: author,
    description: '',
    rememberAuthor: !!author,
    request: null,
    receipt: null
  }
}

function isReceipt(value: unknown): value is SetupReceipt {
  return (
    record(value) &&
    exact(value, ['projectId', 'workspaceId', 'documentId']) &&
    [value.projectId, value.workspaceId, value.documentId].every(isId)
  )
}

function isSetupDraft(value: unknown): value is SetupDraft {
  if (
    !record(value) ||
    !exact(value, [
      'version',
      'step',
      'template',
      'title',
      'byline',
      'description',
      'rememberAuthor',
      'request',
      'receipt'
    ]) ||
    value.version !== 1 ||
    !['type', 'details', 'creating', 'connection'].includes(String(value.step)) ||
    (value.template !== null && !isProjectTemplate(value.template)) ||
    !projectText(value.title, 4000) ||
    !projectText(value.byline, 4000) ||
    !projectText(value.description, 12000) ||
    typeof value.rememberAuthor !== 'boolean' ||
    (value.request !== null && !isCreateInput(value.request)) ||
    (value.receipt !== null && !isReceipt(value.receipt))
  )
    return false
  if (value.step !== 'type' && value.template === null) return false
  if (value.request === null)
    return value.receipt === null && (value.step === 'type' || value.step === 'details')
  const request = value.request as CreateInput
  if (
    value.template !== request.template ||
    value.title !== request.title ||
    value.byline !== request.byline ||
    value.description !== request.description
  )
    return false
  if (value.step === 'type') return false
  return value.receipt === null
    ? value.step === 'creating'
    : value.step === 'connection' || value.step === 'details'
}

export function readSetupDraft(): { draft: SetupDraft | null; issue: string | null } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw === null) return { draft: null, issue: null }
    if (raw.length > 40000) throw new Error('LIMIT')
    const parsed: unknown = JSON.parse(raw)
    if (!isSetupDraft(parsed)) throw new Error('INVALID_DRAFT')
    return { draft: parsed, issue: null }
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
  if (!isSetupDraft(draft)) return false
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function discardSetupDraft(): boolean {
  try {
    localStorage.removeItem(DRAFT_KEY)
    return true
  } catch {
    return false
  }
}
