import { expect, test } from 'vitest';
import {
  boundedBubbles,
  validGeneratedReply,
  hanCount,
  dailyTemporaryOpening,
  emotionalGuide,
} from '@research/contracts';
test('daily has one intact bubble and a 30-Han boundary; cognitive formatter is independent', () => {
  const text = '字'.repeat(30);
  expect(boundedBubbles(text, 'daily')).toEqual([text]);
  expect(boundedBubbles(text + '字', 'daily')).toBeNull();
  expect(validGeneratedReply('你喜欢音乐吗？最近听什么？', 'daily')).toBe(false);
  expect(validGeneratedReply('我觉得音乐能让生活更有趣。', 'daily')).toBe(true);
  expect(boundedBubbles(dailyTemporaryOpening, 'daily')).toEqual([dailyTemporaryOpening]);
});
test('emotional semantic bubbles never clip quotes, preserve fixed guide, and require one last attributed question', () => {
  const guide = boundedBubbles(emotionalGuide, 'emotional')!;
  expect(guide.join('')).toBe(emotionalGuide);
  expect(guide.every((x) => hanCount(x) < 30)).toBe(true);
  expect(validGeneratedReply('Marcus说：“这里真新鲜。”李阳会怎么回应？', 'emotional')).toBe(true);
  expect(validGeneratedReply('他觉得很好。你怎么看？', 'emotional')).toBe(false);
  expect(validGeneratedReply('Marcus怎么想？李阳点点头。', 'emotional')).toBe(false);
  expect(validGeneratedReply('Marcus怎么想？李阳怎么想？', 'emotional')).toBe(false);
  expect(boundedBubbles('Marcus说：“' + '字'.repeat(40) + '。”', 'emotional')).toBeNull();
  expect(validGeneratedReply('这是Marcus的想法吗？', 'emotional')).toBe(true);
});
