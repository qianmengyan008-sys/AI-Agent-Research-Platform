# Step 2 完成反馈：独立状态机核心

本轮依据上传的《第二轮反馈：Step 1 验收通过，请进入 Step 2（状态机核心）》完成。只实现 experiment-core 层及其测试、示例和文档；未开发数据库、页面、模型或新的 API。

## 1. 当前目录结构

```text
packages/experiment-core/
├── package.json
├── tsconfig.json
├── tsconfig.tests.json
├── src/
│   ├── index.ts             公开导出
│   ├── types.ts             定义、快照、结果、审计与错误类型
│   ├── definitions.ts       三条路径的结构及版本
│   ├── events.ts            事件枚举与事件信封
│   ├── validation.ts        定义、事件、数据校验与结构签名
│   ├── immutable.ts         冻结模块自己创建的输出
│   └── transition.ts        初始状态、快照校验、纯迁移函数
├── tests/
│   ├── fixtures.ts
│   ├── definition.test.ts   27 个定义校验测试
│   └── transition.test.ts   68 个迁移与边界测试
└── examples/
    └── cognitive-path.ts    可执行完整认知路径示例
```

## 2. 状态定义文件与版本

代码：[definitions.ts](../packages/experiment-core/src/definitions.ts)。

三个版本分别为 cognitive_v1、emotion_v1、daily_v1。每个定义包含 path、experimentVersion 与有序 stages；每个非终态阶段定义允许事件及必填字段规则。没有提示词、模型配置或可执行回调。

认知路径：

```text
INIT
→ STEREOTYPE_CAPTURE
→ VIEWPOINT_CONFIRMATION
→ INITIAL_RATING
→ REFRAME_SOCIAL_STRUCTURE
→ REFRAME_MEDIA_ALGORITHM
→ REFRAME_COUNTER_FACT
→ REFRAME_INDIVIDUAL_DIFFERENCE
→ SECOND_RATING
→ ACTION_INTENTION
→ COMPLETED
```

情感路径：

```text
INIT → PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING
→ RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP
→ ENDING_FEEDBACK → COMPLETED
```

日常路径：

```text
INIT → NATURAL_CHAT → COMPLETED
```

阶段名称只保存在配置定义中。迁移函数依照定义位置、事件和字段规则决定下一阶段，不判断固定的阶段字符串。测试已验证使用全部重命名的阶段与 daily_v2 定义仍可运行。

实验版本与状态修订号是两个概念：experimentVersion 冻结实验结构；version 从 0 开始，每次获准迁移增加 1，供后续服务处理过期请求。

会话还保存规范化的 definitionSignature，拒绝在同一个版本名下偷偷修改未来阶段或字段规则。这是结构 JSON 比较，不是密码学签名，也不能证明快照来源可信。

## 3. event 定义文件

代码：[events.ts](../packages/experiment-core/src/events.ts)。

| 事件                       | 用途                                     |
| -------------------------- | ---------------------------------------- |
| EXPERIMENT_STARTED         | INIT 进入路径的第一个阶段                |
| STEREOTYPE_SUBMITTED       | 保存认知路径的观点采集回答               |
| VIEWPOINT_CONFIRMED        | 保存观点，并要求 confirmed 为布尔值 true |
| RATING_SUBMITTED           | 保存当前阶段的初次或二次评分             |
| REFRAME_COMPLETED          | 完成当前认知重构阶段，最多推进一步       |
| ACTION_INTENTION_SUBMITTED | 保存行动意愿并完成认知路径               |
| STAGE_RESPONSE_SUBMITTED   | 完成当前情感路径阶段                     |
| CHAT_FINISHED              | 完成日常聊天路径                         |

事件信封只有 id、type、experimentVersion、expectedStateVersion。不接受目标 stage、跳转命令或任意字符串。相同事件 ID 和内容的重试返回 DUPLICATE_EVENT；相同 ID 更换内容返回 EVENT_ID_CONFLICT。两种情况均无新变量、无新审计事件、无状态修改。

