import { ipcRenderer } from 'electron'
import { AI_CHANNELS, AI_CHANGED, isAiEvent, isAiChannelValue, isAiResult,
  type AiAPI, type AiResult } from '../shared/ai'

async function call<T>(channel:typeof AI_CHANNELS[keyof typeof AI_CHANNELS],input?:unknown):Promise<AiResult<T>> {
  const requestId=crypto.randomUUID()
  try{
    const result:unknown=await ipcRenderer.invoke(channel,input===undefined?{requestId}:{requestId,input})
    if(isAiResult<T>(result,requestId,value=>isAiChannelValue(channel,value)))return result
  }catch{/* No raw provider/IPC exception enters renderer state. A lost reply is not rollback. */}
  return {ok:false,requestId,reason:'outcome-unknown'}
}
export const aiApi:AiAPI={
  aiStatus:()=>call(AI_CHANNELS.status),
  connectAi:input=>call(AI_CHANNELS.connect,input),
  cancelAiConnection:input=>call(AI_CHANNELS.cancelConnect,input),
  refreshAiConnection:input=>call(AI_CHANNELS.refresh,input),
  disconnectAi:input=>call(AI_CHANNELS.disconnect,input),
  selectAiConnection:input=>call(AI_CHANNELS.select,input),
  resumeAiConnection:input=>call(AI_CHANNELS.resumeConnection,input),
  cleanupAiConnection:()=>call(AI_CHANNELS.cleanupConnection),
  protectAiConnection:()=>call(AI_CHANNELS.protectConnection),
  aiModels:input=>call(AI_CHANNELS.models,input),
  refreshAiModels:input=>call(AI_CHANNELS.refreshModels,input),
  selectAiModel:input=>call(AI_CHANNELS.selectModel,input),
  prepareAiOperation:input=>call(AI_CHANNELS.prepare,input),
  startAiOperation:input=>call(AI_CHANNELS.start,input),
  cancelAiOperation:input=>call(AI_CHANNELS.cancel,input),
  aiOperations:scope=>call(AI_CHANNELS.operations,scope),
  readAiOperation:input=>call(AI_CHANNELS.record,input),
  retryAiProtection:input=>call(AI_CHANNELS.protect,input),
  onAiChanged:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,value:unknown):void=>{if(isAiEvent(value))callback(value)}
    ipcRenderer.on(AI_CHANGED,listener);return()=>ipcRenderer.removeListener(AI_CHANGED,listener)
  }
}
