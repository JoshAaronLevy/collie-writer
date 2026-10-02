import type { StorageWorker } from '../storage-worker'
import type { AiService } from '../ai/service'
import { AiContentService } from '../ai/content-service'
import { ProjectError } from '../../domain/projects/errors'
import { isProofreadValue, type ProofreadRequest, type ProofreadWorkerInput, type ProofreadValue } from '../../shared/proofreading'
export class ProofreadingService extends AiContentService {
  constructor(storage:StorageWorker,ai:AiService){super(storage,ai,'proofreading')}
  override async worker(input:ProofreadWorkerInput):Promise<ProofreadValue>{const value=await super.worker(input);if(!isProofreadValue(value))throw new ProjectError('UNAVAILABLE');return value}
  override async command(input:ProofreadRequest):Promise<ProofreadValue>{const value=await super.command(input);if(!isProofreadValue(value))throw new ProjectError('UNAVAILABLE');return value}
}
