import { advanceChat, stageNotice } from './chat-flow.js';
import { createContext, validateResponse } from '@research/ai-orchestrator';
import { transition } from '@research/experiment-core';
import { inputKind, limits, turnStages, storyStages } from './research-profile.js';
import { researchVariables } from './research-variables.js';
import type { TraceSink } from './trace.js';
import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../repositories/context.js';
import type { Repositories } from '../repositories/context.js';
import type { Turn } from '../repositories/conversation-repository.js';
import { fail, hash, object, text, uuid } from './common.js';
import type { ParticipantIdentity } from './common.js';
import { recover } from './recovery.js';
import { ModelRunService } from './model-run-service.js';
async function publicTurn(r: Repositories, t: Turn) {
  const reply = await r.conversations.reply(t.id);
  return {
    turn_id: t.id,
    status: t.status,
    text: t.status === 'ready' ? (reply?.content ?? null) : null,
  };
}
export class ConversationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly model: ModelRunService,
    private readonly trace: TraceSink = () => {},
  ) {}
  async send(actor: ParticipantIdentity, input: unknown) {
    const v = object(input, ['text', 'request_id', 'state_token', 'interaction']);
    if (v.interaction !== undefined && v.interaction !== 'chat') fail(400, 'INVALID_INPUT');
    const content = text(v.text, 4000),
      request = text(v.request_id, 128),
      token = uuid(v.state_token);
    const checksum = hash(v);
    const prepared = await this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_ASSIGNED');
      await recover(r, b!.session_id);
      this.trace({
        step: 'conversation_state_loaded',
        participantId: actor.participantId,
        sessionId: b!.session_id,
      });
      const prior = await r.conversations.find(b!.session_id, request);
      if (prior) {
        if (prior.request_hash !== checksum) fail(409, 'IDEMPOTENCY_CONFLICT');
        return { existing: await publicTurn(r, prior) };
      }
      if (b!.status !== 'open') fail(409, 'EXPERIMENT_FINISHED');
      if (b!.state_token !== token) fail(409, 'STATE_CONFLICT');
      if (await r.states.pending(b!.session_id)) fail(409, 'GENERATION_PENDING');
      const chat = v.interaction === 'chat';
      if (chat && !(await r.conversations.chatStarted(b!.session_id)))
        fail(409, 'CHAT_NOT_STARTED');
      const research = b!.configuration.research_config;
      let fixedReply: string | null = null;
      let kind: ReturnType<typeof inputKind> = 'answer';
      let autoAdvance = false;
      let sceneBridge: string | null = null;
      if (research && b!.snapshot.path !== 'daily') {
        kind =
          chat &&
          ['STEREOTYPE_CAPTURE', 'PERSONA_SETUP'].includes(b!.snapshot.stage) &&
          /^(?:可以|方便|好|好的|准备好了|可以开始|嗯可以)[。！!\s]*$/u.test(content)
            ? 'meta'
            : inputKind(content);
        if (
          b!.snapshot.path === 'emotional' &&
          kind === 'answer' &&
          research.emotional.scenes[b!.snapshot.stage]
        ) {
          const local = await r.conversations.turnCounts(b!.session_id, [b!.snapshot.stage]);
          if (local.effective === 0)
            sceneBridge = research.emotional.scenes[b!.snapshot.stage]!.bridge;
        }
        const count = await r.conversations.turnCounts(b!.session_id, turnStages(b!));
        const cap = limits(b!).max;
        const localCounts = await r.conversations.turnCounts(b!.session_id, [b!.snapshot.stage]);
        const reserve =
          b!.snapshot.path === 'emotional' && storyStages.includes(b!.snapshot.stage)
            ? storyStages.length - 1 - storyStages.indexOf(b!.snapshot.stage)
            : 0;
        if (count.effective >= cap - reserve) fail(409, 'MAXIMUM_TURNS_REACHED');
        // Bound repeated failed/off-topic/meta attempts as well as effective turns.
        if (count.attempts >= cap + 2) fail(409, 'RESEARCHER_REQUIRED');
        if (kind === 'meta')
          fixedReply =
            '页面上的填写项用于保存你的回答。这类流程询问不会作为故事内容，也不会改变已确认的观点。';
        else if (kind === 'mistype')
          fixedReply = '已收到误输入说明。你可以重新表达，这条说明不会作为故事内容。';
        else if (kind === 'offtopic') {
          fixedReply =
            localCounts.invalidStreak >= 1
              ? b!.snapshot.path === 'emotional'
                ? '先保留已经明确的人物和情节，继续这段交流。'
                : research.cognitive.neutral_summary
              : b!.snapshot.path === 'emotional'
                ? '我们先回到Marcus与李阳在当前场景中的交流。'
                : research.cognitive.correction;
          autoAdvance = localCounts.invalidStreak >= 1;
        } else {
          if (
            b!.snapshot.path === 'cognitive' &&
            ['INITIAL_RATING', 'SECOND_RATING'].includes(b!.snapshot.stage)
          )
            fixedReply =
              count.effective === 0
                ? research.rating.instruction
                : count.effective === 1
                  ? '评分对象仍然不变，你可以在评分卡中填写数字。'
                  : '已保留你刚才的补充，评分卡等待你输入0到100之间的整数。';
          if (b!.snapshot.stage === 'PERSONA_SETUP' && count.effective === 0)
            fixedReply =
              research.emotional.opening +
              ' Marcus是一名刚来到中国留学的美国黑人青年，李阳是一名中国大学生。你可以补充外貌、兴趣和性格。';
          if (b!.snapshot.stage === 'ENDING_FEEDBACK') fixedReply = research.emotional.ending;
          autoAdvance = count.effective + 1 >= cap - reserve;
        }
        if (
          [
            'STEREOTYPE_CAPTURE',
            'VIEWPOINT_CONFIRMATION',
            'INITIAL_RATING',
            'SECOND_RATING',
          ].includes(b!.snapshot.stage)
        )
          autoAdvance = false;
        // Persona needs explicit optional-trait submission; fixed identities are never inferred.
        if (b!.snapshot.stage === 'PERSONA_SETUP' && kind !== 'offtopic') autoAdvance = false;
        if (
          b!.snapshot.path === 'cognitive' &&
          b!.snapshot.variables.confirmed_viewpoint &&
          fixedReply
        )
          fixedReply =
            '对于“' + String(b!.snapshot.variables.confirmed_viewpoint) + '”，' + fixedReply;
      }
      if (chat) {
        sceneBridge = null; // the persisted stage-entry notice already contains the approved bridge
        if (b!.snapshot.stage === 'PERSONA_SETUP' && kind === 'answer') fixedReply = null;
        if (b!.snapshot.stage === 'ENDING_FEEDBACK') fixedReply = '谢谢你的反馈。';
        if (kind === 'meta')
          fixedReply =
            b!.snapshot.path === 'emotional'
              ? (research?.emotional.opening ?? b!.configuration.instructions)
              : (b!.policies[b!.snapshot.stage]?.fallbackReplies[0]?.replaceAll(
                  '{{confirmed_belief}}',
                  String(b!.snapshot.variables.confirmed_viewpoint ?? ''),
                ) ?? '请在对话中表达你的看法。');
      }
      const policy = b!.policies[b!.snapshot.stage];
      const promptId = b!.prompt_ids[b!.snapshot.stage];
      if (!policy || !promptId) fail(409, 'MISSING_STAGE_POLICY');
      const context = {
        experiment: b!.experiment_id,
        promptId: promptId!,
        promptVersion: `stage-language-v3-${hash(policy)}${chat ? '-complete-sentences-v1' : ''}`,
        model: b!.configuration.model,
        stage: b!.snapshot.stage,
        input_kind: kind,
        reply_source: fixedReply ? 'template' : 'model',
      };
      const recent = await r.conversations.recent(
        b!.session_id,
        b!.snapshot.version,
        b!.snapshot.stage,
      );
      const turn = await r.conversations.create(
        b!.session_id,
        request,
        checksum,
        b!.snapshot.version,
        b!.chat_revision + 1,
        content,
        randomUUID(),
        context.model.timeout_ms * context.model.max_attempts + 30000,
        context,
      );
      return {
        bundle: b!,
        turn,
        policy: policy!,
        recent,
        context,
        fixedReply,
        autoAdvance: chat ? false : autoAdvance,
        chat,
        kind,
        sceneBridge,
      };
    });
    if ('existing' in prepared) {
      this.trace({
        step: 'message_replayed',
        participantId: actor.participantId,
        turnId: prepared.existing?.turn_id,
      });
      return prepared.existing;
    }
    const {
      bundle,
      turn,
      policy,
      recent,
      context,
      fixedReply,
      autoAdvance,
      chat,
      kind,
      sceneBridge,
    } = prepared;
    this.trace({
      step: 'user_message_committed',
      participantId: actor.participantId,
      sessionId: bundle.session_id,
      turnId: turn.id,
    });
    const started = performance.now();
    let result: Awaited<ReturnType<ModelRunService['generate']>> | null = null;
    let error: string | null = null;
    try {
      const generator = fixedReply
        ? new ModelRunService({ generate: async () => fixedReply }, context.model, this.trace)
        : this.model;
      result = await generator.generate(
        {
          state: bundle.snapshot,
          definition: bundle.definition,
          policy,
          userInput: content,
          recentMessages: recent,
        },
        context.model,
        { participantId: actor.participantId, sessionId: bundle.session_id, turnId: turn.id },
        chat,
      );
    } catch {
      error = 'MODEL_GENERATION_FAILED';
      this.trace({ step: 'model_generation_failed', turnId: turn.id });
    }
    if (sceneBridge && result?.text) {
      const candidate = sceneBridge + '\n' + result.text;
      const validated = validateResponse(
        candidate,
        createContext({
          state: bundle.snapshot,
          definition: bundle.definition,
          policy,
          userInput: content,
          recentMessages: recent,
        }),
      );
      result = validated.valid
        ? { ...result, text: candidate }
        : {
            ...result,
            status: 'blocked',
            text: null,
            violations: [...result.violations, ...validated.violations],
          };
    }
    const latency = performance.now() - started;
    const response = await this.uow.transaction(async (r) => {
      const current = await r.states.load(actor.participantId, true);
      if (current) await recover(r, current.session_id);
      const saved = await r.conversations.turn(actor.participantId, turn.id);
      const stale =
        !current ||
        !saved ||
        saved.status !== 'generating' ||
        saved.lease_token !== turn.lease_token ||
        current.status !== 'open' ||
        current.snapshot.version !== turn.accepted_core_version ||
        current.chat_revision !== turn.chat_revision;
      const generationFailure =
        !result ||
        (result.status !== 'generated' &&
          result.violations.some((v) =>
            ['GENERATOR_FAILURE', 'GENERATOR_TIMEOUT', 'GENERATOR_ABORTED'].includes(v),
          ));
      const failed = generationFailure || result?.status === 'blocked';
      if (generationFailure) error = 'MODEL_GENERATION_FAILED';
      const status = stale ? 'stale' : failed ? 'failed' : 'ready';
      if (!stale)
        await r.conversations.replySource(
          turn.id,
          status !== 'ready'
            ? 'none'
            : result?.status === 'fallback'
              ? 'fallback'
              : context.reply_source,
        );
      // A stale worker never overwrites a result or an expired lease's state.
      if (!stale || saved?.status === 'generating')
        await r.conversations.finish(turn.id, status === 'ready' ? result!.text : null, status);
      await r.conversations.log(
        turn,
        context.experiment,
        context.promptId,
        context.promptVersion,
        context.model,
        result,
        latency,
        stale
          ? 'stale'
          : failed
            ? result?.status === 'blocked'
              ? 'blocked'
              : 'failed'
            : result!.status,
        error,
      );
      if (status === 'ready' && autoAdvance && current) {
        const stage = current.definition.stages.find((s) => s.id === current.snapshot.stage)!;
        const response =
          kind === 'offtopic' ? '未获得有效信息（后端中性总结，不代表参与者观点）' : content;
        const data = { response };
        const moved = transition(
          current.snapshot,
          {
            id: `backend-turn-${turn.id}`,
            type: stage.on!,
            experimentVersion: current.snapshot.experimentVersion,
            expectedStateVersion: current.snapshot.version,
          },
          data,
          current.definition,
        );
        if (!moved.ok) fail(409, 'INVALID_AUTOMATIC_TRANSITION');
        await r.states.save(
          current.session_id,
          moved,
          'research-profile',
          {
            ...data,
            source_turn_id: turn.id,
            reason: kind === 'offtopic' ? 'two_uninformative_turns' : 'maximum_turns_completed',
            missing_data: kind === 'offtopic',
          },
          'backend',
          researchVariables(moved, undefined, current.configuration.research_config),
        );
      }
      if (status === 'ready' && chat && current && kind === 'answer') {
        await advanceChat(r, current, turn.id, actor.participantId, content);
        await stageNotice(r, (await r.states.load(actor.participantId))!);
      }
      return publicTurn(r, {
        ...turn,
        status: stale && saved?.status !== 'generating' ? (saved?.status ?? 'stale') : status,
      });
    });
    this.trace({
      step: 'assistant_and_model_log_committed',
      participantId: actor.participantId,
      sessionId: bundle.session_id,
      turnId: turn.id,
      outcome: response.status,
    });
    this.trace({ step: 'conversation_returned_without_state_transition', turnId: turn.id });
    return response;
  }
  async status(actor: ParticipantIdentity, id: string) {
    uuid(id);
    return this.uow.transaction(async (r) => {
      const b = await r.states.load(actor.participantId, true);
      if (!b) fail(404, 'NOT_FOUND');
      await recover(r, b!.session_id);
      const t = await r.conversations.turn(actor.participantId, id);
      if (!t) fail(404, 'NOT_FOUND');
      return publicTurn(r, t!);
    });
  }
  async messages(actor: ParticipantIdentity) {
    return this.uow.read((r) => r.conversations.timeline(actor.participantId));
  }
}
