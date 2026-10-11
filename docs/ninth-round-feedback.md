# 第九轮反馈：真实模型端到端验证与业务开发准备

供 GPT 复核并指导下一轮 Codex 工作。需求原文：[第九轮反馈](inputs/ninth-round-requirements.docx)。本轮完成指定回归补充、一个场景保护缺口修复、日志来源字段和下一阶段设计提案。

**结论：工程回归通过；真实模型端到端验收未完成；暂不满足进入 Step 6 业务实现的条件。** 运行环境仍缺少 MODEL_API_KEY、MODEL_NAME；本轮真实脚本实际执行后退出 2，报告 not_run、外部供应商调用 0。云环境配置草稿有密钥要求，但 has_saved_binding=false；模型名只是待配置建议值，不是运行时值。没有将本地模拟通过认定为真实验收通过。

## 修改原因、文件、测试与实验影响

| 修改文件                                                            | 原因与结果                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| packages/ai-orchestrator/src/response-validator.ts                  | cafeteria.seated 下“跳回图书馆”此前可通过；增加当前食堂就座阶段的图书馆回跳拦截。补全“重新打饭”动作写法 |
| packages/ai-orchestrator/tests/round9.test.ts                       | 7 个测试：食堂回流、场景阶段相关判断、初次评分越阶段、冻结观点替换、否定表达无变量写入                  |
| packages/model-adapter/src/experiment-log.ts                        | 每次内部日志新增 provider；未知时 null，合法值校验，不把任意文字当供应商来源                            |
| packages/model-adapter/examples/experiment-cases.ts                 | 增加精确否定表达、带问号流程询问、直接跳结尾，验收输入从 13 增至 16                                     |
| packages/model-adapter/examples/generation-diagnostics.ts           | 增加明确标注的本地超时注入与取消观测；不计真实供应商调用                                                |
| packages/model-adapter/tests/experiment-e2e.test.ts、round9.test.ts | 3 条参数化回归加 4 个报告来源／超时测试，共新增 14 个测试                                               |
| README.md、docs/step5-model-integration.md                          | 更新本轮入口、调用预算和实际验收限制                                                                    |
| docs/step6-business-design.md、本轮反馈和验收目录                   | 业务层／数据库设计提案、原始需求、Markdown／Word 与机器可读证据                                         |

没有修改 experiment-core、实验事件／变量定义、前端、API、数据库、供应商通信协议或工作区依赖。没有部署，未连接 WorkBuddy。场景约束加强会影响原先错误放行的回复能否展示，但不改变路径顺序或实验变量；正式素材和规则仍需研究者审核。业务层文档是设计，不是已实现功能。

## 1. 真实模型端到端测试结果

本轮已运行真实入口命令，保留实际状态与非零退出码：

```bash
npm run live:e2e -- /tmp/step5-round9-live.json
```

[本轮真实验收报告](acceptance/step5-round9/live-e2e.json)：status=not_run、reason=missing_configuration、missing_variables=[MODEL_API_KEY, MODEL_NAME]、realProviderCalls=0。不存在可供展示的真实回复、真实模型参数测量、真实超时或异常内容样例。

单轮、多轮、长上下文、两条完整路径和指定回归的可执行工具已准备。配置后计划 37 次生成：认知 9、情感 7、回归 16、单轮 1、多轮 3、长上下文 1；默认最多 74 次请求尝试，配置上限为 3 时最多 111 次，可能产生服务商费用。脚本不静默退回 mock；生成故障或被阻断将报告失败。实际文本仍需逐项人工审核。

每次路径／专项调用记录 model_name、provider、temperature、max_tokens、response_latency（整次编排耗时，毫秒）、retry_count（attempts−1）、validator_result、fallback_count。逐回归回合的 fallback_count 为该回合值，路径 logs 为该模拟会话累计值；不要混用为供应商账单。未知模型参数或 provider 不猜测，旧调用者为 null。

**本地 HTTP 验收结果（非 LLM）：** 37 次真实 loopback HTTP 请求；认知和情感最终 completed，16 个回归均 generated，语言调用前后状态不变。连续三轮历史长度 0、2、4；长历史 100 条裁剪到 6 条，每条最多 800 字符，旧标记被丢弃。

