import { isId } from '../../domain/editor/schema'
import { AI_LIMITS, aiText, type AiReason } from '../../shared/ai'
import { record } from '../../shared/projects'
import { AiError } from './errors'

// Main-only output. CD04 binds/protects these distinct channels before feature
// settlement. No opaque provider IDs or hidden reasoning leave here.
export type CodexTextUpdate = {
  text: string; commentary: string; finalText: string | null
  state: 'running' | 'completed' | 'cancelled' | 'failed' | 'unknown'; reason: AiReason | null
}
type Item = { text: string; phase: 'commentary' | 'final_answer' | null; complete: boolean }
type Terminal = { state: 'completed' | 'cancelled' | 'failed'; reason: AiReason | null }
const itemId=(v:unknown):v is string=>aiText(v,512)&&v.length>0
export function codexTurnReason(error: unknown): AiReason {
  if (!record(error)) return 'provider-failed'
  const info=error.codexErrorInfo
  if (info==='usageLimitExceeded'||info==='rateLimitExceeded'||info==='sessionBudgetExceeded') return 'quota-exhausted'
  if (info==='unauthorized') return 'session-expired'
  if (info==='contextWindowExceeded') return 'output-limit'
  if (record(info)&&['httpConnectionFailed','responseStreamDisconnected','responseStreamConnectionFailed','responseTooManyFailedAttempts'].some(key=>key in info)) return 'outcome-unknown'
  return 'provider-failed'
}

/** One fresh thread/one turn. Notification completion is held until the start
 * reply confirms the same turn. No RPC acknowledgment is treated as success. */
