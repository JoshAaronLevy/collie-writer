import { request } from 'node:https'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { record } from '../../shared/projects'
import { AiError } from './errors'
import { OPENAI } from './deployment'

/** Fixed provider origins, no redirects, inherited proxy or generic renderer HTTP. */
export async function openAiRequest(url: string, body?: URLSearchParams, signal?: AbortSignal): Promise<{status:number; value:unknown}> {
  const target=new URL(url)
  if(target.origin!==OPENAI.issuer || target.username || target.password || target.hash || target.search || signal?.aborted)throw new AiError(signal?.aborted?'cancelled':'configuration-required')
  return new Promise((resolve,reject)=>{
    let deadline:ReturnType<typeof setTimeout>|undefined
    const fail=(error:AiError):void=>{if(deadline)clearTimeout(deadline);reject(error)}
    const req=request(target,{method:body?'POST':'GET',signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})}},res=>{
      const chunks:Buffer[]=[];let size=0
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>256*1024){req.destroy();fail(new AiError('provider-failed'))}else chunks.push(chunk)})
      res.on('error',()=>fail(new AiError('offline')))
      res.on('aborted',()=>fail(new AiError('offline')))
      res.on('end',()=>{
        if(deadline)clearTimeout(deadline)
        const status=res.statusCode??0
        if(status>=300&&status<400){reject(new AiError('provider-failed'));return}
        try { const text=Buffer.concat(chunks).toString('utf8');resolve({status,value:text?JSON.parse(text):null}) }
        catch{reject(new AiError('provider-failed'))}
      })
    })
    deadline=setTimeout(()=>{req.destroy();fail(new AiError('offline'))},20000)
    req.on('error',()=>fail(new AiError(signal?.aborted?'cancelled':'offline')))
    req.end(body?.toString())
  })
}
let keys: {expiresAt:number; value:ReturnType<typeof createLocalJWKSet>} | null=null
export async function verifyOpenAiToken(token:string,audience:string,signal?:AbortSignal):Promise<Record<string,unknown>> {
  if(!keys||Date.now()>=keys.expiresAt){
    const response=await openAiRequest(OPENAI.jwks,undefined,signal)
    if(response.status!==200||!record(response.value)||!Array.isArray(response.value.keys)||response.value.keys.length>32)throw new AiError('auth-failed')
    keys={expiresAt:Date.now()+5*60000,value:createLocalJWKSet(response.value as unknown as JSONWebKeySet)}
  }
  try {
    const {payload}=await jwtVerify(token,keys.value,{issuer:OPENAI.issuer,audience,algorithms:['RS256'],requiredClaims:['sub','exp','iat'],clockTolerance:30})
    if(typeof payload.sub!=='string'||payload.sub.length>500)throw new Error('IDENTITY')
    return payload
  } catch { keys=null;throw new AiError('auth-failed') }
}
export async function revokeOpenAi(refresh:string,clientId:string,signal?:AbortSignal):Promise<boolean> {
  try {
    const discovery=await openAiRequest(OPENAI.discovery,undefined,signal)
    if(discovery.status!==200||!record(discovery.value)||discovery.value.issuer!==OPENAI.issuer||typeof discovery.value.revocation_endpoint!=='string')return false
    const response=await openAiRequest(discovery.value.revocation_endpoint,new URLSearchParams({token:refresh,token_type_hint:'refresh_token',client_id:clientId}),signal)
    return response.status===200
  } catch { return false }
}
