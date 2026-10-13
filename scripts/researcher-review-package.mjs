/** Offline extraction from ONE complete export; never calls a model or scores its language. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const input = process.argv[2],
  destination = process.argv[3];
if (!input || !destination)
  throw new Error(
    'Usage: node scripts/researcher-review-package.mjs complete-export.json new-output-directory',
  );
const data = JSON.parse(await readFile(input, 'utf8'));
if (data.complete !== true || data.per_table_limit !== null || !Array.isArray(data.analysis_rows))
  throw new Error('COMPLETE_EXPORT_REQUIRED');
const dims = [
  '流程忠实度',
  '对用户输入的响应性',
  '语义准确性／指代清晰度',
  '语言自然度',
  '中性与非诱导性',
  '重复与机械感',
];
const percentile = (values, p) => {
  const a = values.toSorted((a, b) => a - b);
  return a.length ? a[Math.ceil(a.length * p) - 1] : null;
};
const experiences = data.analysis_rows.map((row) => {
  const messages = row.conversation_history.toSorted((a, b) => a.sequence - b.sequence);
  const turns = row.conversation_turns.toSorted((a, b) => a.chat_revision - b.chat_revision);
  // Legacy exports lack message-to-turn foreign keys. Only pair when the entire
  // history has exactly one alternating ready pair per contiguous chat revision.
  const unambiguous =
    messages.length === turns.length * 2 &&
    turns.every((t, i) => t.status === 'ready' && t.chat_revision === i + 1) &&
    messages.every((m, i) => m.sequence === i + 1 && m.role === (i % 2 ? 'assistant' : 'user'));
  const runs = row.model_runs;
  const latencies = runs
    .filter(
      (r) =>
        row.conversation_turns.find((t) => t.id === r.turn_id)?.generation_context?.reply_source ===
        'model',
    )
    .map((r) => Number(r.latency_ms))
    .filter(Number.isFinite);
  const participant = data.participants.find((p) => p.id === row.participant_id);
  return {
    participant_id: row.participant_id,
    participant_code: participant?.participant_code ?? null,
    session_id: row.session_id,
    path: row.path_type,
    experience_mode: 'unconfirmed',
    human_reviewer: null,
    start_time: messages[0]?.created_at ?? null,
    end_time:
      row.current_state?.status === 'completed'
        ? (row.state_transition.at(-1)?.created_at ?? null)
        : null,
    final_state: row.current_state?.stage ?? null,
    completed: row.current_state?.status === 'completed',
    total_turns: turns.length,
    retry_count: runs.reduce((a, r) => a + r.retry_count, 0),
    fallback_count: runs.reduce((a, r) => a + r.fallback_count, 0),
    model_generated_latency_ms: {
      samples: latencies.length,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: latencies.length ? Math.max(...latencies) : null,
      definition: 'backend generation including retries, model-source turns only; not TTFT',
    },
    reply_sources: turns.reduce((a, t) => {
      const source = t.generation_context?.reply_source ?? 'unknown';
      a[source] = (a[source] ?? 0) + 1;
      return a;
    }, {}),
    errors: runs
      .filter((r) => r.error_code)
      .map((r) => ({ turn_id: r.turn_id, error_code: r.error_code })),
    message_pairing: unambiguous
      ? 'strict_contiguous_ready_history'
      : 'cannot_judge_use_original_timeline',
    per_turn_review: turns.map((turn, i) => ({
      turn_id: turn.id,
      stage: turn.generation_context?.stage ?? null,
      source: turn.generation_context?.reply_source ?? null,
      latency_ms: runs.filter((r) => r.turn_id === turn.id).map((r) => Number(r.latency_ms)),
      user_message_id: unambiguous ? messages[2 * i].id : null,
      assistant_message_id: unambiguous ? messages[2 * i + 1].id : null,
      user_text: unambiguous ? messages[2 * i].content : null,
      assistant_text: unambiguous ? messages[2 * i + 1].content : null,
      dimensions: Object.fromEntries(dims.map((d) => [d, '待审核'])),
      decision: '待审核',
      severity: null,
      issue: null,
      suggested_change: null,
    })),
    experience_notes: {
      ambiguous_input: null,
      multiple_beliefs: null,
      system_question: null,
      rating_interruption: null,
      short_reply: null,
      off_topic: null,
      reconsideration: null,
      waiting_experience: null,
    },
  };
});
const directory = resolve(destination);
await mkdir(directory); // refuse overwriting any existing review or human decisions
await writeFile(
  resolve(directory, 'review.json'),
  JSON.stringify(
    {
      source_export: input,
      experiment_id: data.experiment_id,
      generated_at: new Date().toISOString(),
      mentor_test_ready: false,
      human_review_status: 'pending',
      decisions: ['通过', '需修改', '无法判断'],
      dimensions: dims,
      experiences,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(directory, 'original-complete-export.json'),
  JSON.stringify(data, null, 2) + '\n',
);
console.info(
  `Offline review package created: ${experiences.length} sessions; all human decisions pending`,
);
