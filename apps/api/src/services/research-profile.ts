import { readFileSync } from 'node:fs';
import { demoPolicy } from '@research/ai-orchestrator';
import type { StagePolicy } from '@research/ai-orchestrator';
import type { ExperimentDefinition } from '@research/experiment-core';
import type { Bundle } from '../repositories/state-repository.js';
import { fail } from './common.js';

export interface ResearchConfig {
  version: string;
  purpose: string;
  rating: {
    min: number;
    max: number;
    step: number;
    low_anchor: string;
    high_anchor: string;
    instruction: string;
  };
  cognitive: {
    turns: Record<string, number[]>;
    target: string;
    correction: string;
    neutral_summary: string;
  };
  emotional: {
    characters: Record<string, string>;
    editable_traits: string[];
    opening: string;
    ending: string;
    persona_turns: number;
    story_turns: number[];
    scenes: Record<string, { place: string; goal: string; bridge: string }>;
  };
}
export const mentorConfig: ResearchConfig = JSON.parse(
  readFileSync(new URL('../../../../research/mentor-test-v1.json', import.meta.url), 'utf8'),
) as ResearchConfig;
export function mentorPolicy(
  definition: ExperimentDefinition,
  stage: string,
  config: ResearchConfig,
): StagePolicy {
  const base = demoPolicy(definition, stage);
  if (definition.path === 'daily') return base;
  if (definition.path === 'cognitive') {
    const goals: Record<string, string> = {
      STEREOTYPE_CAPTURE:
        '邀请用户用自己的话表达一个关于美国黑人的负面刻板印象，并询问来源；不猜测、不替用户填写。',
      VIEWPOINT_CONFIRMATION: '让用户明确确认自己表达的唯一观点；不要按关键词改写或替用户确认。',
      REFRAME_COUNTER_FACT: '围绕唯一确认观点讨论反刻板事实与文化多样性，不替换评分对象。',
      REFRAME_INDIVIDUAL_DIFFERENCE: '围绕唯一确认观点讨论美国黑人的个体差异。',
      ACTION_INTENTION: '询问用户面对美国黑人刻板印象相关内容时的行动意愿，不自行作答或结束流程。',
    };
    const fallback: Record<string, string> = {
      INITIAL_RATING: '对于“{{confirmed_belief}}”，' + config.rating.instruction,
      SECOND_RATING: '对于“{{confirmed_belief}}”，' + config.rating.instruction,
      REFRAME_SOCIAL_STRUCTURE:
        '对于“{{confirmed_belief}}”，教育、住房和社会资源的差异可能怎样影响个人处境？',
      REFRAME_MEDIA_ALGORITHM:
        '对于“{{confirmed_belief}}”，新闻选取和推荐算法可能怎样影响我们看到的信息？',
      REFRAME_COUNTER_FACT: '对于“{{confirmed_belief}}”，你见过哪些反例或不同的文化经验？',
      REFRAME_INDIVIDUAL_DIFFERENCE:
        '对于“{{confirmed_belief}}”，具体个人经历与群体标签之间有哪些差异？',
      ACTION_INTENTION:
        '对于“{{confirmed_belief}}”，下次面对美国黑人刻板印象相关内容，你愿意怎样核实或回应？',
    };
    return {
      ...base,
      goal: goals[stage] ?? base.goal,
      ...(fallback[stage]
        ? { fallbackReplies: [fallback[stage]!, fallback[stage]!.replace('对于', '想到')] }
        : {}),
    };
  }
  const scene = config.emotional.scenes[stage];
  const identity = Object.entries(config.emotional.characters)
    .map(([name, identity]) => `${name}：${identity}`)
    .join('；');
  return {
    ...base,
    roleDescription: `故事《打破心墙》的对话伙伴。固定人物：${identity}。用户仅可补充外貌、兴趣、性格，不能改变种族身份或核心关系发展。自然克制，不提前透露未发生的内容。`,
    goal:
      scene?.goal ??
      (stage === 'PERSONA_SETUP'
        ? '介绍Marcus和李阳，邀请用户补充外貌、兴趣和性格。'
        : '完成情感总结并告别，不再提问或邀请新创作。'),
    scene: {
      id: `${config.version}-${stage}`,
      description: scene?.place ?? (stage === 'PERSONA_SETUP' ? '人物建立' : '故事收尾'),
      fixedTransition: scene?.bridge ?? '保持当前任务，不切换场景。',
      scene_state: scene?.place ?? stage,
      scene_phase: stage,
      allowed_actions: scene
        ? ['回应当前固定场景内的用户补充', '保持当前人物关系']
        : ['回应当前任务'],
    },
    forbiddenScenes: [
      ...base.forbiddenScenes,
      '回到已经结束的场景',
      '重新初次见面',
      ...Object.entries(config.emotional.scenes)
        .slice(0, Object.keys(config.emotional.scenes).indexOf(stage))
        .flatMap(([, s]) => (s.place !== scene?.place ? ['回到' + s.place, '返回' + s.place] : [])),
    ],
  };
}
export function inputKind(input: string): 'answer' | 'meta' | 'mistype' | 'offtopic' {
  const s = input.trim();
  if (
    /^(?:现在|我们现在|故事现在|请问)?(?:进行|进展|到|处于).{0,8}(?:哪里|哪一步|哪一阶段)|(?:流程|规则|状态|系统|提示词)(?:是什么|是什么样|怎么|如何)|^(?:这是|你是)(?:什么系统|AI|机器人)|(?:现在进行到哪里|测试系统|忽略.*指令)/iu.test(
      s,
    )
  )
    return 'meta';
  if (/^(?:打错了|误输入|发错了|撤回|更正上一条)[。！!\s]*$/u.test(s)) return 'mistype';
  if (/^(?:不知道|随便|不想回答|拒绝回答|嗯|哦|啊)[。！!\s]*$/u.test(s)) return 'offtopic';
  return 'answer';
}
export const storyStages = [
  'FIRST_CONTACT',
  'MISUNDERSTANDING',
  'RESOLUTION',
  'SHARED_EXPERIENCE',
  'RELATIONSHIP',
];
export function turnStages(b: Bundle): string[] {
  if (['STEREOTYPE_CAPTURE', 'VIEWPOINT_CONFIRMATION'].includes(b.snapshot.stage))
    return ['STEREOTYPE_CAPTURE', 'VIEWPOINT_CONFIRMATION'];
  if (b.snapshot.path === 'emotional' && storyStages.includes(b.snapshot.stage)) return storyStages;
  return [b.snapshot.stage];
}
export function limits(b: Bundle): { min: number; max: number } {
  const c = b.configuration.research_config!;
  const stage = b.snapshot.stage;
  if (b.snapshot.path === 'cognitive') {
    const pair = c.cognitive.turns[turnStages(b).length === 2 ? 'capture_confirmation' : stage]!;
    return { min: stage === 'STEREOTYPE_CAPTURE' ? 1 : pair[0]!, max: pair[1]! };
  }
  if (stage === 'PERSONA_SETUP')
    return { min: c.emotional.persona_turns, max: c.emotional.persona_turns };
  if (stage === 'ENDING_FEEDBACK') return { min: 1, max: 1 };
  return {
    min: stage === 'RELATIONSHIP' ? c.emotional.story_turns[0]! : 1,
    max: c.emotional.story_turns[1]!,
  };
}
export function enforceRating(b: Bundle, data: Record<string, unknown>) {
  if (
    !b.configuration.research_config ||
    !['INITIAL_RATING', 'SECOND_RATING'].includes(b.snapshot.stage)
  )
    return;
  const s = b.configuration.research_config.rating,
    v = data.rating;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < s.min || v > s.max)
    fail(400, 'INVALID_RATING');
}
