import { mentorConfig, mentorPolicy } from './research-profile.js';
import type { TraceSink } from './trace.js';
import { createInitialState, experimentDefinitions, transition } from '@research/experiment-core';
import type { ExperimentDefinition, Scalar } from '@research/experiment-core';
import { createContext, demoPolicy } from '@research/ai-orchestrator';
import type { StagePolicy } from '@research/ai-orchestrator';
import type { ModelSettings } from '@research/model-adapter';
import type { Repositories } from '../repositories/context.js';
import { UnitOfWork } from '../repositories/context.js';
import { admin, fail, hash, object, text, uuid } from './common.js';
import type { AdminIdentity } from './common.js';
import { researchVariables } from './research-variables.js';
function validatePolicies(definition: ExperimentDefinition, policies: readonly StagePolicy[]) {
  if (!Array.isArray(policies) || policies.some((p) => !p || typeof p !== 'object'))
    fail(400, 'INVALID_STAGE_POLICY');
  let state = createInitialState(definition);
  while (state.lifecycle !== 'completed') {
    const stage = definition.stages.find((s) => s.id === state.stage)!;
    if (state.lifecycle === 'active') {
      const policy = policies.find((p) => p.stage === state.stage);
      if (!policy) fail(400, 'MISSING_STAGE_POLICY');
      try {
        createContext({ state, definition, policy: policy!, userInput: '配置验证合成输入' });
      } catch {
        fail(400, 'INVALID_STAGE_POLICY');
      }
    }
    const data: Record<string, Scalar> = {};
    for (const field of stage.fields)
      data[field.field] =
        field.type === 'confirmation'
          ? true
          : field.type === 'number'
            ? (field.min ?? 0)
            : '配置验证合成观点';
    const next = transition(
      state,
      {
        id: `validate-${state.version}`,
        type: stage.on!,
        experimentVersion: definition.experimentVersion,
        expectedStateVersion: state.version,
      },
      data,
      definition,
    );
    if (!next.ok) fail(400, 'INVALID_DEFINITION');
    state = next.newState;
  }
  if (
    policies.length !== definition.stages.length - 2 ||
    new Set(policies.map((p) => p.stage)).size !== policies.length
  )
    fail(400, 'INVALID_STAGE_POLICY');
}
export class ExperimentService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly settings: ModelSettings,
    private readonly trace: TraceSink = () => {},
  ) {}
  async create(actor: AdminIdentity, input: unknown) {
    admin(actor);
    const v = object(input, ['name', 'instructions', 'research_profile']);
    const name = text(v.name, 200);
    const instructions = text(v.instructions, 10000);
    if (v.research_profile !== undefined && v.research_profile !== mentorConfig.version)
      fail(400, 'UNKNOWN_RESEARCH_PROFILE');
    const configuration = {
      instructions,
      model: this.settings,
      policiesAreDemo: false,
      ...(v.research_profile ? { research_config: structuredClone(mentorConfig) } : {}),
    };
    return this.uow.transaction(async (r) => {
      const created = await r.experiments.create(name, configuration, hash(configuration));
      await r.experiments.audit(
        created.experimentId,
        actor.id,
        'EXPERIMENT_CREATED',
        'Create versioned draft',
      );
      return created;
    });
  }
  async condition(actor: AdminIdentity, experiment: string, input: unknown) {
    admin(actor);
    uuid(experiment);
    const v = object(input, [
      'code',
      'path_version',
      'agent_name',
      'policies',
      'demo_policies',
      'participant_display',
    ]);
    const key = text(v.path_version, 128);
    const definition = experimentDefinitions[key as keyof typeof experimentDefinitions];
    if (!definition) fail(400, 'UNKNOWN_PATH_VERSION');
    let display: { identity: string; avatar?: string } | undefined;
    if (v.participant_display !== undefined) {
      if (definition.path !== 'daily') fail(400, 'DISPLAY_ONLY_FOR_DAILY');
      const d = object(v.participant_display, ['identity', 'avatar']);
      display = { identity: text(d.identity, 300) };
      if (d.avatar !== undefined) {
        const avatar = text(d.avatar, 120);
        if (!/^\/agent-avatars\/[a-z0-9-]+\.svg$/.test(avatar)) fail(400, 'INVALID_AVATAR');
        display.avatar = avatar;
      }
    }
    const template = await this.uow.read((r) => r.experiments.template(experiment));
    const research = template?.configuration.research_config;
    let policies: readonly StagePolicy[];
    if (research) {
      if (v.demo_policies === true || v.policies !== undefined)
        fail(400, 'FROZEN_POLICIES_REQUIRED');
      policies = definition.stages
        .slice(1, -1)
        .map((s) => mentorPolicy(definition, s.id, research));
    } else if (v.demo_policies === true && v.policies === undefined)
      policies = definition.stages.slice(1, -1).map((s) => demoPolicy(definition, s.id));
    else if (Array.isArray(v.policies) && v.demo_policies !== true)
      policies = v.policies as StagePolicy[];
    else fail(400, 'APPROVED_POLICIES_REQUIRED');
    validatePolicies(definition, policies!);
    return this.uow.transaction(async (r) => {
      const t = await r.experiments.template(experiment, true);
      if (!t) fail(404, 'NOT_FOUND');
      if (t!.status !== 'draft') fail(409, 'IMMUTABLE_CONFIGURATION');
      const created = await r.experiments.condition(
        experiment,
        t!.id,
        text(v.code, 80),
        definition,
        createInitialState(definition).definitionSignature,
        text(v.agent_name, 128),
        policies!,
        hash,
        display,
      );
      await r.experiments.audit(
        experiment,
        actor.id,
        'CONDITION_CREATED',
        v.demo_policies === true
          ? 'Engineering demonstration policies'
          : 'Researcher supplied stage policies',
      );
      return created;
    });
  }
  async publish(actor: AdminIdentity, experiment: string) {
    admin(actor);
    uuid(experiment);
    return this.uow.transaction(async (r) => {
      const t = await r.experiments.template(experiment, true);
      if (!t) fail(404, 'NOT_FOUND');
      if (t!.status === 'published') return { published: true };
      const conditions = await r.experiments.conditions(t!.id);
      if (!conditions.length) fail(400, 'NO_CONDITIONS');
      for (const c of conditions) validatePolicies(c.definition, c.policies);
      await r.experiments.publish(t!.id, hash({ configuration: t!.configuration, conditions }));
      await r.experiments.audit(
        experiment,
        actor.id,
        'EXPERIMENT_PUBLISHED',
        'Freeze configuration and condition resources',
      );
      return { published: true };
    });
  }
  async assign(actor: AdminIdentity, input: unknown) {
    admin(actor);
    const v = object(input, ['participant_id', 'condition_id']);
    const participant = uuid(v.participant_id),
      condition = uuid(v.condition_id);
    return this.uow.transaction(async (r) => {
      return assignParticipant(r, actor, participant, condition, this.trace);
    });
  }
}

