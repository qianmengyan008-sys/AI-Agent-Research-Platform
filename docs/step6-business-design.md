# Step 6 数据库与业务层设计方案（第九轮提案）

本文是进入业务开发前的可复核方案，不是已实施的数据库、API 或界面。第九轮真实模型验收仍为 not_run，业务开发门禁关闭。第一轮 database.md 为历史提案；正式迁移以本方案的版本绑定、拆分消息和状态版本语义为后续讨论基准，不直接照抄旧字段。

## 1. 配置与复现模型

```text
Experiment Template
  → Published Template Version
    → Condition Version
      → Agent Configuration Version
      → State Machine Version（完整流程，只在后端）
      → Prompt Version Set（每个当前阶段一个策略）
    → Participant Assignment（固定全部版本和条件）
      → Experiment Session → State / Conversation / Variables / Audit
```

模板只描述实验配置组合；完整流程存于独立 state_machine_version，当前阶段语言策略存于 prompt_version。管理员在草稿中选择已注册路径、条件和 Agent，发布时校验兼容性，不能用任意 Prompt 改实验流程。运行中的分配固定全部引用，管理员修改草稿、发布新版本只影响之后的分配。

发布清单固定 template_version、condition_version、agent_version、state_machine_version、逐阶段 prompt_version、模型参数版本、素材／量表版本及规范化内容 SHA-256。保存发布人、时间、验证策略版本和实现代码提交号。模型名称及参数可追溯，但供应商服务变化、模型随机性意味着无法保证逐字复现；必须保存实际回复、校验和失败记录。

## 2. PostgreSQL 逻辑表

物理名采用 snake_case，UUID 主键、timestamptz 时间。下列名称满足本轮要求；不创建 SQL 迁移或安装数据库驱动。

| 表                                 | 主要字段与约束                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| participant                        | experiment_id、participant_code、password_hash、account_status；实验内编号唯一；密码不可导出                                                                          |
| admin_user、admin_membership       | 管理员身份及实验内角色；后续鉴权按实验范围限制访问                                                                                                                    |
| experiment_template                | 研究项目归属、模板名、草稿及发布版本入口                                                                                                                              |
| experiment_template_version        | template_id、version、发布状态、manifest_json、content_hash；已发布不可改                                                                                             |
| condition_version                  | template_version_id、condition_code、path_type、固定实验参数；版本内条件代码唯一                                                                                      |
| agent_configuration_version        | 人物／身份、风格、版本与 hash；不携带完整状态机流程                                                                                                                   |
| state_machine_version              | experiment_version 标识、路径、definition_json、definition_signature、content_hash；冻结后端阶段／事件／变量规则                                                      |
| prompt_version、prompt_version_set | 当前阶段 StagePolicy、阶段 ID、Prompt 实现版本、hash；一组版本覆盖所选路径所有有效阶段，禁止漏配或跨版本配错                                                          |
| model_configuration_version        | provider、model_name、temperature、max_tokens、timeout、max_attempts；不保存 API 密钥                                                                                 |
| experiment_assignment              | participant_id、发布配置、条件、Agent、状态机、Prompt 组和模型设置引用；初版一个参与者一个正式分配，启动后不可改                                                      |
| experiment_session                 | assignment_id、运营状态、退出原因／时间、chat_revision、created_at；运营撤回与核心流程生命周期分开                                                                    |
| experiment_state                   | session_id、stage、core_version、definition_signature、snapshot_json；保存完整 core 快照（包括 receipts）以便重放校验                                                 |
| conversation                       | session_id、channel、next_sequence、状态；初版每会话一个实验对话                                                                                                      |
| message                            | conversation_id、turn_id、sequence、role、content、生成状态、accepted_core_version、prompt_version_id、时间；顺序唯一                                                 |
| conversation_turn                  | session_id、客户端幂等键、request_hash、accepted_core_version、chat_revision、状态；同一请求重试返回原回合                                                            |
| state_transition                   | session_id、core_event_id、事件类型、from/to stage 与 version、actor、验证输入、返回回执、时间；事件 ID 会话内唯一                                                    |
| experiment_variable                | session_id、key、typed_value、revision、source_transition_id、recorded_stage；同一 key/revision 唯一，引用同会话迁移；不覆盖初次评分                                  |
| model_run_log                      | turn_id、模型配置版本、状态、总耗时、retry_count、fallback_count、validator_result、请求所依据状态／聊天版本与 hash、最终输出对应消息、validator 策略版本和实现提交号 |
| model_run_attempt                  | run_id、attempt_number、latency、provider_error_code、候选文本（受限访问）、validator_violations、审计结果；保留每次失败和被拒绝尝试                                  |
| generation_job                     | turn_id、status、lease_token、lease_until、attempts；事务内入队、后台租约执行、恢复可追溯                                                                             |
| admin_audit_log、export_job        | 谁何时修改／发布／分配／导出哪个实验，原因和结果；导出清单、快照截止点、文件 hash                                                                                     |

