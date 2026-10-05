type ConnectionControllerState = {
  status: AiStatus | null
  checking: boolean
  issue: AiReason | null
  pending: Action | null
  waiting: boolean
  canCancel: boolean
  busy: boolean
  checkStatus: (acknowledge?: boolean) => Promise<void>
  connect: (connectionId: string | null, trigger: HTMLElement | null) => Promise<boolean>
  cancel: () => Promise<boolean>
  accountAction: (
    kind: 'refresh' | 'disconnect' | 'select' | 'resume' | 'refreshModels',
    connectionId: string,
    trigger: HTMLElement | null
  ) => Promise<boolean>
  localAction: (
    kind: 'cleanup' | 'protectConnection',
    trigger: HTMLElement | null
  ) => Promise<boolean>
  selectModel: (input: AiSelectModelInput, trigger: HTMLElement | null) => Promise<boolean>
  showOrigin: () => void
}
import { useLayoutEffect } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AiReason, AiResult, AiStatus } from '../../../../shared/ai'
import type { AiSelectModelInput } from '../../../../shared/ai-catalog'
import type { AppDestination } from '../../app/navigation'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { connectionProblemReasons } from './connection-copy'

type Action = {
  id: number
  kind:
    | 'connect'
    | 'cancel'
    | 'refresh'
    | 'disconnect'
    | 'select'
    | 'resume'
    | 'cleanup'
    | 'protectConnection'
    | 'refreshModels'
    | 'selectModel'
  connectionId: string | null
  attemptId: string | null
}
type Origin = {
  destination: AppDestination
  trigger: HTMLElement | null
  surface: HTMLElement | null
}

