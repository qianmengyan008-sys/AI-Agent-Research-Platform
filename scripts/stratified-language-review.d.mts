export function buildStratifiedReview(sourceDirectory: string): Promise<{
  selected_count: number;
  mandatory_count: number;
  all_retry_fallback_and_anomaly_rows_included: boolean;
  violation_coverage: Record<string, number>;
  human_scored_items: number;
  human_average: null;
  items: {
    review_id: string;
    scores: Record<string, number | null>;
    willing_to_continue: boolean | null;
    obvious_scripted_feel: boolean | null;
    previous_three_turns: unknown[];
  }[];
}>;
