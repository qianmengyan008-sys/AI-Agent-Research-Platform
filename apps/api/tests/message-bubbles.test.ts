import { test, expect } from 'vitest';
import { assistantBubbles } from '../../web/src/message-bubbles.js';
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
