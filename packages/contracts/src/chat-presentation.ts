export const dailyIdentities = {
  DAILY_US_BLACK_MALE: { name: 'Jamal', identity: '美国黑人男性' },
  DAILY_US_BLACK_FEMALE: { name: 'Lakisha', identity: '美国黑人女性' },
  DAILY_CHINESE_MALE: { name: '王涛', identity: '中国男性' },
  DAILY_CHINESE_FEMALE: { name: '王静', identity: '中国女性' },
} as const;
export const dailyTemporaryOpening =
  '嗨！今天过得怎么样？最近有什么学习、生活或兴趣上的事想聊聊吗？';
export const emotionalGuide =
  'Marcus是一名刚来到中国留学的美国黑人青年。你可以补充他的外貌、兴趣和性格。';
export const hanCount = (text: string) => (text.match(/\p{Script=Han}/gu) ?? []).length;
export const questionCount = (text: string) => (text.match(/[？?]+/gu) ?? []).length;
/** Never clips. Null means regeneration or an explicit failure, not partial display. */
export function boundedBubbles(text: string, path: 'daily' | 'emotional'): string[] | null {
  if (!text.trim() || Array.from(text).length > 400) return null;
  if (path === 'daily')
    return hanCount(text) <= 30 && Array.from(text).length <= 120 ? [text] : null;
  const sentences = [
    ...new Intl.Segmenter('zh', { granularity: 'sentence' }).segment(text.replace(/\\n/g, '\n')),
  ].map((x) => x.segment);
  const units: string[] = [];
  for (const sentence of sentences) {
    if (hanCount(sentence) < 30) {
      units.push(sentence);
      continue;
    }
    let part = '',
      quoted = 0;
    for (const ch of sentence) {
      part += ch;
      if ('“「『'.includes(ch)) quoted++;
      if ('”」』'.includes(ch)) quoted = Math.max(0, quoted - 1);
      if (!quoted && '，；\n'.includes(ch)) {
        units.push(part);
        part = '';
      }
    }
    if (part) units.push(part);
  }
  const result: string[] = [];
  for (const unit of units) {
    if (!unit.trim()) continue;
    if (hanCount(unit) >= 30) return null;
    const last = result.at(-1);
    if (last && hanCount(last + unit) < 30) result[result.length - 1] = last + unit;
    else result.push(unit);
  }
  return result.length > 0 && result.length <= 3 ? result : null;
}
export function validGeneratedReply(
  text: string,
  path: 'daily' | 'emotional',
  maxBubbles = 3,
): boolean {
  const bubbles = boundedBubbles(text, path);
  if (!bubbles || bubbles.length > maxBubbles || questionCount(text) > 1) return false;
  if (path === 'daily')
    return !/(?:听起来你|你的感受|我能理解你的情绪|感谢你的分享|你真的很棒)/u.test(text);
  return (
    bubbles.every((b) => /Marcus|李阳/u.test(b)) &&
    questionCount(bubbles.at(-1)!) === 1 &&
    /[？?][”」』]?\s*$/u.test(bubbles.at(-1)!)
  );
}