export function useConnectionController(): ConnectionControllerState {
  const session = useWorkspaceSession()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [issue, setIssue] = useState<AiReason | null>(null)
  const [pending, setPending] = useState<Action | null>(null)
  const snapshot = useRef<AiStatus | null>(null)
  const action = useRef<Action | null>(null)
  const ownedAttempt = useRef<string | null>(null)
  const unconfirmed = useRef<Action | null>(null)
  const origin = useRef<Origin | null>(null)
  const nextAction = useRef(0)
  const mounted = useRef(false)
  const statusRead = useRef<Promise<void> | null>(null)
  const acknowledgeStatusRead = useRef(false)
  const latestSession = useRef(session)
  useLayoutEffect(() => {
    latestSession.current = session
  })

  const restoreOriginFocus = useCallback(() => {
    const captured = origin.current,
      current = latestSession.current
    if (
      !captured ||
      JSON.stringify(captured.destination) !== JSON.stringify(current.destination) ||
      current.composition.current
    )
      return
    const surface = captured.surface
    const trigger = captured.trigger
    const target =
      trigger?.isConnected && !trigger.matches(':disabled')
        ? trigger
        : surface?.querySelector<HTMLElement>('h2')
    if (!target?.isConnected || target.closest('[hidden], [inert]')) return
    if (document.activeElement !== document.body && !surface?.contains(document.activeElement))
      return
    requestAnimationFrame(() => {
      const current = latestSession.current
      if (
        origin.current !== captured ||
        JSON.stringify(captured.destination) !== JSON.stringify(current.destination) ||
        current.composition.current
      )
        return
      if (document.activeElement !== document.body && !surface?.contains(document.activeElement))
        return
      if (
        target.isConnected &&
        !target.matches(':disabled') &&
        !target.closest('[hidden], [inert]')
      )
        target.focus({ preventScroll: true })
    })
  }, [])

  const apply = useCallback(
    (next: AiStatus) => {
      if (!mounted.current || (snapshot.current && next.sequence <= snapshot.current.sequence))
        return
      const wasSigningIn = snapshot.current?.state === 'signing-in'
      snapshot.current = next
      setStatus(next)
      if (unconfirmed.current) setIssue('outcome-unknown')
      if (wasSigningIn && next.state !== 'signing-in') {
        ownedAttempt.current = null
        const reason = [...next.reasons]
          .reverse()
          .find((value) => connectionProblemReasons.includes(value))
        if (!unconfirmed.current) setIssue(reason && reason !== 'cancelled' ? reason : null)
        restoreOriginFocus()
      }
    },
    [restoreOriginFocus]
  )

  const checkStatus = useCallback(
    (acknowledge = false): Promise<void> => {
      if (acknowledge) acknowledgeStatusRead.current = true
      if (statusRead.current) return statusRead.current
      if (!latestSession.current.available) {
        acknowledgeStatusRead.current = false
        return Promise.resolve()
      }
      const reconciling = unconfirmed.current
      setChecking(true)
      const task = (async () => {
        try {
          const result = await window.collie.aiStatus()
          if (!mounted.current) return
          if (result.ok) {
            apply(result.value)
            if (snapshot.current && result.value.sequence < snapshot.current.sequence) return
            // A read started before an uncertain reply cannot acknowledge it.
            // Retain the exact action until a subsequent local snapshot returns.
            const reconciled =
              !!reconciling && unconfirmed.current === reconciling && action.current === null
            if (reconciled) unconfirmed.current = null
            if (
              action.current === null &&
              !unconfirmed.current &&
              (acknowledgeStatusRead.current || reconciled)
            )
              setIssue(null)
            if (
              result.value.state !== 'signing-in' &&
              result.value.actions.disconnect &&
              action.current?.kind !== 'connect'
            )
              ownedAttempt.current = null
          } else setIssue(result.reason)
        } catch {
          if (mounted.current) setIssue('outcome-unknown')
        } finally {
          statusRead.current = null
          acknowledgeStatusRead.current = false
          if (mounted.current) setChecking(false)
        }
      })()
      statusRead.current = task
      return task
    },
    [apply]
  )

  useEffect(() => {
    mounted.current = true
    const unsubscribe = window.collie.onAiChanged((event) => {
      if (event.kind === 'connection') apply(event.status)
    })
    const focus = (): void => {
      void checkStatus()
    }
    window.addEventListener('focus', focus)
    return () => {
      mounted.current = false
      unsubscribe()
      window.removeEventListener('focus', focus)
    }
  }, [apply, checkStatus])
  useEffect(() => {
    if (session.available) void checkStatus()
  }, [session.available, checkStatus])
  const waiting =
    status?.state === 'signing-in' || pending?.kind === 'connect' || pending?.kind === 'cancel'
  const canCancel =
    status?.state === 'signing-in'
      ? (status.local?.cancellable ?? true)
      : pending?.kind === 'connect'
  useEffect(() => {
    if (!session.available) return
    // Repair missed initial/terminal events even while panels are hidden.
    // Main's local snapshot never refreshes authentication or runs Codex.
    const timer = setInterval(() => {
      void checkStatus()
    }, 5000)
    return () => clearInterval(timer)
  }, [session.available, checkStatus])

  const begin = useCallback(
    (
      kind: Action['kind'],
      connectionId: string | null,
      trigger: HTMLElement | null
    ): Action | null => {
      if (action.current || unconfirmed.current || latestSession.current.closing) return null
      if (
        kind !== 'protectConnection' &&
        latestSession.current.drafts
          .states()
          .some(
            (draft) =>
              ['conversation', 'proofreading', 'proofreading-application', 'ai-work'].includes(
                draft.kind
              ) &&
              (draft.busy || draft.pendingOperation !== null)
          )
      ) {
        setIssue('busy')
        return null
      }
      origin.current = {
        destination: latestSession.current.destination,
        trigger,
        surface: trigger?.closest<HTMLElement>('[data-ai-connection-surface]') ?? null
      }
      const next: Action = {
        id: ++nextAction.current,
        kind,
        connectionId,
        attemptId: kind === 'connect' ? crypto.randomUUID() : null
      }
      action.current = next
      setPending(next)
      setIssue(null)
      if (next.attemptId) ownedAttempt.current = next.attemptId
      return next
    },
    []
  )

  const finish = useCallback(
    async (current: Action, operation: () => Promise<AiResult<AiStatus>>): Promise<boolean> => {
      let confirmed = false
      try {
        const result = await operation()
        if (!mounted.current) return false
        if (result.ok) {
          apply(result.value)
          confirmed = true
          if (current.kind !== 'connect') restoreOriginFocus()
        } else if (action.current?.id === current.id) {
          setIssue(result.reason)
          if (result.reason === 'outcome-unknown') unconfirmed.current = current
        }
      } catch {
        if (mounted.current && action.current?.id === current.id) {
          unconfirmed.current = current
          setIssue('outcome-unknown')
        }
      } finally {
        if (action.current?.id === current.id) {
          action.current = null
          if (mounted.current) setPending(null)
        }
      }
      return confirmed
    },
    [apply, restoreOriginFocus]
  )

  const connect = useCallback(
    (connectionId: string | null, trigger: HTMLElement | null): Promise<boolean> => {
      if (!snapshot.current?.actions.connect) return Promise.resolve(false)
      const next = begin('connect', connectionId, trigger)
      return next
        ? finish(next, () => window.collie.connectAi({ attemptId: next.attemptId!, connectionId }))
        : Promise.resolve(false)
    },
    [begin, finish]
  )

  const cancel = useCallback((): Promise<boolean> => {
    const attemptId = snapshot.current?.attemptId ?? ownedAttempt.current
    if (!attemptId || (action.current && !['connect', 'cancel'].includes(action.current.kind)))
      return Promise.resolve(false)
    if (action.current?.kind === 'cancel') return Promise.resolve(false)
    const next: Action = { id: ++nextAction.current, kind: 'cancel', connectionId: null, attemptId }
    action.current = next
    setPending(next)
    setIssue(null)
    return finish(next, () => window.collie.cancelAiConnection({ attemptId })).then((confirmed) => {
      if (confirmed && snapshot.current?.state !== 'signing-in') ownedAttempt.current = null
      return confirmed
    })
  }, [finish])

  const accountAction = useCallback(
    (
      kind: 'refresh' | 'disconnect' | 'select' | 'resume' | 'refreshModels',
      connectionId: string,
      trigger: HTMLElement | null
    ): Promise<boolean> => {
      if (!snapshot.current?.actions[kind]) return Promise.resolve(false)
      const next = begin(kind, connectionId, trigger)
      if (!next) return Promise.resolve(false)
      const input = { connectionId }
      return finish(next, () =>
        kind === 'refresh'
          ? window.collie.refreshAiConnection(input)
          : kind === 'refreshModels'
            ? window.collie.refreshAiModels(input)
            : kind === 'resume'
              ? window.collie.resumeAiConnection(input)
              : kind === 'disconnect'
                ? window.collie.disconnectAi(input)
                : window.collie.selectAiConnection(input)
      )
    },
    [begin, finish]
  )

  const selectModel = useCallback(
    (input: AiSelectModelInput, trigger: HTMLElement | null): Promise<boolean> => {
      if (!snapshot.current?.actions.selectModel) return Promise.resolve(false)
      const next = begin('selectModel', input.connectionId, trigger)
      return next ? finish(next, () => window.collie.selectAiModel(input)) : Promise.resolve(false)
    },
    [begin, finish]
  )

  const localAction = useCallback(
    (kind: 'cleanup' | 'protectConnection', trigger: HTMLElement | null): Promise<boolean> => {
      if (!snapshot.current?.actions[kind]) return Promise.resolve(false)
      const next = begin(kind, null, trigger)
      return next
        ? finish(next, () =>
            kind === 'cleanup'
              ? window.collie.cleanupAiConnection()
              : window.collie.protectAiConnection()
          )
        : Promise.resolve(false)
    },
    [begin, finish]
  )

  const showOrigin = useCallback(() => {
    const captured = origin.current?.destination,
      current = latestSession.current
    // Returning never switches projects or recreates a completed setup wizard.
    if (
      captured?.kind === 'workspace' &&
      current.project?.projectId === captured.scope.projectId &&
      current.project.workspaceId === captured.scope.workspaceId
    )
      void current.navigate(captured)
    else if (captured?.kind === 'setup' && current.destination.kind === 'setup')
      restoreOriginFocus()
    else void current.navigate({ kind: 'settings', page: 'ai' })
  }, [restoreOriginFocus])

  const busy =
    !!pending ||
    status?.state === 'signing-in' ||
    status?.state === 'refreshing' ||
    status?.state === 'disconnecting'
  useRetainedDraft('ai-connection-action', {
    read: () => ({
      scope: session.project
        ? { projectId: session.project.projectId, workspaceId: session.project.workspaceId }
        : { projectId: '', workspaceId: '' },
      kind: 'ai-connection',
      entityId: status?.activeConnectionId ?? null,
      label: 'AI connection acknowledgment',
      dirty: false,
      composing: false,
      busy,
      pendingOperation: pending ?? unconfirmed.current,
      policy: 'operation',
      target: { kind: 'settings', page: 'ai' }
    }),
    focus: showOrigin
  })
  return useMemo(
    () => ({
      status,
      checking,
      issue,
      pending,
      waiting,
      canCancel,
      busy,
      checkStatus,
      connect,
      cancel,
      accountAction,
      localAction,
      selectModel,
      showOrigin
    }),
    [
      status,
      checking,
      issue,
      pending,
      waiting,
      canCancel,
      busy,
      checkStatus,
      connect,
      cancel,
      accountAction,
      localAction,
      selectModel,
      showOrigin
    ]
  )
}

type Connections = ReturnType<typeof useConnectionController>
export const Context = createContext<Connections | null>(null)

export function useAiConnections(): Connections {
  const connections = useContext(Context)
  if (!connections) throw new Error('AI connection owner is missing')
  return connections
}
