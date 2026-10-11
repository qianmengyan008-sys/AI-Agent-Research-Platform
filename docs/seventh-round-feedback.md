# 第七轮反馈：Step 5 真实 Adapter 实现与端到端验收

供 GPT 复核并指导 Codex 后续工作。依据 [第七轮需求原文](inputs/seventh-round-requirements.docx)，本轮完成真实 HTTP Adapter、环境配置、日志接口、模块级端到端实验测试和回归测试集。

**验收状态：工程实现与本地 HTTP 验证已完成；真实外部模型验收尚未完成。** 当前缺少 MODEL_API_KEY 和 MODEL_NAME，真实验收报告明确为 not_run、调用数 0。不能把本地模拟服务或未鉴权 401 连通性检查称为真实模型测试通过。

## 修改原因、文件和实验影响

前轮只有 MockAdapter。本轮新增 OpenAICompatibleAdapter，业务和状态机继续只依赖 LanguageGenerator。模型地址、模型名称、temperature、max_tokens、timeout 与重试预算通过可信环境配置管理，没有把供应商调用写进业务状态机。

修改范围：model-adapter 新增 providers/openai-compatible-adapter.ts、config.ts、experiment-log.ts；把已有 mock 移到 providers/mock-adapter.ts；更新公开导出和工作区依赖。新增本地 HTTP 辅助服务、provider.test.ts、experiment-e2e.test.ts、实验场景与本地／真实验收脚本。ai-orchestrator 新增供应商无关失败分类、停止不可重试错误、Prompt 版本标识，并修复评分对象文字规则误拦。更新工作区命令、锁文件、README、.env.example 和本轮文档。

未修改 experiment-core、contracts、前端、API 业务、数据库、用户系统或管理后台；未部署，未连接 WorkBuddy。没有新增第三方依赖。后端阶段和关键变量定义保持原样。语言规则变化需要研究者复核正式实验刺激和语义有效性。

测试发现，多观点选择后的确认文本本身可能包含“评分对象”，原规则会将其正常引用误判为新评分对象。现只检查精确冻结观点引用之外的新评分对象／观点归因，使用不会与原文冲突的本地标记；同时测试追加新评分对象和伪造标记仍被拦截。没有通过堆叠完整实验 Prompt 处理该问题。

## 1. Model Adapter 目录结构

```text
packages/model-adapter/
  src/
    providers/
      openai-compatible-adapter.ts   真实 HTTP 协议、配置、响应和安全错误处理
      mock-adapter.ts                本地 Mock
    config.ts                        环境选择及非秘密模型设置
    experiment-log.ts                服务端运行日志、参与者 text 投影
    index.ts                         公共导出
  tests/
    interface.test.ts                前轮替换、超时与状态边界测试
    provider.test.ts                 本轮请求协议、错误、配置、真实验收前置检查
    experiment-e2e.test.ts           本轮路径与实验回归测试
    helpers/http-server.ts          临时 loopback 测试服务器
  examples/
    experiment-run.ts               显式后端提交的合成流程模拟器
    experiment-cases.ts             11 类实验问题测试输入
    local-http-acceptance.ts         本轮实际 HTTP 模块级端到端记录
    live-e2e.ts                      真实供应商验收；缺配置明确 not_run
    acceptance.ts                   历史 Mock Adapter 示例
```

## 2. 真实模型调用示例与架构

```text
显式参与者提交 → 后端 State Machine
                        ↓ 可信当前快照
                 AI Orchestrator
                        ↓ 模型可见 messages
                 LanguageGenerator
                        ↓
              OpenAICompatibleAdapter
                        ↓ HTTPS /chat/completions
                 实际模型服务
                        ↓ 候选文本／安全错误
                 Validator／重试／兜底
                        ↓
                自然 text 与内部日志
```

真实服务接口代码已实现；当前真实服务调用示例是可运行脚本，不是已执行的模型回答。详见 [模型服务操作说明](step5-model-integration.md)。

```typescript
const { generator, settings } = createConfiguredGenerator(serverEnvironment);
const result = await orchestrate(trustedCurrentStageRequest, generator, {
  timeoutMs: settings.timeout_ms,
  maxAttempts: settings.max_attempts,
});
const participantOutput = participantReply(result); // 仅 text
```

