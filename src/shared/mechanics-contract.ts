/** Frozen mechanics-v1 result vocabulary. Keep these values for old captures
 * and operation-v3 schema identities when introducing a later contract. */
export const MECHANICS_RESULT_V1 = {
  version:1, mode:'mechanics', schemaId:'collie-mechanics-result-v1',
  envelopeKeys:['version','mode','findings'],
  findingKeys:['targetId','from','to','before','replacement','reason','kind'],
  kinds:['spelling','grammar','punctuation'],
  targetPattern:'^run-[1-9][0-9]{0,2}$',
  limits:{targets:128,findings:100,span:4000,reason:1000,offset:64000}
} as const
