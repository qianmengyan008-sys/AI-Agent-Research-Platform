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
  const paragraphs = normalized.split('\n').filter((line) => line.trim().length > 0);
  return paragraphs.length <= 3
    ? paragraphs
    : [paragraphs[0]!, paragraphs[1]!, paragraphs.slice(2).join('\n')];
}
