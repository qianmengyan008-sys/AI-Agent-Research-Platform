import type { TraceSink, BusinessTrace } from './trace.js';
import { orchestrate } from '@research/ai-orchestrator';
import type { LanguageGenerator, OrchestrationRequest } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { fail, hash } from './common.js';
export class ModelRunService {
  constructor(
    private readonly generator: LanguageGenerator,
    readonly settings: ModelSettings,
    private readonly trace: TraceSink = () => {},
  ) {}
  async generate(
    request: OrchestrationRequest,
    pinned: ModelSettings,
    context: Pick<BusinessTrace, 'participantId' | 'sessionId' | 'turnId'> = {},
  ) {
    if (hash(pinned) !== hash(this.settings)) fail(503, 'MODEL_CONFIGURATION_MISMATCH');
    this.trace({ ...context, step: 'orchestrator_started' });
    const result = await orchestrate(
      request,
      {
        generate: (prompt, options) => {
          this.trace({ ...context, step: 'model_adapter_called' });
          return this.generator.generate(prompt, options);
        },
      },
      {
        timeoutMs: pinned.timeout_ms,
        maxAttempts: pinned.max_attempts,
      },
    );
    this.trace({ ...context, step: 'response_validator_completed', outcome: result.status });
    return result;
  }
}
