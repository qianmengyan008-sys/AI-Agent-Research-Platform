# 第八轮反馈：Step 5 真实模型验收准备与业务层门禁

供 GPT 复核并指导 Codex 后续工作。依据 [第八轮需求原文](inputs/eighth-round-requirements.docx)。本轮继续完善模型边界、验收工具和回归测试，没有扩大到业务界面或数据库。

**本轮结论：自动化工程验收通过；真实模型验收未完成。** 当前运行环境缺少 MODEL_API_KEY、MODEL_NAME。实际运行 live:e2e 返回退出码 2、status=not_run、realProviderCalls=0。因此不能宣布 Step 5 通过，不能进入 PostgreSQL、账号、管理员后台、参与者聊天界面或数据导出开发。

## 修改原因、范围与实验影响

附件要求模型故障有明确诊断事件，并补齐参数、重试指标以及单轮、多轮、长上下文验收。本轮只调整语言编排诊断、模型运行日志、验收工具与测试。experiment-core 状态机、实验阶段和变量定义、前端、API、数据库均未修改。没有新增第三方依赖；没有连接 WorkBuddy、部署或发布实验。

| 文件                                                                  | 修改与目的                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| packages/ai-orchestrator/src/types.ts、orchestrator.ts                | 生成失败、超时、取消的 rejected 审计记录标为 MODEL_GENERATION_FAILED；不产生实验状态或变量事件 |
| packages/model-adapter/src/experiment-log.ts                          | 记录 temperature、max_tokens、retry_count；参数校验；旧调用者未知参数记 null                   |
| packages/model-adapter/examples/experiment-run.ts                     | 将可信模型设置传给每次路径调用日志                                                             |
| packages/model-adapter/examples/generation-diagnostics.ts             | 单轮、三轮、100 条长历史；本地故障和非法回复注入明确分开标注                                   |
| packages/model-adapter/examples/experiment-cases.ts                   | 精确采用附件关键输入，增加刻板印象批判和拒绝评分，案例从 11 增至 13                            |
| packages/model-adapter/examples/live-e2e.ts、local-http-acceptance.ts | 整合专项测试；真实验收完成条件同时核对案例数量、状态不变与生成异常                             |
| packages/model-adapter/tests/round8.test.ts、experiment-e2e.test.ts   | 故障事件、取消信号、重试与日志、连续历史、长上下文、情感回流和未来阶段标记回归                 |
| README.md、docs/step5-model-integration.md、本轮文档与验收目录        | 更新运行预算、下载材料和门禁说明                                                               |

实验阶段、评分触发、冻结观点和状态迁移权限保持原有后端规则。未新增正式实验刺激或量表。文字规则与演示策略仍需研究者审核，自动化通过不等于实验语义有效。

## 1. 当前模型调用架构图

```text
参与者显式结构化提交 → 后端 State Machine → 权威当前状态快照
                                               ↓
                                        AI Orchestrator
                                               ↓
                                  LanguageGenerator 接口
                                     ↙                ↘
                                MockAdapter     OpenAICompatibleAdapter
                                                       ↓ HTTPS
                                                 LLM Provider
                                               ↓ 候选文本
                                    Validator → 有限重试／兜底
                                               ↓
                               participantReply: text；内部运行日志
```

模型通信均通过 LanguageGenerator，状态机和实验路径不直接调用供应商。Adapter 不持有状态迁移函数、变量写入接口或数据库。完整实验流程由后端版本化路径维护，模型仅接收当前阶段语言任务及受限上下文。更换兼容模型无需修改状态机、前端或实验数据结构；其他原生协议需另一个 LanguageGenerator 实现。

## 2. Model Adapter 实现说明

OpenAICompatibleAdapter 使用非流式 Chat Completions，仅提交 model、messages、temperature、max_tokens、stream=false。凭据私有保存，不进入日志和序列化输出。使用 HTTPS、拒绝重定向、校验响应格式并限制读取大小。显式 loopback HTTP 只用于自动化测试，环境配置不能启用任意 HTTP。

每次 generate 只发一次请求，重试由编排层统一控制，默认总尝试 2 次、上限 3 次。401/403、无效请求和响应格式错误不可重试；429、5xx、网络异常可在预算内重试。文本违规也占同一预算，不无限重试。

