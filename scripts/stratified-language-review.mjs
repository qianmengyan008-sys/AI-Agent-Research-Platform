/** Offline selection; never rates language or invokes a model. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha = (x) => createHash('sha256').update(x).digest('hex');
const dims = [
  'clarity',
  'logic',
  'reference',
  'non_repetition',
  'experiment_fidelity',
  'nonstandard_understanding',
];
export async function buildStratifiedReview(sourceDirectory) {
  const source = resolve(sourceDirectory),
    file = await readFile(resolve(source, 'human-language-review-template.json'));
  const original = JSON.parse(file),
    items = original.items;
  if (
    !Array.isArray(items) ||
    items.length !== 164 ||
    items.some((x) => x.mode !== 'real-provider' || x.fixture_only)
  )
    throw Error('REAL_164_SAMPLE_SOURCE_REQUIRED');
  const reports = {};
  for (const name of ['paired-real.json', 'long-real.json']) {
    const bytes = await readFile(resolve(source, name));
    reports[name] = { sha: sha(bytes), data: JSON.parse(bytes) };
  }
  if (items.some((x) => !reports[x.source_file] || x.source_sha256 !== reports[x.source_file].sha))
    throw Error('SOURCE_PROVENANCE_MISMATCH');
  const rank = (x) => sha('stratified-review-v1:' + x.review_id);
  const ordered = [...items].sort((a, b) => rank(a).localeCompare(rank(b)));
  const mandatory = (x) =>
    x.reply_status === 'fallback' ||
    x.original_candidates.length > 1 ||
    x.validator_violations.length > 0;
  const selected = ordered.filter(mandatory),
    ids = new Set(selected.map((x) => x.review_id));
  if (selected.length > 40) throw Error('MANDATORY_COVERAGE_EXCEEDS_40');
  const add = (x) => {
    if (x && !ids.has(x.review_id) && selected.length < 40) {
      selected.push(x);
      ids.add(x.review_id);
    }
  };
  for (const provider of ['gpt', 'deepseek'])
    for (const path of ['cognitive', 'emotional'])
      for (const file of ['paired-real.json', 'long-real.json'])
        add(
          ordered.find(
            (x) =>
              x.provider_label === provider &&
              x.path === path &&
              x.source_file === file &&
              !mandatory(x),
          ),
        );
  for (const item of [...selected])
    add(
      ordered.find(
        (x) =>
          x.provider_label !== item.provider_label &&
          x.source_file === item.source_file &&
          x.path === item.path &&
          x.case_id === item.case_id &&
          x.round === item.round,
      ),
    );
  for (const item of ordered) add(item);
  const reviewItems = selected.map((x, index) => {
    const prior =
      x.source_file === 'long-real.json'
        ? reports[x.source_file].data.rows
            .filter(
              (r) =>
                r.provider_label === x.provider_label && r.path === x.path && r.round < x.round,
            )
            .slice(-3)
            .map((r) => ({
              round: r.round,
              input: r.input,
              final_presented_text: r.output,
              status: r.status,
            }))
        : [];
    return {
      ...x,
      index: index + 1,
      selection_reason: mandatory(x)
        ? 'mandatory_retry_fallback_or_violation'
        : 'normal_stratum_or_matched_counterpart',
      previous_three_turns: prior,
      context_limitation:
        x.source_file === 'long-real.json'
          ? 'Same held stage; only the existing projected recent history reached the model; not full-path progression.'
          : 'Independent diagnostic case; no conversation history was recorded.',
      scores: { ...Object.fromEntries(dims.map((k) => [k, null])), ...x.scores },
      willing_to_continue: x.willing_to_continue ?? null,
      obvious_scripted_feel: x.obvious_scripted_feel ?? null,
    };
  });
  const count = (key) =>
    reviewItems.reduce((o, x) => {
      o[x[key]] = (o[x[key]] ?? 0) + 1;
      return o;
    }, {});
  const report = {
    version: 'stratified-review-v1',
    mode: 'real-provider-sample-review',
    source_template_sha256: sha(file),
    source_count: 164,
    selected_count: reviewItems.length,
    mandatory_count: items.filter(mandatory).length,
    all_retry_fallback_and_anomaly_rows_included: items
      .filter(mandatory)
      .every((x) => ids.has(x.review_id)),
    dimensions: dims,
    scale: '1–5; null means unreviewed',
    additional_decisions: ['willing_to_continue', 'obvious_scripted_feel'],
    provider_counts: count('provider_label'),
    path_counts: count('path'),
    source_counts: count('source_file'),
    violation_coverage: Object.fromEntries(
      [
        'BELIEF_ANCHOR_MISSING',
        'BELIEF_REPLACEMENT',
        'BACKEND_DISCLOSURE',
        'WRONG_SCENE',
        'EMPTY_REPLY',
        'GENERATOR_FAILURE',
      ].map((v) => [v, reviewItems.filter((x) => x.validator_violations.includes(v)).length]),
    ),
    selection_bias:
      'All anomalies are forced in, making provider counts unequal. Do not compare pooled averages or extrapolate population error rates. Compare matched cases/strata and researcher free experience.',
    human_scored_items: reviewItems.filter((x) => Object.values(x.scores).some((v) => v !== null))
      .length,
    human_average: null,
    model_selection: 'pending_researcher_review',
    mentor_test_ready: false,
    formal_ready: false,
    items: reviewItems,
  };
  return report;
}
export function reviewMarkdown(report) {
  const lines = [
    '# 40条真实模型分层人审包',
    '',
    '先看最终呈现，再结合原候选、校验标记和上下文判断。所有分数/意愿/脚本感由研究者本人填写，不能把兜底当模型原文。',
    '',
    `来源164条，选${report.selected_count}条，全部${report.mandatory_count}条重试/兜底/异常均包含。模型数量不等，勿直接比较总体均分。`,
    '',
    '维度：中文自然清楚、逻辑连贯、指代清楚、不重复、实验一致性、非标准表达理解；每项1–5。愿意继续/明显脚本感：是或否。缺上下文请标“无法判断”，不要猜。',
    '',
  ];
  const quote = (x) =>
    String(x ?? '（没有可用文本，不推测内容）')
      .split('\n')
      .map((s) => '> ' + s)
      .join('\n');
  for (const x of report.items) {
    lines.push(
      `## ${x.index}. ${x.review_id}`,
      '',
      `模型：${x.provider_label}；路径：${x.path}；阶段：${x.stage}；来源：${x.source_file}；理由：${x.selection_reason}`,
      '',
    );
    if (x.previous_three_turns.length)
      for (const t of x.previous_three_turns)
        lines.push(
          `此前第${t.round}轮（${t.status}）`,
          quote(t.input),
          quote(t.final_presented_text),
          '',
        );
    lines.push(
      '当前输入：',
      quote(x.input),
      '',
      '最终呈现（' + x.reply_status + '）：',
      quote(x.final_presented_text),
      '',
    );
    for (const c of x.original_candidates)
      lines.push(`原候选${c.attempt}（${c.status}）：`, quote(c.text), '');
    lines.push(
      '标记：' + (x.validator_violations.join(', ') || '无'),
      '',
      '六项评分：____ / ____ / ____ / ____ / ____ / ____',
      '愿意继续聊：□是 □否 □无法判断；明显机器人/脚本感：□是 □否 □无法判断',
      '问题等级/意见：________________；审核人/时间：________________',
      '',
    );
  }
  return lines.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, out, ...extra] = process.argv.slice(2);
  if (!source || !out || extra.length) throw Error('SOURCE_AND_NEW_OUTPUT_REQUIRED');
  const report = await buildStratifiedReview(source);
  await mkdir(resolve(out));
  await writeFile(resolve(out, 'review.json'), JSON.stringify(report, null, 2) + '\n', {
    flag: 'wx',
  });
  await writeFile(resolve(out, 'review.md'), reviewMarkdown(report), { flag: 'wx' });
  console.log(
    JSON.stringify({
      selected: report.selected_count,
      mandatory: report.mandatory_count,
      provider_counts: report.provider_counts,
      human_scored: report.human_scored_items,
    }),
  );
}
