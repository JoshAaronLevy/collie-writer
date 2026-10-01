import { isId } from '../domain/editor/schema'
import { exact, record, isOpenInput, type OpenInput, type ProjectResult } from './projects'

export const ACCESS_CHANNELS = { read: 'access.read', designate: 'access.designate', finish: 'access.finish', importGrant: 'access.importGrant', tutorial: 'access.tutorial' } as const
export const ACCESS_CHANGED = 'access.changed'
export type AccessState = 'free' | 'subscription' | 'grace' | 'lifetime' | 'expired' | 'revoked' | 'unavailable'
export type AccessView = {
  revision: string; state: AccessState; paid: boolean; paidThrough: string | null; graceUntil: string | null
  clockWarning: boolean; storageWarning: boolean; issuerConfigured: boolean
  freeProject: OpenInput | null; sampleProject: OpenInput | null; transition: { id: string; scope: OpenInput } | null
}
export type DesignateInput = { scope: OpenInput; expectedRevision: string }
export type FinishAccessInput = { transitionId: string }
export type TutorialInput = { reset: boolean }
export type AccessAPI = {
  readAccess: () => Promise<ProjectResult<AccessView>>
  designateFreeProject: (input: DesignateInput) => Promise<ProjectResult<AccessView>>
  finishAccessTransition: (input: FinishAccessInput) => Promise<ProjectResult<AccessView>>
  importAccessGrant: () => Promise<ProjectResult<AccessView>>
  openTutorial: (input: TutorialInput) => Promise<ProjectResult<import('./projects').OpenProject>>
  onAccessChanged: (callback: (view: AccessView) => void) => () => void
}
export function isDesignateInput(v: unknown): v is DesignateInput { return record(v) && exact(v,['scope','expectedRevision']) && isOpenInput(v.scope) && isId(v.expectedRevision) }
export function isFinishAccessInput(v: unknown): v is FinishAccessInput { return record(v) && exact(v,['transitionId']) && isId(v.transitionId) }
export function isTutorialInput(v: unknown): v is TutorialInput { return record(v) && exact(v,['reset']) && typeof v.reset === 'boolean' }
export function isAccessView(v: unknown): v is AccessView {
  return record(v) && exact(v,['revision','state','paid','paidThrough','graceUntil','clockWarning','storageWarning','issuerConfigured','freeProject','sampleProject','transition']) && isId(v.revision) && ['free','subscription','grace','lifetime','expired','revoked','unavailable'].includes(String(v.state)) && typeof v.paid==='boolean' && [v.paidThrough,v.graceUntil].every(d=>d===null||typeof d==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(d)) && [v.clockWarning,v.storageWarning,v.issuerConfigured].every(b=>typeof b==='boolean') && (v.freeProject===null||isOpenInput(v.freeProject)) && (v.sampleProject===null||isOpenInput(v.sampleProject)) && (v.transition===null||record(v.transition)&&exact(v.transition,['id','scope'])&&isId(v.transition.id)&&isOpenInput(v.transition.scope))
}
export function sameProject(a: OpenInput | null, b: OpenInput | null): boolean { return !!a && !!b && a.projectId===b.projectId && a.workspaceId===b.workspaceId }
export function canEditProject(access: AccessView | null, scope: OpenInput): boolean { return !!access && (access.paid || sameProject(access.freeProject,scope) || sameProject(access.sampleProject,scope)) }
