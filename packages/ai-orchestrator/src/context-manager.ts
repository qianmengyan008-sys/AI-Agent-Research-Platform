import { createInitialState } from '@research/experiment-core';
import type { Scalar } from '@research/experiment-core';
import { freeze } from './immutable.js';
import { normalizedReply } from './response-validator.js';
import type {
  CognitiveVariables,
  GenerationContext,
  OrchestrationRequest,
  StagePolicy,
} from './types.js';

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const list = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every(isText);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function checkPolicy(policy: StagePolicy): void {
  if (
    !record(policy) ||
    !isText(policy.roleDescription) ||
    !isText(policy.goal) ||
    policy.roleDescription.length > 1000 ||
    policy.goal.length > 1000 ||
    typeof policy.requiresConfirmedBelief !== 'boolean' ||
    !Array.isArray(policy.variableKeys) ||
    !policy.variableKeys.every(isText) ||
    policy.variableKeys.length > 10 ||
    !list(policy.forbiddenPurpose) ||
    !list(policy.forbiddenJumps) ||
    !list(policy.forbiddenScenes) ||
    !list(policy.forbiddenContent) ||
    !list(policy.fallbackReplies) ||
    policy.fallbackReplies.length < 2 ||
    !Number.isSafeInteger(policy.maxReplyLength) ||
    policy.maxReplyLength < 1 ||
    policy.maxReplyLength > 10000
  )
    throw new Error('Invalid stage policy');
  if (
    policy.scene &&
    (!isText(policy.scene.id) ||
      !isText(policy.scene.description) ||
      !isText(policy.scene.fixedTransition) ||
      !isText(policy.scene.scene_state) ||
      !isText(policy.scene.scene_phase) ||
      !list(policy.scene.allowed_actions) ||
      policy.scene.allowed_actions.length === 0 ||
      policy.scene.allowed_actions.length > 10 ||
      [
        policy.scene.id,
        policy.scene.description,
        policy.scene.fixedTransition,
        policy.scene.scene_state,
        policy.scene.scene_phase,
        ...policy.scene.allowed_actions,
      ].some((value) => value.length > 1000))
  )
    throw new Error('Invalid scene');
}

function readAlias(
  variables: Readonly<Record<string, Scalar>>,
  canonical: string,
  legacy?: string,
): Scalar | null {
  const primary = variables[canonical];
  const previous = legacy ? variables[legacy] : undefined;
  if (primary !== undefined && previous !== undefined && primary !== previous)
    throw new Error(`Conflicting variable aliases: ${canonical}`);
  return primary ?? previous ?? null;
}
function textValue(value: Scalar | null): string | null {
  if (value === null) return null;
  if (!isText(value) || value.length > 10000) throw new Error('Invalid cognitive text variable');
  return value;
}
function ratingValue(value: Scalar | null): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('Invalid cognitive rating');
  return value;
}
export function cognitiveVariables(
  variables: Readonly<Record<string, Scalar>>,
): CognitiveVariables {
  return freeze({
    negative_stereotype: textValue(readAlias(variables, 'negative_stereotype', 'stereotype_text')),
    confirmed_belief: textValue(readAlias(variables, 'confirmed_belief', 'confirmed_viewpoint')),
    source: textValue(readAlias(variables, 'source')),
    rating_1: ratingValue(readAlias(variables, 'rating_1', 'initial_rating')),
    rating_2: ratingValue(readAlias(variables, 'rating_2', 'second_rating')),
  });
}

