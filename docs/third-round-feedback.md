# 第三轮反馈：Step 2 要求复核通过

## 本轮结论与修改范围

已读取《Codex_第三轮反馈_Step2状态机开发要求.docx》。该文档与上一轮 PDF 的 Step 2 任务一致，没有新增数据库、页面或模型任务。对应功能已在提交 `3d6b409286e51c29a4f125332b8d370f5361d525` 中实现。本轮重新逐项验收，未重复修改业务代码。

- 修改原因：对照新上传文档确认已有交付符合要求，并提供本轮可下载的验收反馈。
- 修改范围：本反馈文档、实际执行的验收结果 JSON、README 中的反馈入口。
- 测试结果：重新运行 npm run check，97 个测试全部通过，0 跳过；类型检查、ESLint、Prettier 和四个工作区构建通过。
- 对实验设计的影响：无。本轮未改变路径、事件、变量规则、版本或实验阶段，也未修改前端、后端、提示词或依赖。
- 按文档要求完成 Step 2 后暂停，等待下一步确认；没有进入 Step 3。

## 1. experiment-core 当前目录结构

下面列出源码与配置，不包含忽略的构建产物：

```text
packages/experiment-core/
├── package.json
├── tsconfig.json
├── tsconfig.tests.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── definitions.ts
│   ├── events.ts
│   ├── validation.ts
│   ├── immutable.ts
│   └── transition.ts
├── tests/
│   ├── fixtures.ts
│   ├── definition.test.ts
│   └── transition.test.ts
└── examples/
    └── cognitive-path.ts
```

## 2. 状态定义文件

[definitions.ts](../packages/experiment-core/src/definitions.ts) 包含三条结构化路径；[types.ts](../packages/experiment-core/src/types.ts) 包含定义与状态快照类型。

| 版本         | 阶段顺序                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cognitive_v1 | INIT → STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION → COMPLETED |
| emotion_v1   | INIT → PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK → COMPLETED                                                                                          |
| daily_v1     | INIT → NATURAL_CHAT → COMPLETED                                                                                                                                                                                                |

本轮文档给出的阶段名称和顺序与代码一致。定义仅包含结构、允许事件和字段规则，没有具体提示词。

迁移算法没有把阶段名称写成固定分支；通过传入定义确定下一阶段。已有测试验证配置全部重命名的阶段仍能运行。

experimentVersion 固定实验定义；状态 version 记录已接受迁移次数。两者分别校验，不能用新的实验版本替换已运行会话，也不能在同一版本名下改写冻结的定义。

## 3. event 定义文件

[events.ts](../packages/experiment-core/src/events.ts) 定义统一 EventType 枚举：

```text
EXPERIMENT_STARTED
STEREOTYPE_SUBMITTED
VIEWPOINT_CONFIRMED
RATING_SUBMITTED
REFRAME_COMPLETED
ACTION_INTENTION_SUBMITTED
STAGE_RESPONSE_SUBMITTED
CHAT_FINISHED
```

事件信封包含 id、type、experimentVersion、expectedStateVersion。普通字符串、未知事件或附带目标 stage 的事件均被拒绝；只有当前阶段声明的事件可以推进一步。

未来 API 负责身份、会话和权限校验并构造可信事件，模型不能直接提供被接受的状态或事件。本阶段没有 API 业务接入。

## 4. transition 核心代码

实际实现：[transition.ts](../packages/experiment-core/src/transition.ts)。

公开函数签名：

```ts
transition(
  currentState: ExperimentStateSnapshot,
  event: unknown,
  validatedData: unknown,
  experimentDefinition: ExperimentDefinition,
): TransitionResult
```

输出为 `{ ok, newState, events, variables, errors }`。失败保留原快照，events 与 variables 为空；成功返回下一阶段快照、审计事件和变量变更。

已复核源码仅依赖模块内纯逻辑与共用的类型声明，不调用数据库、Express 或模型 API，不读取环境变量，也不生成随机 ID 或系统时间。

