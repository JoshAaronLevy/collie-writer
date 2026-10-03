import { useLayoutEffect, useRef, useState } from 'react'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, ChoiceField, SelectField } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/WorkspaceSession'
import { useAiConnections } from '../../ai-connections/AiConnectionsProvider'
import { AiRequestConnection } from '../../ai-connections/AiRequestConnection'
import { connectionReason, featureDescription } from '../../ai-connections/connection-copy'
import type { AiReason } from '../../../../../shared/ai'
import type { ConversationTurn } from '../../../../../shared/conversations'
import { useConversations } from './ConversationProvider'
import styles from './Conversations.module.css'

const outcomes={ 'not-sent':'Not sent',preparing:'Preparing',running:'Responding',stopping:'Stop requested',completed:'Completed',cancelled:'Cancelled',failed:'Failed',unknown:'Interrupted · outcome unknown' }
function requestReason(reason:AiReason):string {
  if(reason==='auth-failed'||reason==='session-expired'||reason==='signed-out')return 'Codex could not authorize this request. Open connection settings and explicitly resume or reconnect your account. A further request needs a new review; this one will not resend.'
  if(reason==='model-unavailable')return 'Codex refused the selected model. Refresh models and explicitly choose an available model before reviewing a new request. No model was substituted.'
  if(reason==='invalid-request')return 'Codex could not accept this request. Narrow the prompt or context and review a new request. This attempt is retained and will not resend.'
  if(reason==='storage-unavailable')return 'The request or output needs local protection. Keep Collie open and use Retry local protection. This action saves the same retained work without sending again.'
  if(reason==='outcome-unknown')return 'The outcome is uncertain. Any retained text is shown; reopening never resends this request. A new reviewed request may consume additional usage.'
  if(reason==='cancelled')return 'The provider reported cancellation. Any actual partial response remains here; cancellation does not confirm restored usage.'
  return connectionReason[reason]
}
function MessageTurn({turn}:{turn:ConversationTurn}):React.JSX.Element {
  const c=useConversations(),a=turn.attempt,active=['preparing','running','stopping'].includes(a.state),messages=turn.assistant?[turn.user,turn.assistant]:[turn.user]
  return <article className={styles['conversation-turn']} aria-label={`Request from ${new Date(turn.user.createdAt).toLocaleString()}`}>
    {messages.map(m=><div className={styles['conversation-message']} data-role={m.role} key={m.id}>
      <p className={styles['conversation-message-heading']}>{m.role==='user'?'You':'Assistant'} <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleString()}</time></p>
      <div className={styles['conversation-message-text']}>{m.text}</div>
      {c.page?.conversation.state==='active'?<ChoiceField label={`Include this ${m.role==='user'?'user':'assistant'} message in the next request`} checked={c.draft.historyIds.includes(m.id)} disabled={c.readOnly||c.busy||!!c.pending||active||a.state==='unknown'} onChange={e=>c.history(m.id,e.currentTarget.checked)}/>:null}
    </div>)}
    <p className={styles['conversation-outcome']} role={active?'status':undefined}>{outcomes[a.state]}{a.model?` · ${a.provider==='openai-codex'?'Codex · ':''}${a.model}`:''}</p>
    {a.reason?<p className={styles['conversation-caption']}>{a.reason==='busy'?`The provider is busy or its ${c.capacity}-operation retained journal is full. Nothing will be retried automatically.`:requestReason(a.reason)}</p>:null}
    {a.state==='not-sent'?<p className={styles['conversation-caption']}>Saved locally. Nothing was queued for later sending.</p>:null}
    {a.state==='stopping'?<p className={styles['conversation-caption']}>Waiting for the provider’s outcome. A stop request does not confirm cancellation or restored usage.</p>:null}
    <div className={styles['conversation-actions']}>
      {active?<AppButton variant="default" disabled={c.busy||!!c.pending||a.state==='stopping'} onClick={()=>c.cancel(a.id)}>Stop response</AppButton>:<AppButton variant="subtle" disabled={c.busy||!!c.pending||c.readOnly||!!c.draft.text||c.page?.conversation.state!=='active'} onClick={()=>c.retryAsNew(turn)}>Use prompt in a new request</AppButton>}
      {a.provider||c.run?.issue&&c.run.attemptId===a.id?<AppButton variant="subtle" disabled={c.busy||!!c.pending} onClick={()=>c.protect(a.id)}>Retry local protection</AppButton>:null}
    </div>
    <details className={styles['conversation-capture']}><summary>Reviewed request context</summary>
      <p className={styles['conversation-caption']}>{turn.capture.template} · {new Date(turn.capture.createdAt).toLocaleString()}</p>
      {turn.capture.context.length?turn.capture.context.map((item,i)=><div key={i}><h4>{item.label||'Untitled section'} · {item.kind}</h4><div className={styles['conversation-message-text']}>{item.text}</div></div>):<p>No attached writing or prior messages.</p>}
      <p className={styles['conversation-digest']}>Capture digest: {turn.capture.digest}</p>
    </details>
  </article>
}
export function ConversationPanel():React.JSX.Element {
  const c=useConversations(),session=useWorkspaceSession(),connections=useAiConnections(),transcript=useRef<HTMLDivElement>(null)
  const [includeContext,setIncludeContext]=useState(false),[expandedReview,setExpandedReview]=useState(true)
  const key=`${c.selected??'none'}:${c.before??'latest'}`
  useLayoutEffect(()=>{if(transcript.current)transcript.current.scrollTop=c.scroll.current.get(key)??0},[key,c.page?.conversation.id])
  const blocked=c.busy||!!c.pending||session.closing||session.navigating,archived=c.page?.conversation.state==='archived',review=c.draft.review
  return <section className={styles['conversation-panel']} aria-label="Project conversations"
    onCompositionStartCapture={()=>{c.composing.current=true;c.draftEvents.onCompositionStartCapture()}}
    onCompositionEndCapture={()=>{c.composing.current=false;c.draftEvents.onCompositionEndCapture()}}>
    <div className={styles['conversation-introduction']}><h3>Conversations</h3><p>Think through your writing. Requests and responses stay with this project.</p></div>
    <details className={styles['conversation-library']} open={!c.selected}>
      <summary>Find or start a conversation</summary>
      <TextInput label="Find by title" value={c.query} maxLength={160} onChange={e=>{c.setQuery(e.currentTarget.value);c.setOffset(0)}}/>
      <SelectField label="Conversation list" value={c.view} onChange={e=>{c.setView(e.currentTarget.value as 'active'|'archived');c.setOffset(0)}}><option value="active">Active</option><option value="archived">Archived</option></SelectField>
      <ul className={styles['conversation-list']}>{c.items.map(item=><li key={item.id}><AppButton variant={c.selected===item.id?'default':'subtle'} className={styles['conversation-list-item']} disabled={blocked} aria-current={c.selected===item.id?'true':undefined} onClick={()=>c.choose(item.id)}>{item.title}</AppButton><span>{new Date(item.updatedAt).toLocaleDateString()}{c.drafts[item.id]?.text?' · Unsent draft':''}</span></li>)}</ul>
      {!c.items.length?<p>No {c.view} conversations match this title.</p>:null}
      <div className={styles['conversation-actions']}><AppButton variant="subtle" disabled={c.offset===0} onClick={()=>c.setOffset(Math.max(0,c.offset-20))}>Previous conversations</AppButton><AppButton variant="subtle" disabled={c.offset+20>=c.total} onClick={()=>c.setOffset(c.offset+20)}>More conversations</AppButton></div>
      <form className={styles['conversation-form']} onSubmit={e=>{e.preventDefault();c.change('create')}}>
        <TextInput label="New conversation title" value={c.newTitle} maxLength={160} readOnly={c.readOnly||blocked} onChange={e=>c.setNewTitle(e.currentTarget.value)}/>
        <div className={styles['conversation-actions']}><AppButton type="submit" disabled={c.readOnly||blocked||!c.newTitle.trim()}>New conversation</AppButton>{c.newTitle?<AppButton variant="subtle" disabled={blocked} onClick={()=>c.setNewTitle('')}>Clear title</AppButton>:null}</div>
      </form>
    </details>
    {c.issue?<p className={styles['conversation-error']} role="alert">{c.issue}</p>:null}
    {c.notice?<p className={styles['conversation-caption']} role="status">{c.notice}</p>:null}
    {c.pending?<AppButton disabled={c.busy} onClick={c.retry}>Retry the same local action</AppButton>:null}
    {c.readOnly?<p>History and export remain available. Protect or copy any unsent input before changing access. New conversations and requests require an editable project.</p>:null}
    {c.loading?<p role="status">Loading conversation…</p>:null}
    {c.page?<>
      <header className={styles['conversation-heading']}><h3>{c.page.conversation.title}</h3><p>{archived?'Archived conversation':'Active conversation'}</p></header>
      <details className={styles['conversation-management']}><summary>Conversation actions</summary>
        <form className={styles['conversation-form']} onSubmit={e=>{e.preventDefault();c.change('rename')}}><TextInput label="Rename conversation" value={c.rename} maxLength={160} readOnly={c.readOnly||blocked} onChange={e=>c.setRename(e.currentTarget.value)}/><div className={styles['conversation-actions']}><AppButton type="submit" disabled={c.readOnly||blocked||!c.rename.trim()}>Save title</AppButton><AppButton variant="subtle" disabled={blocked} onClick={()=>c.setRename('')}>Clear rename</AppButton></div></form>
        <AppButton variant="default" disabled={c.readOnly||blocked||c.active} onClick={()=>c.change(archived?'restore':'archive')}>{archived?'Restore conversation':'Archive conversation'}</AppButton>
        <p className={styles['conversation-caption']}>Archiving keeps the entire conversation and any unsent draft.</p>
        <ChoiceField label="Include reviewed context in transcript export" checked={includeContext} onChange={e=>setIncludeContext(e.currentTarget.checked)}/>
        <AppButton variant="default" disabled={blocked||c.active} onClick={()=>c.exportTranscript(includeContext)}>Export transcript…</AppButton><p className={styles['conversation-caption']}>UTF-8 plain text. Choose a new filename; existing files are kept.</p>
      </details>
      <div className={styles['conversation-actions']}><AppButton variant="subtle" disabled={blocked||c.page.olderThan===null} onClick={()=>c.setBefore(c.page!.olderThan)}>Earlier requests</AppButton><AppButton variant="subtle" disabled={blocked||c.before===null} onClick={()=>c.setBefore(null)}>Latest requests</AppButton></div>
      <div className={styles['conversation-transcript']} ref={transcript} onScroll={e=>c.scroll.current.set(key,e.currentTarget.scrollTop)} tabIndex={0} role="region" aria-label="Conversation transcript">
        {c.page.turns.length?c.page.turns.map(turn=><MessageTurn key={turn.attempt.id} turn={turn}/>):<p className={styles['conversation-empty']}>Start with a question or an idea. Writing is shared only when you choose it.</p>}
      </div>
      <p className={styles['conversation-caption']}>{c.page.totalMessages} saved messages. Up to five requests are shown per page. Previous messages are not attached automatically.</p>
      <AiRequestConnection action="conversation" disabled={blocked}/>
      {!archived||c.draft.text?<form className={styles['conversation-form']} onSubmit={e=>{e.preventDefault();void c.review()}}>
        <Textarea label="Your next message" ref={c.composer} value={c.draft.text} maxLength={16000} rows={5} readOnly={c.readOnly||blocked||archived} onChange={e=>c.update({text:e.currentTarget.value})}/>
        <p className={styles['conversation-caption']}>{c.draft.text.length.toLocaleString()} / 16,000 characters. Enter adds a new line; Review request opens the sharing review.</p>
        <div className={styles['conversation-actions']} role="group" aria-label="Optional writing context">
          <AppButton variant="default" disabled={blocked||c.readOnly||archived} onMouseDown={e=>e.preventDefault()} onClick={()=>void c.attach('passage')}>Use selected passage</AppButton>
          <AppButton variant="default" disabled={blocked||c.readOnly||archived} onClick={()=>void c.attach('section')}>Use current section</AppButton>
          {c.draft.source.kind!=='none'?<AppButton variant="subtle" disabled={blocked} onClick={()=>void c.attach('none')}>Remove writing context</AppButton>:null}
        </div>
        <p className={styles['conversation-caption']}>{c.draft.source.kind==='none'?'No writing attached.':c.draft.source.kind==='passage'?'The selected passage is attached at its saved revision.':'The selected section is attached at its saved revision, including footnote bodies.'} Text only: citation and footnote references are labelled; images and formatting are omitted. The exact text appears in review.</p>
        <p className={styles['conversation-caption']}>{c.draft.historyIds.length} previous messages selected, at most 12. All attached writing and history share a 64,000-character limit. Review also checks the combined structured request and instructions against an 80,000-character limit.</p>
        {c.draft.historyIds.length?<AppButton variant="subtle" disabled={blocked} onClick={()=>c.update({historyIds:[]})}>Clear previous-message selection</AppButton>:null}
        <div className={styles['conversation-actions']}><AppButton type="submit" disabled={blocked||c.readOnly||archived||!c.draft.text.trim()||c.active}>Review request</AppButton><AppButton variant="subtle" disabled={blocked||!c.draft.text} onClick={c.clear}>Clear unsent draft</AppButton></div>
      </form>:null}
      {review?<section className={styles['conversation-review']} aria-label="Review outgoing request">
        <h4>Review what will be shared</h4><p>{review.excluded} saved messages excluded. No other writing or research will be added.</p>
        <AppButton variant="subtle" aria-expanded={expandedReview} onClick={()=>setExpandedReview(!expandedReview)}>{expandedReview?'Collapse exact request':'Show exact request'}</AppButton>
        <div hidden={!expandedReview} inert={!expandedReview}><h4>Your message</h4><div className={styles['conversation-message-text']}>{review.capture.prompt}</div>{review.capture.context.map((item,i)=><div key={i}><h4>{item.label||'Untitled section'} · {item.kind}</h4><div className={styles['conversation-message-text']}>{item.text}</div></div>)}<p className={styles['conversation-caption']}>The provider receives these text fields in a structured request with their labels, source IDs and saved revision IDs. Template: {review.capture.template}.</p><p className={styles['conversation-digest']}>Capture digest: {review.capture.digest}</p></div>
        <p className={styles['conversation-caption']}>Provider: Codex. Account: {connections.status?.connections.find(a=>a.id===review.connectionId)?.label??'None'}. Model: {review.model??'Not selected'}. Saving locally does not send or queue this request.</p>
        {c.capability?.state==='unavailable'?<p className={styles['conversation-caption']}>{featureDescription(c.capability)}</p>:null}
        <div className={styles['conversation-actions']}><AppButton disabled={blocked||c.readOnly||archived} onClick={()=>c.submit(false)}>Save request locally</AppButton><AppButton variant="default" disabled={blocked||!c.canSend||archived||c.active} onClick={()=>c.submit(true)}>Send reviewed request</AppButton><AppButton variant="subtle" disabled={blocked} onClick={()=>c.update({})}>Edit request</AppButton></div>
      </section>:null}
    </>:null}
    <AppButton variant="subtle" disabled={blocked} onClick={c.recover}>Retry local recovery</AppButton>
    <p className={styles['conversation-caption']}>AI responses are available only through your own supported account. This foundation retains at most {c.capacity} provider operations across the app; a full journal refuses new AI requests. Saved conversations remain readable and exportable.</p>
  </section>
}
export function ConversationNotice():React.JSX.Element|null {
  const c=useConversations(),drafts=Object.values(c.drafts).filter(d=>!!d.text).length
  if(!c.scope||(!c.run?.pending&&!c.run?.issue&&!c.pending&&!drafts&&!c.newTitle&&!c.rename))return null
  return <aside className={styles['conversation-notice']} aria-label="Conversation work"><span>{c.run?.issue??(c.pending?'A conversation action needs acknowledgment.':c.run?.pending?'Protecting conversation work…':drafts?`${drafts} unsent conversation draft${drafts===1?'':'s'}.`:'A conversation title is unsaved.')}</span><AppButton variant="subtle" onClick={c.show}>Return to conversations</AppButton></aside>
}
