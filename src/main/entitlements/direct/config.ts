export type DirectConfiguration = {
  origin: string
  issuer: string
  environment: 'sandbox' | 'live'
  checkoutApproved: boolean
}
// Build-owned public configuration, supplied only after actual issuer/domain setup.
// No environment, renderer, project or downloaded grant can change the trust boundary.
// Keep sandbox issuer keys and profiles separate from live release configuration.
export const DIRECT_CONFIGURATION: DirectConfiguration | null = null