归属关系使用复合外键或同等约束，阻止跨实验引用条件、参与者、事件或版本。不能仅靠前端隐藏选项。发布状态与资源兼容性由服务层在发布事务内校验；应用账号不得随意修改已发布配置和历史审计。

八个必需实体映射：participant、experiment_assignment、conversation、message、state_transition、experiment_variable、prompt_version、model_run_log 均在上表。原 Participant 对应 participant；Experiment_State 拆为 experiment_session / experiment_state；Conversation 拆为 conversation / message；Path_Data 对应 experiment_variable。

## 3. 状态版本、变量与迁移事务

当前 core.version 是成功迁移数，且快照包含 receipts，不是所有聊天请求的计数。普通聊天不能递增 core.version，否则现有核心重放校验会失配。独立 chat_revision 跟踪聊天顺序；不要沿用第一轮“同阶段消息也增加状态 version”的提案。

显式阶段提交事务：验证身份和实验归属 → 锁定 experiment_state → 验证幂等键／请求 hash → 检查 expected_core_version → 调用现有 transition 纯函数 → 若成功同时保存快照、state_transition、experiment_variable 和回执 → 提交。任何失败全回滚。重复键同 hash 返回已保存结果；不同 hash 拒绝。版本冲突返回 409，不自动重新提交评分。

confirmed_viewpoint（语言上下文映射为 confirmed_belief）只来自参与者明确结构化确认；viewpoint_confirmed 为真后保持冻结。initial_rating / second_rating 分别保存，数值格式与范围来自批准量表配置。LLM 提取或解释只能是非权威候选，不进入 experiment_variable 或 transition 输入。否定和批判文本不能自动当成负面刻板印象；正式采集与确认协议需研究者明确，当前没有自动语义分类器。

结构化变量值初版遵循 core Scalar：字符串、数值、布尔。量表和复杂对象的扩展需另行版本化设计，不直接把任意 JSON 传给现有 core。

## 4. 聊天生成事务与恢复

接收聊天时：校验会话允许继续 → 锁定会话和状态 → 保持 core_version 不变，分配消息 sequence 与 chat_revision → 保存 user 消息、assistant 占位、turn 及 generation_job → 提交。每会话初版只允许一个正在生成的回合，避免历史交叉。

任务在数据库事务外调用 AI Orchestrator / LanguageGenerator。模型只生成候选文本，经 Validator、有限重试／兜底后产生结果。写回时重新锁定会话，核对 core_version、chat_revision、分配版本、任务 lease_token 与会话运营状态；任何不一致将结果标为 stale／cancelled，不能作为可见回复或触发迁移。

故障只保存 MODEL_GENERATION_FAILED 诊断和 message/run/job 状态；不调用 transition、不写实验变量。兜底也必须经过 Validator。参与者只能读取 text 和适当重试状态；内部 Prompt、模型错误、假设和诊断不返回。

服务重启后从持久化快照与 receipts 恢复，验证 definition_signature 与版本绑定。过期租约可重领，但以唯一助手消息槽与租约 token 防止重复写回。不保证供应商调用或计费恰好一次；任务重试与编排重试必须有统一总预算，不能相乘形成隐含无限重试。

正式退出／撤回走独立后端命令和审计，禁止把用户请求交给 LLM 决定。现有 core 未定义 terminated；业务初版可先用 session 运营状态关闭发送并取消未完成任务，是否增加核心终止事件另行研究协议评审和版本化，不能暗改运行参与者。

