import { app, shell } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { TextDecoder } from 'node:util'
import { isId } from '../../domain/editor/schema'
import { AI_LIMITS, aiText } from '../../shared/ai'
import { isAiCatalogModel, isCatalogModelId, isCodexReasoningEffort, type AiCatalogModel } from '../../shared/ai-catalog'
import type { AiConnectionReason } from '../../shared/ai-route'
import { record } from '../../shared/projects'
import { directory } from '../../worker/storage/files'
import { codexExecutable } from './codex-runtime'
import { selectAiRoute } from './deployment'
import { AiError } from './errors'
import { requireLocalTextIsolation } from './codex-local-policy'
import { CodexTextTurn, type CodexTextUpdate } from './codex-text-turn'
import { executionOutputSchema, identityHash, LOCAL_DISPATCH_V2, workspaceIdentity, type LocalExecution } from './local-operation'
import { secureAiStorage, type AiStorage } from './storage'

export class CodexAccountError extends AiError {
  constructor(readonly connectionReason: AiConnectionReason) { super('auth-failed') }
}
const accountError = (message: unknown): CodexAccountError => {
  // Examine only in memory; never retain or expose provider error text/URLs.
  const text = typeof message === 'string' ? message.slice(0,16000).toLowerCase() : ''
  return new CodexAccountError(/keyring|keychain|credential store/.test(text) ? 'secure-session-unavailable' :
    /address.*use|port.*use/.test(text) ? 'callback-port-in-use' : /timed out|timeout/.test(text) ? 'login-timeout' :
    /connect|dns|network|offline/.test(text) ? 'login-offline' : 'login-denied')
}
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; method: string }
type Completion = { loginId: string; success: boolean; reason: AiConnectionReason | null }
const config = [
  'cli_auth_credentials_store="keyring"', 'forced_login_method="chatgpt"', 'features.secret_auth_storage=false',
  'model_provider="openai"', 'approval_policy="never"', 'sandbox_mode="read-only"', 'web_search="disabled"',
  'features.shell_tool=false', 'features.unified_exec=false', 'features.multi_agent=false',
  'features.apps=false', 'features.plugins=false', 'features.hooks=false', 'features.remote_control=false',
  'mcp_servers={}', 'plugins={}', 'hooks={}', 'project_doc_max_bytes=0', 'history.persistence="none"',
  'analytics.enabled=false', 'feedback.enabled=false', 'otel.exporter="none"',
  'shell_environment_policy.inherit="none"', 'shell_environment_policy.experimental_use_profile=false'
]

/** One managed account transport, shared with explicit catalog discovery.
 * Never constructed by a status read; no generic renderer RPC entrypoint. */
export class CodexAccountRuntime {
  private generation=randomUUID()
  get epoch():string {return this.generation}
  private child: ChildProcessWithoutNullStreams | null = null
  private requests = new Map<number, Pending>()
  private nextId = 1
  private decoder = new TextDecoder('utf-8',{fatal:true})
  private buffer = ''
  private ended = false
  private closing = false
  private exit: Promise<void> = Promise.resolve()
  private closeWork: Promise<void> | null = null
  private completions = new Map<string, Completion>()
  private completionWaiter: { id: string; resolve: (value: Completion) => void; reject: (error: Error) => void } | null = null
  private loginId: string | null = null
  private authenticated = false
  private accountInvalidated = false
  private identity: {accountFingerprint:string;workspaceId:string} | null = null
  private cwd = ''
  private codexHome = ''
  private textTurn: CodexTextTurn | null = null
  private executing = false
  private cancelText = false
  constructor(private readonly storage: AiStorage, private readonly lost: (reason: AiConnectionReason) => void = () => undefined) {}
  isAlive(): boolean { return !!this.child && !this.ended && !this.closing }
  isStopping():boolean {return !!this.child&&this.closing&&!this.ended}
  hasCurrentAccount():boolean {return this.authenticated&&!this.accountInvalidated&&this.isAlive()}
  invalidateAccount():void {this.accountInvalidated=true;this.generation=randomUUID()}
  accountIdentity(): {accountFingerprint:string;workspaceId:string} | null {return this.hasCurrentAccount()&&this.identity?{...this.identity}:null}

