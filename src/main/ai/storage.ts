import { safeStorage } from 'electron'
import { randomUUID } from 'node:crypto'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isId } from '../../domain/editor/schema'
import { aiText, isAiOperation, isAiPrepare, AI_LIMITS, type AiOperation, type AiPrepareInput } from '../../shared/ai'
import { exact, record } from '../../shared/projects'
import { contained, directory, writeJson } from '../../worker/storage/files'
import { AiError } from './errors'

export type Tokens = { access: string; refresh: string; id: string; expiresAt: number; earliestRefreshAt: number; scopes: string[] }
export type Account = { id: string; subject: string; label: string; clientId: string; tokens: Tokens | null; refreshPending: boolean }
export type Credentials = { version: 1; hostId: string; activeId: string | null; accounts: Account[] }
export type RetainedOperation = { version: 1; input: AiPrepareInput; view: AiOperation }
const secret = (v: unknown): v is string => aiText(v,32768) && v.length > 0 && !/[\s\u0000-\u001f]/u.test(v)
const finiteTime = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0
export function isTokens(v: unknown): v is Tokens {
  return record(v) && exact(v,['access','refresh','id','expiresAt','earliestRefreshAt','scopes']) && [v.access,v.refresh,v.id].every(secret) &&
    finiteTime(v.expiresAt) && finiteTime(v.earliestRefreshAt) && Array.isArray(v.scopes) && v.scopes.length <= 32 && v.scopes.every(s=>typeof s==='string' && /^[a-zA-Z0-9.:_-]{1,100}$/.test(s))
}
function isCredentials(v: unknown): v is Credentials {
  return record(v) && exact(v,['version','hostId','activeId','accounts']) && v.version===1 && isId(v.hostId) && (v.activeId===null || isId(v.activeId)) &&
    Array.isArray(v.accounts) && v.accounts.length<=8 && v.accounts.every(a=>record(a) && exact(a,['id','subject','label','clientId','tokens','refreshPending']) &&
      isId(a.id) && aiText(a.subject,500) && a.subject.length>0 && aiText(a.label,200) && typeof a.clientId==='string' && /^oaiapp_[A-Za-z0-9_-]{1,200}$/.test(a.clientId) &&
      (a.tokens===null || isTokens(a.tokens)) && typeof a.refreshPending==='boolean') &&
    new Set(v.accounts.map(a=>a.id)).size===v.accounts.length && new Set(v.accounts.map(a=>JSON.stringify([a.clientId,a.subject]))).size===v.accounts.length &&
    (v.activeId===null || v.accounts.some(a=>a.id===v.activeId))
}
export function secureAiStorage(): boolean { return ['darwin','win32'].includes(process.platform) && safeStorage.isEncryptionAvailable() }

/** This directory is a sibling of workspaces, never a portable project asset.
 * Failed writes retain encrypted candidates; no automatic content cleanup. */
export class AiStorage {
  private root: string | null = null
  private initialized: Promise<void> | null = null
  constructor(private readonly workingRoot: ()=>string|undefined) {}
  async initialize(): Promise<void> {
    const working = this.workingRoot()
    if (!working || !secureAiStorage()) throw new AiError(!working ? 'storage-unavailable' : 'secure-storage-unavailable')
    if (this.root && this.root!==join(working,'ai')) throw new AiError('storage-unavailable')
    if (!this.initialized) {
      this.root = join(working,'ai')
      this.initialized = (async()=>{ await directory(working,this.root!); await directory(this.root!,join(this.root!,'operations')) })()
        .catch(()=>{this.initialized=null; throw new AiError('storage-unavailable')})
    }
    await this.initialized
  }
  async runtimeRoot(): Promise<string> { await this.initialize(); await directory(this.root!,join(this.root!,'runtime')); return join(this.root!,'runtime') }
  private async read(name: string): Promise<unknown|null> {
    await this.initialize()
    const path = join(this.root!,name)
    try {
      await contained(this.root!,path,false)
      if ((await lstat(path)).size>2*1024*1024) throw new AiError('storage-unavailable')
      const bytes=await readFile(path)
      if(bytes.length>2*1024*1024)throw new AiError('storage-unavailable')
      const envelope:unknown=JSON.parse(bytes.toString('utf8'))
      if(!record(envelope)||!exact(envelope,['version','encrypted'])||envelope.version!==1||typeof envelope.encrypted!=='string'||!/^[A-Za-z0-9+/]+=*$/.test(envelope.encrypted))throw new AiError('storage-unavailable')
      return JSON.parse(safeStorage.decryptString(Buffer.from(envelope.encrypted,'base64')))
    } catch(error) {
      if(error && typeof error==='object' && 'code' in error && error.code==='ENOENT')return null
      throw new AiError('storage-unavailable')
    }
  }
  private async write(name: string, value: unknown): Promise<void> {
    await this.initialize()
    try {
      const path=join(this.root!,name)
      await contained(this.root!,dirname(path),true)
      try { await contained(this.root!,path,false) }
      catch(error) { if(!error||typeof error!=='object'||!('code'in error)||error.code!=='ENOENT')throw error }
      await writeJson(path,{version:1,encrypted:safeStorage.encryptString(JSON.stringify(value)).toString('base64')})
    }
    catch { throw new AiError('storage-unavailable') }
  }
  async credentials(): Promise<Credentials> {
    const value=await this.read('credentials-v1.json')
    if(value===null)return {version:1,hostId:randomUUID(),activeId:null,accounts:[]}
    if(!isCredentials(value))throw new AiError('storage-unavailable')
    // A pending rotation after interruption cannot safely replay its old refresh token.
    if(value.accounts.some(a=>a.refreshPending)) {
      for(const account of value.accounts)if(account.refreshPending){account.tokens=null;account.refreshPending=false}
      await this.saveCredentials(value)
    }
    return value
  }
  async saveCredentials(value: Credentials): Promise<void> {
    if(!isCredentials(value))throw new AiError('storage-unavailable')
    await this.write('credentials-v1.json',value)
  }
  async operations(): Promise<RetainedOperation[]> {
    await this.initialize()
    const names=(await readdir(join(this.root!,'operations'))).filter(n=>n.endsWith('.json')&&!n.startsWith('.write-'))
    if(names.length>AI_LIMITS.jobs)throw new AiError('storage-unavailable')
    const operations:RetainedOperation[]=[]
    for(const name of names){
      if(!isId(name.slice(0,-5)))throw new AiError('storage-unavailable')
      const value=await this.read(join('operations',name))
      if(!record(value)||!exact(value,['version','input','view'])||value.version!==1||!isAiPrepare(value.input)||!isAiOperation(value.view)||value.view.operationId!==name.slice(0,-5)||value.input.operationId!==value.view.operationId)throw new AiError('storage-unavailable')
      operations.push(value as RetainedOperation)
    }
    return operations
  }
  async retain(operation: RetainedOperation): Promise<void> {
    if(!isAiPrepare(operation.input)||!isAiOperation(operation.view))throw new AiError('invalid-request')
    await this.write(join('operations',`${operation.view.operationId}.json`),operation)
  }
}
