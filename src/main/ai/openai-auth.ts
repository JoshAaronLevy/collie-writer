import { shell } from 'electron'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { aiText } from '../../shared/ai'
import { record } from '../../shared/projects'
import { AiError } from './errors'
import { OPENAI, type OpenAiRegistration } from './deployment'
import { openAiRequest, verifyOpenAiToken } from './openai-http'
import { isTokens, type Account, type Tokens } from './storage'

const SCOPES='openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
function equal(a:string,b:string):boolean { const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right) }
function tokenError(status:number,value:unknown):AiError {
  if(record(value)&&['invalid_grant','invalid_token'].includes(String(value.error)))return new AiError('session-expired')
  return new AiError(status===429?'quota-exhausted':status>=500?'offline':'auth-failed')
}
async function parseTokens(value:unknown,clientId:string,signal:AbortSignal,nonce?:string,expectedSubject?:string,priorId?:string):Promise<{tokens:Tokens;subject:string;label:string}> {
  if(!record(value)||value.token_type!=='Bearer'||!aiText(value.access_token,32768)||!aiText(value.refresh_token,32768)||typeof value.scope!=='string'||value.scope.length>4096||!Number.isSafeInteger(value.expires_in)||Number(value.expires_in)<=0||Number(value.expires_in)>86400)throw new AiError('auth-failed')
  const id=typeof value.id_token==='string'?value.id_token:priorId
  if(!id||id.length>32768)throw new AiError('auth-failed')
  // The fresh access token is verified independently; opaque auth metadata is never decoded as entitlement.
  const access=await verifyOpenAiToken(value.access_token,OPENAI.resource,signal)
  if(access.client_id!==clientId)throw new AiError('auth-failed')
  const identity=value.id_token ? await verifyOpenAiToken(id,clientId,signal) : null
  if(nonce && (!identity||!aiText(identity.nonce,256)||!equal(identity.nonce,nonce)))throw new AiError('auth-failed')
  const subject=identity?.sub??expectedSubject
  if(typeof subject!=='string'||access.sub!==subject||expectedSubject&&subject!==expectedSubject)throw new AiError('auth-failed')
  const scopes=[...new Set(value.scope.split(' ').filter(Boolean))]
  const accessScope=access.scope
  if(typeof accessScope!=='string'||scopes.some(s=>!accessScope.split(' ').includes(s)))throw new AiError('auth-failed')
  const now=Date.now(),expiresAt=Math.min(now+Number(value.expires_in)*1000,Number(access.exp)*1000)
  let earliestRefreshAt=0
  if(value.earliest_refresh_at!==undefined){
    if(!Number.isSafeInteger(value.earliest_refresh_at)||Number(value.earliest_refresh_at)<0)throw new AiError('auth-failed')
    earliestRefreshAt=Number(value.earliest_refresh_at)*1000
  }
  const tokens:Tokens={access:value.access_token,refresh:value.refresh_token,id,expiresAt,earliestRefreshAt,scopes}
  if(!isTokens(tokens)||signal.aborted)throw new AiError(signal.aborted?'cancelled':'auth-failed')
  const email=identity?.email
  return {tokens,subject,label:typeof email==='string'&&!/[\u0000-\u001f]/u.test(email)?email.slice(0,160):'ChatGPT account'}
}

/** One attempt owns a listener, PKCE/state/nonce and abort controller. It cannot
 * replace the selected connection until all identity checks and persistence succeed. */
