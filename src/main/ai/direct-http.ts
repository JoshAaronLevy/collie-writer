import { ResearchResponse } from './research-response'
import { hasControlCharacters } from '../../shared/control-characters'
import { request } from 'node:https'
import type { IncomingMessage } from 'node:http'
import { StringDecoder } from 'node:string_decoder'
import { AI_LIMITS, aiText } from '../../shared/ai'
import { record } from '../../shared/projects'
import { isCatalogModelId, type AiCatalogModel } from '../../shared/ai-catalog'
import type { DirectStage } from '../../shared/ai-direct'
import type { CodexTextUpdate } from './codex-text-turn'
import { DirectError, directFailure, directIssue, httpFailure } from './direct-errors'
import type { DirectTextExecution } from './direct-conversation'

/** Fixed endpoints; no environment credentials, redirect, proxy, retry or tool
 * executor. The caller supplies only its protected, validated OAuth token. */
async function open(
  path: '/models' | '/responses',
  access: string,
  signal: AbortSignal,
  body?: string
): Promise<{ response: IncomingMessage; close: () => void }> {
  const stage: DirectStage = path === '/models' ? 'model-discovery' : 'inference-http'
  if (signal.aborted) throw new DirectError(directIssue(stage, 'cancelled', 'cancelled'))
  return new Promise((resolve, reject) => {
    const req = request(
      `https://api.openai.com/v1${path}`,
      {
        method: body ? 'POST' : 'GET',
        signal,
        agent: false,
        headers: {
          Authorization: `Bearer ${access}`,
          Accept: body ? 'text/event-stream' : 'application/json',
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {})
        }
      },
      (response) => resolve({ response, close })
    )
    const timer = setTimeout(() => req.destroy(new Error('DEADLINE')), body ? 5 * 60000 : 30000)
    const close = (): void => {
      clearTimeout(timer)
      req.destroy()
    }
    req.setTimeout(body ? 90000 : 30000, () => req.destroy(new Error('IDLE')))
    req.on('error', () => {
      clearTimeout(timer)
      reject(
        new DirectError(directIssue(stage, signal.aborted ? 'cancelled' : 'offline', 'interrupted'))
      )
    })
    req.end(body)
  })
}
async function jsonBody(response: IncomingMessage, stage: DirectStage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of response) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > 1024 * 1024) throw protocolFailure(stage, 'collie_error_body_limit')
    chunks.push(part)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}
function requestId(response: IncomingMessage): string | undefined {
  const id = response.headers['x-request-id']
  return typeof id === 'string' ? id : undefined
}
function protocolFailure(stage: DirectStage, code: string): DirectError {
  return new DirectError({ ...directIssue(stage, 'provider-failed', 'invalid-response'), code })
}
/** Preserve response metadata even when parsing fails. Never retain a body,
 * provider message, header set, prompt or credential in diagnostics. */
