/** Offline extraction only: never calls a provider or approves semantics/Pilot. */
type RecordData = Record<string, unknown>;
function record(value: unknown): RecordData {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid review source');
  return value as RecordData;
}
function records(value: unknown): RecordData[] {
  if (!Array.isArray(value)) throw new Error('Missing review records');
  return value.map(record);
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing trace identifier');
  return value;
}
function unique(items: RecordData[], key: string, value: unknown): RecordData {
  const found = items.filter((item) => item[key] === value);
  if (found.length !== 1) throw new Error('Ambiguous or missing trace record');
  return found[0]!;
}
const variableKeys = [
  'confirmed_belief',
  'rating_1',
  'rating_2',
  'action_intention',
  'scene_state',
  'scene_phase',
  'character_profile',
  'relationship_state',
];
export const semanticProblemTypes = [
  '流程错误',
  '状态错误',
  '语言问题',
  '指代问题',
  '重复问题',
  '数据问题',
] as const;
export function createSemanticReview(
  input: unknown,
  scope: 'real-provider' | 'local-fixture' = 'real-provider',
) {
  const report = record(input);
  if (report.mode !== scope) throw new Error('Provider scope mismatch');
  const status = id(report.status);
  if (
    ![
      'not_run',
      'failed',
      'provider_or_flow_failed',
      'latency_threshold_exceeded',
      'completed',
      'completed_with_guard_interventions',
    ].includes(status)
  )
    throw new Error('Unknown acceptance status');
  const rows: RecordData[] = [];
  if (status === 'not_run') {
    if (report.external_model_calls !== 0 || report.database_started !== false)
      throw new Error('Inconsistent not_run evidence');
  } else if (status !== 'failed' || report.paths !== undefined) {
    for (const path of records(report.paths)) {
      const pathId = id(path.path);
      if (!['cognitive_v1', 'emotion_v1'].includes(pathId)) throw new Error('Unknown path');
      const data = record(path.analysis_export);
      const messages = records(data.messages),
        runs = records(data.runs);
      const diagnostics = records(record(path.diagnostics).debug_log);
      const seen = new Set<string>();
      const seenMessages = new Set<string>();
      for (const observation of records(path.observations)) {
        const turnId = id(observation.turn_id),
          sessionId = id(observation.session_id);
        if (seen.has(turnId)) throw new Error('Duplicate turn');
        seen.add(turnId);
        const user = unique(messages, 'id', id(observation.user_message_id));
        const assistant = unique(messages, 'id', id(observation.assistant_message_id));
        const run = unique(runs, 'turn_id', turnId);
        const diagnostic = unique(diagnostics, 'turn_id', turnId);
        const stage = id(observation.stage);
        id(run.id);
        id(run.model_name);
        id(run.provider);
        if (seenMessages.has(id(user.id)) || seenMessages.has(id(assistant.id)))
          throw new Error('Duplicate message source');
        seenMessages.add(id(user.id));
        seenMessages.add(id(assistant.id));
        if (
          user.session_id !== sessionId ||
          assistant.session_id !== sessionId ||
          run.session_id !== sessionId ||
          user.role !== 'user' ||
          assistant.role !== 'assistant' ||
          !Number.isInteger(user.sequence) ||
          !Number.isInteger(assistant.sequence) ||
          Number(assistant.sequence) !== Number(user.sequence) + 1 ||
          diagnostic.model_run_id !== run.id ||
          diagnostic.state_before !== stage ||
          typeof user.content !== 'string' ||
          (assistant.content !== null && typeof assistant.content !== 'string')
        )
          throw new Error('Broken turn provenance');
        if (scope === 'real-provider' && run.provider === 'mock')
          throw new Error('Mock is not real provider evidence');
        if (
          scope === 'real-provider' &&
          (typeof report.external_model_calls !== 'number' || report.external_model_calls <= 0)
        )
          throw new Error('Missing provider call evidence');
        const model = Object.fromEntries(
          [
            'model_name',
            'provider',
            'temperature',
            'max_tokens',
            'latency_ms',
            'retry_count',
            'validator_result',
            'fallback_count',
            'error_code',
            'status',
            'prompt_version',
          ].map((key) => [key, run[key] ?? null]),
        );
        rows.push({
          test_id: `${pathId}:${turnId}`,
          path: pathId,
          stage,
          session_id: sessionId,
          turn_id: turnId,
          user_message_id: user.id,
          assistant_message_id: assistant.id,
          input: user.content,
          expected_behavior:
            pathId === 'cognitive_v1'
              ? `仅回应当前 ${stage}；围绕明确用户观点，不替换观点、不暗示评分、不跳评分或四重构；表达、逻辑和指代清楚。`
              : `仅回应当前 ${stage}；保持明确场景和阶段，不回退、不预告后续剧情，回应用户且避免重复引导。`,
          model_output: assistant.content,
          reply_status: observation.reply_status ?? null,
          model_run_id: run.id,
          model,
          final_research_variables: records(data.variables)
            .filter((v) => v.session_id === sessionId && variableKeys.includes(String(v.key)))
            .map((v) => ({
              key: v.key,
              value: v.value,
              source_transition_id: v.source_transition_id,
            })),
          engineering_observation: Object.fromEntries(
            ['state_unchanged', 'variables_unchanged', 'events_unchanged'].map((key) => [
              key,
              observation[key] ?? null,
            ]),
          ),
          passed: null,
          review_status: 'pending_researcher_review',
          problem_types: [],
          fix_proposal: null,
          reviewer: null,
          reviewed_at: null,
        });
      }
    }
  }
  return {
    format: 'real-model-semantic-review-v1',
    scope,
    source_status: status,
    external_model_calls: report.external_model_calls ?? null,
    missing_variables:
      status === 'not_run'
        ? ['MODEL_API_KEY', 'MODEL_NAME'].filter(
            (k) => Array.isArray(report.missing_variables) && report.missing_variables.includes(k),
          )
        : [],
    semantic_review: rows.length ? 'pending_researcher_review' : 'not_run',
    problem_type_options: semanticProblemTypes,
    row_count: rows.length,
    rows,
    pilot_ready: false,
    formal_ready: false,
    note: 'Extraction trusts the source scope label; it is not proof of provider calls or a semantic verdict. Final research variables are post-flow context, not the prompt seen by the model. No discarded candidate text is reconstructed.',
  };
}
function cell(value: unknown): string {
  return String(value ?? '未验收／无记录')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\\|[\]!*_`]/g, '\\$&')
    .replace(/\r?\n/g, '<br>');
}
export function semanticReviewMarkdown(review: ReturnType<typeof createSemanticReview>) {
  const lines = [
    '# real-model-semantic-review：逐条回复审核表',
    '',
    `范围：${cell(review.scope)}；来源状态：${cell(review.source_status)}；记录数：${review.row_count}。`,
    '',
    '**自动提取不评价语义，所有“是否通过”均为未验收；Pilot 与正式实验均未放行。**',
    '',
    '问题类型：流程错误、状态错误、语言问题、指代问题、重复问题、数据问题。',
    '',
    '| 测试编号 | 路径／阶段 | 输入 | 期望行为 | 模型输出 | 是否通过 | 问题类型 | 修复方案 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of review.rows)
    lines.push(
      '| ' +
        [
          row.test_id,
          `${row.path}／${row.stage}`,
          row.input,
          row.expected_behavior,
          row.model_output,
          '未验收',
          '待研究者填写',
          '待研究者填写',
        ]
          .map(cell)
          .join(' | ') +
        ' |',
    );
  if (!review.rows.length) lines.push('', '没有可审核的实际回复；不生成虚构输入、输出或通过结论。');
  lines.push(
    '',
    'JSON 保留消息／turn／模型日志 ID、实测参数、异常和最终研究变量；人工结论应另存，不覆盖原始机器报告。',
    '',
  );
  return lines.join('\n');
}
