import { ipcRenderer } from 'electron'
import { AI_CHANNELS, AI_CHANGED, isAiEvent, isAiModels, isAiOperation, isAiOperationRecord, isAiPrepared, isAiResult, isAiStatus,
  type AiAPI, type AiResult } from '../shared/ai'

async function call<T>(channel:string,valid:(value:unknown)=>boolean,input?:unknown):Promise<AiResult<T>> {
  const requestId=crypto.randomUUID()
  try{
    const result:unknown=await ipcRenderer.invoke(channel,input===undefined?{requestId}:{requestId,input})
    if(isAiResult<T>(result,requestId,valid))return result
  }catch{/* No raw provider/IPC exception enters renderer state. A lost reply is not rollback. */}
  return {ok:false,requestId,reason:'outcome-unknown'}
}
export const aiApi:AiAPI={
  aiStatus:()=>call(AI_CHANNELS.status,isAiStatus),
  connectAi:input=>call(AI_CHANNELS.connect,isAiStatus,input),
  cancelAiConnection:input=>call(AI_CHANNELS.cancelConnect,isAiStatus,input),
  refreshAiConnection:input=>call(AI_CHANNELS.refresh,isAiStatus,input),
  disconnectAi:input=>call(AI_CHANNELS.disconnect,isAiStatus,input),
  selectAiConnection:input=>call(AI_CHANNELS.select,isAiStatus,input),
  aiModels:input=>call(AI_CHANNELS.models,isAiModels,input),
  prepareAiOperation:input=>call(AI_CHANNELS.prepare,isAiPrepared,input),
  startAiOperation:input=>call(AI_CHANNELS.start,isAiOperation,input),
  cancelAiOperation:input=>call(AI_CHANNELS.cancel,isAiOperation,input),
  aiOperations:scope=>call(AI_CHANNELS.operations,v=>Array.isArray(v)&&v.length<=64&&v.every(isAiOperation),scope),
  readAiOperation:input=>call(AI_CHANNELS.record,isAiOperationRecord,input),
  retryAiProtection:input=>call(AI_CHANNELS.protect,isAiOperation,input),
  onAiChanged:callback=>{
    const listener=(_event:Electron.IpcRendererEvent,value:unknown):void=>{if(isAiEvent(value))callback(value)}
    ipcRenderer.on(AI_CHANGED,listener);return()=>ipcRenderer.removeListener(AI_CHANGED,listener)
  }
}
