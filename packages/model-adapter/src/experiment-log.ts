import { PROMPT_VERSION } from '@research/ai-orchestrator';
import type { OrchestrationResult } from '@research/ai-orchestrator';
import type { ExperimentStateSnapshot } from '@research/experiment-core';

export function experimentLog(input: {
  conversation_id: string;
  participant_id: string;
  model_name: string;
  model_parameters?: {
    readonly temperature: number;
    readonly max_tokens: number;
    readonly provider?: string;
  };
  state_before: ExperimentStateSnapshot;
  state_after: ExperimentStateSnapshot;
  result: OrchestrationResult;
  response_latency: number;
  fallback_count: number;
}) {
  if (
    ![input.conversation_id, input.participant_id, input.model_name].every(
      (value) => typeof value === 'string' && /^[\p{L}\p{N}_.:/-]{1,128}$/u.test(value),
    ) ||
    !Number.isFinite(input.response_latency) ||
    input.response_latency < 0 ||
    !Number.isSafeInteger(input.fallback_count) ||
    input.fallback_count < 0
  )
    throw new Error('Invalid experiment log metadata');
  if (
    input.model_parameters &&
    (!Number.isFinite(input.model_parameters.temperature) ||
      input.model_parameters.temperature < 0 ||
      input.model_parameters.temperature > 2 ||
      !Number.isSafeInteger(input.model_parameters.max_tokens) ||
      input.model_parameters.max_tokens < 1 ||
      input.model_parameters.max_tokens > 32768 ||
      (input.model_parameters.provider !== undefined &&
        !['mock', 'openai-compatible', 'deepseek'].includes(input.model_parameters.provider)))
  )
    throw new Error('Invalid model log parameters');
  const snapshot = (state: ExperimentStateSnapshot) =>
    Object.freeze({
      path: state.path,
      stage: state.stage,
      stateVersion: state.version,
      experimentVersion: state.experimentVersion,
      lifecycle: state.lifecycle,
    });
  return Object.freeze({
    conversation_id: input.conversation_id,
    participant_id: input.participant_id,
    state_before: snapshot(input.state_before),
    state_after: snapshot(input.state_after),
    model_name: input.model_name,
    provider: input.model_parameters?.provider ?? null,
    prompt_version: PROMPT_VERSION,
    temperature: input.model_parameters?.temperature ?? null,
    max_tokens: input.model_parameters?.max_tokens ?? null,
    retry_count: Math.max(0, input.result.attempts - 1),
    response_latency: input.response_latency,
    validator_result: Object.freeze({
      status: input.result.status,
      violations: Object.freeze([...input.result.violations]),
      attempts: input.result.attempts,
    }),
    fallback_count: input.fallback_count,
  });
}
/** Explicit participant projection; prompt, backend logs and model metadata stay internal. */
export function participantReply(result: OrchestrationResult): { readonly text: string | null } {
  return Object.freeze({ text: result.text });
}
