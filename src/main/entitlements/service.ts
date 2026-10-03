import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { isTrustedSender } from '../ipc'
import { isInfoRequest } from '../../shared/schemas'
import { ACCESS_CHANGED, ACCESS_CHANNELS, canEditProject, isDesignateInput, isFinishAccessInput, isTutorialInput, sameProject, type AccessState, type AccessView } from '../../shared/access'
import { commandCapability, commandScope } from '../../domain/capabilities'
import { ProjectError, projectError } from '../../domain/projects/errors'
import { exact, record, isOpenInput, projectFailure, type OpenInput, type OpenProject, type ProjectCommand, type ProjectValue, type ProjectList } from '../../shared/projects'
import { isId } from '../../domain/editor/schema'
import { contained, directory, writeJson } from '../../worker/storage/files'
import type { StorageWorker } from '../storage-worker'
import { ISSUER_KEYS } from './keys'
import { canonicalGrant, purchaseIdentity, verifyGrant, type SignedGrant } from './grant'
import { seedTutorial } from '../tutorial'

type Settings = { version: 1; revision: string; freeProject: OpenInput | null; sampleProject: OpenInput | null }
type Cache = { version: 1; lastSeen: number; grants: SignedGrant[] }

export class AccessService {
  private settings: Settings = {version:1,revision:randomUUID(),freeProject:null,sampleProject:null}
  private cache: Cache = {version:1,lastSeen:0,grants:[]}
  private settingsBroken=false
  private cacheBroken=false
  private storageWarning=false
  private changing=false
  private sampleBusy=false
  private clockBase=Date.now()
  private clockStart=performance.now()
  private observed=0
  private active: OpenInput|null=null
  private activeWasEditable=false
  private transition: AccessView['transition']=null
  private drainOperations=new Map<string,{operationId:string;digest:string}>()
  private lastView=''
  private timer:ReturnType<typeof setInterval>|undefined
  private root=''
  private initialized=false
  private initializing=false
  private externalWorkPending:()=>boolean=()=>false
  constructor(private readonly owner:()=>WebContents|undefined,private readonly storage:StorageWorker,private readonly dirty:()=>boolean,private readonly workingRoot:()=>string|undefined,private readonly devOrigin?:string){}
  private async readLocal(name:string):Promise<unknown|null>{
    const path=join(this.root,name)
    try{await contained(this.root,path,false);if((await lstat(path)).size>2*1024*1024)throw new Error('LIMIT');return JSON.parse(await readFile(path,'utf8'))}
    catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return null;throw error}
  }
  async initialize():Promise<void>{
    const working=this.workingRoot()
    if(!working||this.initialized||this.initializing)return
    this.initializing=true
    const root=join(working,'access')
    try{await directory(working,root);this.root=root}catch{this.initializing=false;this.storageWarning=true;this.publish();return}
    try{
      const v=await this.readLocal('capability-settings-v1.json')
      if(v!==null){
        if(!record(v)||!exact(v,['version','revision','freeProject','sampleProject'])||v.version!==1||!isId(v.revision)||(v.freeProject!==null&&!isOpenInput(v.freeProject))||(v.sampleProject!==null&&!isOpenInput(v.sampleProject)))throw new Error('SETTINGS')
        this.settings=v as Settings
      }
    }catch{this.settingsBroken=true;this.storageWarning=true}
    try{
      const v=await this.readLocal('entitlement-cache-v1.json')
      if(v!==null){
        if(!record(v)||!exact(v,['version','lastSeen','grants'])||v.version!==1||!Number.isSafeInteger(v.lastSeen)||Number(v.lastSeen)<0||!Array.isArray(v.grants)||v.grants.length>1000)throw new Error('CACHE')
        const grants=v.grants.map(verifyGrant),identities=new Set(grants.map(g=>purchaseIdentity(g.grant)))
        if(identities.size!==grants.length)throw new Error('CACHE')
        this.cache={version:1,lastSeen:Number(v.lastSeen),grants}
      }
    }catch{this.cacheBroken=true;this.storageWarning=true}
    this.clockBase=Math.max(Date.now(),this.cache.lastSeen);this.clockStart=performance.now()
    this.timer=setInterval(()=>{this.publish();void this.persistClock()},60000)
    this.timer.unref()
    this.initialized=true;this.initializing=false
    this.publish()
  }
  private now():number{
    const tick=performance.now(),wall=Date.now()
    this.observed=Math.max(this.observed,wall,this.clockBase+Math.max(0,tick-this.clockStart),this.cache.lastSeen)
    this.clockBase=this.observed;this.clockStart=tick
    return this.observed
  }
  view():AccessView{
    const now=this.now()
    let state:AccessState=this.cacheBroken?'unavailable':'free',paidThrough:string|null=null,graceUntil:string|null=null
    let best=0
    for(const {grant:g} of this.cacheBroken?[]:this.cache.grants){
      let candidate:AccessState,rank:number
      if(g.status==='revoked'){candidate='revoked';rank=1}
      else if(Date.parse(g.issuedAt)>now+5*60000){candidate='unavailable';rank=1}
      else if(g.accessKind==='lifetime'){candidate='lifetime';rank=5}
      else if(now<=Date.parse(g.paidThrough!)){candidate='subscription';rank=4}
      else if(now<=Date.parse(g.graceUntil!)){candidate='grace';rank=3}
      else{candidate='expired';rank=2}
      if(rank>best||rank===best&&Date.parse(g.graceUntil??'')>Date.parse(graceUntil??'')){best=rank;state=candidate;paidThrough=g.paidThrough??null;graceUntil=g.graceUntil??null}
    }
    const paid=['subscription','grace','lifetime'].includes(state)
    const base:AccessView={revision:this.settings.revision,state,paid,paidThrough,graceUntil,clockWarning:Date.now()+5*60000<now,storageWarning:this.storageWarning,issuerConfigured:ISSUER_KEYS.some(key=>key.channel==='direct'),freeProject:this.settings.freeProject,sampleProject:this.settings.sampleProject,transition:this.transition}
    if(this.active&&canEditProject(base,this.active))this.activeWasEditable=true
    if(this.activeWasEditable&&this.active&&!canEditProject(base,this.active)&&!this.transition){this.transition={id:randomUUID(),scope:{...this.active}};this.drainOperations.clear()}
    if(paid&&this.transition){this.transition=null;this.drainOperations.clear()}
    base.transition=this.transition
    return base
  }
  private publish():void{
    const view=this.view(),serialized=JSON.stringify(view)
    if(serialized===this.lastView)return
    this.lastView=serialized
    const owner=this.owner();if(owner&&!owner.isDestroyed())owner.send(ACCESS_CHANGED,view)
  }
  private async persistClock():Promise<void>{
    if(this.cacheBroken||this.changing||!this.cache.grants.length)return
    this.changing=true
    try{const next={...this.cache,lastSeen:Math.floor(this.now())};await writeJson(join(this.root,'entitlement-cache-v1.json'),next);this.cache=next}
    catch{this.storageWarning=true}
    finally{this.changing=false;this.publish()}
  }
  observe(command:ProjectCommand,value:ProjectValue):void{
    if(['open','create','section','interchangeCommit'].includes(command.kind)&&record(value)&&isId(value.projectId)&&isId(value.workspaceId)){
      const view=this.view()
      this.active={projectId:value.projectId,workspaceId:value.workspaceId}
      this.activeWasEditable=canEditProject(view,this.active)
    }
    this.publish()
  }
  /** Main-only authorization before any command enters the trusted worker queue. */
  authorize(command:ProjectCommand):void{
    const capability=commandCapability(command),view=this.view(),scope=commandScope(command)
    this.publish()
    if(this.transition&&(command.kind==='create'||command.kind==='open'&&!sameProject(scope,this.transition.scope)||command.kind==='reset'||command.kind==='recoverReset'))throw new ProjectError('ACCESS_TRANSITION')
    if(capability==='read')return
    if(!this.root)throw new ProjectError('STORAGE_LOCATION_REQUIRED')
    if(!this.initialized||this.changing)throw new ProjectError('ACCESS_BUSY')
    if(capability==='create')return // Stored-project count is unlimited; editing still needs a designation.
    if(capability==='batch'){if(!view.paid)throw new ProjectError('PAID_CAPABILITY');return}
    if(capability==='recipes'&&!view.paid)throw new ProjectError('PAID_CAPABILITY')
    if(scope&&canEditProject(view,scope))return
    if(scope&&this.transition&&sameProject(scope,this.transition.scope)&&this.allowDrain(command))return
    throw new ProjectError('READ_ONLY_PROJECT')
  }
  private allowDrain(command:ProjectCommand):boolean{
    // Bounded protection of buffers from the previously authorized active editor. No new
    // structure/import/recipe work, and a retry can only repeat identical input.
    let slot:string|null=null
    if(command.kind==='commit'||command.kind==='meta')slot=command.kind
    if(command.kind==='noteChange'&&['updateNote','createAnnotation','updateAnnotation'].includes(command.input.change.type))slot=command.input.change.type
    if(command.kind==='sourceChange'&&['create','update'].includes(command.input.change.type))slot='source-draft'
    if(!slot||!('input'in command)||typeof command.input!=='object'||!('operationId'in command.input)||typeof command.input.operationId!=='string')return false
    const operationId=command.input.operationId,digest=createHash('sha256').update(JSON.stringify(command)).digest('hex'),prior=this.drainOperations.get(slot)
    if(prior)return prior.operationId===operationId&&prior.digest===digest
    this.drainOperations.set(slot,{operationId,digest});return true
  }
  authorizeFileChange():void{if(this.transition)throw new ProjectError('ACCESS_TRANSITION');if(this.changing||this.sampleBusy)throw new ProjectError('ACCESS_BUSY')}
  /** Inference is new work, never an access-drain operation. Scope comes from
   * the project that main observed the trusted storage worker open. */
  authorizeAi(scope:OpenInput,editing:boolean):void{
    if(!this.root||!this.initialized)throw new ProjectError('STORAGE_LOCATION_REQUIRED')
    if(!editing)return
    if(!sameProject(this.active,scope))throw new ProjectError('DENIED')
    const view=this.view()
    if(this.changing||this.sampleBusy||view.transition)throw new ProjectError('ACCESS_BUSY')
    if(!canEditProject(view,scope))throw new ProjectError('READ_ONLY_PROJECT')
  }
  /** Local handoff targets only the original project observed from the worker. */
  isActiveAiScope(scope:OpenInput):boolean{return sameProject(this.active,scope)}
  setExternalWorkGuard(pending:()=>boolean):void{this.externalWorkPending=pending}
  releaseWindow():void{this.active=null;this.activeWasEditable=false;this.transition=null;this.drainOperations.clear();this.lastView=''}
  private requireSettled(keepActive=false):void{if(!this.root)throw new ProjectError('STORAGE_LOCATION_REQUIRED');if(!this.initialized||(!keepActive&&this.dirty())||!this.storage.idle()||this.changing||this.sampleBusy||this.externalWorkPending())throw new ProjectError('ACCESS_BUSY')}
  private async tutorial(reset:boolean):Promise<OpenProject>{
    this.requireSettled()
    if(this.settingsBroken)throw new ProjectError('ACCESS_SETTINGS')
    this.sampleBusy=true
    try{
      const old=this.settings.sampleProject
      const listed=await this.storage.request(randomUUID(),{kind:'list'})
      if(!listed.ok)throw new ProjectError(listed.error.code)
      const exists=old&&(listed.value as ProjectList).projects.some(p=>sameProject(p,old))
      let scope:OpenInput
      if(old&&exists&&!reset)scope=old
      else{
        const created=await this.storage.request(randomUUID(),{kind:'create',input:{operationId:this.settings.revision,template:'article',title:'Untitled project',byline:'Collie Writer tutorial',description:''}})
        if(!created.ok)throw new ProjectError(created.error.code)
        const project=created.value as OpenProject
        scope={projectId:project.projectId,workspaceId:project.workspaceId}
        // The sample privilege comes only from this trusted creation path.
        this.changing=true
        try{
          const next:Settings={...this.settings,revision:randomUUID(),sampleProject:scope}
          await writeJson(join(this.root,'capability-settings-v1.json'),next)
          this.settings=next;this.publish()
        }catch(error){this.storageWarning=true;this.publish();throw error
        }finally{this.changing=false}
      }
      return await seedTutorial(this.storage,scope)
    }finally{this.sampleBusy=false}
  }
  private async designate(scope:OpenInput,revision:string):Promise<AccessView>{
    // Keeping the already-open transitioning editor as the free project cannot revoke its
    // buffer's authority. It is also the recovery route when a flush needs manual repair.
    const keepActive=!!this.transition&&sameProject(scope,this.active)&&sameProject(scope,this.transition.scope)
    this.requireSettled(keepActive)
    if(this.settingsBroken)throw new ProjectError('ACCESS_SETTINGS')
    if(revision!==this.settings.revision)throw new ProjectError('STALE_REVISION')
    const listed=await this.storage.request(randomUUID(),{kind:'list'})
    if(!listed.ok)throw new ProjectError(listed.error.code)
    if(!(listed.value as ProjectList).projects.some(p=>sameProject(p,scope)))throw new ProjectError('NOT_FOUND')
    if(sameProject(scope,this.settings.sampleProject))throw new ProjectError('VALIDATION')
    this.requireSettled(keepActive)
    if(revision!==this.settings.revision)throw new ProjectError('STALE_REVISION')
    this.changing=true
    try{
      const next:Settings={...this.settings,revision:randomUUID(),freeProject:scope}
      await writeJson(join(this.root,'capability-settings-v1.json'),next)
      this.settings=next;this.transition=null;this.drainOperations.clear();this.activeWasEditable=false
      this.activeWasEditable=!!this.active&&canEditProject(this.view(),this.active)
      this.publish();return this.view()
    }catch(error){this.storageWarning=true;this.publish();throw error}finally{this.changing=false}
  }
  /** Stage 20 channel adapters call this only with a signed issuer document. */
  async acceptGrant(value:unknown):Promise<AccessView>{
    if(!this.initialized)throw new ProjectError('ACCESS_BUSY')
    if(this.sampleBusy)throw new ProjectError('ACCESS_BUSY')
    const signed=verifyGrant(value)
    if(this.cacheBroken)throw new ProjectError('ACCESS_SETTINGS') // Never overwrite an unreadable anti-replay ledger.
    if(this.changing)throw new ProjectError('ACCESS_BUSY')
    const identity=purchaseIdentity(signed.grant),prior=this.cache.grants.find(g=>purchaseIdentity(g.grant)===identity)
    if(prior&&(signed.grant.revision<prior.grant.revision||signed.grant.revision===prior.grant.revision&&canonicalGrant(signed.grant)!==canonicalGrant(prior.grant)))throw new ProjectError('STALE_GRANT')
    if(prior&&signed.grant.revision===prior.grant.revision)return this.view()
    if(!prior&&this.cache.grants.length>=1000)throw new ProjectError('LIMIT_EXCEEDED')
    this.changing=true
    try{
      const next:Cache={version:1,lastSeen:Math.floor(this.now()),grants:[...this.cache.grants.filter(g=>purchaseIdentity(g.grant)!==identity),signed]}
      await writeJson(join(this.root,'entitlement-cache-v1.json'),next)
      this.cache=next;this.publish();return this.view()
    }catch(error){
      // A rename may already have happened before a durability error. Do not keep
      // granting old rights after receiving a newer authentic decision, or activate
      // new rights on an uncertain write. Preserve the files for recovery on restart.
      this.cacheBroken=true;this.storageWarning=true;this.publish();throw error
    }finally{this.changing=false}
  }
  register():void{
    for(const [kind,channel] of Object.entries(ACCESS_CHANNELS))ipcMain.handle(channel,async(event,payload:unknown)=>{
      if(!isTrustedSender(event,this.owner(),this.devOrigin)||!record(payload)||!isId(payload.requestId))return projectFailure('','DENIED')
      const requestId=payload.requestId
      try{
        if(kind==='read'&&isInfoRequest(payload))return {ok:true,requestId,value:this.view()}
        if(kind==='tutorial'&&exact(payload,['requestId','input'])&&isTutorialInput(payload.input))return {ok:true,requestId,value:await this.tutorial(payload.input.reset)}
        if(kind==='designate'&&exact(payload,['requestId','input'])&&isDesignateInput(payload.input))return {ok:true,requestId,value:await this.designate(payload.input.scope,payload.input.expectedRevision)}
        if(kind==='finish'&&exact(payload,['requestId','input'])&&isFinishAccessInput(payload.input)){
          this.requireSettled()
          if(this.transition?.id!==payload.input.transitionId)throw new ProjectError('STALE_REVISION')
          this.transition=null;this.activeWasEditable=false;this.drainOperations.clear();this.publish()
          return {ok:true,requestId,value:this.view()}
        }
        if(kind==='importGrant'&&isInfoRequest(payload)){
          if(!ISSUER_KEYS.some(key=>key.channel==='direct'))throw new ProjectError('ISSUER_UNCONFIGURED')
          this.requireSettled()
          const window=BrowserWindow.fromWebContents(event.sender);if(!window)throw new ProjectError('DENIED')
          const answer=await dialog.showOpenDialog(window,{title:'Import signed Collie Writer access document',filters:[{name:'Signed access document',extensions:['json','collie-license']}],properties:['openFile','dontAddToRecent']})
          if(answer.canceled)return {ok:true,requestId,value:this.view()}
          if(window.isDestroyed()||!isTrustedSender(event,this.owner(),this.devOrigin)||answer.filePaths.length!==1)throw new ProjectError('DENIED')
          const path=answer.filePaths[0],stat=await lstat(path)
          if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new ProjectError('INVALID_GRANT')
          const bytes=await readFile(path);if(bytes.length>65536)throw new ProjectError('INVALID_GRANT')
          this.requireSettled()
          let document:unknown
          try{document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new ProjectError('INVALID_GRANT')}
          return {ok:true,requestId,value:await this.acceptGrant(document)}
        }
        throw new ProjectError('VALIDATION')
      }catch(error){return projectFailure(requestId,projectError(error))}
    })
  }
}