function responseFailure(
  error: unknown,
  response: IncomingMessage,
  stage: DirectStage
): DirectError {
  const issue = directFailure(stage, error)
  const id = requestId(response)
  const mediaType = String(response.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  return new DirectError({
    ...issue,
    httpStatus: issue.httpStatus ?? response.statusCode ?? null,
    requestId: issue.requestId ?? (id && /^[A-Za-z0-9_.:-]{1,128}$/.test(id) ? id : null),
    responseType:
      mediaType === 'text/event-stream'
        ? 'event-stream'
        : mediaType === 'application/json' || mediaType.endsWith('+json')
          ? 'json'
          : mediaType === 'text/html'
            ? 'html'
            : mediaType
              ? 'other'
              : 'missing'
  })
}
export async function planModels(access: string, signal: AbortSignal): Promise<AiCatalogModel[]> {
  const { response, close } = await open('/models', access, signal)
  try {
    const value = await jsonBody(response, 'model-discovery')
    if (response.statusCode !== 200)
      throw httpFailure('model-discovery', response.statusCode ?? 502, value, requestId(response))
    if (!record(value) || !Array.isArray(value.models) || value.models.length > 1000)
      throw protocolFailure('model-discovery', 'collie_invalid_model_catalog')
    const visible = value.models.filter((m) => record(m) && m.visibility === 'list')
    if (
      visible.length > 100 ||
      visible.some(
        (m) =>
          !isCatalogModelId(m.slug) ||
          typeof m.display_name !== 'string' ||
          !m.display_name.trim() ||
          m.display_name.length > 200 ||
          hasControlCharacters(m.display_name, false, 0x7f)
      ) ||
      new Set(visible.map((m) => m.slug)).size !== visible.length
    )
      throw protocolFailure('model-discovery', 'collie_invalid_model_catalog')
    return visible.map((m): AiCatalogModel => ({
      id: m.slug as string,
      label: m.display_name as string,
      isDefault: false,
      inputModalities: ['text'],
      reasoningEfforts: [],
      defaultReasoningEffort: null
    }))
  } catch (error) {
    throw responseFailure(error, response, 'model-discovery')
  } finally {
    close()
  }
}
function completedText(value: unknown, streamed: string): string {
  if (
    !record(value) ||
    value.status !== 'completed' ||
    value.error != null ||
    value.incomplete_details != null ||
    !Array.isArray(value.output) ||
    value.output.length > 256
  )
    throw protocolFailure('inference-stream', 'collie_invalid_completed_response')
  let text = ''
  for (const item of value.output) {
    if (!record(item)) throw protocolFailure('inference-stream', 'collie_invalid_output_item')
    if (item.type === 'reasoning') continue // Do not retain hidden reasoning or signatures.
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content))
      throw protocolFailure('inference-stream', 'collie_unsupported_output_item')
    for (const part of item.content) {
      if (!record(part)) throw protocolFailure('inference-stream', 'collie_invalid_text_part')
      const content =
        part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : null
      if (!aiText(content, AI_LIMITS.output))
        throw protocolFailure('inference-stream', 'collie_invalid_text_part')
      text += content
      if (text.length > AI_LIMITS.output)
        throw new DirectError(directIssue('inference-stream', 'output-limit'))
    }
  }
  // The completed event can omit the duplicate answer in its output array.
  // Retain already-validated deltas from this request in that case. A nonempty
  // terminal answer must still match them; EOF/[DONE] never calls this path.
  if (!text.length) text = streamed
  if (!text.trim()) throw protocolFailure('inference-stream', 'collie_empty_response')
  return text
}
/** Completion requires the provider terminal event, never EOF or a final delta.
 * Abort closes HTTP; it does not assert remote cancellation or returned usage. */
