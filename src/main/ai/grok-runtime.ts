import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { AI_LIMITS, aiText, type AiModel, type AiReason } from '../../shared/ai'
import { record } from '../../shared/projects'
import { AiError } from './errors'
import { prepareGrokLaunch } from './grok-deployment'
import type { RuntimeUpdate, TextRuntime } from './runtime'

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: AiError) => void
  timer: ReturnType<typeof setTimeout>
}
const runtimeId = (value: unknown): value is string => aiText(value, 512) && value.length > 0

/** Grok's documented ACP v1 transport. Launch/auth/funding/isolation are NOT
 * implemented by a JSON-RPC client; prepareGrokLaunch refuses before spawn.
 * One instance owns exactly one fresh session and at most one prompt.
 */
export class GrokRuntime implements TextRuntime {
  private child: ChildProcessWithoutNullStreams | null = null
  private requests = new Map<number, Pending>()
  private nextId = 1
  private buffer = ''
  private decoder = new StringDecoder('utf8')
  private sessionId: string | null = null
  private currentModel: string | null = null
  private catalog: AiModel[] = []
  private opened = false
  private used = false
  private dispatched = false
  private settled = false
  private stopping = false
  private ended = false
  private cancelRequested = false
  private text = ''
  private update: ((value: RuntimeUpdate) => void) | null = null
  private fatal: AiError | null = null
  private cancelTimer: ReturnType<typeof setTimeout> | null = null
  private exitPromise: Promise<void> = Promise.resolve()

