import type { LanguageGenerator } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
export function runLongComparison(
  models: readonly {
    label: 'gpt' | 'deepseek';
    settings: ModelSettings;
    generator: LanguageGenerator;
  }[],
  mode: 'real-provider' | 'local-fixture',
): Promise<{
  status: string;
  rows: {
    provider_label: string;
    round: number;
    path: string;
    base_prompt_sha256: string;
    actual_prompt_sha256: string;
    stored_history_messages: number;
    state_violation: boolean;
    human_passed: null;
    candidate_outputs: { text: string | null }[];
  }[];
  summary: {
    process_errors: number;
    state_violations: number;
    external_model_calls: number;
    human_language_quality_average: null;
  }[];
  state_transitions: unknown[];
}>;
