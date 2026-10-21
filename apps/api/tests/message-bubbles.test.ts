import { test, expect } from 'vitest';
import { assistantBubbles, chatMessageGroups } from '../../web/src/message-bubbles.js';
test.each([
  ['A\nB\nC', ['A', 'B', 'C']],
  ['A\nB\nC\nD', ['A', 'B', 'C\nD']],
  ['\nA\n\n \nB\n\nC\n\nD\n', ['A', 'B', 'C\nD']],
  ['A\\nB\\nC\\nD', ['A', 'B', 'C\nD']],
  ['\r\nA\r\nB\r\nC', ['A', 'B', 'C']],
  ['\n  \n', []],
])('assistant paragraph composition preserves content and limits groups: %s', (input, expected) => {
  expect(assistantBubbles(input)).toEqual(expected);
  expect(assistantBubbles(input)).toEqual(assistantBubbles(input));
  expect(assistantBubbles(input).length).toBeLessThanOrEqual(3);
});
test.each([
  '<think>internal prompt</think>',
  'state_token: private',
  'REFRAME_COUNTER_FACT',
  'validator_result: failed',
])('recognizable internal output is not rendered: %s', (input) => {
  const out = assistantBubbles(input).join('');
  expect(out).not.toContain(input);
  expect(out).toContain('请联系研究人员');
});

test('sentence boundaries split without clipping text, even for long paragraphs', () => {
  const text = '第一句完整。第二句完整！第三句完整？第四句也不能丢失。';
  const result = assistantBubbles(text);
  expect(result).toHaveLength(3);
  expect(result.join('\n').replaceAll('\n', '')).toBe(text);
  expect(result[2]).toContain('第四句也不能丢失。');
  const long = '完整长句' + '信息'.repeat(1500) + '。';
  expect(assistantBubbles(long).join('')).toBe(long);
});

test('a wrapped Chinese sentence is never cut into incomplete bubbles', () => {
  const result = assistantBubbles('教育与住房\n资源差异会影响个人处境。\n你怎么看？');
  expect(result).toEqual(['教育与住房\n资源差异会影响个人处境。', '你怎么看？']);
});

test('quoted belief punctuation stays attached to its full question', () => {
  const input = '对于“我原先认为美国黑人都不重视学习。”，媒体机制可能如何影响这个印象？';
  expect(assistantBubbles(input)).toEqual([input]);
});

test('a stage guide and its assistant reply stay in one AI round; structured cards stay separate', () => {
  const base = { created_at: '2026-10-21T00:00:00Z' };
  const source = [
    { ...base, id: 'user', role: 'user' as const, text: '表达', turn_id: 't1' },
    { ...base, id: 'reply', role: 'assistant' as const, text: 'A\nB\nC', turn_id: 't1' },
    { ...base, id: 'guide', role: 'assistant' as const, text: '指导语。', turn_id: null },
    {
      ...base,
      id: 'card',
      role: 'assistant' as const,
      text: '评分已提交',
      turn_id: null,
      card_record: { label: '初次评分已提交', value: 70 },
    },
    { ...base, id: 'next', role: 'assistant' as const, text: '后续指导语。', turn_id: null },
  ];
  const groups = chatMessageGroups(source);
  expect(groups).toHaveLength(4);
  expect(assistantBubbles(groups[1]!.text)).toEqual(['A', 'B', 'C\n指导语。']);
  expect(groups[2]!.card_record?.value).toBe(70);
  expect(source[1]!.text).toBe('A\nB\nC');
  expect(chatMessageGroups(source)).toEqual(groups);
});