认知顺序：STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION。9 次语言调用、10 次显式后端迁移；确认观点冻结；四次重构无跳过；二次评分只能由后端合法事件触发；打断评分需独立合法提交后恢复。

情感顺序：PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK。7 次语言调用、8 次显式后端迁移；scene_state=library，scene_phase 分别为当前后端阶段；询问流程或跳结尾不能修改状态。cafeteria.seated 是独立可信策略回归夹具，不是本轮新增正式路径。

本地异常注入另外验证：不可重试错误 1 次；非法回复最多 2 次后兜底；超时最多 2 次，收到 2 次取消信号通知，记录 GENERATOR_TIMEOUT / MODEL_GENERATION_FAILED，状态不变。这些内存注入不计 37 次 HTTP 请求，不是供应商真实故障。已有 Adapter 测试继续覆盖本地 HTTP 超时、401/403、429、5xx、无效 JSON／非文本／工具调用等。

## 2. Regression Test 列表与证据

| 本轮重点                                         | 自动化已证明的范围                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| “我不认为所有美国黑人都这样。”                   | 在 STEREOTYPE_CAPTURE，negative_stereotype 仍为 null，未生成任何变量或迁移；模型回复只作为文本 |
| 多个观点                                         | 使用参与者已明确选择的单一 confirmed_belief，不替换评分对象；既有精确引用与伪造标记测试保留    |
| 拒绝／打断评分                                   | 当前 state 不变、不填评分；显式有效提交才恢复                                                  |
| 要求跳过步骤                                     | 不写 state、不自动进入二次评分或完成                                                           |
| “好的”                                           | 本地自然回复通过文本校验；是否阶段推进仍由独立合法后端事件控制                                 |
| “现在是什么阶段？”                               | 故事状态不变；不授予模型控制权限。真实回复是否妥善回答问题仍待语义审核                         |
| “直接跳到结尾。”                                 | SHARED_EXPERIENCE 保持，不能跳过流程；正式退出另需后端协议                                     |
| cafeteria.seated：重新打饭／重新认识／跳回图书馆 | 非法回复被拦截和兜底，当前状态不变；允许当前座位自然午餐交流                                   |
| INITIAL_RATING：“现在进入认知重构阶段”           | 根据当前状态拦截，不能推进重构                                                                 |
| 冻结观点后重新总结                               | 已知替换表达被拦截；任意隐含改写仍需真实语义评估                                               |
| 模型超时／异常内容                               | 取消通知、有限重试、安全错误和 Validator；无变量或状态副作用                                   |
| 日志来源                                         | provider 可信配置记录，未知为 null；本地注入明确标注 mock / local-fault-injection              |

全量 **321 个测试通过，0 失败、0 跳过，13 个测试文件**，本轮新增 14 个。[测试报告](acceptance/step5-round9/test-results.json)、[16 个回归的输入与指标](acceptance/step5-round9/regression-results.json)、[完整 HTTP 链路](acceptance/step5-round9/local-http-e2e.json) 可逐项复核。类型、lint、格式与六个工作区构建通过；GitHub CI 状态须另看仓库页面。

重要边界：当前不存在自动“负面刻板印象分类器”。上述否定表达测试证明不会由聊天自动落库或改变量，不能证明真实模型永不误解否定含义，也不能将现有 stereotype_text 字段名称当作已经完成语义分类。现有原始表达与冻结观点只有显式结构化提交产生；正式采集规则仍待研究者确认。

## 3. 当前架构状态与 Validator 能力

```text
Experiment State Machine（后端完整流程和显式事件）
    ↓ 可信当前状态
AI Orchestrator（Context / 当前 Prompt / Validator / 有限重试与兜底）
    ↓ LanguageGenerator
Model Adapter（Mock 或 OpenAI 兼容 HTTP）
    ↓
LLM Provider（仅候选自然语言）
```

检查调用入口：生产源码中供应商 endpoint 和 Authorization 只在 model-adapter/providers/openai-compatible-adapter.ts；前端 fetch 仅调用原有 health 接口。状态机不依赖供应商，模型不可创建变量、提交迁移或拿到数据库。正常输出、重新生成和兜底均经过 Validator；调试 Prompt 和日志只留内部。

Validator 结合当前阶段、冻结观点、scene_state / scene_phase、禁止动作和历史回复检查一致性，不能把它描述为完全与上下文无关的简单词表。例如同一句“去打饭吧”在 cafeteria.seated 被拒绝，在非 seated 的测试策略下不触发这个特定限制；这不表示其他场景已经拥有完整生产策略。