export async function planResponse(
  access: string,
  model: string,
  execution: DirectTextExecution,
  signal: AbortSignal,
  update: (value: CodexTextUpdate) => void,
  onStreaming: () => void
): Promise<void> {
  const research = execution.template === 'conversation-research-v1' ? new ResearchResponse() : null
  const body = JSON.stringify({
    model,
    instructions: execution.instructions,
    input:
      execution.template !== 'conversation-v1'
        ? JSON.parse(execution.framedText)
        : [{ role: 'user', content: execution.framedText }],
    ...(execution.template === 'conversation-research-v1' ? execution.researchPolicy : {}),
    store: false,
    stream: true
  })
  const { response, close } = await open('/responses', access, signal, body)
  let stage: DirectStage = 'inference-http'
  let text = '',
    terminal = false
  try {
    if (response.statusCode !== 200)
      throw httpFailure(
        'inference-http',
        response.statusCode ?? 502,
        await jsonBody(response, 'inference-http'),
        requestId(response)
      )
    // Like the official SDK, parse a requested stream by its events, not its
    // Content-Type header. Completion still requires response.completed and a
    // validated output. A JSON error body must remain a provider failure.
    const decoder = new StringDecoder('utf8')
    let buffer = '',
      bytes = 0,
      data: string[] = [],
      mode: 'sse' | 'json' | null = null,
      errorEvent = false
    const event = (): void => {
      const isErrorEvent = errorEvent
      errorEvent = false
      if (!data.length) return
      const raw = data.join('\n')
      data = []
      if (raw === '[DONE]') return // This sentinel alone never establishes success.
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        throw protocolFailure('inference-stream', 'collie_invalid_stream_json')
      }
      if (record(value) && (isErrorEvent || record(value.error) || typeof value.error === 'string'))
        throw httpFailure(
          'inference-stream',
          200,
          value.error ? value : { error: value },
          requestId(response)
        )
      if (!record(value) || typeof value.type !== 'string')
        throw protocolFailure('inference-stream', 'collie_invalid_stream_event')
      research?.receive(value)
      if (value.type === 'response.output_text.delta' || value.type === 'response.refusal.delta') {
        if (
          !aiText(value.delta, AI_LIMITS.output) ||
          text.length + value.delta.length > AI_LIMITS.output
        )
          throw new DirectError(directIssue('inference-stream', 'output-limit'))
        text += value.delta
        update({ text, commentary: '', finalText: null, state: 'running', reason: null })
      } else if (value.type === 'response.completed') {
        const researched = research?.complete(value.response, text)
        const final = researched?.text ?? completedText(value.response, text)
        if (text && text !== final)
          throw protocolFailure('inference-stream', 'collie_response_text_mismatch')
        text = final
        terminal = true
        update({
          text,
          commentary: '',
          finalText: text,
          state: 'completed',
          reason: null,
          ...(researched ? { research: researched.research } : {})
        })
      } else if (value.type === 'response.failed' || value.type === 'error') {
        throw httpFailure(
          'inference-stream',
          200,
          value.type === 'error' ? { error: value } : value.response,
          requestId(response)
        )
      } else if (value.type === 'response.incomplete') {
        throw new DirectError({
          ...directIssue('inference-stream', 'provider-failed', 'incomplete')
        })
      }
    }
    for await (const chunk of response) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += part.length
      if (bytes > 8 * 1024 * 1024)
        throw new DirectError(directIssue('inference-stream', 'output-limit'))
      buffer += decoder.write(part)
      if (buffer.length + data.reduce((n, line) => n + line.length, 0) > 1024 * 1024)
        throw new DirectError(directIssue(stage, 'output-limit'))
      if (mode === null) {
        buffer = buffer.replace(/^\uFEFF/, '')
        const first = buffer.trimStart()[0]
        if (!first) continue
        mode = first === '{' ? 'json' : 'sse'
        if (mode === 'sse') {
          stage = 'inference-stream'
          onStreaming()
        }
      }
      if (mode === 'json') continue
      let boundary: number
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary).replace(/\r$/, '')
        buffer = buffer.slice(boundary + 1)
        if (line === '') event()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        else if (line.startsWith('event:')) errorEvent = line.slice(6).trim() === 'error'
        if (terminal) return
      }
    }
    buffer += decoder.end()
    if (mode === 'json') {
      let value: unknown
      try {
        value = JSON.parse(buffer)
      } catch {
        throw protocolFailure('inference-http', 'collie_invalid_json_response')
      }
      if (
        record(value) &&
        (record(value.error) || typeof value.error === 'string' || typeof value.detail === 'string')
      )
        throw httpFailure('inference-http', 200, value, requestId(response))
      throw protocolFailure('inference-http', 'collie_non_streaming_response')
    }
    // A final event need not end in a second newline; still parse it once.
    if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, '').replace(/\r$/, ''))
    if (data.length) event()
    if (!terminal)
      throw new DirectError(directIssue('inference-stream', 'outcome-unknown', 'interrupted'))
  } catch (error) {
    throw responseFailure(error, response, stage)
  } finally {
    close()
  }
}
