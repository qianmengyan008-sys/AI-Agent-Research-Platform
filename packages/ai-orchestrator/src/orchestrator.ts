import { createContext } from './context-manager.js';
import { buildPrompt } from './prompt-builder.js';
import { validateResponse } from './response-validator.js';
import { fallbackReply } from './fallback-handler.js';
import { freeze } from './immutable.js';
import type {
  LanguageGenerator,
  OrchestrationRequest,
  OrchestrationResult,
  ResponseValidation,
} from './types.js';

export async function orchestrate(
  request: OrchestrationRequest,
  generator: LanguageGenerator,
): Promise<OrchestrationResult> {
  const context = createContext(request);
  const prompt = buildPrompt(context);
  let reply: unknown;
  let validation: ResponseValidation;
  try {
    reply = await generator.generate(prompt);
    validation = validateResponse(reply, context);
  } catch {
    validation = { valid: false, violations: ['GENERATOR_FAILURE'] };
  }
  const text = validation.valid ? (reply as string) : fallbackReply(context);
  return freeze({
    status: validation.valid ? 'generated' : text === null ? 'blocked' : 'fallback',
    text,
    stage: context.stage,
    experimentVersion: context.experimentVersion,
    stateVersion: context.stateVersion,
    violations: validation.violations,
    prompt,
  });
}

/** Fixed local text only: no vendor, HTTP client, credentials or network. */
export class FixedTextGenerator implements LanguageGenerator {
  constructor(private readonly reply: string) {}
  async generate(): Promise<string> {
    return this.reply;
  }
}