同时，**它仍主要依赖确定性文字规则，不是完整语义判别系统**。结构化控制权限由类型与调用边界隔离，语言层隐含改写、绕写泄露、否定理解和剧情逻辑仍可能漏检／误拦。因此本轮不能声称满足所有语义验收要求。不能通过模型自报“校验通过”绕过后端 Validator。

## 4. 是否满足进入业务开发的条件

**不满足，业务实现门禁关闭。** 原因包括：真实配置未注入；真实模型调用未执行；真实认知／情感／压力场景结果不存在；研究者语义审核未完成。

云环境已有 MODEL_API_KEY 的需求和 api.openai.com 的允许目标，本轮没有重复添加或替换设置。请在当前云环境设置安全填写密钥和 MODEL_NAME，按界面要求保存并发布／应用至运行环境，再执行真实脚本。密钥不要发送聊天或提交 Git；若使用自定义服务，需同步调整服务 HTTPS 地址、网络目标和密钥绑定域。建议值不是已绑定的运行变量。

门禁通过须同时具备：实际供应商生成证据；完整路径与压力输入执行；失败不改状态、输出受校验；观点和故事一致性逐条审核；研究者批准具体模型／参数／策略版本。零退出码、模拟测试数量或一句“通过”都不能代替这些证据。

## 5. 下一阶段数据库和业务层方案

完整提案见 [Step 6 业务层与数据库设计](step6-business-design.md)。仅准备设计，不创建迁移、不安装驱动、不开发 UI。

配置链为 Experiment Template → 已发布模板版本 → Condition → Agent Configuration / State Machine Version / Prompt Version Set。发布版本不可变，参与者分配固定全部引用和模型设置；管理员只能编辑草稿、发布新版本、创建分配、观察或导出，不允许直接改正在运行参与者的 state。

覆盖 participant、experiment_assignment、conversation、message、state_transition、experiment_variable、prompt_version、model_run_log，并补充模板／条件／Agent／路径版本、会话和快照、逐次模型尝试、任务租约、管理员审计及导出清单。

重要实现边界：现有 core.version 是成功迁移计数，聊天顺序另设 chat_revision；不能将普通聊天累加到 core.version。显式迁移以状态锁、版本和幂等校验执行，状态、事件、变量与回执原子提交。生成在事务外进行，写回前重新核对状态版本、聊天版本、分配和任务租约；迟到回复废弃，故障只写生成日志。

复现保存版本清单、内容 hash、实际消息、逐次候选／校验与迁移来源。复杂量表类型、正式退出和同意协议需后续版本化评审，不能擅改当前 core。导出使用一致性快照、版本化变量和 manifest，不含密码、令牌或模型密钥。

Step 5 通过后的实施顺序：数据库迁移与事务集成测试 → 版本发布和配置 → 参与者认证／显式提交 → 聊天任务和日志 → 最小管理员／参与者页面 → 数据导出。每步独立验收，不同时铺开全部层。

## 已知限制和交给 GPT 的下一步

真实模型凭据阻塞未解除；不能交付真实回答。确定性 Validator 的语义覆盖有限。现有端到端是模块级内存状态机加本地 HTTP，不是 PostgreSQL／浏览器／账号链路。正式量表、人物和场景材料、负面表达采集与撤回协议需要研究者固定版本。

请 GPT 首先复核本轮报告和 Step 6 提案，确认 not_run 与门禁关闭；帮助用户完成安全配置并安排真实模型逐项验收。不要仅因为 321 个本地测试通过就进入数据库或大规模 UI 实现。

本轮下载材料：[Word 反馈](ninth-round-feedback.docx)、[需求原文](inputs/ninth-round-requirements.docx)、[测试报告](acceptance/step5-round9/test-results.json)、[回归列表](acceptance/step5-round9/regression-results.json)、[本地验收](acceptance/step5-round9/local-http-e2e.json)、[真实 not_run](acceptance/step5-round9/live-e2e.json)、[汇总](acceptance/step5-round9/summary.json)、[Step 6 提案](step6-business-design.md)。完整项目 ZIP 包含这些材料和历轮源代码／文档，不含依赖目录、缓存或真实密钥。