/** Shared existing assignment initialization; callers supply the transaction. */
export async function assignParticipant(
  r: Repositories,
  actor: AdminIdentity,
  participant: string,
  condition: string,
  trace: TraceSink = () => {},
) {
  const c = await r.experiments.assignmentConfiguration(condition);
  if (!c) fail(404, 'NOT_FOUND');
  if (c!.status !== 'published') fail(409, 'CONFIGURATION_NOT_PUBLISHED');
  const a = await r.participants.assign(
    c!.experiment_id,
    participant,
    c!.template_version_id,
    condition,
    actor.id,
  );
  const initial = createInitialState(c!.definition);
  const session = await r.states.initialize(a.id, c!.experiment_id, initial);
  const start = transition(
    initial,
    {
      id: 'assignment-start',
      type: c!.definition.stages[0]!.on!,
      experimentVersion: c!.definition.experimentVersion,
      expectedStateVersion: 0,
    },
    {},
    c!.definition,
  );
  if (!start.ok) fail(400, 'INVALID_DEFINITION');
  await r.states.save(session, start, actor.id, {}, 'backend', researchVariables(start));
  await r.experiments.audit(
    c!.experiment_id,
    actor.id,
    'PARTICIPANT_ASSIGNED',
    'Initialize via backend start event',
  );
  trace({
    step: 'assignment_initialized',
    participantId: participant,
    sessionId: session,
  });
  return { sessionId: session };
}
