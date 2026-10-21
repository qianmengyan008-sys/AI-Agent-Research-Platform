import type { ParticipantMessage } from '@research/contracts';
/** Presentation only: invoked on the final persisted assistant text, never on cards or events. */
export function assistantBubbles(text: string): string[] {
  const normalized = text.replace(/\\r\\n|\\n|\\r/g, '\n').replace(/\r\n?/g, '\n');
  // Fail closed on recognizable protocol/internal output; never execute or echo it.
  if (
    /<\/?(?:think|analysis|system|prompt)>|\b(?:state_token|validator_result|system_prompt|REFRAME_[A-Z_]+|STEREOTYPE_CAPTURE|VIEWPOINT_CONFIRMATION|INITIAL_RATING|SECOND_RATING|ENDING_FEEDBACK)\b/i.test(
      normalized,
    )
  )
    return ['这条回复暂时无法显示，请联系研究人员。'];
  let paragraphs = normalized.split('\n').filter((line) => line.trim().length > 0);
  const joined: string[] = [];
  for (const paragraph of paragraphs) {
    const previous = joined.at(-1);
    // A wrapped Chinese sentence is one semantic unit, not two dialogue bubbles.
    if (
      previous &&
      /[\u3400-\u9fff]/u.test(previous) &&
      /^[\u3400-\u9fff]/u.test(paragraph.trim()) &&
      !/[。！？!?…：:；;][”’"』」]?$/u.test(previous.trim())
    )
      joined[joined.length - 1] = previous + '\n' + paragraph;
    else joined.push(paragraph);
  }
  paragraphs = joined;
  if (paragraphs.length === 1) {
    const sentences = [
      ...new Intl.Segmenter('zh', { granularity: 'sentence' }).segment(paragraphs[0]!),
    ].map((s) => s.segment);
    if (sentences && sentences.length > 1) paragraphs = sentences;
  }
  return paragraphs.length <= 3
    ? paragraphs
    : [paragraphs[0]!, paragraphs[1]!, paragraphs.slice(2).join('\n')];
}

/** A persisted stage guide after a reply belongs to that same visual AI round. Cards remain components. */
export function chatMessageGroups(messages: readonly ParticipantMessage[]): ParticipantMessage[] {
  const groups: ParticipantMessage[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (
      message.role === 'assistant' &&
      !message.card_record &&
      previous?.role === 'assistant' &&
      previous.turn_id &&
      !previous.card_record &&
      !message.turn_id
    )
      groups[groups.length - 1] = { ...previous, text: previous.text + '\n' + message.text };
    else groups.push({ ...message });
  }
  return groups;
}
