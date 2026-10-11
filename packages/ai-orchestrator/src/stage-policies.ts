import type { ExperimentDefinition } from '@research/experiment-core';
import { freeze } from './immutable.js';
import type { StagePolicy } from './types.js';

/** Demonstration language scaffolds; not approved study stimuli. */
export function demoPolicy(definition: ExperimentDefinition, stage: string): StagePolicy {
  if (
    !definition.stages.some((entry) => entry.id === stage && entry.on) ||
    stage === definition.stages[0]?.id
  )
    throw new Error('Only active stages have generation policies');
  const isReframe = definition.path === 'cognitive' && stage.startsWith('REFRAME_');
  const requiresConfirmedBelief =
    isReframe ||
    (definition.path === 'cognitive' && ['INITIAL_RATING', 'SECOND_RATING'].includes(stage));
  const goals: Record<string, string> = {
    STEREOTYPE_CAPTURE: '邀请用户表达当前观点，不代替用户填写。',
    VIEWPOINT_CONFIRMATION: '邀请用户明确确认自己的观点，不替用户确认。',
    INITIAL_RATING: '说明当前评分任务，不替用户打分。',
    REFRAME_SOCIAL_STRUCTURE: '围绕确认观点讨论社会结构因素，回应用户补充。',
    REFRAME_MEDIA_ALGORITHM: '围绕确认观点讨论媒体呈现与算法因素。',
    REFRAME_COUNTER_FACT: '围绕确认观点讨论可能的反例，不替换评分对象。',
    REFRAME_INDIVIDUAL_DIFFERENCE: '围绕确认观点讨论个体差异。',
    SECOND_RATING: '说明当前再次评分任务，不修改既有评分。',
    ACTION_INTENTION: '邀请用户表达行动意愿，不自行完成流程。',
    PERSONA_SETUP: '回应已设定人物的确认任务，不自行修改人物。',
    FIRST_CONTACT: '在当前图书馆场景中进行初次交流。',
    MISUNDERSTANDING: '回应当前误解内容，不自行解除或转场。',
    RESOLUTION: '回应当前解除误解的交流，不重演已完成误解。',
    SHARED_EXPERIENCE: '回应当前共同整理图书的经历，只保持当前共同经历场景。',
    RELATIONSHIP: '回应当前关系交流，不自行宣布关系阶段完成。',
    ENDING_FEEDBACK: '邀请用户表达当前反馈，等待后端完成事件。',
    NATURAL_CHAT: '进行中性日常聊天，不主动引入实验干预。',
  };
  const goal = goals[stage];
  if (!goal) throw new Error('A custom stage requires its own approved policy');
  const emotional = definition.path === 'emotional';
  const ratingStage =
    definition.path === 'cognitive' && ['INITIAL_RATING', 'SECOND_RATING'].includes(stage);
  const fallbackReplies = ratingStage
    ? [
        '对于“{{confirmed_belief}}”，你会怎样评价自己的认同程度？',
        '想到“{{confirmed_belief}}”，你现在的认同程度是什么？',
      ]
    : requiresConfirmedBelief
      ? [
          '你提到“{{confirmed_belief}}”。哪些经历让你形成了这样的看法？',
          '听到你说“{{confirmed_belief}}”，我很好奇，你觉得哪些因素与此有关？',
        ]
      : [
          '听起来这对你有些意义。你愿意多说一点吗？',
          '我在听。刚才提到的内容里，哪一点让你印象最深？',
        ];
  return freeze({
    path: definition.path,
    experimentVersion: definition.experimentVersion,
    stage,
    roleDescription: '遵守当前任务边界的对话伙伴',
    goal,
    requiresConfirmedBelief,
    variableKeys: emotional ? ['persona_snapshot'] : [],
    ...(emotional
      ? {
          scene: {
            id: `demo-library-${stage}`,
            description: '演示场景：图书馆内共同整理图书，仅用于工程验证。',
            fixedTransition: '继续当前图书馆场景，不自行转场。',
            scene_state: 'library',
            scene_phase: stage.toLowerCase(),
            allowed_actions: ['描述当前图书馆情境', '回应当前任务相关交流'],
          },
        }
      : {}),
    forbiddenPurpose: ['本实验旨在', '实验目的是', '你被分配到实验组', '测量你的刻板印象变化'],
    forbiddenJumps: [
      '进入下一阶段',
      '跳过这一阶段',
      '回到初次接触',
      '实验已结束',
      '对话已经结束',
      '不用再回答',
    ],
    forbiddenScenes: emotional ? ['回到咖啡馆', '来到海滩', '重新初次见面'] : [],
    forbiddenContent:
      definition.path === 'daily'
        ? ['认知重构', '制造误解', '改变你的刻板印象']
        : isReframe
          ? ['现在进行第二次评分', '现在填写行动意愿']
          : [],
    fallbackReplies,
    maxReplyLength: 2000,
  });
}
