/** A stopped transport run cannot become a vendor-quality comparison via fallback rows. */
export function normalizeStoppedComparison(report, attempts, fatal) {
  if (!fatal) return report;
  return {
    ...report,
    status: 'stopped_configuration_error',
    comparison_valid: false,
    reason: 'fatal_provider_http_status',
    fatal_stop: fatal,
    completed_pairs: null,
    rows: [],
    summary: report.summary.map((s) => ({
      provider_label: s.provider_label,
      settings: s.settings,
      status: attempts.some((a) => a.provider_label === s.provider_label) ? 'blocked' : 'not_run',
      external_model_calls: attempts.filter((a) => a.provider_label === s.provider_label).length,
      latency_ms: null,
      process_error_rate: null,
      state_violations: null,
      human_language_quality_average: null,
      human_scored_cases: 0,
    })),
    semantic_review: 'not_run',
    skipped_controller_rows: report.rows.length,
    skipped_rows_definition:
      'Controller fallback/skipped rows after an access failure are excluded, not counted as executed vendor cases or semantic errors.',
  };
}

/** Honor a configured name only when it is a listed chat model; never choose embeddings. */
export function selectAccountChatModel(ids, configured) {
  const chat = ids.filter(
    (id) =>
      typeof id === 'string' &&
      /^gpt-/.test(id) &&
      !/embedding|audio|realtime|image|transcri/i.test(id),
  );
  return chat.includes(configured) ? configured : chat.toSorted()[0];
}
