import type { AiContext, AiReason } from './ai'

/** Action-neutral text targeting and retained outcome fields. No renderer/editor/runtime ownership. */
export type CaptureSource = { kind:'none' } | { kind:'section';documentId:string;revisionId:string } | { kind:'passage';documentId:string;revisionId:string;ranges:{blockId:string;from:number;to:number}[] }
export type AiTextCaptureFields = { version:1;id:string;createdAt:string;head:string;prompt:string;source:CaptureSource;context:AiContext[];digest:string }
export type AttemptState = 'not-sent'|'preparing'|'running'|'stopping'|'completed'|'cancelled'|'failed'|'unknown'
export type AiAttemptFields = { version:1;id:string;revisionId:string;state:AttemptState;provider:'openai-codex'|null;model:string|null;reason:AiReason|null;sequence:number;createdAt:string;finishedAt:string|null;requestDigest:string }
