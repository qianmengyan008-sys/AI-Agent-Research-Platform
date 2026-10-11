import { createContext } from './context-manager.js';
import { buildPrompt } from './prompt-builder.js';
import { validateResponse } from './response-validator.js';
import { fallbackReply } from './fallback-handler.js';
import { freeze } from './immutable.js';
import {
  runGeneration,
  GenerationTimeoutError,
  GenerationAbortedError,
  GenerationFailureError,
} from './generation.js';
import type {
  LanguageGenerator,
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationOptions,
  AuditEvent,
  ViolationCode,
} from './types.js';

export async function orchestrate(
  request: OrchestrationRequest,
  generator: LanguageGenerator,
  options: OrchestrationOptions = {},
): Promise<OrchestrationResult> {
  const maxAttempts = options.maxAttempts ?? 2;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3)
    throw new Error('maxAttempts must be an integer from 1 to 3');
  const timeoutMs = options.timeoutMs ?? 10000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new Error('timeoutMs must be an integer from 1 to 60000');
  const context = createContext(request);
  const prompt = buildPrompt(context);
  const violations = new Set<ViolationCode>();
  const auditEvents: AuditEvent[] = [];
  let auditDelivery: OrchestrationResult['auditDelivery'] = options.auditSink
    ? 'delivered'
    : 'returned';
  let text: string | null = null;
  let status: OrchestrationResult['status'] = 'blocked';
  let attempts = 0;
  async function audit(outcome: AuditEvent['outcome'], reasons: readonly ViolationCode[]) {
    const event = freeze({
      path: context.path,
      stage: context.stage,
      experimentVersion: context.experimentVersion,
      stateVersion: context.stateVersion,
      attempt: attempts,
      outcome,
      violations: [...reasons],
    });
    auditEvents.push(event);
    if (options.auditSink) {
      try {
        await options.auditSink(event);
      } catch {
        auditDelivery = 'failed';
      }
    }
  }
  while (attempts < maxAttempts) {
    attempts += 1;
    let reply: unknown;
    let reasons: readonly ViolationCode[];
    let retryable = true;
    try {
      // No raw invalid output or future-stage list is fed back to the generator.
      const attemptPrompt =
        attempts === 1
          ? prompt
          : freeze({
              ...prompt,
              messages: [
                ...prompt.messages,
                {
                  role: 'system' as const,
                  content:
                    '重新生成当前任务的自然回复。严格遵守既有规则、确认观点和当前场景，不重复已给出的回复。',
                },
              ],
            });
      reply = await runGeneration(
        (signal) => generator.generate(attemptPrompt, { timeoutMs, signal }),
        { timeoutMs, ...(options.signal ? { signal: options.signal } : {}) },
      );
      reasons = validateResponse(reply, context).violations;
    } catch (error) {
      retryable = !(error instanceof GenerationFailureError) || error.retryable;
      reasons = [
        error instanceof GenerationTimeoutError
          ? 'GENERATOR_TIMEOUT'
          : error instanceof GenerationAbortedError
            ? 'GENERATOR_ABORTED'
            : 'GENERATOR_FAILURE',
      ];
    }
    if (reasons.length === 0) {
      text = reply as string;
      status = 'generated';
      if (attempts > 1) await audit('regenerated', []);
      break;
    }
    for (const reason of reasons) violations.add(reason);
    await audit('rejected', reasons);
    if (!retryable || reasons.includes('GENERATOR_ABORTED')) break;
  }
  if (status !== 'generated') {
    text = fallbackReply(context);
    status = text === null ? 'blocked' : 'fallback';
    await audit(status, [...violations]);
  }
  return freeze({
    status,
    text,
    stage: context.stage,
    experimentVersion: context.experimentVersion,
    stateVersion: context.stateVersion,
    violations: [...violations],
    prompt,
    attempts,
    auditEvents,
    auditDelivery,
  });
}

/** Fixed local text only: no vendor, HTTP client, credentials or network. */
export class FixedTextGenerator implements LanguageGenerator {
  constructor(private readonly reply: string) {}
  async generate(): Promise<string> {
    return this.reply;
  }
}