超时通过 AbortSignal 通知 HTTP 请求取消；迟到结果不能被采用。失败只返回安全错误，生成故障的 rejected 审计记录 type=MODEL_GENERATION_FAILED，不生成 STATE_CHANGED 或 VARIABLE_UPDATED。Validator 拒绝文本记录违规原因，不伪称供应商故障；兜底为独立诊断结果。审计尚未持久化，不是已建成的数据库事件总线。远程服务是否停止计算和计费不能由取消信号证明。

日志包括 model_name、prompt_version、temperature、max_tokens、response_latency、retry_count、validator_result 和 fallback_count。response_latency 是整次编排耗时（毫秒）；retry_count=attempts−1，含违规文本再生成。旧调用者未传参数时为 null。参与者投影仅 text，不含后台状态、Prompt 或审计详情。

## 3. 真实模型调用示例与当前执行结果

以下是可执行接口用法，**不是本轮已取得的真实模型回答**：

```typescript
const { generator, settings } = createConfiguredGenerator(serverEnvironment);
const result = await orchestrate(trustedCurrentStageRequest, generator, {
  timeoutMs: settings.timeout_ms,
  maxAttempts: settings.max_attempts,
});
const reply = participantReply(result);
```

在云环境安全设置配置 MODEL_API_KEY 与账户可用的 MODEL_NAME。用户已选择 OpenAI 兼容服务；服务地址可配置，默认 https://api.openai.com/v1。不要把密钥发到聊天、写入反馈或提交 Git。既有配置草稿已保存秘密绑定要求；草稿中的建议值并不等于当前运行环境已注入变量，若环境界面要求发布或重启，需按其流程完成。

```bash
npm run live:e2e -- /tmp/step5-round8-live.json
```

本轮实际执行该命令，报告为 [live-e2e.json](acceptance/step5-round8/live-e2e.json)：缺少上述两个变量，退出 2，真实供应商调用 0。未使用假密钥或未鉴权检查冒充模型验收。

配置后完整计划为两条路径 16 次生成、13 个回归输入、单轮 1 次、多轮 3 次、长上下文 1 次，总计 34 次生成；默认最多 68 次 HTTP 尝试，上限设置 3 时最多 102 次。仅使用合成参与者资料，会产生供应商用量。失败路径可提前停止。

异常和 validator 拦截通过独立 localFaultInjection 明确记录为本地注入，真实供应商调用数为 0；真实服务错误或违规回答只有实际发生才能记录为真实观察。脚本生成的模型参数和原始生成证据仍需研究者逐条语义审核，semanticReview=pending_researcher_review。零退出码也不能自行开放业务层门禁。

## 4. 认知路径端到端测试结果

本轮使用真实 HTTP Adapter 连接本地模拟服务，**不是实际 LLM**。9 次阶段语言调用、10 次显式后端迁移，最终 completed：

STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION。

确认观点“我认为这种刻板印象是不合理的”在确认后冻结，四次重构读取同一观点，没有跳过阶段。初次／二次评分为模拟参与者显式提交的 5／3，不是模型生成的数值，也不是正式量表。

评分打断回归证明：聊天后 INITIAL_RATING 与评分变量不变；只有单独提交有效结构化评分，后端才推进。二次评分只能由最后一个重构阶段的合法提交触发。多观点回归固定参与者选定的评分对象，不让模型另选。

完整上下文、调用结果、迁移、日志与最终快照见 [local-http-e2e.json](acceptance/step5-round8/local-http-e2e.json) 的 cognitive。真实认知路径尚未运行。

## 5. 情感路径端到端测试结果

同样是本地 HTTP 模拟供应商。7 次语言调用、8 次显式后端迁移，最终 completed：

PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK。

scene_state 保持 library，scene_phase 随权威当前阶段改变，共 7 个阶段值。所有模型调用后状态保持不变。询问“现在是什么阶段”、跳场景、质疑 AI 身份、要求结束不能让语言层产生迁移或变量写入。

新增回归覆盖已知文字“重新认识”、跳海滩、未来阶段 RELATIONSHIP 的非法回复，均在预算内拦截、兜底，保持当前故事状态。此结论限于已知规则；隐含剧情回流、自然语言提前揭示未来情节仍可能漏检，必须通过真实模型和研究者语义审核评估。

完整记录见本地报告 emotional。真实情感路径尚未运行。

## 6. Regression Test 列表与验收成果

