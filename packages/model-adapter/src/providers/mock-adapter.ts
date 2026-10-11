import { runGeneration } from '@research/ai-orchestrator';
import type { GenerationOptions, LanguageGenerator, PromptBundle } from '@research/ai-orchestrator';

export type MockResponder = (prompt: PromptBundle, signal: AbortSignal) => Promise<unknown>;

/** Local injectable adapter. No HTTP, provider credentials, tools or state access. */
export class MockAdapter implements LanguageGenerator {
  constructor(private readonly responder: string | MockResponder) {}
  generate(prompt: PromptBundle, options: GenerationOptions = {}): Promise<unknown> {
    return runGeneration(
      async (signal) =>
        typeof this.responder === 'string' ? this.responder : this.responder(prompt, signal),
      options,
    );
  }
}