/** Reads trusted backend facts; does not run a transition or persist anything. */
export function createContext(request: OrchestrationRequest): GenerationContext {
  const { state, definition, policy } = request;
  const initial = createInitialState(definition);
  checkPolicy(policy);
  if (
    state.path !== definition.path ||
    state.experimentVersion !== definition.experimentVersion ||
    state.definitionSignature !== initial.definitionSignature ||
    !Number.isSafeInteger(state.version) ||
    state.version < 1 ||
    state.version >= definition.stages.length - 1 ||
    definition.stages[state.version]?.id !== state.stage ||
    state.lifecycle !== 'active' ||
    !record(state.variables) ||
    !Array.isArray(state.receipts) ||
    state.receipts.length !== state.version
  )
    throw new Error('Invalid or inactive state snapshot');
  if (
    policy.path !== state.path ||
    policy.experimentVersion !== state.experimentVersion ||
    policy.stage !== state.stage
  )
    throw new Error('Policy does not match the current stage/version');
  if (!isText(request.userInput) || request.userInput.length > 4000)
    throw new Error('User input must contain 1–4000 characters');
  if (state.path === 'emotional' && !policy.scene)
    throw new Error('Emotional stage requires a fixed current scene');
  const cognitive = state.path === 'cognitive' ? cognitiveVariables(state.variables) : null;
  if (
    state.path === 'cognitive' &&
    state.stage.startsWith('REFRAME_') &&
    !policy.requiresConfirmedBelief
  ) {
    throw new Error('Reframing policy must require the confirmed belief');
  }
  if (
    (policy.requiresConfirmedBelief ||
      (state.path === 'cognitive' && state.stage.startsWith('REFRAME_'))) &&
    (!cognitive?.confirmed_belief || state.variables.viewpoint_confirmed !== true)
  )
    throw new Error('Cognitive reframing requires an explicitly confirmed belief');
  const disallowedStageIds = definition.stages
    .filter((stage) => stage.id !== state.stage)
    .map((stage) => stage.id);
  const summary = request.stageSummary ?? `当前任务：${policy.goal}`;
  if (
    !isText(summary) ||
    summary.length > 1000 ||
    disallowedStageIds.some((id) => summary.includes(id)) ||
    [...policy.forbiddenPurpose, ...policy.forbiddenJumps, ...policy.forbiddenScenes].some(
      (phrase) => normalizedReply(summary).includes(normalizedReply(phrase)),
    )
  )
    throw new Error('Summary must be bounded and describe only the current stage');
  const recent = request.recentMessages ?? [];
  if (
    !Array.isArray(recent) ||
    recent.some(
      (message) =>
        !record(message) ||
        typeof message.role !== 'string' ||
        !['user', 'assistant'].includes(message.role) ||
        !isText(message.stage) ||
        typeof message.content !== 'string' ||
        message.content.length > 10000,
    )
  )
    throw new Error('Invalid recent conversation');
  const selectedMessages = recent.filter((message) => message.stage === state.stage).slice(-6);
  const recentReplyFingerprints = selectedMessages
    .filter((message) => message.role === 'assistant')
    .map((message) => normalizedReply(message.content));
  const recentMessages = selectedMessages.map((message) => ({
    role: message.role,
    stage: message.stage,
    content: message.content.slice(0, 800),
  }));
  const eventCounts = new Map<string, number>();
  for (const [i, receipt] of state.receipts.entries()) {
    if (
      !receipt ||
      receipt.experimentVersion !== state.experimentVersion ||
      receipt.type !== definition.stages[i]?.on ||
      receipt.expectedStateVersion !== i
    )
      throw new Error('Inconsistent event memory');
    eventCounts.set(receipt.type, (eventCounts.get(receipt.type) ?? 0) + 1);
  }
  const keyVariables: Record<string, Scalar | null> = {};
  for (const key of policy.variableKeys) {
    if (state.path === 'cognitive')
      throw new Error(
        'Cognitive variables are exposed only through the protected belief projection',
      );
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new Error('Unsafe variable key');
    const value = state.variables[key];
    if (
      value !== undefined &&
      (typeof value === 'object' ||
        typeof value === 'function' ||
        typeof value === 'symbol' ||
        (typeof value === 'number' && !Number.isFinite(value)) ||
        (typeof value === 'string' && value.length > 10000))
    )
      throw new Error('Invalid key variable');
    keyVariables[key] = value ?? null;
  }
  return freeze({
    path: state.path,
    experimentVersion: state.experimentVersion,
    stage: state.stage,
    stateVersion: state.version,
    policy: structuredClone(policy),
    memory: {
      stageSummary: summary,
      completedEvents: [...eventCounts].map(([type, count]) => ({ type, count })),
      keyVariables,
      cognitive,
    },
    recentMessages,
    userInput: request.userInput,
    disallowedStageIds,
    recentReplyFingerprints,
  });
}
