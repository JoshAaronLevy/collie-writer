import { captureDigest } from '../ai/capture'
import { activeBindings, localBinding, protectHandoff, retireBinding } from '../ai/handoff'
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { open, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname } from 'node:path'
import { captureWriting } from '../../domain/ai/context'
import { ProjectError } from '../../domain/projects/errors'
import { AI_LIMITS } from '../../shared/ai'
import { CONVERSATION_LIMITS, isAiCapture, isConversation, isConversationAttempt, isConversationMessage, isConversationTurn, type AiCapture, type Conversation, type ConversationAttempt, type ConversationBinding, type ConversationMessage, type ConversationReview, type ConversationTurn, type ConversationValue, type ConversationWorkerInput } from '../../shared/conversations'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { syncDirectory } from '../storage/files'
import { requireSpace } from './streams'
import { readDocument } from '../../domain/editor/schema'

type Context = { db: Database.Database; operations: Database.Database; projectId: string; workspaceId: string }
const activeStates = ['preparing','running','stopping']
const corrupt = (): never => { throw new ProjectError('CORRUPT_PROJECT') }
const parse = <T>(body: unknown, valid: (v: unknown) => v is T): T => { if (typeof body !== 'string' || body.length > 1_000_000) return corrupt(); let value: unknown; try { value=JSON.parse(body) } catch { return corrupt() } return valid(value)?value:corrupt() }
function conversation(db:Database.Database,p:string,id:string):Conversation {
  const row=db.prepare('SELECT id,revision_id AS revisionId,title,state,created_at AS createdAt,updated_at AS updatedAt FROM conversations WHERE project_id=? AND id=?').get(p,id)
  if(!row)throw new ProjectError('NOT_FOUND')
  const value={version:1,...row as object};return isConversation(value)?value:corrupt()
}
function message(db:Database.Database,p:string,id:string):ConversationMessage {
  const row=db.prepare('SELECT id,revision_id AS revisionId,conversation_id AS conversationId,attempt_id AS attemptId,ordinal,role,CASE WHEN length(text)<=128000 THEN text ELSE NULL END AS text,created_at AS createdAt FROM conversation_messages WHERE project_id=? AND id=?').get(p,id)
  const value={version:1,...row as object};return isConversationMessage(value)?value:corrupt()
}
function attempt(db:Database.Database,p:string,id:string):ConversationAttempt {
  const row=db.prepare('SELECT substr(body,1,1000001) AS body FROM conversation_attempts WHERE project_id=? AND id=?').get(p,id) as {body:string}|undefined
  if(!row)throw new ProjectError('NOT_FOUND');return parse(row.body,isConversationAttempt)
}
function turn(db:Database.Database,p:string,id:string):ConversationTurn {
  const a=attempt(db,p,id),row=db.prepare('SELECT substr(body,1,1000001) AS body FROM ai_captures WHERE project_id=? AND id=?').get(p,a.captureId) as {body:string}|undefined
  const value={attempt:a,capture:parse(row?.body,isAiCapture),user:message(db,p,a.userMessageId),assistant:a.assistantMessageId?message(db,p,a.assistantMessageId):null}
  return isConversationTurn(value)?value:corrupt()
}
function head(db:Database.Database,p:string):{head:string;updatedAt:string} {return db.prepare('SELECT head_commit_id AS head,updated_at AS updatedAt FROM projects WHERE id=?').get(p) as {head:string;updatedAt:string}}
function advance(db:Database.Database,p:string,id:string):{head:string;updatedAt:string} {
  const previous=head(db,p),next={head:randomUUID(),updatedAt:new Date().toISOString()}
  db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(p,next.head,previous.head,next.updatedAt)
  db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(next.head,next.updatedAt,p)
  db.prepare('UPDATE conversations SET revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(randomUUID(),next.updatedAt,p,id)
  return next
}
function insertMessage(db:Database.Database,p:string,m:ConversationMessage):void { db.prepare('INSERT INTO conversation_messages VALUES (?,?,?,?,?,?,?,?,?)').run(p,m.id,m.conversationId,m.attemptId,m.ordinal,m.role,m.revisionId,m.text,m.createdAt) }
function writeAttempt(db:Database.Database,p:string,a:ConversationAttempt):void {a.revisionId=randomUUID();db.prepare('UPDATE conversation_attempts SET body=? WHERE project_id=? AND id=?').run(JSON.stringify(a),p,a.id)}
function review(db:Database.Database,p:string,input:ConversationReview):Extract<ConversationValue,{type:'review'}> {
  const c=conversation(db,p,input.conversationId)
  if(c.state!=='active')throw new ProjectError('DENIED')
  if(c.revisionId!==input.expectedRevision||head(db,p).head!==input.expectedHead)throw new ProjectError('STALE_REVISION')
  const context:AiCapture['context']=[]
  if(input.source.kind!=='none') {
    const source=input.source
    type DocumentRow={id:string;title:string;kind:string;parent_id:string|null;revision_id:string;payload:string;state:string}
    const find=db.prepare('SELECT d.id,d.title,d.kind,d.parent_id,d.revision_id,d.payload,s.state FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.id=?')
    const doc=find.get(p,source.documentId) as DocumentRow|undefined
    if(!doc||doc.kind!=='text'||doc.state!=='active'||doc.revision_id!==source.revisionId)throw new ProjectError('STALE_REVISION')
    let parent=doc.parent_id,depth=0
    while(parent){const row=find.get(p,parent) as DocumentRow|undefined;if(!row||row.state!=='active'||++depth>3)throw new ProjectError('STALE_REVISION');parent=row.parent_id}
    let text:string
    try{text=captureWriting(readDocument(JSON.parse(doc.payload)),source)}catch{throw new ProjectError('STALE_REVISION')}
    context.push({kind:input.source.kind,id:doc.id,revision:doc.revision_id,label:doc.title.slice(0,200),text})
  }
  let last=-1
  for(const id of input.historyIds) {
    const m=message(db,p,id),a=attempt(db,p,m.attemptId)
    if(m.conversationId!==c.id||m.ordinal<=last||activeStates.includes(a.state)||a.state==='unknown')throw new ProjectError('STALE_REVISION')
    last=m.ordinal;context.push({kind:'history',id:m.id,revision:m.revisionId,label:m.role==='user'?'Previous user message':'Previous assistant message',text:m.text})
  }
  if(context.reduce((n,c)=>n+c.text.length,0)>AI_LIMITS.context)throw new ProjectError('LIMIT_EXCEEDED')
  const capture:AiCapture={version:1,id:input.captureId,conversationId:c.id,template:'conversation-v1',createdAt:input.createdAt,head:input.expectedHead,prompt:input.prompt,source:input.source,historyIds:input.historyIds,context,digest:''}
  capture.digest=captureDigest(capture)
  if(!isAiCapture(capture))throw new ProjectError('VALIDATION')
  const total=(db.prepare('SELECT count(*) AS n FROM conversation_messages WHERE project_id=? AND conversation_id=?').get(p,c.id) as {n:number}).n
  return {type:'review',capture,excludedMessages:total-input.historyIds.length}
}
function bindings(operations:Database.Database):ConversationBinding[] {
  return activeBindings(operations,'conversation')
}
function sameBinding(left:ConversationBinding|undefined,right:ConversationBinding|null):boolean {return !!left&&!!right&&requestDigest(left)===requestDigest(right)}
export async function conversationCommand(context:Context,input:ConversationWorkerInput):Promise<ConversationValue> {
  const {db,operations,projectId:p}=context
  switch(input.action) {
    case 'list': {
      const filter=`project_id=? AND state=? AND instr(lower(title),lower(?))>0`,args=[p,input.state,input.query]
      const rows=db.prepare(`SELECT id FROM conversations WHERE ${filter} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`).all(...args,CONVERSATION_LIMITS.list,input.offset) as {id:string}[]
      return {type:'list',items:rows.map(r=>conversation(db,p,r.id)),total:(db.prepare(`SELECT count(*) AS n FROM conversations WHERE ${filter}`).get(...args) as {n:number}).n}
    }
    case 'read': {
      const c=conversation(db,p,input.conversationId),rows=db.prepare("SELECT attempt_id,ordinal FROM conversation_messages WHERE project_id=? AND conversation_id=? AND role='user' AND ordinal<? ORDER BY ordinal DESC LIMIT ?").all(p,c.id,input.before??1_000_000_000,CONVERSATION_LIMITS.turns+1) as {attempt_id:string;ordinal:number}[]
      const page=rows.slice(0,CONVERSATION_LIMITS.turns).reverse()
      return {type:'page',conversation:c,turns:page.map(r=>turn(db,p,r.attempt_id)),olderThan:rows.length>CONVERSATION_LIMITS.turns?page[0].ordinal:null,totalMessages:(db.prepare('SELECT count(*) AS n FROM conversation_messages WHERE project_id=? AND conversation_id=?').get(p,c.id) as {n:number}).n}
    }
    case 'review': return review(db,p,input)
    case 'get': return {type:'turn',turn:turn(db,p,input.attemptId),fresh:false,...head(db,p)}
    case 'bindings': return {type:'bindings',bindings:bindings(operations)}
    case 'binding': return localBinding(context,'conversation',input.attemptId)
    case 'handoff': {
      const t=turn(db,p,input.binding.attemptId),a=t.attempt,op=input.operation
      if(t.capture.digest!==input.binding.captureDigest||a.sequence!==op.sequence+1||a.state!==op.state||a.model!==op.model||a.provider!=='openai-codex'||a.reason!==op.reason||a.finishedAt!==new Date(op.finishedAt??0).toISOString()||(t.assistant?.text??'')!==op.text)throw new ProjectError('OPERATION_CONFLICT')
      return {type:'handoff',receipt:protectHandoff(context,'conversation',input.binding,op,input.acknowledged,{revision:a.revisionId,head:head(db,p).head,body:t})}
    }
    case 'retire': retireBinding(context,'conversation',input.receipt);return {type:'done'}
    case 'change': return inWriteTransaction(db,()=>{
      const digest=requestDigest(input),prior=db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(p,input.operationId) as {digest:string}|undefined
      if(prior){if(prior.digest!==digest)throw new ProjectError('OPERATION_CONFLICT');return {type:'changed' as const,conversation:conversation(db,p,input.conversationId),...head(db,p)}}
      if(input.expectedRevision===null) {
        if((db.prepare('SELECT count(*) AS n FROM conversations WHERE project_id=?').get(p) as {n:number}).n>=10000)throw new ProjectError('LIMIT_EXCEEDED')
        if(db.prepare('SELECT id FROM conversations WHERE project_id=? AND id=?').get(p,input.conversationId))throw new ProjectError('OPERATION_CONFLICT')
        const now=new Date().toISOString();db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?)').run(p,input.conversationId,randomUUID(),input.title,input.state,now,now)
      } else {
        const c=conversation(db,p,input.conversationId)
        if(c.revisionId!==input.expectedRevision)throw new ProjectError('STALE_REVISION')
        db.prepare('UPDATE conversations SET title=?,state=? WHERE project_id=? AND id=?').run(input.title,input.state,p,c.id)
      }
      const next=advance(db,p,input.conversationId),doc=db.prepare("SELECT id FROM documents WHERE project_id=? AND kind='text' ORDER BY id LIMIT 1").get(p) as {id:string}
      db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(p,input.operationId,digest,JSON.stringify({projectId:p,documentId:doc.id,revisionId:next.head,headCommitId:next.head}))
      return {type:'changed' as const,conversation:conversation(db,p,input.conversationId),...next}
    })
    case 'append': return inWriteTransaction(db,()=>{
      const s=input.submission,digest=requestDigest(s),prior=db.prepare('SELECT substr(body,1,1000001) AS body FROM conversation_attempts WHERE project_id=? AND id=?').get(p,s.attemptId) as {body:string}|undefined
      if(prior){if(parse(prior.body,isConversationAttempt).requestDigest!==digest)throw new ProjectError('OPERATION_CONFLICT');return {type:'turn' as const,turn:turn(db,p,s.attemptId),fresh:false,...head(db,p)}}
      if((db.prepare('SELECT count(*) AS n FROM conversation_messages WHERE project_id=?').get(p) as {n:number}).n>=100000)throw new ProjectError('LIMIT_EXCEEDED')
      if((db.prepare("SELECT count(*) AS n FROM conversation_attempts WHERE project_id=? AND json_extract(body,'$.state') IN ('preparing','running','stopping')").get(p) as {n:number}).n)throw new ProjectError('ACCESS_BUSY')
      const {capture}=review(db,p,s.review)
      if(capture.digest!==s.digest)throw new ProjectError('STALE_REVISION')
      const now=new Date().toISOString(),ordinal=(db.prepare('SELECT coalesce(max(ordinal),-2)+2 AS n FROM conversation_messages WHERE project_id=? AND conversation_id=?').get(p,capture.conversationId) as {n:number}).n
      const user:ConversationMessage={version:1,id:randomUUID(),revisionId:randomUUID(),conversationId:capture.conversationId,attemptId:s.attemptId,ordinal,role:'user',text:capture.prompt,createdAt:now}
      const a:ConversationAttempt={version:1,id:s.attemptId,revisionId:randomUUID(),conversationId:capture.conversationId,captureId:capture.id,userMessageId:user.id,assistantMessageId:null,state:'not-sent',provider:null,model:null,reason:null,sequence:0,createdAt:now,finishedAt:null,requestDigest:digest}
      db.prepare('INSERT INTO ai_captures VALUES (?,?,?,?)').run(p,capture.id,capture.conversationId,JSON.stringify(capture))
      db.prepare('INSERT INTO conversation_attempts VALUES (?,?,?,?,?)').run(p,a.id,a.conversationId,a.captureId,JSON.stringify(a));insertMessage(db,p,user)
      return {type:'turn' as const,turn:{attempt:a,capture,user,assistant:null},fresh:true,...advance(db,p,a.conversationId)}
    })
    case 'bind': {
      const value=turn(db,p,input.binding.attemptId),existing=localBinding(context,'conversation',input.binding.attemptId).binding??undefined
      if(value.capture.digest!==input.binding.captureDigest||value.attempt.state!=='not-sent'&&!existing)throw new ProjectError('OPERATION_CONFLICT')
      if(existing&&!sameBinding(existing,input.binding))throw new ProjectError('OPERATION_CONFLICT')
      if(!existing) {
        if(bindings(operations).length>=AI_LIMITS.jobs)throw new ProjectError('LIMIT_EXCEEDED')
        // This is deliberately outside portable SQLite. An interrupted bind is reconciled, never sent again.
        operations.prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?)').run(input.binding.attemptId,input.binding.operationId,'conversation-binding','bound',new Date().toISOString(),JSON.stringify(input.binding))
      }
      return inWriteTransaction(db,()=>{
        const a=attempt(db,p,input.binding.attemptId)
        if(a.state==='not-sent'){a.state='preparing';a.provider='openai-codex';a.model=input.binding.model;writeAttempt(db,p,a);advance(db,p,a.conversationId)}
        return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...head(db,p)}
      })
    }
    case 'settle': return inWriteTransaction(db,()=>{
      const a=attempt(db,p,input.attemptId),owned=localBinding(context,'conversation',a.id),existing=owned.binding??undefined,op=input.operation
      if(input.binding&&!sameBinding(existing,input.binding))throw new ProjectError('DENIED')
      if(owned.receipt){if(!op||owned.receipt.resultDigest!==requestDigest(op))throw new ProjectError('OPERATION_CONFLICT');return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...head(db,p)}}
      if(op) {
        if(!existing||!input.binding||op.scope.projectId!==p||op.scope.workspaceId!==context.workspaceId||op.operationId!==existing.operationId||op.digest!==existing.digest||op.connectionId!==existing.connectionId||op.model!==existing.model||op.action!=='conversation')throw new ProjectError('DENIED')
        if(op.sequence+1<=a.sequence)return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...head(db,p)}
        a.sequence=op.sequence+1;a.provider='openai-codex';a.model=op.model;a.state=op.state==='starting'?'preparing':op.state==='cancelling'?'stopping':op.state;a.reason=op.reason;a.finishedAt=op.finishedAt===null?null:new Date(op.finishedAt).toISOString()
        if(op.text) {
          const user=message(db,p,a.userMessageId)
          if(!a.assistantMessageId){a.assistantMessageId=randomUUID();insertMessage(db,p,{version:1,id:a.assistantMessageId,revisionId:randomUUID(),conversationId:a.conversationId,attemptId:a.id,ordinal:user.ordinal+1,role:'assistant',text:op.text,createdAt:new Date(op.startedAt).toISOString()})}
          else db.prepare('UPDATE conversation_messages SET text=?,revision_id=? WHERE project_id=? AND id=?').run(op.text,randomUUID(),p,a.assistantMessageId)
        }
      } else {
        if(a.state==='not-sent'&&!existing){if(a.reason===input.reason)return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...head(db,p)};a.reason=input.reason}
        else if(activeStates.includes(a.state)||a.state==='not-sent'&&existing){a.state='unknown';a.reason='outcome-unknown';a.finishedAt=new Date().toISOString()}
        else return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...head(db,p)}
      }
      writeAttempt(db,p,a)
      return {type:'turn' as const,turn:turn(db,p,a.id),fresh:false,...advance(db,p,a.conversationId)}
    })
    case 'export': {
      const c=conversation(db,p,input.conversationId)
      if(c.revisionId!==input.expectedRevision)throw new ProjectError('STALE_REVISION')
      const chunks:string[]=[c.title+'\nConversation transcript\n'],append=(text:string):void=>{bytes+=Buffer.byteLength(text,'utf8');if(bytes>CONVERSATION_LIMITS.exportBytes)throw new ProjectError('LIMIT_EXCEEDED');chunks.push(text)};let bytes=Buffer.byteLength(chunks[0])
      for(const row of db.prepare("SELECT attempt_id FROM conversation_messages WHERE project_id=? AND conversation_id=? AND role='user' ORDER BY ordinal").iterate(p,c.id) as Iterable<{attempt_id:string}>) {
        const t=turn(db,p,row.attempt_id)
        append(`\nUser · ${new Date(t.user.createdAt).toUTCString()}\n${t.user.text}\n`)
        append(`Outcome: ${t.attempt.state}${t.attempt.reason?' ('+t.attempt.reason+')':''}\nProvider: ${t.attempt.provider??'Not established'}; model: ${t.attempt.model??'Not established'}\n`)
        if(t.assistant)append(`\nAssistant · ${new Date(t.assistant.createdAt).toUTCString()}\n${t.assistant.text}\n`)
        if(input.includeContext){append(`\nReviewed context (${t.capture.template}; captured ${new Date(t.capture.createdAt).toUTCString()})\n`);for(const item of t.capture.context)append(`${item.label} · ${item.kind}\n${item.text}\n`);if(!t.capture.context.length)append('No attached context.\n')}
      }
      await requireSpace(dirname(input.destinationPath),bytes)
      const file=await open(input.destinationPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600).catch(error=>{if(error?.code==='EEXIST')throw new ProjectError('DESTINATION_EXISTS');throw error})
      try{for(const chunk of chunks)await file.writeFile(chunk,'utf8');await file.sync()}catch(error){await file.close().catch(()=>{});await unlink(input.destinationPath).catch(()=>{});throw error}finally{await file.close().catch(()=>{})}
      await syncDirectory(dirname(input.destinationPath));return {type:'exported',path:input.destinationPath}
    }
  }
}
/** Copies keep content, but running portable states have no independent execution authority. */
export function interruptUnboundConversations(db:Database.Database,operations:Database.Database,p:string):void {
  const bound=new Set(bindings(operations).map(b=>b.attemptId))
  inWriteTransaction(db,()=>{
    for(const row of db.prepare("SELECT id FROM conversation_attempts WHERE project_id=? AND json_extract(body,'$.state') IN ('preparing','running','stopping')").all(p) as {id:string}[]){if(bound.has(row.id))continue;const a=attempt(db,p,row.id);a.state='unknown';a.reason='outcome-unknown';a.finishedAt=new Date().toISOString();writeAttempt(db,p,a);advance(db,p,a.conversationId)}
  })
}
export function validatePortableConversations(db:Database.Database,p:string):void {
  for(const table of ['conversations','ai_captures','conversation_attempts','conversation_messages'])if((db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id<>?`).get(p) as {n:number}).n)corrupt()
  const counts=(table:string)=>(db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n
  if(counts('conversations')>10000||counts('conversation_messages')>100001||counts('conversation_attempts')>100000||counts('ai_captures')!==counts('conversation_attempts'))corrupt()
  for(const row of db.prepare('SELECT id FROM conversations WHERE project_id=?').iterate(p) as Iterable<{id:string}>)conversation(db,p,row.id)
  for(const row of db.prepare('SELECT id,conversation_id,substr(body,1,1000001) AS body FROM ai_captures WHERE project_id=?').iterate(p) as Iterable<{id:string;conversation_id:string;body:string}>){const capture=parse(row.body,isAiCapture);if(capture.id!==row.id||capture.conversationId!==row.conversation_id)corrupt()}
  let messageCount=0
  for(const row of db.prepare('SELECT id,conversation_id,capture_id FROM conversation_attempts WHERE project_id=?').iterate(p) as Iterable<{id:string;conversation_id:string;capture_id:string}>){
    const t=turn(db,p,row.id)
    if(t.attempt.id!==row.id||t.attempt.conversationId!==row.conversation_id||t.attempt.captureId!==row.capture_id||captureDigest(t.capture)!==t.capture.digest)corrupt()
    if(!db.prepare('SELECT id FROM commits WHERE project_id=? AND id=?').get(p,t.capture.head))corrupt()
    if(t.capture.source.kind!=='none'&&!db.prepare('SELECT id FROM documents WHERE project_id=? AND id=?').get(p,t.capture.source.documentId))corrupt()
    for(const id of t.capture.historyIds){const m=message(db,p,id);if(m.conversationId!==t.attempt.conversationId||m.ordinal>=t.user.ordinal)corrupt()}
    const history=t.capture.context.filter(c=>c.kind==='history'),writing=t.capture.context.filter(c=>c.kind!=='history')
    if(history.some(c=>{const m=message(db,p,c.id);return c.text!==m.text||c.revision!==m.revisionId})||history.length!==t.capture.historyIds.length||history.some((c,i)=>c.id!==t.capture.historyIds[i])||writing.length!==(t.capture.source.kind==='none'?0:1))corrupt()
    if(t.capture.source.kind!=='none'&&(writing[0].kind!==t.capture.source.kind||writing[0].id!==t.capture.source.documentId||writing[0].revision!==t.capture.source.revisionId))corrupt()
    messageCount+=t.assistant?2:1
  }
  if(messageCount!==counts('conversation_messages'))corrupt()
}
