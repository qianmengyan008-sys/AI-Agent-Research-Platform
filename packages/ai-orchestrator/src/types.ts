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
    readonly scene_state: string;
    readonly scene_phase: string;
    readonly allowed_actions: readonly string[];
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
  /** Backend-only structured facts, never serialized wholesale to the model. */
  readonly experiment: {
    readonly currentStage: string;
    readonly experimentVersion: string;
    readonly stateVersion: number;
    readonly completedEvents: readonly { readonly type: string; readonly count: number }[];
  };
  readonly variables: {
    readonly cognitive: CognitiveVariables | null;
    readonly emotional: {
      readonly persona_snapshot: Scalar | null;
      readonly scene_state: string;
      readonly scene_phase: string;
    } | null;
  };
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
  generate(prompt: PromptBundle, options?: GenerationOptions): Promise<unknown>;
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
  | 'GENERATOR_FAILURE'
  | 'GENERATOR_TIMEOUT'
  | 'GENERATOR_ABORTED'
  | 'CONTROL_INSTRUCTION'
  | 'BACKEND_DISCLOSURE';
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
  readonly attempts: number;
  readonly auditEvents: readonly AuditEvent[];
  readonly auditDelivery: 'returned' | 'delivered' | 'failed';
}

/** Metadata only; no participant input, belief, prompt or provider error. */
export interface AuditEvent {
  readonly path: ExperimentPath;
  readonly stage: string;
  readonly experimentVersion: string;
  readonly stateVersion: number;
  readonly attempt: number;
  readonly outcome: 'rejected' | 'regenerated' | 'fallback' | 'blocked';
  readonly violations: readonly ViolationCode[];
}
export interface GenerationOptions {
  /** Per attempt, 1–60000ms; default 10000ms. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}
export interface OrchestrationOptions extends GenerationOptions {
  /** Total generation attempts, including the first; bounded to 1–3. Default 2. */
  readonly maxAttempts?: number;
  readonly auditSink?: (event: AuditEvent) => void | Promise<void>;
}
