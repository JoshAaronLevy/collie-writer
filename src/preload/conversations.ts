import { ipcRenderer } from 'electron'
import { CONVERSATION_CHANNEL, CONVERSATION_CHANGED, isConversationEvent, isConversationValue, type ConversationAPI, type ConversationValue } from '../shared/conversations'
import { isProjectResult, projectFailure } from '../shared/projects'
export const conversationApi:ConversationAPI={
  conversation:async input=>{
    const requestId=crypto.randomUUID()
    try{const result:unknown=await ipcRenderer.invoke(CONVERSATION_CHANNEL,{requestId,input});if(isProjectResult<ConversationValue>(result,requestId,isConversationValue))return result}catch{/* Preserve exact requests when acknowledgments are lost. */}
    return projectFailure(requestId,'UNAVAILABLE')
  },
  onConversationChanged:listener=>{
    const receive=(_event:Electron.IpcRendererEvent,value:unknown):void=>{if(isConversationEvent(value))listener(value)}
    ipcRenderer.on(CONVERSATION_CHANGED,receive);return()=>ipcRenderer.removeListener(CONVERSATION_CHANGED,receive)
  }
}
