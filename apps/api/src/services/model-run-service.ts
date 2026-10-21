import type { TraceSink, BusinessTrace } from './trace.js';
import { boundedBubbles, validGeneratedReply } from '@research/contracts';
import { GenerationFailureError } from '@research/ai-orchestrator';
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
    presentation?: {
      path: 'daily' | 'emotional';
      maxBubbles: number;
      fixed: boolean;
      identity: string;
    },
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
          generate: async (prompt, options) => {
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
            if (presentation) {
              const content =
                presentation.path === 'daily'
                  ? `你是${presentation.identity}。用自然平等的伙伴口吻简短聊天，一轮仅一个气泡，不超过30个汉字，最多一个问题，也可不提问。可以回应、分享和表达个人立场，不做心理疏导，不反复共情或肯定，不要每轮都追问。不要声称真实个人经历。`
                  : `保留当前固定人物、场景及任务。最多${presentation.maxBubbles}个气泡，每个少于30个汉字，完整语义，不截句。每个涉及人物的气泡标注Marcus或李阳及说话、动作或心理归属。最后一个气泡提出一个明确问题，全轮最多一问。归属不明时只问一句澄清，不编造归属，不重复已知信息。`;
              const raw = await generator.generate(
                {
                  ...formatted,
                  messages: [...formatted.messages, { role: 'system' as const, content }],
                },
                options,
              );
              const claimed =
                typeof raw === 'string'
                  ? raw.match(/(?:我是|我叫|我的名字是)(Jamal|Lakisha|王涛|王静)/u)?.[1]
                  : undefined;
              if (
                (presentation.path === 'daily' &&
                  claimed &&
                  !presentation.identity.startsWith(claimed)) ||
                typeof raw !== 'string' ||
                (presentation.fixed
                  ? boundedBubbles(raw, presentation.path) === null
                  : !validGeneratedReply(raw, presentation.path, presentation.maxBubbles))
              )
                throw new GenerationFailureError(true);
              return raw;
            }
            return generator.generate(formatted, options);
          },
        },
        {
          timeoutMs: pinned.timeout_ms,
          maxAttempts: pinned.max_attempts,
        },
      );
      const checked =
        presentation &&
        result.text &&
        (presentation.fixed
          ? boundedBubbles(result.text, presentation.path) === null
          : !validGeneratedReply(result.text, presentation.path, presentation.maxBubbles))
          ? {
              ...result,
              status: 'blocked' as const,
              text: null,
              violations: [...result.violations, 'CURRENT_STAGE_RESTRICTION' as const],
            }
          : result;
      this.trace({ ...context, step: 'response_validator_completed', outcome: checked.status });
      return audit.attempts.length
        ? { ...checked, model_transport_attempts: structuredClone(audit.attempts) }
        : checked;
    });
  }
}