Adapter 只接收 PromptBundle / GenerationOptions，不接收 state 或数据库接口。供应商请求只发送当前 messages 与可信模型参数，不发送完整控制状态、未来任务或工具接口。

## 3. 环境变量配置方案与当前阻塞

| 变量               | 用途                                                       |
| ------------------ | ---------------------------------------------------------- |
| MODEL_PROVIDER     | 默认 mock；真实 openai-compatible；DeepSeek 为兼容接口预设 |
| MODEL_API_BASE_URL | 服务 HTTPS 根地址，可替换                                  |
| MODEL_API_KEY      | 安全密钥绑定，禁止进入 Git 或聊天                          |
| MODEL_NAME         | 账户可用且兼容 Chat Completions 的模型名称                 |
| MODEL_TEMPERATURE  | 可信生成参数，默认 0.2                                     |
| MODEL_MAX_TOKENS   | 输出预算，默认 512                                         |
| MODEL_TIMEOUT_MS   | 每次尝试超时，默认 10000ms                                 |
| MODEL_MAX_ATTEMPTS | 首次加重试的总预算，默认 2，最大 3                         |

按用户选择优先实现 OpenAI 兼容接口。已在云环境配置草稿保存变量建议及 MODEL_API_KEY → api.openai.com 的秘密绑定要求；没有写入任何秘密值，并更新了环境启动指导；安装脚本继续使用已验证的 npm ci / npm run check。保存配置不会自动执行命令或证明已发布。当前运行环境仍缺少 MODEL_API_KEY 和 MODEL_NAME。OpenAI 未鉴权连通性复查返回 HTTP 401，但未执行生成调用，不证明账号权限。

需要在云环境设置填写秘密值和模型名，保存并确认运行环境获得变量；若产品要求发布环境版本，请按其界面完成。草稿保存与变量注入／发布是不同步骤。自定义服务或 DeepSeek 需配置相应地址、网络目标和密钥绑定；Claude 原生协议仍未实现。

真实模型验收命令：

```bash
npm run live:e2e -- /tmp/step5-live-e2e.json
```

正常完整验收含两条路径的 16 次阶段调用及 11 个回归输入；默认最多 54 次 HTTP 尝试，配置最大预算时最多 81 次。脚本只使用合成数据，明确选择真实服务，不会静默退回 mock。缺少配置退出 2；供应商或流程失败退出 1；完成时仍需查看是否出现恢复和人工语义审核。

## 4. 一次完整认知路径测试结果

**此次为真实 Adapter 连接本地 HTTP 模拟服务，非真实 LLM。**

STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION。

9 次语言调用，10 次显式后端迁移（含启动和最终完成），最终 completed。确认观点固定为“我认为这种刻板印象是不合理的”；四个重构阶段按上述次序执行并读取同一确认观点。初次评分为合成值 5，二次评分为合成值 3，不是正式评分尺度。

语言调用后所有快照不变；INITIAL_RATING 中用户打断不会自动产生评分或推进事件。测试随后明确提交合法评分，才由后端推进重构。SECOND_RATING 仅在后端接受最后一个重构阶段回答后进入。

完整请求、上下文、回复、校验、后端迁移、最终快照和运行日志见 [本地 HTTP 端到端记录](acceptance/step5/local-http-e2e.json) 的 cognitive。

## 5. 一次完整情感路径测试结果

**此次同样使用本地 HTTP 模拟服务，非真实 LLM。**

PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK。

7 次语言调用，8 次显式后端迁移，最终 completed。当前 scene_state 保持已定义的 library，scene_phase 分别对应后端当前阶段。模型没有创建场景、回退时序、提前结束或执行控制指令的接口。

所有模型调用前后状态相同。情感阶段文本规则、人物快照和 allowed_actions 保持当前场景约束；已知跳跃场景、系统提示披露等输出有回归测试，但不能将文字规则当作完整的故事语义证明。

完整记录见 local-http-e2e.json 的 emotional；真实情感路径尚未运行，状态见 [真实验收记录](acceptance/step5/live-e2e.json)。

## 6. 自动化测试列表与运行日志

本轮新增 63 个测试：provider.test.ts 40 个，experiment-e2e.test.ts 23 个。全量 295 个测试通过，0 失败、0 跳过；10 个测试文件。npm ci 与 npm run check 已执行，后者覆盖类型、ESLint、格式、全部测试及六个工作区构建。GitHub CI 的实际状态需查看 GitHub 页面，不能用本地结果代替。

