import type { Pool } from 'pg';
import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { UnitOfWork } from '../repositories/context.js';
import { ExperimentService } from './experiment-service.js';
import { ParticipantService } from './participant-service.js';
import { ConversationService } from './conversation-service.js';
import { AdminService } from './admin-service.js';
import { ModelRunService } from './model-run-service.js';
import type { ModelProfile } from './model-run-service.js';
import { safeTrace } from './trace.js';
import type { TraceSink } from './trace.js';
export function createServices(
  pool: Pool,
  generator: LanguageGenerator,
  settings: ModelSettings,
  sink?: TraceSink,
  profiles?: readonly ModelProfile[],
) {
  const trace = safeTrace(sink);
  const uow = new UnitOfWork(pool);
  const model = new ModelRunService(generator, settings, trace, profiles);
  return {
    experiments: new ExperimentService(uow, settings, trace),
    participants: new ParticipantService(uow, trace),
    conversations: new ConversationService(uow, model, trace),
    admin: new AdminService(uow),
  };
}
export type Services = ReturnType<typeof createServices>;