export class CodexTextTurn {
  private turnId: string | null = null
  private items=new Map<string,Item>()
  private acknowledged=false
  private dispatched=false
  private settled=false
  private stopping=false
  private interruptSent=false
  private terminal: Terminal | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private resolve!: (value:CodexTextUpdate)=>void
  readonly outcome=new Promise<CodexTextUpdate>(resolve=>{this.resolve=resolve})
  constructor(readonly threadId:string, private readonly emit:(value:CodexTextUpdate)=>void,
    private readonly interruptRpc:(turnId:string)=>Promise<void>, private readonly terminate:()=>void) {}
  startDispatch(): void {
    if (this.stopping) throw new AiError('cancelled')
    this.dispatched=true
    this.timer=setTimeout(()=>this.lost('outcome-unknown'),5*60000)
  }
  acknowledge(value:unknown): void {
    if (!record(value)||!record(value.turn)||!isId(value.turn.id)) throw new AiError('outcome-unknown')
    this.correlate(value.turn.id);this.acknowledged=true
    // A start reply can include items, but only turn/completed settles success.
    if (this.terminal) this.finish(this.terminal.state,this.terminal.reason)
  }
  private correlate(id: unknown): void {
    if (!isId(id)||(this.turnId!==null&&this.turnId!==id)) throw new AiError('outcome-unknown')
    this.turnId=id
    if (this.stopping) this.sendInterrupt()
  }
  receive(method:string,p:unknown): void {
    if (this.settled||!this.dispatched||!record(p)||p.threadId!==this.threadId) return
    if (!['turn/started','turn/completed','item/started','item/completed','item/agentMessage/delta','error','model/rerouted'].includes(method)) return
    this.correlate(method==='turn/started'||method==='turn/completed' ? record(p.turn)?p.turn.id:null : p.turnId)
    if (method==='model/rerouted') {this.lost('model-unavailable');return}
    if (method==='error') {
      // Runtime retry is not an app retry. Refuse further work after a reported
      // error; interruption cannot promise it beat an in-flight runtime retry.
      if (p.willRetry===true) this.sendInterrupt()
      this.lost(codexTurnReason(p.error));return
    }
    if (method==='item/agentMessage/delta') {
      if (!itemId(p.itemId)||!aiText(p.delta,AI_LIMITS.output)) throw new AiError('output-limit')
      const prior=this.items.get(p.itemId)
      if (prior?.complete) throw new AiError('outcome-unknown')
      this.setItem(p.itemId,{text:(prior?.text??'')+p.delta,phase:prior?.phase??null,complete:false})
    }
    if (method==='item/started'||method==='item/completed') this.item(p.item,method==='item/completed')
    if (method==='turn/completed') {
      if (!record(p.turn)||!Array.isArray(p.turn.items)||p.turn.items.length>128) throw new AiError('provider-failed')
      for (const item of p.turn.items) this.item(item,true)
      if (p.turn.status==='completed') this.terminal={state:'completed',reason:null}
      else if (p.turn.status==='interrupted') this.terminal={state:'cancelled',reason:'cancelled'}
      else if (p.turn.status==='failed') this.terminal={state:'failed',reason:codexTurnReason(p.turn.error)}
      else throw new AiError('outcome-unknown')
      if (this.acknowledged) this.finish(this.terminal.state,this.terminal.reason)
    }
  }
  private item(value:unknown,complete:boolean): void {
    if (!record(value)) throw new AiError('provider-failed')
    if (value.type==='reasoning'||value.type==='userMessage') return
    if (value.type!=='agentMessage') throw new AiError('isolation-unresolved')
    if (!itemId(value.id)||!aiText(value.text,AI_LIMITS.output)||
      !(value.phase===null||value.phase==='commentary'||value.phase==='final_answer')||value.memoryCitation!==null||value.delivery!==null||value.questions!==null) throw new AiError('provider-failed')
    const prior=this.items.get(value.id)
    if (prior?.phase!==null&&prior?.phase!==undefined&&prior.phase!==value.phase) throw new AiError('outcome-unknown')
    if (prior?.complete) {
      if (prior.text!==value.text||prior.phase!==value.phase) throw new AiError('outcome-unknown')
      return
    }
    if (prior && !(complete?value.text.startsWith(prior.text):prior.text.startsWith(value.text))) throw new AiError('outcome-unknown')
    this.setItem(value.id,{text:!complete&&prior?prior.text:value.text,phase:value.phase,complete})
  }
  private setItem(id:string,value:Item): void {
    if (!this.items.has(id)&&this.items.size>=64) throw new AiError('output-limit')
    let size=value.text.length
    for (const [key,item] of this.items) if (key!==id) size+=item.text.length+2
    if (size>AI_LIMITS.output) throw new AiError('output-limit')
    this.items.set(id,value);this.emit(this.snapshot('running',null))
  }
  private snapshot(state:CodexTextUpdate['state'],reason:AiReason|null): CodexTextUpdate {
    const items=[...this.items.values()],final=items.filter(item=>item.phase==='final_answer')
    return {text:items.map(item=>item.text).join('\n\n'),commentary:items.filter(item=>item.phase==='commentary').map(item=>item.text).join('\n\n'),
      finalText:state==='completed'&&final.length===1&&final[0].complete&&items.every(item=>item.phase!==null)?final[0].text:null,state,reason}
  }
  private finish(state:CodexTextUpdate['state'],reason:AiReason|null): void {
    if (this.settled) return
    this.settled=true
    if (this.timer) clearTimeout(this.timer)
    const value=this.snapshot(state,reason)
    // Resolve even if a downstream protection callback fails; the owner keeps
    // the returned actual snapshot and owns the local storage failure.
    try {this.emit(value)} finally {this.resolve(value)}
  }
  fail(reason:AiReason): void {
    // Closing the child after possible dispatch is not provider-confirmed
    // cancellation. Keep both its state and explanation uncertain.
    this.finish(this.dispatched?'unknown':reason==='cancelled'?'cancelled':'failed',this.dispatched&&reason==='cancelled'?'outcome-unknown':reason)
  }
  lost(reason:AiReason): void {try {this.fail(reason)} finally {this.terminate()}}
  interrupt(): void {
    this.stopping=true
    if (this.settled) return
    if (!this.dispatched) {this.finish('cancelled','cancelled');return}
    this.sendInterrupt()
  }
  private sendInterrupt(): void {
    if (this.interruptSent||!this.turnId||this.settled) return
    this.interruptSent=true
    if (this.timer) clearTimeout(this.timer)
    this.timer=setTimeout(()=>this.lost('outcome-unknown'),15000)
    void this.interruptRpc(this.turnId).catch(()=>this.lost('outcome-unknown'))
  }
}
