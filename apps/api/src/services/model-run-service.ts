import type { TraceSink, BusinessTrace } from './trace.js';
import { orchestrate } from '@research/ai-orchestrator';
import type { LanguageGenerator, OrchestrationRequest } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import { fail, hash } from './common.js';
import { modelTransportScope } from './model-transport-audit.js';
import type { TransportAudit } from './model-transport-audit.js';
export interface ModelProfile {
  readonly settings: ModelSettings;
  readonly generator: LanguageGenerator;
}
export class ModelRunService {
  constructor(
    private readonly generator: LanguageGenerator,
    readonly settings: ModelSettings,
    private readonly trace: TraceSink = () => {},
    private readonly profiles: readonly ModelProfile[] = [],
  ) {}
  async generate(
    request: OrchestrationRequest,
    pinned: ModelSettings,
    context: Pick<BusinessTrace, 'participantId' | 'sessionId' | 'turnId'> = {},
    completeSentences = false,
  ) {
    const generator =
      hash(pinned) === hash(this.settings)
        ? this.generator
        : this.profiles.find((p) => hash(p.settings) === hash(pinned))?.generator;
    if (!generator) return fail(503, 'MODEL_CONFIGURATION_MISMATCH');
    const audit: TransportAudit = { settings: pinned, attempts: [] };
    return modelTransportScope.run(audit, async () => {
      this.trace({ ...context, step: 'orchestrator_started' });
      const result = await orchestrate(
        request,
        {
          generate: (prompt, options) => {
            this.trace({ ...context, step: 'model_adapter_called' });
            const formatted = completeSentences
              ? {
                  ...prompt,
                  messages: [
                    ...prompt.messages,
                    {
                      role: 'system' as const,
                      content:
                        '请用一至三个简短自然段完整回应当前任务，保留必要信息，使用完整句子并自然结束。优先精炼措辞，不机械截断，不引入其他任务。',
                    },
                  ],
                }
              : prompt;
            return generator.generate(formatted, options);
          },
        },
        {
          timeoutMs: pinned.timeout_ms,
          maxAttempts: pinned.max_attempts,
        },
      );
      this.trace({ ...context, step: 'response_validator_completed', outcome: result.status });
      return audit.attempts.length
        ? { ...result, model_transport_attempts: structuredClone(audit.attempts) }
        : result;
    });
  }
}
