import { orchestrate } from '@research/ai-orchestrator';
import type { LanguageGenerator, OrchestrationRequest } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { fail, hash } from './common.js';
export class ModelRunService {
  constructor(
    private readonly generator: LanguageGenerator,
    readonly settings: ModelSettings,
  ) {}
  async generate(request: OrchestrationRequest, pinned: ModelSettings) {
    if (hash(pinned) !== hash(this.settings)) fail(503, 'MODEL_CONFIGURATION_MISMATCH');
    return orchestrate(request, this.generator, {
      timeoutMs: pinned.timeout_ms,
      maxAttempts: pinned.max_attempts,
    });
  }
}
