# 第十九轮 Acceptance Report：真实模型验收与正式实验就绪评估

日期：2026-10-11（北京时间）。依据[原始要求](inputs/nineteenth-round-requirements.docx)。**正式结论：not_ready。工程回归通过，真实供应商验收 not_run，研究者语义审核 pending。** 本报告记录已执行与未执行项，不构成正式实验放行。

## 1. 环境与真实模型结果

| 检查           | 本轮实际观察                                                              | 正式目标环境                 |
| -------------- | ------------------------------------------------------------------------- | ---------------------------- |
| Node／npm      | Node 24.19.0、npm 11.9.0                                                  | 未部署、待验证               |
| npm 依赖       | npm ls --depth=0 成功；既有锁文件与依赖未改                               | 目标环境需按 npm ci 复现     |
| 数据库／Docker | Docker 28.4.0；测试运行真实 PostgreSQL 17.7，显式迁移 001／002／003       | 外部持久 DATABASE_URL 未配置 |
| 浏览器         | Chromium 154.0.8037.57；真实 Vite／Express 浏览器操作                     | 正式 HTTPS 环境未配置        |
| 变量           | MODEL_API_KEY／MODEL_NAME／DATABASE_URL／ADMIN_ACCESS_TOKEN_HASH 均未设置 | 阻塞；凭据只通过安全设置配置 |
| 模型绑定       | 云环境 draft 已声明需求，但 MODEL_API_KEY 无有效绑定                      | 不能把配置声明当实际凭据     |
| 真实命令       | 实际执行 live:business:e2e，退出 2、not_run、调用 0、数据库未启动         | 真实模型未验收               |

证据：[本轮环境检查](acceptance/step6-round19/environment-check.json)、[依赖树](acceptance/step6-round19/dependency-tree.json)、[真实模型报告](acceptance/step6-round19/real-model-business-report.json)、[机器环境与结论](acceptance/step6-round19/acceptance-report.json)。真实 latency／retry_count／validator_result／fallback_count 为 null，没有伪造测量。真实 model_name／provider／temperature／max_tokens 尚无已运行配置；正式报告不能使用本机 fixture 参数代替。

既有真实命令已具备配置 → OpenAI 兼容 Adapter → 当前阶段 Orchestrator／Validator → 真实业务 API → 合法明确 core 提交 → PostgreSQL 状态、事件、变量、消息和日志的链路。模型不会触发状态迁移；Validator 的拒绝不会变成实验事件。本轮按用户选择交付阻塞报告与审核工具，补充验收 observation 追踪与离线表格生成；核心状态机、编排、Adapter、migration、依赖、前端、Prompt 结构及实验变量设计均未修改。

手动配置后运行：

```bash
npm run live:business:e2e -- /tmp/round19-real-business.json
```

使用合成账号和自己创建的临时 PostgreSQL，忽略外部 DATABASE_URL，不在正式库建实验；缺配置先退出，不启动服务／模型／数据库。正常 18 个语言回合，默认最多 36 个 Adapter 尝试，上限 54；不得自动付费重跑。报告不含凭据、原始供应商异常或完整 Prompt，返回合成结构化数据。

配置、退出码和延迟门槛的完整操作沿用[验收清单](experiment-acceptance-checklist.md)。MODEL_ACCEPTANCE_MAX_LATENCY_MS 默认 10000ms 是工程门槛，超标退出 1；completed 或 guarded 都仍 formal_ready=false、semantic_review=pending_researcher_review。未来实际报告需研究者审核后脱敏留存，不能直接提交真实研究数据到 GitHub。

## 2. 功能和异常 Acceptance

| 功能             | 工程结果与边界                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| 登录／说明／分配 | 真实浏览器与真实 HTTP 登录通过，发布条件与版本固定；无正式账号或招募                                 |
| 发送／AI 回复    | 本机 OpenAI 兼容协议服务运行 18 次 Adapter 调用，两路径完成；不是外部 LLM                            |
| 状态推进         | 仅明确合法提交；聊天与中断不改变 core snapshot／事件／变量；重放不多生成或推进                       |
| 数据保存         | 真实 PostgreSQL 保存 user／assistant 槽位、事件、来源变量、模型日志；8 类 SQL 完整性检查通过正常数据 |
| 导出             | 指定分析字段、路径和版本关联通过；complete=false／各类最多 1000，正式全量归档阻塞                    |
| 管理员／Pilot    | 默认关闭，认证后显式勾选的只读诊断；参与者无内部阶段／事件／Prompt／Validator／模型日志              |

| 异常           | 本轮重新执行结果                                                                              |
| -------------- | --------------------------------------------------------------------------------------------- |
| 网络丢失       | 已落库回复同键重放，模型不重复生成；提交重放仅一次迁移                                        |
| 模型失败       | 保留 user 与 failed/null assistant，核心版本与变量不变，受控错误码入库                        |
| 违规输出       | 本机注入研究目的泄露／跳阶段，Validator 拒绝后重生成／安全兜底；报告标 guarded                |
| 模型超时       | 10ms 合成超时、两次取消信号，GENERATOR_TIMEOUT 记录；不推进 state 或变量                      |
| 重复请求／双击 | 同键同内容返回原结果，每回合两槽位；同键异内容拒绝                                            |
| 页面刷新       | 连续 3 次 reload／重新登录，assignment／state／source／消息／事件与之前相同                   |
| 服务重启／恢复 | 本轮真实 API SIGKILL／新进程、新 Pool 与过期 lease 回归通过；不是数据库主机断电或正式备份演练 |