| 分类                 | 输入／断言                                                                    |
| -------------------- | ----------------------------------------------------------------------------- |
| 认知：拒绝群体归纳   | “我不认为黑人都这样”；冻结当前确认观点，不写变量                              |
| 认知：批判与元认知   | 批判刻板印象、反思思考方式；不得改归因                                        |
| 认知：多个观点       | 只使用已选择的评分对象；追加新对象或伪造引用标记仍拒绝                        |
| 认知：拒绝与打断评分 | 不代填数字、不推进；有效结构化提交才能恢复                                    |
| 认知：跳步骤         | 跳过重构或直接二次评分不能改状态                                              |
| 情感：最短回答       | “好的”；保留当前故事状态                                                      |
| 情感：问流程         | “现在是什么阶段”；不改阶段或场景                                              |
| 情感：改剧情与跳场景 | 海滩、咖啡馆跳转请求不能修改 scene_state                                      |
| 情感：质疑 AI 身份   | 不执行系统提示索取或控制指令                                                  |
| 情感：主动结束       | 语言层不能改完成状态；正式撤回需后端独立实现                                  |
| 恶意模型回复         | 自行推进、后台提示、换观点、目的披露、JSON 状态指令、回流和未来阶段标记被拒绝 |
| 模型异常             | 失败、超时、取消仅有诊断；有限次数、状态与变量不变                            |
| 上下文               | 单轮、连续三轮历史递增；100 条长历史只保留最后 6 条、每条最多 800 字符        |
| 日志                 | 配置参数、重试、耗时、校验结果；旧调用者未知参数 null；参与者仅 text          |

本轮新增 12 个测试（round8.test.ts 10 个，加两条参数化输入），全量 **307 个测试通过，0 失败、0 跳过，11 个测试文件**。类型检查、ESLint、Prettier、全部工作区构建均通过。本地测试结果不是 GitHub CI 状态。

本地 HTTP 记录共 34 次请求：认知 9、情感 7、回归 13、上下文专项 5。单轮／多轮最终 generated；多轮历史数量 0、2、4。长上下文输入 100 条，选择 6 条，每条最大 800 字符，旧历史标记被丢弃，所有状态不变。本地故障样例额外运行在内存中，不计 HTTP 或真实供应商调用。

可复现命令：npm ci；npm run check；npm run example:http。普通检查完全离线。真实验收另用 live:e2e，不会静默退回 mock。

## 7. 已知问题与下一轮门禁

1. 真实模型验收缺少密钥和模型名：目前没有真实回答、真实完整路径、真实异常或语义稳定性证据。此项是具体外部配置阻塞，不是测试通过。
2. Validator 是确定性文字规则，不能证明任意自然语言没有构念漂移、评分暗示、剧情回流或目的泄漏；可能漏检和误拦。
3. 状态恢复目前是内存纯函数／模块级链路测试，不是数据库断线恢复。授权、原子持久化、并发、日志投递和异步版本复查尚未实现。
4. 兼容接口不保证所有模型支持当前 Chat Completions 参数；Claude 原生协议尚未实现。没有 Retry-After 队列或供应商计费保证。
5. 主动退出的回归只证明模型不能改状态，不代表正式参与者撤回流程已实现。该流程需后续后端和研究协议定义。

下一轮先安全注入配置、实际运行 live:e2e、复核每条语言输出、重试／兜底、确认观点和场景一致性。只有真实模型验收与研究者语义审核通过后，才按 PostgreSQL 迁移 → 账号 → 管理后台 → 参与者聊天 → 数据导出的顺序小步开发，并继续每轮自动化测试。

## 发给 GPT 的材料

- [本轮 Word 反馈](eighth-round-feedback.docx)
- [全量自动化测试报告](acceptance/step5-round8/test-results.json)
- [本地 HTTP 验收成果](acceptance/step5-round8/local-http-e2e.json)
- [真实模型未运行报告](acceptance/step5-round8/live-e2e.json)
- [机器可读汇总](acceptance/step5-round8/summary.json)
- [配置与调用操作](step5-model-integration.md)

给 GPT 的复核提示：请区分本地模拟通过与真实模型 not_run，复核本轮诊断、指标和测试，不将 Step 5 判为全部通过；当前应协助完成配置与真实验收，不提前安排业务层开发。

完整 GitHub 项目 ZIP 包括全部源代码、历史文档、本轮 Markdown／Word、需求原文与上述验收 JSON。使用不可变提交链接下载，避免后续 main 更新导致材料版本混淆；下载后解压或直接上传 ZIP 给 GPT，不含 node_modules、缓存或真实密钥。