事件必须由未来可信后端在身份、会话和权限校验后构造。本模块本身不实现身份认证，不能把客户端或模型提供的“当前状态”直接当作可信状态。

## 4. transition 核心代码与接口

代码：[transition.ts](../packages/experiment-core/src/transition.ts)。类型：[types.ts](../packages/experiment-core/src/types.ts)。

接口：

```ts
transition(currentState, event, validatedData, experimentDefinition);
// → { ok, newState, events, variables, errors }
```

示例调用：

```ts
const initial = createInitialState(cognitiveV1);
const result = transition(
  initial,
  {
    id: 'example-start',
    type: EventType.EXPERIMENT_STARTED,
    experimentVersion: 'cognitive_v1',
    expectedStateVersion: 0,
  },
  {},
  cognitiveV1,
);
// result.newState.stage === 'STEREOTYPE_CAPTURE'
// result.newState.version === 1
```

内部依次校验定义、路径与版本、定义结构签名、快照历史一致性、事件结构、重复事件、预期状态版本、终态、当前阶段允许事件以及字段数据。全部通过才推进到定义中的下一阶段。

成功时输出新的 JSON 可序列化快照、一条迁移审计事件、该阶段变量的变更记录及空 errors。失败时返回原快照引用，events 和 variables 均为空，errors 中提供明确错误码。

函数不调用数据库、Express 或模型，不读取环境变量，不使用时间或随机 ID。相同输入得到相同结果。成功输出独立复制并冻结；不会修改或冻结调用者传入的对象。

数据使用结构化字段保存。初次评分与二次评分为独立变量；四个认知重构回答分别保存。回复文本中的 JSON 跳转指令只作为文本数据，不会被执行。

本阶段字段规则是结构验证：文本非空、长度上限为工程限制，评分必须为有限数值。尚未确定正式量表，因此默认没有臆定研究分值范围；定义支持 min/max，测试覆盖显式配置后的越界拒绝。示例数值不代表已选定量表。

## 5. 测试覆盖与实际结果

实际执行 npm run check：类型检查、ESLint、Prettier、Vitest 和全部四个工作区构建通过。

| 测试文件                                 | 数量 | 结果             |
| ---------------------------------------- | ---- | ---------------- |
| experiment-core/tests/definition.test.ts | 27   | 通过             |
| experiment-core/tests/transition.test.ts | 68   | 通过             |
| 原有 apps/api/tests/app.test.ts          | 2    | 通过             |
| 合计                                     | 97   | 全部通过，0 跳过 |

行为覆盖：

- 三条完整合法路径，以及输出的状态、变量和审计信息。
- INITIAL_RATING 收到 RATING_SUBMITTED 后进入 REFRAME_SOCIAL_STRUCTURE。
- INITIAL_RATING 收到 ACTION_INTENTION_SUBMITTED 时拒绝转换。
- SECOND_RATING 已完成后，原事件重放及新的评分事件均不能再次修改状态。
- 连续重构阶段中的旧请求因 expectedStateVersion 过期被拒绝，避免误推进下一阶段。
- 缺字段、额外目标阶段或条件字段、空白文本、非数值评分、非有限数值和未明确确认被拒绝。
- 错误实验版本、跨路径定义、同版本下修改定义、非法定义和不一致快照被拒绝。
- JSON 序列化、恢复后的继续迁移和重复事件检测。
- 完成后拒绝新动作；原事件重放仍可识别为重复。
- 输入不变、输出冻结及确定性；文本指令无法控制状态。

这里报告的是测试用例与行为范围，没有生成行覆盖率或分支覆盖率百分比。

并发边界：测试验证过期请求在最新快照上被拒绝，同时明确验证两个纯函数调用若使用同一个旧快照，都可能计算成功。本层无法锁定数据库或阻止两份结果同时被提交。后续 PostgreSQL/API 必须通过事务锁或原子版本比较、事件唯一约束保证单次提交；本轮没有声称真实并发持久化已经完成。