相同输入产生相同结果。输入对象不被修改或冻结；成功输出独立复制并冻结。回复中的指令字符串不被解析成迁移指令。

## 5. 测试覆盖与本轮验收

本轮重新执行：

```bash
npm run check
npm run example:cognitive --workspace @research/experiment-core
```

| 测试文件                                 | 数量 | 本轮结果         |
| ---------------------------------------- | ---- | ---------------- |
| experiment-core/tests/definition.test.ts | 27   | 通过             |
| experiment-core/tests/transition.test.ts | 68   | 通过             |
| apps/api/tests/app.test.ts               | 2    | 原有测试通过     |
| 合计                                     | 97   | 全部通过，0 跳过 |

覆盖三条正常路径、非法事件与跳步、重复事件及 ID 内容冲突、版本保护、非法定义、数据字段校验、终态保护、输入不变、输出独立性和 JSON 快照恢复。这里没有声称行覆盖率或分支覆盖率百分比。

还独立调用构建后的 ESM 包，实际核验文档要求的三个场景，结果保存在 [third-round-acceptance.json](examples/third-round-acceptance.json)：

| 场景                                           | 实际结果                                                  |
| ---------------------------------------------- | --------------------------------------------------------- |
| INITIAL_RATING 收到 RATING_SUBMITTED           | 接受；进入 REFRAME_SOCIAL_STRUCTURE，version 从 3 到 4    |
| INITIAL_RATING 收到 ACTION_INTENTION_SUBMITTED | 拒绝；EVENT_NOT_ALLOWED；仍为 INITIAL_RATING、version 3   |
| SECOND_RATING 完成后重放原评分事件             | 拒绝；DUPLICATE_EVENT；仍为 ACTION_INTENTION、version 9   |
| SECOND_RATING 完成后用新 ID 再提交评分         | 拒绝；EVENT_NOT_ALLOWED；仍为 ACTION_INTENTION、version 9 |

所有拒绝场景均没有新审计事件或变量变更，返回原快照。

边界仍与上一轮一致：JSON 快照恢复不是数据库恢复；过期版本检查不是数据库并发锁。真实并发持久化、登录和权限、数据库迁移、退出/管理员终止，以及正式量表和干预材料仍留给对应后续阶段。

## 6. 完整认知路径示例

本轮重新运行 [cognitive-path.ts](../packages/experiment-core/examples/cognitive-path.ts)，输出与已保存的 [cognitive-v1-run.json](examples/cognitive-v1-run.json) 完全一致。

```text
v0  INIT
    --EXPERIMENT_STARTED-->
v1  STEREOTYPE_CAPTURE
    --STEREOTYPE_SUBMITTED-->
v2  VIEWPOINT_CONFIRMATION
    --VIEWPOINT_CONFIRMED-->
v3  INITIAL_RATING
    --RATING_SUBMITTED-->
v4  REFRAME_SOCIAL_STRUCTURE
    --REFRAME_COMPLETED-->
v5  REFRAME_MEDIA_ALGORITHM
    --REFRAME_COMPLETED-->
v6  REFRAME_COUNTER_FACT
    --REFRAME_COMPLETED-->
v7  REFRAME_INDIVIDUAL_DIFFERENCE
    --REFRAME_COMPLETED-->
v8  SECOND_RATING
    --RATING_SUBMITTED-->
v9  ACTION_INTENTION
    --ACTION_INTENTION_SUBMITTED-->
v10 COMPLETED
```

最终 lifecycle 为 completed；初次评分示例值 5、二次评分示例值 3 分别保存。所有内容为合成验收数据，不代表正式心理学量表或实验刺激材料。

## 查看和下载

可以直接复制本页正文给 GPT。下载全部项目：仓库首页 Code → Download ZIP。下载单个反馈或 JSON：打开文件后选择 Raw / Download raw file。私有仓库需先登录有权限的 GitHub 账号。

上一轮更详细的实现说明见 [Step 2 完整反馈](step2-feedback.md)。