## 5. API 和前后端模块提案

后端增加配置仓储、参与者认证、管理员权限、ExperimentService（唯一迁移入口）、ConversationService、GenerationWorker、审计及 ExportService。保持 experiment-core 无数据库／网络依赖，ai-orchestrator 无迁移权限，model-adapter 只负责通信。

| API 类别                 | 拟提供的能力                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Participant auth         | 登录、注销、会话恢复；初版实验编号与初始化口令，口令只保存安全 hash                         |
| Participant experiment   | 读取自己的当前状态投影／必要表单，明确提交当前阶段数据；不接受任意 stage 或 variables PATCH |
| Participant conversation | 创建幂等回合、轮询生成结果和消息分页；初版采用轮询，后续再评估流式需求                      |
| Participant withdrawal   | 按研究协议退出并取消任务；独立后台权限、幂等和审计                                          |
| Admin configuration      | 创建／编辑草稿、校验／发布、分配条件和 Agent；禁止 PUT 正在运行的 state                     |
| Admin observation        | 按实验权限查看参与者状态、消息、变量和模型运行诊断                                          |
| Admin export             | 创建导出任务、查看状态、授权下载可追溯数据集                                                |

前端参与者模块为登录、当前阶段表单、聊天与恢复；管理员模块为模板／条件／Agent 配置、参与者与分配、只读观察、导出。React 页面只展示后端当前可操作表单；不把未来流程或实验假设注入模型 Prompt 或参与者界面。

“好的”应得到自然回复，是否推进阶段仍取决于合法后端事件；“现在是什么阶段？”的回复质量由研究者定义，语言层不得披露禁止的控制文本或改变状态。“直接跳到结尾”不能改 state；正式退出权限仍独立提供。

## 6. 导出与追踪

初版导出 ZIP 含 manifest.json、participants.csv（去凭据）、assignments.csv、messages.csv、state_transitions.csv、experiment_variables.csv、model_run_logs.csv。单次一致性数据库快照生成，保留阶段、来源事件、版本、状态和失败标记，明确 pending / stale / fallback。变量导出保留每个 revision，避免仅取最新值而丢失评分历史。

manifest 列出实验／条件／Agent／状态机／Prompt／模型版本、导出截止点、行数及文件 hash。受限原始候选回复的导出需明确研究者权限，不默认把所有内部 Prompt 混入普通数据集。CSV 转义公式，统一 UTF-8、带时区时间；密码、会话令牌、供应商密钥永不导出。验证导出可关联回原始事件和消息。

## 7. 实施顺序及自动化验收

0. 先关闭 Step 5 阻塞：安全配置、真实路径和回归执行、语义逐项审核，记录谁批准了何版本。通过后才开始下列实现。
1. PostgreSQL 第一批迁移：配置版本、参与者、分配、状态、事件、变量；采用空库迁移和回滚／恢复演练验证，并发幂等和事务失败测试。
2. 发布与配置 API：冻结发布清单，验证跨实验引用拒绝、草稿不影响已有分配、运行中分配不可改。
3. 参与者认证与提交 API：权限隔离、版本冲突、冻结变量保护、重复评分提交、重启恢复。
4. 聊天任务与模型日志：超时无状态写入、有限重试、租约恢复、迟到回复丢弃、退出取消，真实数据库集成测试。
5. 最小管理员和参与者页面：通过既有 API，验证两条完整路径、断线恢复、只读观察；不在前端实现状态机。
6. 导出：一致性、完整性、版本追踪、权限、CSV 处理与文件清单校验。

每步只做可验收的小范围提交并运行自动化测试。供应商真实测试保持手动明确运行，不能将密钥依赖或收费调用放进普通 CI。业务验收必须含 PostgreSQL 集成和浏览器端到端测试，不能用当前内存／本地 HTTP 单元链路代替。

该顺序是提案，不是授权跳过 Step 5 的计划。正式心理学素材、量表、否定表达的采集规则、参与者退出流程需要研究者确定后固定成版本，不由模型或开发者自行决定。