恢复边界：已验证 JSON 快照恢复及历史一致性校验，未验证数据库或服务重启。快照必须来自后端可信存储；历史一致性校验不能防止有人伪造一份完整一致的历史。

构建后的 ESM 包也已独立导入并执行日常路径起始事件，不依赖应用服务。

## 6. 完整认知路径迁移示例

运行：

```bash
npm run example:cognitive --workspace @research/experiment-core
```

示例代码：[cognitive-path.ts](../packages/experiment-core/examples/cognitive-path.ts)。

实际运行结果：[cognitive-v1-run.json](examples/cognitive-v1-run.json)。该 JSON 包含完整 trace、最终状态、变量和事件回执；全部为合成示例数据。

| 状态版本 | 原阶段                        | 事件                       | 新阶段                        |
| -------- | ----------------------------- | -------------------------- | ----------------------------- |
| 0 → 1    | INIT                          | EXPERIMENT_STARTED         | STEREOTYPE_CAPTURE            |
| 1 → 2    | STEREOTYPE_CAPTURE            | STEREOTYPE_SUBMITTED       | VIEWPOINT_CONFIRMATION        |
| 2 → 3    | VIEWPOINT_CONFIRMATION        | VIEWPOINT_CONFIRMED        | INITIAL_RATING                |
| 3 → 4    | INITIAL_RATING                | RATING_SUBMITTED           | REFRAME_SOCIAL_STRUCTURE      |
| 4 → 5    | REFRAME_SOCIAL_STRUCTURE      | REFRAME_COMPLETED          | REFRAME_MEDIA_ALGORITHM       |
| 5 → 6    | REFRAME_MEDIA_ALGORITHM       | REFRAME_COMPLETED          | REFRAME_COUNTER_FACT          |
| 6 → 7    | REFRAME_COUNTER_FACT          | REFRAME_COMPLETED          | REFRAME_INDIVIDUAL_DIFFERENCE |
| 7 → 8    | REFRAME_INDIVIDUAL_DIFFERENCE | REFRAME_COMPLETED          | SECOND_RATING                 |
| 8 → 9    | SECOND_RATING                 | RATING_SUBMITTED           | ACTION_INTENTION              |
| 9 → 10   | ACTION_INTENTION              | ACTION_INTENTION_SUBMITTED | COMPLETED                     |

最终 experimentVersion 为 cognitive_v1，stage 为 COMPLETED，lifecycle 为 completed，version 为 10，initial_rating 为示例值 5、second_rating 为示例值 3，分别保存且互不覆盖。

## 修改范围与对已有设计的影响

- 原因：把 Step 1 的状态机类型骨架落实为可单独测试的纯状态机。
- 范围：packages/experiment-core；根目录 Vitest 测试发现配置；README 和本轮反馈、示例 JSON。没有改动 apps/web、apps/api、contracts、依赖版本或锁文件。
- 设计变化：按最新 PDF 增加 INIT，并用四个明确命名阶段替代第一轮的 reframe_1…4；采用本轮事件枚举。原有设计文档作为第一轮记录保留，当前实现以本反馈和 definitions.ts 为准。
- 未实现：研究干预文本、量表细节、聊天内容处理、人物设定的权限流程、退出/管理员终止事件、会话认证、数据库或真实并发提交。人物设定示例仅记录结构化阶段回答，未来 API 必须使用管理员冻结的设定及确认流程。
- 下一步：等待用户确认后进入 Step 3 PostgreSQL migration，本轮不继续开发数据库或页面。

## GitHub 查看与下载

在 GitHub 打开本文件即可阅读并复制给 GPT。需要全部源码与反馈时，在仓库首页点击 Code → Download ZIP；单独下载本文件或示例 JSON 时，打开对应文件并选择 Raw / Download raw file。私有仓库需要先登录有访问权限的账号。