export class OpenAiSignIn {
  private server:Server|null=null
  private rejectCode:((error:AiError)=>void)|null=null
  private timeout:ReturnType<typeof setTimeout>|null=null
  readonly abort=new AbortController()
  constructor(readonly attemptId:string){}
  cancel():void {
    this.abort.abort();this.rejectCode?.(new AiError('cancelled'));this.cleanup()
  }
  private cleanup():void {
    if(this.timeout)clearTimeout(this.timeout)
    this.timeout=null;this.server?.close();this.server?.closeAllConnections();this.server=null;this.rejectCode=null
  }
  async run(config:OpenAiRegistration,hostId:string,existing:Account|undefined):Promise<{tokens:Tokens;subject:string;label:string}> {
    const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url')
    let redirect='';let accepted=false
    const controller=this.abort
    let resolveCode!:(code:string)=>void
    const codePromise=new Promise<string>((resolve,reject)=>{resolveCode=resolve;this.rejectCode=reject})
    // Observe early rejection while the listener/browser setup is still in progress.
    void codePromise.catch(()=>undefined)
    this.server=createServer((req,res)=>{
      res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer')
      const fail=():void=>{res.writeHead(400);res.end('This sign-in response could not be accepted. Return to Collie Writer.')}
      if(!redirect||req.method!=='GET'||!req.url||req.url.length>16384||req.headers.host!==new URL(redirect).host||req.headers.origin||accepted||controller.signal.aborted){fail();return}
      let url:URL
      try{url=new URL(req.url,redirect)}catch{fail();return}
      if(url.origin!==new URL(redirect).origin||url.pathname!==config.callbackPath||url.hash){fail();return}
      const q=url.searchParams
      if([...q.keys()].some(k=>!['state','code','client_id','scope','error','error_description','iss'].includes(k))||[...new Set(q.keys())].some(k=>q.getAll(k).length!==1)||!equal(q.get('state')??'',state)){fail();return}
      if(q.has('iss')&&q.get('iss')!==OPENAI.issuer || q.has('client_id')&&q.get('client_id')!==config.clientId){fail();return}
      accepted=true
      if(q.has('error')){res.end('Sign-in was not completed. Return to Collie Writer.');this.rejectCode?.(new AiError(q.get('error')==='access_denied'?'consent-required':'auth-failed'));return}
      const code=q.get('code')
      if(!code||code.length>8192){fail();this.rejectCode?.(new AiError('auth-failed'));return}
      res.end('You can return to Collie Writer. The app will finish checking this connection.');resolveCode(code)
    })
    this.server.headersTimeout=5000;this.server.requestTimeout=10000
    this.server.maxConnections=8
    try {
      await new Promise<void>((resolve,reject)=>{
        this.server!.once('error',()=>reject(new AiError('auth-failed')))
        this.server!.listen(config.callbackPort,'127.0.0.1',()=>resolve())
      })
      if(controller.signal.aborted)throw new AiError('cancelled')
      const address=this.server.address()
      if(!address||typeof address==='string')throw new AiError('auth-failed')
      redirect=`http://127.0.0.1:${address.port}${config.callbackPath}`
      this.timeout=setTimeout(()=>this.cancel(),5*60000)
      const url=new URL(OPENAI.authorize)
      url.search=new URLSearchParams({client_id:config.clientId,ext_agent_host_id:`urn:uuid:${hostId}`,response_type:'code',redirect_uri:redirect,scope:SCOPES,resource:OPENAI.resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')}).toString()
      // Deliberately omit login hints: tokens never appear in browser URLs or OS history.
      await shell.openExternal(url.href,{activate:true})
      const code=await codePromise
      const result=await openAiRequest(OPENAI.token,new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,code,code_verifier:verifier,redirect_uri:redirect,resource:OPENAI.resource}),controller.signal)
      if(result.status!==200)throw tokenError(result.status,result.value)
      return await parseTokens(result.value,config.clientId,controller.signal,nonce,existing?.subject)
    } finally {this.cleanup()}
  }
}
export async function refreshOpenAi(account:Account,signal:AbortSignal):Promise<Tokens> {
  if(!account.tokens)throw new AiError('signed-out')
  if(Date.now()<account.tokens.earliestRefreshAt)throw new AiError('session-expired')
  const result=await openAiRequest(OPENAI.token,new URLSearchParams({grant_type:'refresh_token',client_id:account.clientId,refresh_token:account.tokens.refresh,resource:OPENAI.resource}),signal)
  if(result.status!==200)throw tokenError(result.status,result.value)
  return (await parseTokens(result.value,account.clientId,signal,undefined,account.subject,account.tokens.id)).tokens
}