  async open(): Promise<void> {
    if (this.opened || this.stopping) throw new AiError('busy')
    this.opened = true
    // This gate runs before all filesystem/process/provider actions. Neither a
    // renderer token nor the OpenAI account record can authorize Grok.
    const launch = await prepareGrokLaunch()
    if (this.stopping || this.cancelRequested) throw new AiError('cancelled')
    const child = spawn(launch.executable, ['--no-auto-update', 'agent', 'stdio'], {
      cwd: launch.cwd,
      env: launch.env,
      stdio: 'pipe',
      windowsHide: true,
      shell: false
    })
    this.child = child
    this.exitPromise = new Promise((resolve) =>
      child.once('close', () => {
        this.ended = true
        this.fail(new AiError(this.dispatched ? 'outcome-unknown' : 'runtime-unavailable'))
        resolve()
      })
    )
    child.once('error', () => this.fail(new AiError('runtime-unavailable')))
    child.stdin.on('error', () =>
      this.fail(new AiError(this.dispatched ? 'outcome-unknown' : 'runtime-unavailable'))
    )
    child.stderr.on('data', () => {
      /* Provider diagnostics can contain content and credentials. Discard. */
    })
    child.stdout.on('data', (chunk: Buffer) => this.consume(chunk))
    try {
      const initialized = await this.rpc('initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'collie-writer', version: app.getVersion() },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
      })
      if (
        !record(initialized) ||
        initialized.protocolVersion !== 1 ||
        !Array.isArray(initialized.authMethods) ||
        initialized.authMethods.length > 32 ||
        !initialized.authMethods.some((method) => record(method) && method.id === 'cached_token')
      ) {
        throw new AiError('signed-out')
      }
      // Never choose xai.api_key, an external token broker, or a login fallback.
      await this.rpc('authenticate', { methodId: 'cached_token', _meta: { headless: true } })
      const session = await this.rpc('session/new', { cwd: launch.cwd, mcpServers: [] })
      if (!record(session) || !runtimeId(session.sessionId)) throw new AiError('provider-failed')
      this.sessionId = session.sessionId
      // Grok exposes its actual session model catalog. Missing/unknown catalogs
      // stay unavailable rather than inventing a default model or capability.
      if (
        record(session.models) &&
        runtimeId(session.models.currentModelId) &&
        Array.isArray(session.models.availableModels)
      ) {
        if (session.models.availableModels.length > 100) throw new AiError('output-limit')
        const ids = new Set<string>()
        for (const model of session.models.availableModels) {
          if (
            !record(model) ||
            !aiText(model.modelId, 100) ||
            !/^[A-Za-z0-9._-]+$/.test(model.modelId) ||
            !aiText(model.name, 200) ||
            !model.name.trim() ||
            ids.has(model.modelId)
          )
            throw new AiError('provider-failed')
          ids.add(model.modelId)
          this.catalog.push({ id: model.modelId, label: model.name, eligibility: 'unverified' })
        }
        this.currentModel = session.models.currentModelId
      }
    } catch (error) {
      await this.close()
      throw error
    }
  }

  async models(): Promise<AiModel[]> {
    this.requireSession()
    // This increment supports the already selected runtime model only. Selecting
    // another model requires the pinned release's supported selection contract.
    return this.catalog
      .filter((model) => model.id === this.currentModel)
      .map((model) => ({ ...model }))
  }

  private requireSession(): void {
    if (this.fatal) throw this.fatal
    if (!this.sessionId || !this.child || this.ended || this.stopping)
      throw new AiError('runtime-unavailable')
  }

  private write(value: unknown): void {
    if (!this.child || this.ended || this.stopping || !this.child.stdin.writable)
      throw new AiError('runtime-unavailable')
    const line = JSON.stringify(value) + '\n'
    if (Buffer.byteLength(line) > 1024 * 1024 || this.child.stdin.writableLength > 1024 * 1024)
      throw new AiError('output-limit')
    this.child.stdin.write(line)
  }

  private rpc(method: string, params: unknown, timeout = 20000): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new AiError(this.dispatched ? 'outcome-unknown' : 'runtime-unavailable'))
        void this.close()
      }, timeout)
      this.requests.set(id, { resolve, reject, timer })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.requests.delete(id)
        reject(error)
      }
    })
  }

  private consume(chunk: Buffer): void {
    if (this.fatal || this.stopping) return
    this.buffer += this.decoder.write(chunk)
    if (Buffer.byteLength(this.buffer) > 2 * 1024 * 1024) {
      this.fail(new AiError('output-limit'))
      void this.close()
      return
    }
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      if (!line.trim()) continue
      try {
        this.receive(JSON.parse(line))
      } catch (error) {
        this.fail(error instanceof AiError ? error : new AiError('provider-failed'))
        void this.close()
        return
      }
    }
  }

  private receive(value: unknown): void {
    if (!record(value) || value.jsonrpc !== '2.0') throw new AiError('provider-failed')
    if ('id' in value && !('method' in value)) {
      if (!Number.isSafeInteger(value.id) || typeof value.id !== 'number')
        throw new AiError('provider-failed')
      const pending = this.requests.get(value.id)
      if (!pending || 'result' in value === 'error' in value) throw new AiError('provider-failed')
      clearTimeout(pending.timer)
      this.requests.delete(value.id)
      // Do not parse provider error prose or infer billing from HTTP-like codes.
      if ('error' in value)
        pending.reject(new AiError(this.dispatched ? 'outcome-unknown' : 'provider-failed'))
      else pending.resolve(value.result)
      return
    }
    if (typeof value.method !== 'string') throw new AiError('provider-failed')
    if ('id' in value) {
      if (!(typeof value.id === 'number' && Number.isSafeInteger(value.id)) && !runtimeId(value.id))
        throw new AiError('provider-failed')
      if (value.method === 'session/request_permission') {
        this.write({ jsonrpc: '2.0', id: value.id, result: { outcome: { outcome: 'cancelled' } } })
      } else {
        this.write({
          jsonrpc: '2.0',
          id: value.id,
          error: { code: -32601, message: 'Client capability unavailable.' }
        })
      }
      throw new AiError('isolation-unresolved')
    }
    if (value.method !== 'session/update') return
    const params = value.params
    if (!record(params) || !record(params.update)) throw new AiError('provider-failed')
    if (params.sessionId !== this.sessionId) {
      // Setup metadata can precede session/new's reply; no early content is used.
      if (this.sessionId !== null) throw new AiError('context-changed')
      return
    }
    const update = params.update
    if (['tool_call', 'tool_call_update', 'plan'].includes(String(update.sessionUpdate)))
      throw new AiError('isolation-unresolved')
    if (
      update.sessionUpdate === 'current_model_update' &&
      update.currentModelId !== this.currentModel
    )
      throw new AiError('model-unavailable')
    if (update.sessionUpdate !== 'agent_message_chunk' || this.settled) return
    if (
      !this.dispatched ||
      !record(update.content) ||
      update.content.type !== 'text' ||
      !aiText(update.content.text, AI_LIMITS.output)
    ) {
      throw new AiError('provider-failed')
    }
    if (this.text.length + update.content.text.length > AI_LIMITS.output)
      throw new AiError('output-limit')
    this.text += update.content.text
    this.update?.({ text: this.text, state: 'running', reason: null })
    // agent_thought_chunk, attachments, tool output and metadata are never emitted.
  }

  private fail(error: AiError): void {
    this.fatal ??= error
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer)
      pending.reject(this.fatal)
    }
    this.requests.clear()
  }

  async execute(
    model: string,
    prompt: string,
    authorize: () => Promise<void>,
    update: (value: RuntimeUpdate) => void
  ): Promise<RuntimeUpdate> {
    if (this.used) throw new AiError('busy')
    this.used = true
    this.update = update
    let state: RuntimeUpdate['state'] = 'failed'
    let reason: AiReason | null = null
    try {
      this.requireSession()
      if (!aiText(prompt, AI_LIMITS.prompt + AI_LIMITS.context + 16000) || !prompt.trim())
        throw new AiError('invalid-request')
      if (model !== this.currentModel || !this.catalog.some((entry) => entry.id === model))
        throw new AiError('model-unavailable')
      await authorize()
      this.requireSession()
      if (this.cancelRequested) throw new AiError('cancelled')
      // A lost reply after this point cannot establish that no usage occurred.
      this.dispatched = true
      const response = await this.rpc(
        'session/prompt',
        { sessionId: this.sessionId, prompt: [{ type: 'text', text: prompt }] },
        5 * 60000
      )
      if (this.fatal) throw this.fatal
      if (!record(response)) throw new AiError('outcome-unknown')
      switch (response.stopReason) {
        case 'end_turn':
          state = 'completed'
          break
        case 'cancelled':
          state = 'cancelled'
          reason = 'cancelled'
          break
        case 'max_tokens':
        case 'max_turn_requests':
          state = 'failed'
          reason = 'output-limit'
          break
        case 'refusal':
          state = 'failed'
          reason = 'provider-failed'
          break
        default:
          throw new AiError('outcome-unknown')
      }
    } catch (error) {
      reason = error instanceof AiError ? error.reason : 'provider-failed'
      state = this.dispatched ? 'unknown' : reason === 'cancelled' ? 'cancelled' : 'failed'
    } finally {
      this.settled = true
      if (this.cancelTimer) clearTimeout(this.cancelTimer)
    }
    const outcome: RuntimeUpdate = { text: this.text, state, reason }
    update(outcome)
    return outcome
  }

  async interrupt(): Promise<void> {
    this.cancelRequested = true
    if (!this.dispatched || this.settled || !this.sessionId || this.cancelTimer) return
    try {
      this.write({
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: { sessionId: this.sessionId }
      })
    } catch {
      this.fail(new AiError('outcome-unknown'))
      await this.close()
      return
    }
    // Cancellation is a notification, not an acknowledgment. Only the original
    // prompt response can confirm cancelled; retain chunks arriving meanwhile.
    this.cancelTimer = setTimeout(() => {
      this.fail(new AiError('outcome-unknown'))
      void this.close()
    }, 15000)
  }

  async close(): Promise<void> {
    if (this.stopping) {
      await this.exitPromise
      return
    }
    this.stopping = true
    if (this.cancelTimer) clearTimeout(this.cancelTimer)
    this.fail(new AiError(this.dispatched ? 'outcome-unknown' : 'runtime-unavailable'))
    if (!this.child || this.ended) return
    const child = this.child
    child.stdin.end()
    child.kill()
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    await this.exitPromise
    clearTimeout(timer)
  }
}