[本机完整 HTTP 链路](acceptance/step6-round19/local-business-acceptance.json)、[违规拦截](acceptance/step6-round19/guarded-business-acceptance.json)、[失败](acceptance/step6-round19/failed-business-acceptance.json)、[超时](acceptance/step6-round19/timeout-business-acceptance.json)、[恢复汇总](acceptance/step6-round19/recovery-results.json)、[多次刷新](acceptance/step6-round19/browser-multiple-refresh-records.json)。本机异常不是已观察到的真实供应商错误。

## 3. 认知路径最终验收

STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION → COMPLETED。

本机协议服务完成 9 个明确阶段、10 个语言回合（评分中断额外 1 次）、20 条消息、10 个模型日志和 10 次含初始化迁移。每次聊天均检查核心／变量／事件不变，消息和明确提交重放均不增加调用或推进。

既有 inspectPathRecords 是纯只读验收函数，检查固定身份、路径、版本、准确阶段顺序、完成状态／版本、各分析历史与本 session 一致、必需字段、固定模型／Prompt、所有变量来源及已有 SQL 质量结果。

| 认知专项断言                   | 本轮结果 | 含义                                                                           |
| ------------------------------ | -------- | ------------------------------------------------------------------------------ |
| confirmed_belief_frozen        | true     | 别名与 core confirmed_viewpoint 都只有一条，等于明确确认值且 snapshot 一致     |
| ratings_linked_to_fixed_belief | true     | 两次别名值与 core 评分一致，同一固定 session／观点，来源分别为初／二次评分事件 |
| all_four_reframes_with_sources | true     | 四个重构变量均存在且唯一，来源阶段和明确提交 response 一致                     |
| exact_stage_sequence           | true     | 所有已保存迁移阶段严格等于固定 v1 定义，含完成阶段                             |

故意修改**内存中的导出副本**，包括缺 path_type、错误路径／完成版本／Prompt／阶段顺序、改确认观点、改评分来源、丢重构响应，共 8 个副本都得到 passed=false；查询数据库前后 snapshot 一致。没有修复／篡改真实或测试库的历史记录。

[认知专项](acceptance/step6-round19/cognitive-special-acceptance.json)、[副本拒绝证明](acceptance/step6-round19/structural-proof-cognitive_v1.json)、[浏览器完整路径](acceptance/step6-round19/browser-cognitive-complete.json)。结构上的评分对象固定不证明自然语言没有评分暗示或未表达观点；真实模型认知专项 not_run，语义须人工审核。

## 4. 情感路径最终验收

PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK → COMPLETED。

本机协议服务完成 7 个明确阶段、8 个语言回合（询问规则额外 1 次）、16 条消息、8 个模型日志和 8 次含初始化迁移。规则询问不修改人物／已保存场景／阶段／事件；只有明确表单合法提交更新场景研究别名。

| 情感专项断言                           | 本轮结果 | 含义                                                                  |
| -------------------------------------- | -------- | --------------------------------------------------------------------- |
| scene_phase_follows_events             | true     | 每条 scene_phase 等于其来源迁移的 current_state                       |
| scene_state_only_from_explicit_payload | true     | 四次场景记录来自允许的明确阶段，值等于相应 validated_payload.response |
| exact_stage_sequence                   | true     | 固定阶段按顺序完整执行，没有后端阶段回退                              |

缺字段、错误路径／版本／Prompt／阶段顺序、错场景阶段、未经明确提交的场景值，共 7 个副本都被拒绝，数据库 snapshot 不变。[情感专项](acceptance/step6-round19/emotional-special-acceptance.json)、[副本拒绝证明](acceptance/step6-round19/structural-proof-emotion_v1.json)、[浏览器完整路径](acceptance/step6-round19/browser-emotion-complete.json)。

后端阶段不回退不等于模型语言没有剧情回溯／提前结局；真实模型情感专项 not_run。scene_state 仍是研究者尚待定义 schema 的明确文本，不把四条别名当正式世界状态实现。

## 5. 数据导出示例与质量

[实际合成导出](acceptance/step6-round19/analysis-export.json)与[浏览器实际下载](acceptance/step6-round19/browser-admin-export.json)包含 analysis_rows：participant_id、experiment_id、condition、path_type、agent_version、prompt_version、model_version、conversation_history、state_transition、experiment_variables、model_run_log（兼容 model_runs）。固定 assignment／session 关联，不混入其他账号。

8 类数据库质量计数重新验证：会话／消息无状态、状态／event 不匹配、事件链间隙、变量无合法来源、回合槽位不齐、ready 无回复、ready 无模型日志。正常记录计数为 0；[故障注入](acceptance/step6-round19/integrity-fault-injection.json)必须 false，无来源／改历史被外键及不可变触发器拒绝。

