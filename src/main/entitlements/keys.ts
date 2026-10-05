export type IssuerKey = {
  keyId: string
  issuer: string
  channel: 'direct' | 'mas' | 'microsoft'
  publicKeyPem: string
}
// Release configuration only: verified issuer Ed25519 PUBLIC keys belong here.
// No issuer has been configured. Never accept a key from a grant, renderer, environment or project.
// Retain previously trusted public keys when rotating signing keys.
export const ISSUER_KEYS: readonly IssuerKey[] = Object.freeze([])
