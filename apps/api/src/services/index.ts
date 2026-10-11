import type { Pool } from 'pg';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { UnitOfWork } from '../repositories/context.js';
import { ExperimentService } from './experiment-service.js';
import { ParticipantService } from './participant-service.js';
import { ConversationService } from './conversation-service.js';
import { AdminService } from './admin-service.js';
import { ModelRunService } from './model-run-service.js';
export function createServices(pool: Pool, generator: LanguageGenerator, settings: ModelSettings) {
  const uow = new UnitOfWork(pool);
  const model = new ModelRunService(generator, settings);
  return {
    experiments: new ExperimentService(uow, settings),
    participants: new ParticipantService(uow),
    conversations: new ConversationService(uow, model),
    admin: new AdminService(uow),
  };
}
export type Services = ReturnType<typeof createServices>;