既有结构检查对小规模合成验收导出独立核对，能识别“data_quality 标为 true 但副本字段被改”的矛盾。其范围是完整跑完的单一合成 assignment，不是通用全量多会话分析审计，更不是语义批准。

仍 complete=false／每类 1000，正式全量归档与分析 schema 未通过。requested_model 不等于供应商修订号；supplier_revision=null、token_usage 未采集。不能因为字段齐全或结构通过而认定已满足正式心理学分析需求。

## 6. Pilot Mode 与压力测试

Pilot Mode 是现有管理员只读开发模式的内部试运行流程，**没有另建实验分支、状态机、变量或新的模型调用**。服务 ADMIN_DEVELOPMENT_MODE 默认 false；需显式 true、管理员认证和页面复选框三项同时满足，才能查看状态、事件、变量、模型日志、响应耗时、Validator 和异常。参与者模式不显示诊断。

既有页面明确“内部试运行（Pilot Mode）”及用途。浏览器验证默认未勾选、勾选后五项诊断可见、取消后关闭；读取前后 state／variables／messages／transitions 完全相同，切回参与者没有内部字段。[Pilot 实际截图](acceptance/step6-round19/admin-pilot-mode.png)、[Pilot 记录](acceptance/step6-round19/browser-pilot-mode-records.json)。正式参与者服务保持 false，不自动开启调试。读取仅增加管理员审计。

本轮重新运行三路径各 30 轮约 3600 字符输入、最多 6 条各 800 字阶段历史、6 人各 5 轮并发，共 120 本机压力回合／240 槽位；消息有序、身份隔离、核心／变量不漂移。[压力结果](acceptance/step6-round19/stress-results.json)记录实际本机耗时。服务重启、超时、刷新和网络恢复见异常报告。

没有真实模型 20–30 轮压力、供应商额度、目标规模持续负载或正式容量结论。SIGKILL 测试显式使租约到期，未做数据库主机断电／生产备份恢复。本机成功不能外推正式上线容量。

## 7. 当前阻塞与正式就绪判断

[逐项正式门禁评估](acceptance/step6-round19/formal-readiness.json)记录九类门禁、证据和解除动作；这是本轮报告，不是新增运行时控制模块。**formal_ready=false。** 模型密钥与明确模型名未配置，真实供应商测试没有执行。正式持久库、管理凭据、HTTPS 部署、备份恢复、目标规模运维／持续负载尚未验收。全量归档、正式量表／必填来源／结构化场景／拒答与自愿退出方案、真实语义审核仍阻塞。

单一 bootstrap 管理员、进程内限流、无主动后台恢复队列／消息分页、未知供应商修订号和 token_usage、同实验多模板版本服务未实现等边界保留。Pilot 只提供内部诊断，不解除这些阻塞。

完整 npm run check 退出 0，类型、lint、格式、测试与所有工作区构建通过。实际工程报告：417 Vitest、15 Playwright，432 passed、0 failed／skipped，业务／API 67 项；本轮新增 8 项审核工具测试；业务／API 和 Pilot 浏览器回归保留。[测试](acceptance/step6-round19/test-results.json)、[浏览器](acceptance/step6-round19/browser-results.json)、[汇总](acceptance/step6-round19/summary.json)。本轮证据由重新执行生成，未从第十七轮复制测试结果。正式报告 Word 与此文档同内容。审核工具见[操作说明](round19-semantic-review-guide.md)，真实审核表为 0 条，认知／情感语义 not_run，pilot_ready=false。

[模型安全配置与语义审核指南](round18-live-model-guide.md)列出具体解除阻塞步骤；[本轮真实审核表](acceptance/step6-round19/real-model-semantic-review.md)按实际 not_run 报告生成，尚无可审核回复，不是语义验收证据。用户明确选择本轮先交付阻塞报告与审核工具；真实模型 Pilot 不放行。

下一步在安全环境设置绑定模型并明确模型名，手动运行已有真实入口、研究者审核合成真实回复；再完成正式研究 schema／退出流程、全量归档和目标环境验收。继续采用[正式实验前清单](pre-experiment-checklist.md)与[真实验收清单](experiment-acceptance-checklist.md)，无需优先扩展架构或 UI。

## 8. 复现与材料

Node 24、Docker、Chromium 为前提。npm ci、npm run check 是普通工程流程，不调用真实模型。显式更新本轮 UUID／时间／截图时才执行：

```bash
mkdir -p docs/acceptance/step6-round19
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round19 npm test -- --reporter=json --outputFile=docs/acceptance/step6-round19/test-results.json
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round19 BROWSER_REPORT_PATH=docs/acceptance/step6-round19/browser-results.json npm run test:browser
```

[验收目录](acceptance/step6-round19/)包含真实 not_run、本机 HTTP、两条专项、15 个副本拒绝证明、10 类干扰、异常／恢复／压力、依赖树和七张真实截图；与反馈 Word、此 Acceptance Report Word、真实审核表 Word、原始要求及全部历史成果一并纳入整个项目 ZIP。普通 check 不覆盖已提交材料。
