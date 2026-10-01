import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'
import { isExportFormat, type ExportFormat } from './exports'

export type CompilationRecipe = { id:string; revisionId:string; name:string; documentIds:string[]; paper:'Letter'|'A4'; formats:ExportFormat[]; missingIds:string[]; createdAt:string; updatedAt:string }
export type RecipesView = { headCommitId:string; recipes:CompilationRecipe[] }
export type RecipeChangeInput = OpenInput & { operationId:string; expectedHead:string; id:string|null; expectedRevisionId:string|null; name:string; documentIds:string[]; paper:'Letter'|'A4'; formats:ExportFormat[] }
export type ImportPick = { token:string; name:string; format:'markdown'|'text' }
export type ImportPreviewInput = OpenInput & { token:string }
export type WorkerImportPreview = ImportPreviewInput & { sourcePath:string; originalName:string; format:'markdown'|'text' }
export type ImportPreview = { digest:string; title:string; format:'markdown'|'text'; blocks:number; bytes:number; losses:string[]; excerpt:string }
export type ImportCommitInput = ImportPreviewInput & { operationId:string; expectedHead:string; digest:string; preserveOriginal:boolean }
export type WorkerImportCommit = ImportCommitInput & { sourcePath:string; originalName:string; format:'markdown'|'text' }
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const keys=(v:Record<string,unknown>,names:string[]):boolean=>Object.keys(v).length===names.length&&names.every(n=>Object.hasOwn(v,n))
const scope=(v:Record<string,unknown>):boolean=>isId(v.projectId)&&isId(v.workspaceId)
const formats=(v:unknown):v is ExportFormat[]=>Array.isArray(v)&&v.length>0&&v.length<=4&&v.every(isExportFormat)&&new Set(v).size===v.length
const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>0&&v.length<=10000&&v.every(isId)&&new Set(v).size===v.length
const name=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=255&&!/[\\/:\u0000-\u001f]/.test(v)
export function isRecipeChange(v:unknown):v is RecipeChangeInput{return obj(v)&&keys(v,['projectId','workspaceId','operationId','expectedHead','id','expectedRevisionId','name','documentIds','paper','formats'])&&scope(v)&&isId(v.operationId)&&isId(v.expectedHead)&&(v.id===null||isId(v.id))&&(v.expectedRevisionId===null||isId(v.expectedRevisionId))&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=120&&!/[\u0000-\u001f]/.test(v.name)&&ids(v.documentIds)&&['Letter','A4'].includes(String(v.paper))&&formats(v.formats)}
export function isRecipe(v:unknown):v is CompilationRecipe{return obj(v)&&keys(v,['id','revisionId','name','documentIds','paper','formats','missingIds','createdAt','updatedAt'])&&isId(v.id)&&isId(v.revisionId)&&typeof v.name==='string'&&v.name.length<=120&&ids(v.documentIds)&&['Letter','A4'].includes(String(v.paper))&&formats(v.formats)&&Array.isArray(v.missingIds)&&v.missingIds.every(isId)&&typeof v.createdAt==='string'&&typeof v.updatedAt==='string'}
export function isRecipesView(v:unknown):v is RecipesView{return obj(v)&&keys(v,['headCommitId','recipes'])&&isId(v.headCommitId)&&Array.isArray(v.recipes)&&v.recipes.length<=1000&&v.recipes.every(isRecipe)}
export function isImportPick(v:unknown):v is ImportPick{return obj(v)&&keys(v,['token','name','format'])&&isId(v.token)&&name(v.name)&&(v.format==='markdown'||v.format==='text')}
export function isImportPreviewInput(v:unknown):v is ImportPreviewInput{return obj(v)&&keys(v,['projectId','workspaceId','token'])&&scope(v)&&isId(v.token)}
export function isImportCommitInput(v:unknown):v is ImportCommitInput{return obj(v)&&keys(v,['projectId','workspaceId','token','operationId','expectedHead','digest','preserveOriginal'])&&scope(v)&&isId(v.token)&&isId(v.operationId)&&isId(v.expectedHead)&&typeof v.digest==='string'&&/^[a-f0-9]{64}$/.test(v.digest)&&typeof v.preserveOriginal==='boolean'}
export function isWorkerImportPreview(v:unknown):v is WorkerImportPreview{return obj(v)&&keys(v,['projectId','workspaceId','token','sourcePath','originalName','format'])&&isImportPreviewInput({projectId:v.projectId,workspaceId:v.workspaceId,token:v.token})&&typeof v.sourcePath==='string'&&v.sourcePath.length<=4096&&name(v.originalName)&&(v.format==='markdown'||v.format==='text')}
export function isWorkerImportCommit(v:unknown):v is WorkerImportCommit{return obj(v)&&keys(v,['projectId','workspaceId','token','operationId','expectedHead','digest','preserveOriginal','sourcePath','originalName','format'])&&isImportCommitInput({projectId:v.projectId,workspaceId:v.workspaceId,token:v.token,operationId:v.operationId,expectedHead:v.expectedHead,digest:v.digest,preserveOriginal:v.preserveOriginal})&&typeof v.sourcePath==='string'&&v.sourcePath.length<=4096&&name(v.originalName)&&(v.format==='markdown'||v.format==='text')}
export function isImportPreview(v:unknown):v is ImportPreview{return obj(v)&&keys(v,['digest','title','format','blocks','bytes','losses','excerpt'])&&typeof v.digest==='string'&&/^[a-f0-9]{64}$/.test(v.digest)&&typeof v.title==='string'&&v.title.length<=500&&(v.format==='markdown'||v.format==='text')&&Number.isSafeInteger(v.blocks)&&Number(v.blocks)>=1&&Number.isSafeInteger(v.bytes)&&Number(v.bytes)>=0&&Array.isArray(v.losses)&&v.losses.length<=10000&&v.losses.every(x=>typeof x==='string'&&x.length<=2000)&&typeof v.excerpt==='string'&&v.excerpt.length<=1000}
