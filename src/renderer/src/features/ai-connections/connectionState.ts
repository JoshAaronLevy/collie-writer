type ConnectionControllerState = {
  status: AiStatus | null
  checking: boolean
  statusUnavailable: boolean
  issue: AiReason | null
  pending: Action | null
  waiting: boolean
  canCancel: boolean
  busy: boolean
  startupPrepared: boolean
  checkStatus: (acknowledge?: boolean) => Promise<void>
  connect: (connectionId: string | null, trigger: HTMLElement | null) => Promise<boolean>
  cancel: () => Promise<boolean>
  accountAction: (
    kind: 'refresh' | 'disconnect' | 'select' | 'resume' | 'refreshModels' | 'prepareConnection',
    connectionId: string,
    trigger: HTMLElement | null
  ) => Promise<boolean>
  localAction: (
    kind: 'cleanup' | 'protectConnection',
    trigger: HTMLElement | null
  ) => Promise<boolean>
  selectModel: (input: AiSelectModelInput, trigger: HTMLElement | null) => Promise<boolean>
  dialogOpen: boolean
  openDialog: (trigger?: HTMLElement | null) => void
  closeDialog: () => void
  returnDialogFocus: () => void
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
import { useChatGptStartup } from './useChatGptStartup'

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
    | 'prepareConnection'
    | 'refreshModels'
    | 'selectModel'
  connectionId: string | null
  attemptId: string | null
}
type Origin = {
  destination: AppDestination
  trigger: HTMLElement | null
  surface: HTMLElement | null
  dialogGeneration: number | null
}

