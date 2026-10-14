export function normalizeStoppedComparison<T>(
  report: T,
  attempts: readonly { provider_label: string }[],
  fatal: unknown,
):
  | T
  | {
      status: string;
      comparison_valid: boolean;
      rows: unknown[];
      summary: {
        provider_label: string;
        external_model_calls: number;
        latency_ms: null;
        process_error_rate: null;
        state_violations: null;
      }[];
    };

export function selectAccountChatModel(
  ids: readonly string[],
  configured: string | undefined,
): string | undefined;
