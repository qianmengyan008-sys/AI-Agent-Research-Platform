/** Pure extraction of recorded cognitive evidence; no invented raw candidates or model calls. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [input, output, session] = process.argv.slice(2);
if (!input || !output)
  throw new Error(
    'Usage: node scripts/cognitive-turn-audit.mjs complete-export.json new-directory [session_id]',
  );
const data = JSON.parse(await readFile(input, 'utf8'));
if (data.complete !== true || data.per_table_limit !== null)
  throw new Error('COMPLETE_EXPORT_REQUIRED');
const candidates = data.analysis_rows.filter(
  (r) =>
    r.path_type === 'cognitive' &&
    r.current_state?.status === 'completed' &&
    (!session || r.session_id === session),
);
if (candidates.length !== 1) throw new Error('SELECT_ONE_COMPLETED_COGNITIVE_SESSION');
const row = candidates[0];
const turns = row.conversation_turns.toSorted((a, b) => a.chat_revision - b.chat_revision);
const messages = row.conversation_history.toSorted((a, b) => a.sequence - b.sequence);
if (
  messages.length !== turns.length * 2 ||
  !turns.every((t, i) => t.status === 'ready' && t.chat_revision === i + 1) ||
  !messages.every((m, i) => m.sequence === i + 1 && m.role === (i % 2 ? 'assistant' : 'user'))
)
  throw new Error('AMBIGUOUS_MESSAGE_TURN_PAIRING');
const dimensions = [
  '流程忠实度',
  '对用户输入的响应性',
  '语义准确性／指代清晰度',
  '语言自然度',
  '中性与非诱导性',
  '重复与机械感',
];
const items = turns.map((turn, i) => {
  const runs = row.model_runs.filter((r) => r.turn_id === turn.id);
  if (runs.length !== 1) throw new Error('AMBIGUOUS_MODEL_RUN');
  const run = runs[0],
    user = messages[i * 2],
    assistant = messages[i * 2 + 1];
  const automatic = row.state_transition.filter(
    (e) => e.validated_payload?.source_turn_id === turn.id,
  );
  if (
    automatic.length > 1 ||
    automatic.some(
      (e) =>
        e.from_version !== turn.accepted_core_version ||
        e.previous_state !== turn.generation_context.stage,
    )
  )
    throw new Error('AMBIGUOUS_AUTOMATIC_TRANSITION');
  const before = { stage: turn.generation_context.stage, core_version: turn.accepted_core_version };
  const after = automatic[0]
    ? { stage: automatic[0].current_state, core_version: automatic[0].to_version }
    : before;
  const nextInputTime = messages[i * 2 + 2]?.created_at;
  const followingSubmissions = row.state_transition.filter(
    (e) =>
      e.actor_type === 'participant' &&
      e.from_version === after.core_version &&
      e.created_at >= run.created_at &&
      (!nextInputTime || e.created_at <= nextInputTime),
  );
  return {
    ordinal: i + 1,
    session_id: row.session_id,
    turn_id: turn.id,
    user_message_id: user.id,
    assistant_message_id: assistant.id,
    user_input: user.content,
    final_presented_text: assistant.content,
    reply_source: turn.generation_context.reply_source,
    accepted_model_text:
      turn.generation_context.reply_source === 'model' ? assistant.content : null,
    raw_model_candidates: null,
    raw_candidate_availability: 'not_recorded_in_existing_export',
    validator_result: run.validator_result,
    retry_count: run.retry_count,
    fallback_count: run.fallback_count,
    fallback_reasons: run.fallback_count ? (run.validator_result?.violations ?? []) : [],
    latency_ms: Number(run.latency_ms),
    state_before: before,
    state_after_generation: after,
    state_after_generation_basis: automatic.length
      ? 'recorded source_turn_id transition'
      : 'no recorded generation-linked transition',
    automatic_transition: automatic[0] ?? null,
    following_explicit_submission:
      followingSubmissions.length === 1 ? followingSubmissions[0] : null,
    explicit_submission_mapping:
      followingSubmissions.length > 1 ? 'cannot_judge' : 'version_and_time_window',
    // Stage/version projections only. Historical full snapshots are not available per turn.
    historical_full_state_snapshots_available: false,
    dimensions: Object.fromEntries(dimensions.map((d) => [d, '待审核'])),
    human_decision: '待审核',
    severity: null,
    suspected_cause: null,
    evidence: null,
  };
});
const counts = {};
for (const item of items)
  for (const event of item.validator_result?.auditEvents ?? [])
    if (event.outcome === 'rejected')
      for (const reason of event.violations) counts[reason] = (counts[reason] ?? 0) + 1;
const report = {
  source_export: input,
  session_id: row.session_id,
  synthetic: 'unconfirmed_by_export',
  raw_candidates_available: false,
  causality_verdict:
    'cannot_distinguish_strict_validator_prompt_conflict_or_model_noncompliance_without_raw_candidates',
  mentor_test_ready: false,
  human_review: 'pending',
  total_turns: items.length,
  retry_count: items.reduce((n, t) => n + t.retry_count, 0),
  fallback_turns: items.reduce((n, t) => n + t.fallback_count, 0),
  rejection_reason_counts: counts,
  dimensions,
  items,
};
await mkdir(resolve(output)); // Never overwrite decisions or another review package.
await writeFile(
  resolve(output, 'cognitive-turn-audit.json'),
  JSON.stringify(report, null, 2) + '\n',
);
const escape = (s) =>
  String(s ?? '')
    .replaceAll('|', '／')
    .replaceAll('\n', ' ');
const rows = items
  .map(
    (t) =>
      `| ${t.ordinal} | ${t.state_before.stage} | ${t.reply_source} | ${t.retry_count} | ${t.fallback_reasons.join(', ')} | ${escape(t.user_input)} | ${escape(t.final_presented_text)} |`,
  )
  .join('\n');
await writeFile(
  resolve(output, 'cognitive-turn-audit.md'),
  `# 认知逐轮审核（未人工评分）\n\n会话 ${row.session_id}，${items.length} 轮，${report.retry_count} 次重试，${report.fallback_turns} 轮兜底。完整字段、Validator audit、阶段／版本和提交映射见同名 JSON。原始失败候选没有保存，不能据此裁定是 Validator 过严、Prompt 冲突还是模型不遵循。这里没有重新调用模型。\n\n| 轮 | 阶段 | 来源 | 重试 | 兜底原因 | 用户输入 | 最终呈现 |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows}\n`,
);
console.info(
  `Cognitive audit extracted: ${items.length} turns; raw candidates unavailable; human review pending`,
);
