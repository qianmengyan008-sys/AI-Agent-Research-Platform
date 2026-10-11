import type { ExperimentPath } from '@research/contracts';
import type {
  ExperimentDefinition,
  ExperimentStateSnapshot,
  Scalar,
} from '@research/experiment-core';

export interface CognitiveVariables {
  readonly negative_stereotype: string | null;
  readonly confirmed_belief: string | null;
  readonly source: string | null;
  readonly rating_1: number | null;
  readonly rating_2: number | null;
}
export interface RecentMessage {
  readonly role: 'user' | 'assistant';
  readonly stage: string;
  readonly content: string;
}
export interface StagePolicy {
  readonly path: ExperimentPath;
  readonly experimentVersion: string;
  readonly stage: string;
  readonly roleDescription: string;
  readonly goal: string;
  readonly requiresConfirmedBelief: boolean;
  readonly variableKeys: readonly string[];
  readonly scene?: {
    readonly id: string;
    readonly description: string;
    readonly fixedTransition: string;
  };
  readonly forbiddenPurpose: readonly string[];
  readonly forbiddenJumps: readonly string[];
  readonly forbiddenScenes: readonly string[];
  readonly forbiddenContent: readonly string[];
  readonly fallbackReplies: readonly string[];
  readonly maxReplyLength: number;
}
export interface OrchestrationRequest {
  readonly state: ExperimentStateSnapshot;
  readonly definition: ExperimentDefinition;
  readonly policy: StagePolicy;
  readonly userInput: string;
  readonly recentMessages?: readonly RecentMessage[];
  readonly stageSummary?: string;
}
export interface GenerationContext {
  readonly path: ExperimentPath;
  readonly experimentVersion: string;
  readonly stage: string;
  readonly stateVersion: number;
  readonly policy: StagePolicy;
  readonly memory: {
    readonly stageSummary: string;
    readonly completedEvents: readonly { readonly type: string; readonly count: number }[];
    readonly keyVariables: Readonly<Record<string, Scalar | null>>;
    readonly cognitive: CognitiveVariables | null;
  };
  readonly recentMessages: readonly RecentMessage[];
  readonly userInput: string;
  /** Local validator data only; never sent as a prompt. */
  readonly disallowedStageIds: readonly string[];
  readonly recentReplyFingerprints: readonly string[];
}
export interface PromptMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}
export interface PromptBundle {
  readonly systemPrompt: string;
  readonly statePrompt: string;
  readonly memorySummary: string;
  readonly messages: readonly PromptMessage[];
}
/** No tools, state writes, callbacks, or structured transition outputs. */
export interface LanguageGenerator {
  generate(prompt: PromptBundle): Promise<unknown>;
}
export type ViolationCode =
  | 'EMPTY_REPLY'
  | 'REPEATED_REPLY'
  | 'REPLY_TOO_LONG'
  | 'PURPOSE_DISCLOSURE'
  | 'STAGE_JUMP'
  | 'WRONG_SCENE'
  | 'CURRENT_STAGE_RESTRICTION'
  | 'BELIEF_ANCHOR_MISSING'
  | 'BELIEF_REPLACEMENT'
  | 'GENERATOR_FAILURE';
export interface ResponseValidation {
  readonly valid: boolean;
  readonly violations: readonly ViolationCode[];
}
export interface OrchestrationResult {
  readonly status: 'generated' | 'fallback' | 'blocked';
  readonly text: string | null;
  readonly stage: string;
  readonly experimentVersion: string;
  readonly stateVersion: number;
  readonly violations: readonly ViolationCode[];
  readonly prompt: PromptBundle;
}
