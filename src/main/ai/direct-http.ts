import { request } from 'node:https'
import type { IncomingMessage } from 'node:http'
import { StringDecoder } from 'node:string_decoder'
import { AI_LIMITS, aiText } from '../../shared/ai'
import { record } from '../../shared/projects'
import { isCatalogModelId, type AiCatalogModel } from '../../shared/ai-catalog'
import type { DirectStage } from '../../shared/ai-direct'
import type { CodexTextUpdate } from './codex-text-turn'
import { DirectError, directIssue, httpFailure } from './direct-errors'
import type { DirectExecution } from './direct-operation'

/** Fixed endpoints; no environment credentials, redirect, proxy, retry or tool
 * executor. The caller supplies only its protected, validated OAuth token. */
async function open(path:'/models'|'/responses',access:string,signal:AbortSignal,body?:string):Promise<{response:IncomingMessage;close:()=>void}> {
  const stage:DirectStage=path==='/models'?'model-discovery':'inference-http'
  if(signal.aborted)throw new DirectError(directIssue(stage,'cancelled','cancelled'))
  return new Promise((resolve,reject)=>{
    const req=request(`https://api.openai.com/v1${path}`,{method:body?'POST':'GET',signal,agent:false,
      headers:{Authorization:`Bearer ${access}`,Accept:body?'text/event-stream':'application/json',
        ...(body?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},response=>resolve({response,close}))
    const timer=setTimeout(()=>req.destroy(new Error('DEADLINE')),body?5*60000:30000)
    const close=():void=>{clearTimeout(timer);req.destroy()}
    req.setTimeout(body?90000:30000,()=>req.destroy(new Error('IDLE')))
    req.on('error',()=>{clearTimeout(timer);reject(new DirectError(directIssue(stage,signal.aborted?'cancelled':'offline','interrupted')))})
    req.end(body)
  })
}
async function jsonBody(response:IncomingMessage,stage:DirectStage):Promise<unknown> {
  const chunks:Buffer[]=[];let bytes=0
  for await(const chunk of response){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=part.length
    if(bytes>1024*1024)throw new DirectError(directIssue(stage,'provider-failed','invalid-response'));chunks.push(part)}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return null}
}
function requestId(response:IncomingMessage):string|undefined {const id=response.headers['x-request-id'];return typeof id==='string'?id:undefined}
export async function planModels(access:string,signal:AbortSignal):Promise<AiCatalogModel[]> {
  const {response,close}=await open('/models',access,signal)
  try{
    const value=await jsonBody(response,'model-discovery')
    if(response.statusCode!==200)throw httpFailure('model-discovery',response.statusCode??502,value,requestId(response))
    if(!record(value)||!Array.isArray(value.models)||value.models.length>1000)throw new DirectError(directIssue('model-discovery','provider-failed','invalid-response'))
    const visible=value.models.filter(m=>record(m)&&m.visibility==='list')
    if(visible.length>100||visible.some(m=>!isCatalogModelId(m.slug)||typeof m.display_name!=='string'||!m.display_name.trim()||m.display_name.length>200||/[\u0000-\u001f\u007f]/u.test(m.display_name))||new Set(visible.map(m=>m.slug)).size!==visible.length)throw new DirectError(directIssue('model-discovery','provider-failed','invalid-response'))
    return visible.map((m):AiCatalogModel=>({id:m.slug as string,label:m.display_name as string,isDefault:false,inputModalities:['text'],reasoningEfforts:[],defaultReasoningEffort:null}))
  }finally{close()}
}
function completedText(value:unknown):string {
  if(!record(value)||value.status!=='completed'||!Array.isArray(value.output)||value.output.length>256)throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
  let text=''
  for(const item of value.output){
    if(!record(item))throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
    if(item.type==='reasoning')continue // Do not retain hidden reasoning or signatures.
    if(item.type!=='message'||item.role!=='assistant'||!Array.isArray(item.content))throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
    for(const part of item.content){
      if(!record(part))throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
      const content=part.type==='output_text'?part.text:part.type==='refusal'?part.refusal:null
      if(!aiText(content,AI_LIMITS.output))throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
      text+=content
      if(text.length>AI_LIMITS.output)throw new DirectError(directIssue('inference-stream','output-limit'))
    }
  }
  if(!text.trim())throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
  return text
}
/** Completion requires the provider terminal event, never EOF or a final delta.
 * Abort closes HTTP; it does not assert remote cancellation or returned usage. */
export async function planResponse(access:string,model:string,execution:DirectExecution,signal:AbortSignal,
  update:(value:CodexTextUpdate)=>void,onStreaming:()=>void):Promise<void> {
  const body=JSON.stringify({model,instructions:execution.instructions,input:[{role:'user',content:execution.framedText}],store:false,stream:true})
  const {response,close}=await open('/responses',access,signal,body)
  let text='',terminal=false
  try{
    if(response.statusCode!==200)throw httpFailure('inference-http',response.statusCode??502,await jsonBody(response,'inference-http'),requestId(response))
    if(!String(response.headers['content-type']).toLowerCase().startsWith('text/event-stream'))throw new DirectError(directIssue('inference-http','provider-failed','invalid-response'))
    onStreaming()
    const decoder=new StringDecoder('utf8');let buffer='',bytes=0,data:string[]=[]
    const event=():void=>{
      if(!data.length)return
      const raw=data.join('\n');data=[]
      if(raw==='[DONE]')return // This sentinel alone never establishes success.
      let value:unknown
      try{value=JSON.parse(raw)}catch{throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))}
      if(!record(value)||typeof value.type!=='string')throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
      if(value.type==='response.output_text.delta'||value.type==='response.refusal.delta'){
        if(!aiText(value.delta,AI_LIMITS.output)||text.length+value.delta.length>AI_LIMITS.output)throw new DirectError(directIssue('inference-stream','output-limit'))
        text+=value.delta;update({text,commentary:'',finalText:null,state:'running',reason:null})
      }else if(value.type==='response.completed'){
        const final=completedText(value.response)
        if(text&&text!==final)throw new DirectError(directIssue('inference-stream','provider-failed','invalid-response'))
        text=final;terminal=true;update({text,commentary:'',finalText:text,state:'completed',reason:null})
      }else if(value.type==='response.failed'||value.type==='error'){
        throw httpFailure('inference-stream',200,value.type==='error'?{error:value}:value.response,requestId(response))
      }else if(value.type==='response.incomplete'){
        throw new DirectError({...directIssue('inference-stream','provider-failed','incomplete'),requestId:requestId(response)&&/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId(response)!)?requestId(response)!:null})
      }
    }
    for await(const chunk of response){
      const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=part.length
      if(bytes>8*1024*1024)throw new DirectError(directIssue('inference-stream','output-limit'))
      buffer+=decoder.write(part)
      if(buffer.length+data.reduce((n,line)=>n+line.length,0)>1024*1024)throw new DirectError(directIssue('inference-stream','output-limit'))
      let boundary:number
      while((boundary=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,boundary).replace(/\r$/,'');buffer=buffer.slice(boundary+1)
        if(line==='')event();else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''))
        if(terminal)return
      }
    }
    buffer+=decoder.end()
    // A final event need not end in a second newline; still parse it once.
    if(buffer.startsWith('data:'))data.push(buffer.slice(5).replace(/^ /,'').replace(/\r$/,''))
    if(data.length)event()
    if(!terminal)throw new DirectError(directIssue('inference-stream','outcome-unknown','interrupted'))
  }finally{close()}
}
