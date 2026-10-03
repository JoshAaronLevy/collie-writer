import { ipcMain, type WebContents } from 'electron'
import { isId } from '../../domain/editor/schema'
import { AI_CHANGED, AI_CHANNELS, isAiAttempt, isAiConnect, isAiConnection, isAiEvent, isAiOperationInput,
  isAiPrepare, isAiStart, isAiChannelValue, type AiResult } from '../../shared/ai'
import { exact, isOpenInput, record } from '../../shared/projects'
import { isTrustedSender } from '../ipc'
import { trustedDocument } from '../security'
import { AiError, aiReason } from './errors'
import type { AiService } from './service'

export function registerAiIpc(owner:()=>WebContents|undefined,service:AiService,devOrigin?:string):void {
  for(const [kind,channel]of Object.entries(AI_CHANNELS)){
    ipcMain.handle(channel,async(event,payload:unknown):Promise<AiResult<unknown>>=>{
      if(!isTrustedSender(event,owner(),devOrigin))return {ok:false,requestId:'',reason:'invalid-request'}
      if(!record(payload)||!isId(payload.requestId)||!exact(payload,kind==='status'?['requestId']:['requestId','input']))return {ok:false,requestId:'',reason:'invalid-request'}
      const id=payload.requestId,input=payload.input
      try{
        let value:unknown
        if(kind==='status')value=await service.readStatus()
        else if(kind==='connect'&&isAiConnect(input))value=await service.connect(input)
        else if(kind==='cancelConnect'&&isAiAttempt(input))value=await service.cancelConnect(input.attemptId)
        else if(kind==='refresh'&&isAiConnection(input))value=await service.refresh(input.connectionId)
        else if(kind==='disconnect'&&isAiConnection(input))value=await service.disconnect(input.connectionId)
        else if(kind==='select'&&isAiConnection(input))value=await service.select(input.connectionId)
        else if(kind==='models'&&isAiConnection(input))value=await service.models(input.connectionId)
        else if(kind==='prepare'&&isAiPrepare(input))value=await service.prepare(input)
        else if(kind==='start'&&isAiStart(input))value=await service.start(input)
        else if(kind==='cancel'&&isAiOperationInput(input))value=await service.cancel(input)
        else if(kind==='operations'&&isOpenInput(input))value=await service.operations(input)
        else if(kind==='record'&&isAiOperationInput(input))value=await service.operationRecord(input)
        else if(kind==='protect'&&isAiOperationInput(input))value=await service.retryProtection(input)
        else throw new AiError('invalid-request')
        if(!isTrustedSender(event,owner(),devOrigin))throw new AiError('cancelled')
        if(!isAiChannelValue(channel,value))throw new AiError('outcome-unknown')
        return {ok:true,requestId:id,value}
      }catch(error){return {ok:false,requestId:id,reason:aiReason(error)}}
    })
  }
  service.subscribe(event=>{
    const target=owner()
    if(target&&!target.isDestroyed()&&trustedDocument(target.getURL(),devOrigin)&&isAiEvent(event))target.send(AI_CHANGED,event)
  })
}
