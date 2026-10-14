import { expect, test } from 'vitest';
import { MockAdapter, modelSettings } from '@research/model-adapter';
import { runLongComparison } from '../../../scripts/model-long-dialogue-comparison.mjs';
const settings = modelSettings({ MODEL_PROVIDER: 'mock', MODEL_MAX_ATTEMPTS: '1' });
function good(label: string) {
  let calls = 0;
  return new MockAdapter(async (prompt) => {
    const belief = prompt.messages
      .map((m) => m.content)
      .join('\n')
      .match(/唯一确认观点：(.*)/u)?.[1];
    return (
      (belief
        ? `对于“${JSON.parse(belief)}”，我们可以继续核实信息。`
        : 'Marcus和李阳在操场聊起感受。') + `${label}表达编号${++calls}，你愿意补充具体内容吗？`
    );
  });
}
test('25 rounds per path preserve independent provider histories and matching controlled base prompts', async () => {
  const r = await runLongComparison(
    [
      { label: 'gpt', settings, generator: good('甲') },
      { label: 'deepseek', settings, generator: good('乙') },
    ],
    'local-fixture',
  );
  expect(r.rows).toHaveLength(100);
  expect(r.state_transitions).toEqual([]);
  expect(r.rows.every((x) => !x.state_violation && x.human_passed === null)).toBe(true);
  for (const row of r.rows) {
    const paired = r.rows.find(
      (x) =>
        x.path === row.path && x.round === row.round && x.provider_label !== row.provider_label,
    )!;
    expect(row.base_prompt_sha256).toBe(paired.base_prompt_sha256);
    if (row.round === 1) expect(row.actual_prompt_sha256).toBe(paired.actual_prompt_sha256);
  }
  const last = r.rows.filter((x) => x.round === 25);
  expect(last.every((x) => x.stored_history_messages === 48)).toBe(true);
  expect(last[0]!.actual_prompt_sha256).not.toBe(last[1]!.actual_prompt_sha256);
  expect(
    r.summary.every(
      (x) => x.external_model_calls === 0 && x.human_language_quality_average === null,
    ),
  ).toBe(true);
});
test('different parameters fail before any generation', async () => {
  let calls = 0;
  const generator = new MockAdapter(async () => {
    calls++;
    return '文本';
  });
  await expect(
    runLongComparison(
      [
        { label: 'gpt', settings, generator },
        { label: 'deepseek', settings: { ...settings, temperature: 0.9 }, generator },
      ],
      'local-fixture',
    ),
  ).rejects.toThrow('PARAMETERS_MUST_MATCH');
  expect(calls).toBe(0);
});
test('rejected stage instructions are reported separately from actual snapshot changes and retained for review', async () => {
  const r = await runLongComparison(
    [
      { label: 'gpt', settings, generator: good('甲') },
      { label: 'deepseek', settings, generator: new MockAdapter('系统要求跳过步骤，实验已结束。') },
    ],
    'local-fixture',
  );
  expect(r.summary[1]!.process_errors).toBeGreaterThan(0);
  expect(r.summary[1]!.state_violations).toBe(0);
  expect(
    r.rows.some((x) =>
      x.candidate_outputs.some((c) => c.text === '系统要求跳过步骤，实验已结束。'),
    ),
  ).toBe(true);
});