| 测试分类     | 覆盖内容                                                                               |
| ------------ | -------------------------------------------------------------------------------------- |
| HTTP 协议    | POST 地址、messages 投影、model / temperature / max_tokens、非流式请求、密钥不序列化   |
| 服务失败     | 401/403、429、5xx、网络异常、错误正文隔离、无效 JSON、非文本、工具响应、1 MiB 响应上限 |
| 截止与重试   | 实际 HTTP 超时、abort、重试总预算、不可重试错误停止、前轮迟到输出／异常处理            |
| 配置         | 默认离线、参数边界、可替换模型、DeepSeek 预设、错误地址拒绝、缺密钥不回退 mock         |
| 认知完整流程 | 冻结观点、四阶段顺序、后端触发二次评分、评分打断后显式提交恢复                         |
| 情感完整流程 | 当前场景、独立场景阶段、人物信息与后端顺序                                             |
| 认知问题集   | 拒绝刻板印象、元认知观点、多个负面观点、打断评分、要求跳过步骤                         |
| 情感问题集   | 只输入“好”、询问流程、改变剧情、提前结束、质疑 AI 身份、跳跃场景                       |
| 恶意回复     | 自行推进、后台控制语言、新观点、实验目的披露、忽视当前评分阶段、JSON 状态指令          |
| 评分对象回归 | 确认文本包含“评分对象”仍可原文引用；追加新对象或伪造锚点仍被拒绝                       |
| 日志隔离     | 所需管理员字段齐全、无正文／观点、参与者投影只有 text                                  |
| 真实验收状态 | 缺配置返回 not_run 与非零退出码，不能当成模型测试通过                                  |

此次本地 HTTP 记录共 27 次请求：认知 9、情感 7、问题输入 11。问题集通过的含义是：已知输入在模拟供应商给定回复下不改变实验事实；并不证明真实模型在这些输入下必然表现同样稳定。

运行日志记录 conversation_id、participant_id、state_before、state_after、model_name、prompt_version、response_latency、validator_result、fallback_count。控制快照包含阶段、版本和生命周期，不包含观点或正文；迟到回复仍由未来实验服务按权威版本丢弃。日志随内部结果保存于验收 JSON，尚无数据库持久化或管理员页面。

## 7. 已知限制和后续必要工作

1. **真实外部模型验收未完成。** 本轮仅保存 not_run 报告；必须配置密钥与模型名并实际执行后才能评估真实行为、费用、权限和语义稳定性。
2. 文字规则不是语义证明，仍可能漏检隐含构念漂移、未知场景、评分暗示或绕写披露，也可能误拦。正式实验需要研究者批准的素材、量表和语义评估。
3. 本轮端到端是状态机、编排层、真实 HTTP Adapter 的模块级链路；没有在线参与者 UI、账号、实验 API、数据库并发或部署。
4. 当前非流式 Chat Completions 支持 messages / temperature / max_tokens；其他 API、推理模型的参数差异和 Claude 原生协议需要另一个适配实现。
5. 默认有限重试，不实现供应商 Retry-After 退避队列。取消通知不能证明不合作的供应商停止计算或计费。
6. 日志为内部对象和合成验收记录；生产权限、可靠投递、持久化、数据保留和参与者退出／撤回机制尚待后续后端开发。

## 本轮文件与 GPT 下一轮工作入口

- [第七轮 Word 反馈](seventh-round-feedback.docx)
- [服务配置、调用和真实验收操作](step5-model-integration.md)
- [全量真实测试报告](acceptance/step5/test-results.json)
- [本地 HTTP 完整验收记录](acceptance/step5/local-http-e2e.json)
- [真实模型验收状态](acceptance/step5/live-e2e.json)
- [验收汇总与环境状态](acceptance/step5/summary.json)

请 GPT 先复核接口实现、测试和 pending 状态，指导完成真实模型配置及实际运行，而不是把 Step 5 全部验收通过后直接进入数据库或界面开发。真实报告生成后应检查每次校验、恢复、评分锚点和场景回复，并由研究者进行语义审核。

整个项目 ZIP 包含源代码、历轮设计、本轮 Markdown / Word 反馈、需求原文及全部验收 JSON，不含 node_modules 和缓存。下载后可上传给 GPT，解压后通过 npm ci 安装依赖。