  async open(profileId: string, signal: AbortSignal): Promise<void> {
    if (!isId(profileId) || selectAiRoute().kind !== 'local-codex-chatgpt') throw new AiError('development-access-unavailable')
    if (!secureAiStorage()) throw new CodexAccountError('secure-session-unavailable')
    // Load configuration in a credential-free namespace before exposing an
    // existing keyring namespace to startup. Managed/system config is not
    // suppressed by HOME or CLI flags. Refuse nonempty external layers.
    const guard = new CodexAccountRuntime(this.storage)
    try { await guard.launch('configuration', signal); await guard.requireConfiguration() }
    finally { await guard.close() }
    if (signal.aborted) throw new AiError('cancelled')
    await this.launch(profileId, signal)
    await this.requireConfiguration()
  }
  private async launch(name: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new AiError('cancelled')
    const binary = await codexExecutable(), root = await this.storage.runtimeRoot(), base = join(root,'local-codex')
    await directory(root,base)
    const profile = join(base,name)
    await directory(base,profile)
    for (const part of ['home','codex','work','tmp']) await directory(profile,join(profile,part))
    this.cwd = join(profile,'work'); this.codexHome = join(profile,'codex')
    // Never read a token file. Unexpected plaintext credentials/configuration
    // are retained for recovery and refused, including in the guard namespace.
    for (const path of [join(this.codexHome,'auth.json'),join(this.codexHome,'config.toml'),join(this.cwd,'.codex')]) {
      try { await lstat(path) } catch (error) {
        if (record(error) && error.code === 'ENOENT') continue
        throw new CodexAccountError('local-config-conflict')
      }
      throw new CodexAccountError('local-config-conflict')
    }
    const env: NodeJS.ProcessEnv = {
      HOME: join(profile,'home'), USERPROFILE: join(profile,'home'), CODEX_HOME: this.codexHome,
      XDG_CONFIG_HOME: join(profile,'home'), XDG_DATA_HOME: join(profile,'home'), XDG_CACHE_HOME: join(profile,'tmp'),
      TMPDIR: join(profile,'tmp'), TMP: join(profile,'tmp'), TEMP: join(profile,'tmp')
    }
    if (process.platform === 'win32') {
      if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
      if (process.env.WINDIR) env.WINDIR = process.env.WINDIR
    }
    if (signal.aborted) throw new AiError('cancelled')
    const child = spawn(binary,['app-server','--listen','stdio://',...config.flatMap(value=>['-c',value])],
      {cwd:this.cwd,env,stdio:'pipe',windowsHide:true,shell:false})
    this.child = child
    const abort = (): void => { void this.close() }
    signal.addEventListener('abort',abort,{once:true})
    this.exit = new Promise(resolve => child.once('close',()=>{
      this.ended = true; signal.removeEventListener('abort',abort)
      this.fail(new CodexAccountError('local-runtime-exited'))
      if (!this.closing) this.lost('local-runtime-exited')
      resolve()
    }))
    child.once('error',()=>this.unexpected(new CodexAccountError('local-runtime-exited')))
    child.stdin.on('error',()=>this.unexpected(new CodexAccountError('local-runtime-exited')))
    child.stderr.on('data',()=>{/* Credential-bearing runtime diagnostics never leave this pipe. */})
    child.stdout.on('data',(chunk: Buffer)=>this.consume(chunk))
    child.stdout.once('end',()=>{
      if (this.closing) return
      try {if (this.decoder.decode()||this.buffer.trim()) throw new AiError('outcome-unknown')}
      catch {this.unexpected(new AiError('outcome-unknown'))}
    })
    // Pinned account/read.workspaceRouting is experimental. Only its account ID
    // is consumed; backend origins and routing overrides never become inputs.
    await this.rpc('initialize',{clientInfo:{name:'collie_writer',title:'Collie Writer',version:app.getVersion()},capabilities:{experimentalApi:true}})
    this.write({method:'initialized',params:{}})
    if (signal.aborted) throw new AiError('cancelled')
  }
  private async requireConfiguration(): Promise<void> {
    const value = await this.rpc('config/read',{includeLayers:true,cwd:this.cwd})
    if (!record(value) || !record(value.config) || !Array.isArray(value.layers) || value.layers.length > 32) throw new CodexAccountError('local-config-conflict')
    const settings = value.config
    if (settings.cli_auth_credentials_store !== 'keyring' || settings.forced_login_method !== 'chatgpt' ||
      settings.model_provider !== 'openai' || !record(settings.features) || settings.features.secret_auth_storage !== false) throw new CodexAccountError('local-config-conflict')
    for (const layer of value.layers) {
      if (!record(layer) || !record(layer.name) || !record(layer.config)) throw new CodexAccountError('local-config-conflict')
      if (layer.disabledReason !== null) continue
      if (layer.name.type === 'sessionFlags') continue
      // Empty absent user/system layers are normal; no managed, project, cloud,
      // packaged or user instructions/settings can participate in this route.
      if (Object.keys(layer.config).length !== 0) throw new CodexAccountError('local-config-conflict')
    }
  }
  private write(value: unknown): void {
    if (!this.child || this.ended || this.closing || !this.child.stdin.writable) throw new CodexAccountError('local-runtime-exited')
    const line=JSON.stringify(value)+'\n'
    if (Buffer.byteLength(line)>1024*1024 || this.child.stdin.writableLength>1024*1024) throw new AiError('output-limit')
    this.child.stdin.write(line)
  }
  private rpc(method: string, params: unknown): Promise<unknown> {
    if (this.requests.size>=32) return Promise.reject(new AiError('busy'))
    const id = this.nextId++
    return new Promise((resolve,reject)=>{
      const timer = setTimeout(()=>{this.requests.delete(id);reject(this.executing?new AiError('outcome-unknown'):new CodexAccountError(method==='model/list'?'model-catalog-timeout':'login-timeout'))},20000)
      this.requests.set(id,{resolve,reject,timer,method})
      try { this.write({id,method,params}) } catch (error) { clearTimeout(timer);this.requests.delete(id);reject(error) }
    })
  }
  private consume(chunk: Buffer): void {
    try {this.buffer += this.decoder.decode(chunk,{stream:true})}
    catch {this.unexpected(new AiError('outcome-unknown'));return}
    if (Buffer.byteLength(this.buffer) > 4*1024*1024) { this.unexpected(new AiError('output-limit'));return }
    let index: number
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0,index);this.buffer = this.buffer.slice(index+1)
      if (!line.trim()) continue
      try { this.receive(JSON.parse(line)) } catch(error) { this.unexpected(error instanceof AiError?error:new AiError('provider-failed'));return }
    }
  }
  private receive(value: unknown): void {
    if (!record(value)) throw new AiError('provider-failed')
    if ('id' in value && !('method' in value)) {
      if (typeof value.id !== 'number' || !Number.isSafeInteger(value.id)) return
      const pending = this.requests.get(value.id)
      if (!pending) return
      this.requests.delete(value.id);clearTimeout(pending.timer)
      if (('error' in value)===('result' in value)) pending.reject(new AiError('provider-failed'))
      else if ('error' in value) pending.reject(this.executing ? new AiError('outcome-unknown') : pending.method==='model/list' ? new CodexAccountError('model-catalog-unavailable') : accountError(record(value.error) ? value.error.message : null))
      else pending.resolve(value.result)
      return
    }
    if ('id' in value) {
      // The account transport grants no approvals, tools, secrets or token refresh requests.
      if (typeof value.id === 'number' || aiText(value.id,512)) this.write({id:value.id,error:{code:-32601,message:'Unsupported account request'}})
      if (this.executing) this.unexpected(new AiError('isolation-unresolved'))
      return
    }
    if (value.method === 'account/updated' && this.authenticated) {
      // This notification carries no stable identity. Even chatgpt -> chatgpt
      // can replace a workspace/account. Retire authority immediately. Idle
      // routing notifications may be benign: an explicit Resume can re-read
      // this same child, avoiding a startup-notification/restart loop.
      this.accountInvalidated=true;this.generation=randomUUID()
      if(this.executing||!record(value.params)||value.params.authMode!=='chatgpt')this.unexpected(new CodexAccountError('reconnect-required'))
      else this.lost('reconnect-required')
      return
    }
    if (value.method==='configWarning' && this.executing) {this.unexpected(new AiError('isolation-unresolved'));return}
    if (typeof value.method==='string') this.textTurn?.receive(value.method,value.params)
    if (value.method !== 'account/login/completed') return
    const params = value.params
    if (!record(params) || !isId(params.loginId) || typeof params.success !== 'boolean') return
    const result: Completion = {loginId:params.loginId,success:params.success,reason:params.success?null:accountError(params.error).connectionReason}
    if (this.completionWaiter?.id === result.loginId) this.completionWaiter.resolve(result)
    else if (this.completions.size < 8) this.completions.set(result.loginId,result)
  }
  private fail(error: Error): void {
    for (const pending of this.requests.values()) {clearTimeout(pending.timer);pending.reject(error)}
    this.requests.clear();this.completionWaiter?.reject(error);this.completionWaiter=null
    this.textTurn?.fail(error instanceof CodexAccountError?'outcome-unknown':error instanceof AiError?error.reason:'outcome-unknown')
  }
  private unexpected(error: Error): void {
    if (!this.closing) this.lost(error instanceof CodexAccountError ? error.connectionReason : 'local-runtime-exited')
    this.fail(error);void this.close()
  }
  private openBrowser(url: string, signal: AbortSignal): Promise<void> {
    const child = this.child
    if (signal.aborted) return Promise.reject(new AiError('cancelled'))
    if (!child || !this.isAlive()) return Promise.reject(new CodexAccountError('local-runtime-exited'))
    return new Promise((resolve,reject)=>{
      let settled = false
      const finish = (error?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort',cancel)
        child.removeListener('close',closed)
        if (error) reject(error)
        else resolve()
      }
      const cancel = (): void => finish(new AiError('cancelled'))
      const closed = (): void => finish(new CodexAccountError('local-runtime-exited'))
      const timer = setTimeout(()=>finish(new CodexAccountError('browser-unavailable')),20000)
      signal.addEventListener('abort',cancel,{once:true})
      child.once('close',closed)
      if (signal.aborted) { cancel();return }
      if (!this.isAlive()) { closed();return }
      // The OS launch itself cannot be recalled. Its late completion cannot
      // release a cancelled wait or continue this retired login attempt.
      try { void shell.openExternal(url).then(()=>finish(),()=>finish(new CodexAccountError('browser-unavailable'))) }
      catch { finish(new CodexAccountError('browser-unavailable')) }
    })
  }
  async login(signal: AbortSignal): Promise<string> {
    // v0.160.0 otherwise sends /cancel to a service occupying port 1455. Refuse
    // an occupied port before asking it to login. Never contact that service.
    await new Promise<void>((resolve,reject)=>{
      const reservation = createServer()
      reservation.once('error',()=>reject(new CodexAccountError('callback-port-in-use')))
      reservation.listen({host:'127.0.0.1',port:1455,exclusive:true},()=>reservation.close(error=>error?reject(new CodexAccountError('callback-port-in-use')):resolve()))
    })
    if (signal.aborted) throw new AiError('cancelled')
    const response = await this.rpc('account/login/start',{type:'chatgpt'})
    if (!record(response) || response.type !== 'chatgpt' || !isId(response.loginId) || !aiText(response.authUrl,8192)) throw new AiError('auth-failed')
    const loginId = response.loginId
    this.loginId = loginId
    const url = new URL(response.authUrl)
    if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/oauth/authorize' || url.username || url.password || url.hash ||
      ['client_id','redirect_uri','response_type','state','code_challenge','code_challenge_method'].some(key=>url.searchParams.getAll(key).length!==1) ||
      !url.searchParams.get('client_id') || url.searchParams.get('redirect_uri') !== 'http://127.0.0.1:1455/auth/callback' ||
      url.searchParams.get('response_type') !== 'code' || url.searchParams.get('code_challenge_method') !== 'S256' ||
      !url.searchParams.get('state') || !url.searchParams.get('code_challenge')) throw new AiError('auth-failed')
    if (signal.aborted) throw new AiError('cancelled')
    await this.openBrowser(url.href,signal)
    if (signal.aborted) throw new AiError('cancelled')
    const result = this.completions.get(loginId) ?? await new Promise<Completion>((resolve,reject)=>{
      const timer = setTimeout(()=>{this.completionWaiter=null;reject(new CodexAccountError('login-timeout'))},180000)
      this.completionWaiter = {id:loginId,resolve:value=>{clearTimeout(timer);this.completionWaiter=null;resolve(value)},
        reject:error=>{clearTimeout(timer);this.completionWaiter=null;reject(error)}}
      if (this.ended || this.closing || signal.aborted) this.completionWaiter.reject(new AiError('cancelled'))
    })
    if (!result.success) throw new CodexAccountError(result.reason ?? 'login-denied')
    if (signal.aborted) throw new AiError('cancelled')
    return this.readAccount()
  }
  async readAccount(): Promise<string> {
    const generation=this.generation
    const value = await this.rpc('account/read',{refreshToken:false})
    if(generation!==this.generation)throw new CodexAccountError('reconnect-required')
    if (!record(value) || !record(value.account) || value.account.type !== 'chatgpt') throw new CodexAccountError('reconnect-required')
    const email = value.account.email
    if (!aiText(email,200) || !email.trim() || /[\u0000-\u001f\u007f]/u.test(email)) throw new CodexAccountError('reconnect-required')
    const workspace=record(value.workspaceRouting)?value.workspaceRouting.chatgptAccountId:null
    const identity=workspaceIdentity(workspace)?{workspaceId:workspace,accountFingerprint:identityHash({label:email.trim(),workspaceId:workspace})}:null
    if(this.identity&&(!identity||identityHash(identity)!==identityHash(this.identity))) {
      this.identity=null;this.unexpected(new CodexAccountError('local-account-changed'));throw new CodexAccountError('local-account-changed')
    }
    this.identity=identity
    this.authenticated = true;this.accountInvalidated=false
    return email.trim()
  }
  async models(): Promise<AiCatalogModel[]> {
    if (this.executing) throw new AiError('busy')
    if (!this.authenticated || !this.isAlive()) throw new CodexAccountError('reconnect-required')
    const models: AiCatalogModel[] = [], ids=new Set<string>(), cursors=new Set<string>()
    let cursor: string | null = null, count=0
    do {
      const value=await this.rpc('model/list',{limit:20,includeHidden:false,...(cursor?{cursor}:{})})
      if (!record(value)||!Array.isArray(value.data)||value.data.length>100||
        !(value.nextCursor===null||aiText(value.nextCursor,2048)&&value.nextCursor.length>0)) throw new CodexAccountError('model-catalog-unavailable')
      count+=value.data.length
      if (count>100) throw new CodexAccountError('model-catalog-unavailable')
      for (const entry of value.data) {
        if (!record(entry)||typeof entry.hidden!=='boolean'||!Array.isArray(entry.inputModalities)) throw new CodexAccountError('model-catalog-unavailable')
        if (entry.hidden||!entry.inputModalities.includes('text')) continue
        const candidate={id:entry.model,label:entry.displayName,isDefault:entry.isDefault,inputModalities:entry.inputModalities,
          reasoningEfforts:Array.isArray(entry.supportedReasoningEfforts)?entry.supportedReasoningEfforts.map(option=>record(option)?option.reasoningEffort:null):null,
          defaultReasoningEffort:entry.defaultReasoningEffort}
        if (!isAiCatalogModel(candidate)||ids.has(candidate.id)) throw new CodexAccountError('model-catalog-unavailable')
        ids.add(candidate.id);models.push(candidate)
      }
      cursor=value.nextCursor as string|null
      if (cursor) {
        if (cursors.has(cursor)||cursors.size>=10) throw new CodexAccountError('model-catalog-unavailable')
        cursors.add(cursor)
      }
    } while (cursor)
    return models
  }
  /** Main-only single-turn adapter, reached only through durable CD04 bindings.
   * The route-specific gate MUST stay before thread creation/content dispatch
   * until real tool and content-log controls replace the current refusal. */
  async executeText(input:{epoch:string;model:string;execution:LocalExecution}, authorize:()=>Promise<void>, update:(value:CodexTextUpdate)=>void):Promise<CodexTextUpdate> {
    if (this.executing) throw new AiError('busy')
    if (!this.hasCurrentAccount()||input.epoch!==this.epoch) throw new AiError('session-expired')
    const {framedText:text,defaultReasoningEffort}=input.execution,outputSchema=executionOutputSchema(input.execution)
    if (!isCatalogModelId(input.model)||!isCodexReasoningEffort(defaultReasoningEffort)||!aiText(text,AI_LIMITS.prompt+AI_LIMITS.context)||!text.trim()) throw new AiError('invalid-request')
    requireLocalTextIsolation()
    this.executing=true;this.cancelText=false
    let turn:CodexTextTurn|null=null
    try {
      await authorize()
      await this.requireConfiguration()
      requireLocalTextIsolation()
      if (this.cancelText) throw new AiError('cancelled')
      if (!this.isAlive()) throw new AiError('session-expired')
      const value=await this.rpc('thread/start',{model:input.model,modelProvider:'openai',cwd:this.cwd,approvalPolicy:'never',sandbox:'readOnly',ephemeral:true,
        baseInstructions:LOCAL_DISPATCH_V2.baseInstructions,
        developerInstructions:LOCAL_DISPATCH_V2.developerInstructions})
      if (!record(value)||!record(value.thread)||!isId(value.thread.id)||value.thread.ephemeral!==true||value.thread.path!==null||
        value.thread.forkedFromId!==null||value.thread.parentThreadId!==null||!Array.isArray(value.thread.turns)||value.thread.turns.length!==0||
        value.model!==input.model||value.modelProvider!=='openai'||value.cwd!==this.cwd||value.approvalPolicy!=='never'||
        !Array.isArray(value.instructionSources)||value.instructionSources.length!==0||!record(value.sandbox)||value.sandbox.type!=='readOnly') throw new AiError('isolation-unresolved')
      turn=new CodexTextTurn(value.thread.id,update,async turnId=>{
        const result=await this.rpc('turn/interrupt',{threadId:turn!.threadId,turnId})
        if (!record(result)||Object.keys(result).length!==0) throw new AiError('outcome-unknown')
      },()=>this.unexpected(new AiError('outcome-unknown')))
      this.textTurn=turn
      await authorize()
      requireLocalTextIsolation()
      if (this.cancelText) throw new AiError('cancelled')
      if (!this.isAlive()||input.epoch!==this.epoch) throw new AiError('session-expired')
      turn.startDispatch()
      const started=await this.rpc('turn/start',{threadId:turn.threadId,model:input.model,input:[{type:'text',text,text_elements:[]}],
        approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},serviceTierForTurn:'default',effort:defaultReasoningEffort,
        ...(outputSchema?{outputSchema}:{})})
      turn.acknowledge(started)
      const outcome=await turn.outcome
      if (this.isAlive()) {
        // No resume/history API or archive request. Remove this subscription;
        // this is not a secure-erasure guarantee. Uncertainty retires the child.
        try {
          const result=await this.rpc('thread/unsubscribe',{threadId:turn.threadId})
          if (!record(result)||!['unsubscribed','notLoaded'].includes(String(result.status))) throw new AiError('outcome-unknown')
        } catch {this.unexpected(new AiError('outcome-unknown'));await this.close()}
      }
      return outcome
    } catch(error) {
      if (!turn) {this.unexpected(error instanceof AiError?error:new AiError('outcome-unknown'));await this.close();throw error}
      turn.fail(error instanceof AiError?error.reason:'outcome-unknown')
      this.unexpected(error instanceof AiError?error:new AiError('outcome-unknown'))
      await this.close()
      return turn.outcome
    } finally {this.textTurn=null;this.executing=false}
  }
  interruptText():void {if (this.executing) {this.cancelText=true;this.textTurn?.interrupt()}}
  async cancelLogin(): Promise<void> {
    if (!this.loginId || this.ended || this.closing) return
    const value=await this.rpc('account/login/cancel',{loginId:this.loginId})
    if (!record(value) || !['canceled','notFound'].includes(String(value.status))) throw new AiError('outcome-unknown')
  }
  async logout(): Promise<void> {
    await this.requireConfiguration()
    this.authenticated = false
    const result = await this.rpc('account/logout',{})
    if (!record(result) || Object.keys(result).length) throw new AiError('outcome-unknown')
    // The runtime swallows remote revocation failures. This acknowledges local
    // store removal only; never report confirmed remote/global revocation.
  }
  close(): Promise<void> {
    if (this.closeWork) return this.closeWork
    this.closing=true;this.fail(new AiError('cancelled'))
    this.closeWork=(async()=>{
      const child=this.child
      if (!child || this.ended) return
      child.stdin.end()
      const terminate=setTimeout(()=>child.kill(),1000)
      const kill=setTimeout(()=>child.kill('SIGKILL'),3000)
      try { await this.exit } finally {clearTimeout(terminate);clearTimeout(kill)}
    })()
    return this.closeWork
  }
}
