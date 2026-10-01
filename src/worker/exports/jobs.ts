import { randomUUID, createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { crc32 } from 'node:zlib'
import { openPromise } from 'yauzl'
import { isExportJob, type DestinationFingerprint, type ExportJob, type WorkerExportStart } from '../../shared/exports'
import { ProjectError } from '../../domain/projects/errors'
import { exportFingerprint as fingerprint } from '../../domain/projects/export-path'
import { syncDirectory, writeJson } from '../storage/files'
import { fileHash } from '../projects/streams'
import { exportDocx } from './docx'
import type { PreparedExport } from './prepare'

function same(a:DestinationFingerprint|null,b:DestinationFingerprint|null):boolean{return JSON.stringify(a)===JSON.stringify(b)}
function cancelled(signal:AbortSignal):void{if(signal.aborted)throw new ProjectError('CANCELLED')}
async function inspectDocx(path:string):Promise<void>{
  const zip=await openPromise(path,{autoClose:false,lazyEntries:true,decodeStrings:true,strictFileNames:true,validateEntrySizes:true})
  const names=new Set<string>()
  let total=0
  try{
    if(zip.entryCount>20000)throw new ProjectError('LIMIT_EXCEEDED')
    for await(const entry of zip.eachEntry()){
      if(names.has(entry.fileName)||entry.isEncrypted()||entry.uncompressedSize>512*1024*1024 || (total+=entry.uncompressedSize)>1024*1024*1024)throw new ProjectError('VALIDATION')
      names.add(entry.fileName)
      const stream=await zip.openReadStreamPromise(entry)
      let checksum=0,expanded=0
      for await(const chunk of stream){checksum=crc32(chunk as Buffer,checksum);expanded+=(chunk as Buffer).length}
      if(checksum!==entry.crc32||expanded!==entry.uncompressedSize)throw new ProjectError('VALIDATION')
    }
    if(!['[Content_Types].xml','_rels/.rels','word/document.xml','word/styles.xml'].every(name=>names.has(name)))throw new ProjectError('VALIDATION')
  }finally{zip.close()}
}
type Running={job:ExportJob;controller:AbortController;task:Promise<void>;folder:string}
export class ExportJobs{
  private readonly jobs=new Map<string,Running>()
  constructor(private readonly root:string,private readonly resources:string){}
  private async persist(running:Running):Promise<void>{await writeJson(join(running.folder,'report.json'),{version:1,...running.job})}
  async start(workspace:string,input:WorkerExportStart,prepared:PreparedExport):Promise<ExportJob>{
    const {preview,model,images}=prepared
    if(preview.headCommitId!==input.expectedHead||preview.digest!==input.previewDigest)throw new ProjectError('STALE_REVISION')
    if(!model||preview.issues.some(i=>i.kind!=='metadata')||preview.issues.some(i=>i.kind==='metadata')&&!input.acknowledgeMetadata||preview.losses.length)throw new ProjectError('VALIDATION')
    const destination=input.destinationPath,parent=dirname(destination)
    if(!isAbsolute(destination)||!/\.docx$/i.test(destination)||destination.length>4096)throw new ProjectError('VALIDATION')
    const resolvedParent=await realpath(parent),resolvedRoot=await realpath(this.root),rel=relative(resolvedRoot,resolvedParent)
    if(!rel.startsWith('..')&&!isAbsolute(rel))throw new ProjectError('UNSAFE_DESTINATION')
    const target=await fingerprint(destination)
    if(!same(target,input.destinationFingerprint))throw new ProjectError('EXTERNAL_CHANGE')
    const id=randomUUID(),folder=join(workspace,'exports',id)
    await mkdir(join(workspace,'exports'),{recursive:true,mode:0o700})
    await mkdir(folder,{mode:0o700})
    const job:ExportJob={id,state:'rendering',headCommitId:preview.headCommitId,destinationPath:destination,phase:'Rendering DOCX from captured revision',error:null,reportPath:join(folder,'report.json'),counts:preview.counts,losses:preview.losses}
    const running:Running={job,controller:new AbortController(),task:Promise.resolve(),folder}
    await writeJson(join(folder,'manifest.json'),{version:1,capturedAt:new Date().toISOString(),preview,acknowledgedMetadata:input.acknowledgeMetadata,sourceMap:model.sourceMap,imageAssets:[...images].map(([assetId,image])=>({assetId,bytes:image.bytes.length,sha256:createHash('sha256').update(image.bytes).digest('hex')}))})
    await this.persist(running)
    this.jobs.set(id,running)
    running.task=new Promise<void>(resolve=>setImmediate(()=>{void this.render(running,input,model,images).finally(resolve)}))
    return {...job}
  }
  async status(workspace:string,id:string):Promise<ExportJob>{
    const live=this.jobs.get(id)
    if(live)return {...live.job}
    const path=join(workspace,'exports',id,'report.json')
    let raw:unknown
    try{raw=JSON.parse(await readFile(path,'utf8'))}catch{throw new ProjectError('NOT_FOUND')}
    if(!raw||typeof raw!=='object'||!('id'in raw)||raw.id!==id||!('state'in raw))throw new ProjectError('CORRUPT_PROJECT')
    const stored={...raw} as Record<string,unknown>
    delete stored.version
    if(!isExportJob(stored))throw new ProjectError('CORRUPT_PROJECT')
    const job=stored
    if(job.state==='rendering'||job.state==='publishing'){
      job.state='interrupted';job.phase='Interrupted; inspect retained report and candidate';job.error='JOB_INTERRUPTED'
      await writeJson(path,{version:1,...job})
    }
    return job
  }
  async cancel(workspace:string,id:string):Promise<ExportJob>{
    const running=this.jobs.get(id)
    if(!running)return this.status(workspace,id)
    if(running.job.state==='rendering')running.controller.abort()
    return {...running.job}
  }
  async stop():Promise<void>{for(const job of this.jobs.values())if(job.job.state==='rendering')job.controller.abort();await Promise.all([...this.jobs.values()].map(j=>j.task))}
  private async render(running:Running,input:WorkerExportStart,model:NonNullable<PreparedExport['model']>,images:PreparedExport['images']):Promise<void>{
    const {job,folder,controller}=running,signal=controller.signal
    const candidate=join(folder,'candidate.docx'),destination=input.destinationPath,parent=dirname(destination)
    let temporary:string|null=null,previous:string|null=null
    try{
      cancelled(signal)
      const bytes=await exportDocx(model,this.resources,async assetId=>{
        cancelled(signal)
        const image=images.get(assetId)
        if(!image)throw new ProjectError('NOT_FOUND')
        return image
      })
      cancelled(signal)
      if(bytes.length>512*1024*1024)throw new ProjectError('LIMIT_EXCEEDED')
      const output=await open(candidate,'wx',0o600)
      try{await output.writeFile(bytes);await output.sync()}finally{await output.close()}
      await inspectDocx(candidate)
      cancelled(signal)
      job.phase='Preparing guarded destination';await this.persist(running)
      if(!same(await fingerprint(destination),input.destinationFingerprint))throw new ProjectError('EXTERNAL_CHANGE')
      const suffix=`.collie-export-${job.id}`
      temporary=join(parent,`.${job.id}.incoming.docx`)
      const staging=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600)
      try{await staging.writeFile(bytes);await staging.sync()}finally{await staging.close()}
      await inspectDocx(temporary)
      cancelled(signal)
      if(!same(await fingerprint(destination),input.destinationFingerprint))throw new ProjectError('EXTERNAL_CHANGE')
      job.state='publishing';job.phase='Replacing selected DOCX';await this.persist(running)
      if(input.destinationFingerprint){
        previous=join(parent,`${destination.split(/[\\/]/).pop()}${suffix}.previous.docx`)
        if(await fingerprint(previous))throw new ProjectError('DESTINATION_EXISTS')
        await rename(destination,previous)
        if(!same(await fingerprint(previous),input.destinationFingerprint)){
          if(!await fingerprint(destination))await rename(previous,destination).catch(()=>{})
          throw new ProjectError('EXTERNAL_CHANGE')
        }
      }
      try{
        await link(temporary,destination)
        await unlink(temporary);temporary=null
        await syncDirectory(parent)
        await inspectDocx(destination)
        const actual=await fileHash(destination,512*1024*1024)
        if(actual.sha256!==createHash('sha256').update(bytes).digest('hex')||actual.bytes!==bytes.length)throw new ProjectError('UNAVAILABLE')
      }catch(error){
        if(previous && !await fingerprint(destination))await rename(previous,destination).catch(()=>{})
        throw error
      }
      job.state='complete';job.phase='DOCX ready';job.error=null;await this.persist(running)
    }catch(error){
      const code=error instanceof ProjectError?error.code:'UNAVAILABLE'
      job.state=code==='CANCELLED'?'cancelled':job.state==='publishing'?'interrupted':'failed'
      job.phase=job.state==='interrupted'?'Publication needs inspection':'Export stopped'
      job.error=code
      await this.persist(running).catch(()=>{})
    }finally{
      if(temporary)await unlink(temporary).catch(()=>{})
      this.jobs.delete(job.id)
    }
  }
}