export function useConnectionController(): ConnectionControllerState {
  const session = useWorkspaceSession()
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialog = useRef({
    open: false,
    generation: 0,
    trigger: null as HTMLElement | null,
    destination: ''
  })
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [readUnavailable, setReadUnavailable] = useState(false)
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

  const openConnectionDialog = useCallback((trigger: HTMLElement | null): boolean => {
    const current = latestSession.current
    if (current.closing || current.navigating || current.composition.current || dialog.current.open)
      return false
    // Do not stack a second modal over a recovery, editor or native-close decision.
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
    dialog.current = {
      open: true,
      generation: dialog.current.generation + 1,
      trigger,
      destination: JSON.stringify(current.destination)
    }
    setDialogOpen(true)
    return true
  }, [])
  const openDialog = useCallback(
    (trigger?: HTMLElement | null) => {
      openConnectionDialog(
        trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      )
    },
    [openConnectionDialog]
  )
  const closeDialog = useCallback(() => {
    dialog.current.open = false
    setDialogOpen(false)
    // Dismiss presentation only. Keep attempts, unconfirmed replies and drafts.
  }, [])
  const returnDialogFocus = useCallback(() => {
    const captured = dialog.current
    if (captured.open) return
    requestAnimationFrame(() => {
      const current = latestSession.current
      if (
        dialog.current !== captured ||
        captured.open ||
        current.composition.current ||
        current.closing ||
        current.navigating ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return
      if (
        document.activeElement !== document.body &&
        document.activeElement instanceof HTMLElement &&
        !document.activeElement.closest('[hidden], [inert]')
      )
        return
      const target =
        captured.destination === JSON.stringify(current.destination) &&
        captured.trigger?.isConnected &&
        !captured.trigger.matches(':disabled') &&
        !captured.trigger.closest('[hidden], [inert]') &&
        captured.trigger.getClientRects().length > 0
          ? captured.trigger
          : (document.querySelector<HTMLElement>('[data-destination-region]:not([hidden])') ??
            document.querySelector<HTMLElement>('[data-chatgpt-trigger]'))
      if (target?.hasAttribute('data-destination-region')) {
        const heading = Array.from(target.querySelectorAll<HTMLElement>('h1, h2')).find(
          (item) => !item.closest('[hidden], [inert]') && item.getClientRects().length > 0
        )
        if (heading) {
          heading.tabIndex = -1
          heading.focus({ preventScroll: true })
          return
        }
      }
      target?.focus({ preventScroll: true })
    })
  }, [])

  const restoreOriginFocus = useCallback(() => {
    const captured = origin.current,
      current = latestSession.current
    if (
      !captured ||
      (dialog.current.open && captured.dialogGeneration === null) ||
      JSON.stringify(captured.destination) !== JSON.stringify(current.destination) ||
      current.composition.current ||
      (captured.dialogGeneration !== null &&
        (!dialog.current.open || captured.dialogGeneration !== dialog.current.generation))
    )
      return
    const modal = document.querySelector('[role="dialog"], [role="alertdialog"]')
    if (modal && !modal.contains(captured.surface)) return
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
        current.composition.current ||
        (captured.dialogGeneration !== null &&
          (!dialog.current.open || captured.dialogGeneration !== dialog.current.generation))
      )
        return
      const modal = document.querySelector('[role="dialog"], [role="alertdialog"]')
      if (
        (dialog.current.open && captured.dialogGeneration === null) ||
        (modal && !modal.contains(surface))
      )
        return
      if (document.activeElement !== document.body && !surface?.contains(document.activeElement))
        return
      if (
        target.isConnected &&
        !target.matches(':disabled') &&
        !target.closest('[hidden], [inert]') &&
        target.getClientRects().length > 0
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
      setReadUnavailable(!!unconfirmed.current)
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
      const startedSequence = snapshot.current?.sequence
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
            if (!unconfirmed.current) setReadUnavailable(false)
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
          } else {
            if (snapshot.current?.sequence === startedSequence) setReadUnavailable(true)
            setIssue(result.reason)
          }
        } catch {
          if (mounted.current) {
            if (snapshot.current?.sequence === startedSequence) setReadUnavailable(true)
            setIssue('outcome-unknown')
          }
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
        surface: trigger?.closest<HTMLElement>('[data-ai-connection-surface]') ?? null,
        dialogGeneration: dialog.current.open ? dialog.current.generation : null
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
          if (result.reason === 'outcome-unknown') {
            unconfirmed.current = current
            setReadUnavailable(true)
          }
        }
      } catch {
        if (mounted.current && action.current?.id === current.id) {
          unconfirmed.current = current
          setReadUnavailable(true)
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
      kind: 'refresh' | 'disconnect' | 'select' | 'resume' | 'refreshModels' | 'prepareConnection',
      connectionId: string,
      trigger: HTMLElement | null
    ): Promise<boolean> => {
      if (!snapshot.current?.actions[kind === 'prepareConnection' ? 'refreshModels' : kind])
        return Promise.resolve(false)
      const next = begin(kind, connectionId, trigger)
      if (!next) return Promise.resolve(false)
      const input = { connectionId }
      return finish(next, () =>
        kind === 'prepareConnection'
          ? window.collie.prepareAiConnection(input)
          : kind === 'refresh'
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

  const showOrigin = useCallback(() => openDialog(), [openDialog])

  const busy =
    !!pending ||
    status?.state === 'signing-in' ||
    status?.state === 'refreshing' ||
    status?.state === 'disconnecting' ||
    status?.direct?.preparation === 'running' ||
    status?.direct?.preparation === 'waiting'
  const startupFailure = useCallback(() => {
    setReadUnavailable(true)
    setIssue('outcome-unknown')
  }, [])
  const startupPrepared = useChatGptStartup({
    status,
    apply,
    onFailure: startupFailure
  })
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
  const statusUnavailable = readUnavailable || !session.available
  return useMemo(
    () => ({
      status,
      checking,
      statusUnavailable,
      issue,
      pending,
      waiting,
      canCancel,
      busy,
      startupPrepared,
      checkStatus,
      connect,
      cancel,
      accountAction,
      localAction,
      selectModel,
      dialogOpen,
      openDialog,
      closeDialog,
      returnDialogFocus,
      showOrigin
    }),
    [
      status,
      checking,
      statusUnavailable,
      issue,
      pending,
      waiting,
      canCancel,
      busy,
      startupPrepared,
      checkStatus,
      connect,
      cancel,
      accountAction,
      localAction,
      selectModel,
      dialogOpen,
      openDialog,
      closeDialog,
      returnDialogFocus,
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
