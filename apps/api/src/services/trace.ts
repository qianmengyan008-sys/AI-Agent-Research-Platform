/** Backend-only operation markers. Never include tokens, input text, prompts or variables. */
export interface BusinessTrace {
  step: string;
  participantId?: string;
  sessionId?: string;
  turnId?: string;
  operationId?: string;
  outcome?: string;
}
export type TraceSink = (entry: BusinessTrace) => void;
export function safeTrace(sink?: TraceSink): TraceSink {
  return (entry) => {
    try {
      sink?.(entry);
    } catch {
      // Diagnostic sink failure cannot undo a committed research operation.
    }
  };
}
