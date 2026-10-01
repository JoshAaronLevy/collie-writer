import { createPublicKey, verify } from 'node:crypto'
import { exact, record } from '../../shared/projects'
import { ProjectError } from '../../domain/projects/errors'
import { ISSUER_KEYS } from './keys'

export type Grant = {
  schema: 1; keyId: string; issuer: string; channel: 'direct' | 'mas' | 'microsoft'; purchaseRef: string
  editionId: 'nonfiction'; accessKind: 'subscription' | 'lifetime'; revision: number; status: 'active' | 'revoked'
  issuedAt: string; paidThrough?: string; graceUntil?: string
}
export type SignedGrant = { grant: Grant; signature: string }
const token=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v
/** Fixed flat ASCII/safe-integer subset of RFC 8785; no Unicode/numeric ambiguity. */
export function canonicalGrant(grant: Grant): string {
  return JSON.stringify(Object.fromEntries(Object.entries(grant).sort(([a],[b])=>a<b?-1:a>b?1:0)))
}
export function verifyGrant(value: unknown): SignedGrant {
  const bad=():never=>{throw new ProjectError('INVALID_GRANT')}
  if(!record(value)||!exact(value,['grant','signature'])||!record(value.grant)||typeof value.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(value.signature))return bad()
  const g=value.grant
  const names=['schema','keyId','issuer','channel','purchaseRef','editionId','accessKind','revision','status','issuedAt']
  if(g.accessKind==='subscription')names.push('paidThrough','graceUntil')
  if(!exact(g,names)||g.schema!==1||!token(g.keyId)||!token(g.issuer)||!token(g.purchaseRef)||!['direct','mas','microsoft'].includes(String(g.channel))||g.editionId!=='nonfiction'||!['subscription','lifetime'].includes(String(g.accessKind))||!Number.isSafeInteger(g.revision)||Number(g.revision)<1||!['active','revoked'].includes(String(g.status))||!date(g.issuedAt))return bad()
  if(g.accessKind==='subscription'&&(!date(g.paidThrough)||!date(g.graceUntil)||Date.parse(g.graceUntil)<Date.parse(g.paidThrough)||Date.parse(g.graceUntil)-Date.parse(g.paidThrough)>14*86400000))return bad()
  const trusted=ISSUER_KEYS.find(k=>k.keyId===g.keyId&&k.issuer===g.issuer&&k.channel===g.channel)
  if(!trusted)return bad()
  const signature=Buffer.from(value.signature,'base64')
  if(signature.length!==64||signature.toString('base64')!==value.signature)return bad()
  const key=createPublicKey(trusted.publicKeyPem),grant=g as Grant
  if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(canonicalGrant(grant),'utf8'),key,signature))return bad()
  return {grant,signature:value.signature}
}
export function purchaseIdentity(g: Grant): string { return [g.issuer,g.channel,g.purchaseRef,g.editionId].join(':') }
