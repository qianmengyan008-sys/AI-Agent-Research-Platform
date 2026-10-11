# 第十五轮：稳定性验收与正式实验准备

日期：2026-10-11（北京时间）。依照[本轮原始要求](inputs/fifteenth-round-requirements.docx)，本轮集中完善只读调试关联、数据质量与稳定性证据。experiment-core、AI 编排、Adapter、001／002／003 migration、依赖和 Participant 交互逻辑保持既有设计。

## 1. Pre-experiment checklist

新增[正式实验前检查清单](pre-experiment-checklist.md)，涵盖数据库迁移、API、登录、分配、AI、合法推进、数据保存和导出八项。[机器检查单](acceptance/step6-round15/pre-experiment-checklist.json)分别标记工程结果和正式 not_run／blocked。

本机没有独立 DATABASE_URL、MODEL_API_KEY、MODEL_NAME 或 ADMIN_ACCESS_TOKEN_HASH。当前默认开发模式关闭；测试服务显式启用，仅用于管理员 UI 验收。不会向 WorkBuddy 读取代码、数据库、账号或配置，也没有使用其线上资源。

## 2. Participant 流程结果

真实 Chromium／Vite 代理／Express／Service／Repository／PostgreSQL 跑通登录、实验说明、固定分配、聊天、明确提交、加载、自然错误提示、对话顺序、刷新重新登录和历史恢复。认知完整流程保存 18 条消息、10 次迁移、9 个模型日志；情感保存 14 条消息、8 次迁移、7 个模型日志。

重复点击／响应丢失重放不增加槽位或迁移；旧 state_token 拒绝后可刷新继续。模型失败保留 user，assistant 是 failed/null，提示重新发送；不会把未通过校验的文本显示给参与者。之前 source 和核心版本保持。聊天计数 chat_revision 增加，core_version 不变；这两个计数不可混淆。

参与者接口与页面没有内部阶段名、事件名、Prompt、Validator 或模型日志。日志的内部 state_before／after 不传入 Participant 接口；Admin 入口仍须独立管理员认证。

证据：[认知完整记录](acceptance/step6-round15/browser-cognitive-complete.json)、[情感完整记录](acceptance/step6-round15/browser-emotion-complete.json)、[失败恢复](acceptance/step6-round15/browser-recovery-records.json)、[浏览器报告](acceptance/step6-round15/browser-results.json)。[登录截图](acceptance/step6-round15/participant-login.png)、[聊天截图](acceptance/step6-round15/participant-chat.png)是实际合成数据页面。

## 3. Admin 流程结果

管理员可查看实验列表及模板 v1／发布状态、条件／参与者分配、当前阶段和 core_version、按序消息（包括 failed 状态）、限量 JSON 下载。固定 Agent／Prompt／状态机／模型版本在导出 analysis_rows 中可核对；完整编辑器或同实验新模板版本服务仍未实现。

默认关闭的只读开发模式保留既有权限要求和 DEVELOPMENT_VIEWED 审计，新增回合关联 debug_log、明确事件 event_log、异常记录和 data_quality。异常记录列出失败／阻塞／迟到／取消／兜底；响应耗时与 validator_result 可直接查看。开启／查询不会改变状态、变量、消息或模型结果。

新增真实浏览器验收：经历模型失败→恢复→管理员查看版本、完整合成对话、失败日志、耗时、Validator 与质量结果，前后数据库实验内容一致。默认关闭／参与者越权／诊断隔离的既有 API 测试继续通过。

证据：[管理员完整操作](acceptance/step6-round15/browser-admin-stability-records.json)、[只读调试关联](acceptance/step6-round15/debug-log.json)、[真实调试截图](acceptance/step6-round15/admin-stability.png)、[实际下载 JSON](acceptance/step6-round15/browser-admin-export.json)。页面与导出仍各类限量 1000，超过限制时不保证显示完整，不将“当前展示”解释为全量研究归档。

## 4. 数据完整性与分析字段

在已有 Repository／只读一致事务中增加 SQL 检查，使用本实验全部记录计算计数，而非只检查导出的前 1000 条。Admin export 和 development 都包含 data_quality；passed 表示以下结构计数全为 0，不代表正式语义或全量导出已通过。

| 计数                           | 违反的条件                                                    |
| ------------------------------ | ------------------------------------------------------------- |
| sessions_without_state         | 已创建实验会话没有当前状态                                    |
| messages_without_state         | 消息所在实验会话没有当前状态                                  |
| state_event_mismatch           | 当前 stage／core_version 与最后迁移不对应，或迁移数不等于版本 |
| transition_chain_gaps          | 非首个事件找不到对应版本和前阶段的连续前驱                    |
| variables_without_valid_source | 来源迁移不存在／跨会话，或 recorded_stage 与来源前阶段不符    |
| turn_slot_mismatch             | 接受回合不是 user／assistant 两个槽位（role 唯一约束仍生效）  |
| ready_turn_without_reply       | ready 回合没有 ready 非空 assistant                           |
| ready_turn_without_model_log   | ready 回合没有 generated／fallback 模型日志                   |

这不是自动修复工具。故障注入只在临时隔离测试库执行：合法 snapshot 的版本被直接改成 2 且没有 event 时计数报 1；删除状态后会话计数报 1、消息计数报 2，passed=false。没有修改或删除任何历史验收数据库／正式数据库。变量无来源写入被外键 23503 拒绝，修改来源历史被不可变触发器 23514 拒绝。

analysis_rows 每行关联 participant_id、experiment_id、condition、agent_version、prompt_version、model_version、conversation_history（message）、state_transition、experiment_variables（experiment_variable）。消息以 turn_id／session_id 关联模型日志、时间和来源；模型不能写实验变量。model_version 仍为 requested_model／provider，未知 supplier_revision=null。完整性计数可合格，但 complete=false／每类 1000 的导出仍不能正式放行。

证据：[正常合成导出](acceptance/step6-round15/analysis-export.json)、[故障注入结果](acceptance/step6-round15/integrity-fault-injection.json)、[变量来源约束](acceptance/step6-round15/variable-source-constraints.json)、[全路径数据库记录](acceptance/step6-round15/)。冻结资源和写入失败事务回滚继续回归验证。

## 5. 抗干扰与有限压力测试

认知五例：拒绝表达刻板印象、批判观点、多个观点、打断评分、要求跳过。先通过明确表单固定表达／来源／confirmed_belief，再在 INITIAL_RATING 聊天；每例确认核心 snapshot／变量／事件完全相同，聊天计数只增 1、消息正常保存。拒答测试证明“聊天中的拒绝不改变量”，不表示平台已经设计正式拒答／退出事件。

情感五例：要求改剧情、询问规则、提前结束、极短回复、跳场景。先明确保存人物和初次接触，固定在 MISUNDERSTANDING；每例 scene_state／scene_phase／人物／事件和核心版本不变。

全部使用合成 MockAdapter，通过真实业务／SQL 层检查，不能证明真实 LLM 对这些输入的语义回应正确。既有不安全模型输出、重生成／兜底、禁用兜底、失败／超时／迟到与 lease 恢复测试继续通过。

| 负载             | 已执行范围                                                             | 断言                                                                         |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 三条路径各 30 轮 | 每次输入约 3600 字符，同一合法阶段连续 30 个请求，共 90 个回合         | 每路径 60 消息／30 模型日志，sequence=1…60；变量／事件／核心 snapshot 不漂移 |
| 长上下文         | 30 次真实 Prompt 构造；每次最多 6 条阶段历史，各截取 800 字符          | 生成消息最多 10 条；最大 Prompt 长度超过 5000 字符，数据库保留原始输入       |
| 同实验 6 人并发  | 5 批，每批 6 个独立参与者同名 request_id，模拟 20ms 模型等待           | 共 30 回合／60 消息／30 日志；每人仅有自己的 10 条消息，均不推进 core        |
| 恢复             | 真实 API 子进程 SIGKILL／重启、新连接 Pool、浏览器失败／刷新与网络重放 | 已保存来源／合法变量不丢失，无迟到覆盖                                       |

6 人、120 个压力回合和 MockAdapter 的耗时仅反映本机小规模验证。没有吞吐饱和测试、长时间运行、正式网络延迟、真实 token 限额或模型收费压力，也不推出支持多少正式参与者。不是把完整历史都放进 Prompt：保留既有有界记忆设计。

证据：[认知 30 轮](acceptance/step6-round15/stress-cognitive_v1.json)、[情感 30 轮](acceptance/step6-round15/stress-emotion_v1.json)、[日常 30 轮](acceptance/step6-round15/stress-daily_v1.json)、[6 人并发](acceptance/step6-round15/stress-concurrent.json)、[干扰结果](acceptance/step6-round15/interference-results.json)、[真实进程恢复](acceptance/step6-round15/process-recovery.json)。SIGKILL 测试显式使租约到期，不是数据库主机断电测试。

## 6. 日志字段说明

新增诊断是既有不可变模型日志／事件、回合及固定身份的 SQL 关联视图，没有新表，也不复制原始 Prompt／秘密到 stdout。每个诊断数组仍最多 1000；长实验需要未来分页。debug_log 每个模型日志一行，尚未写模型结果的回合保留 null；迟到工作者可能产生多个安全模型日志，不承诺每回合永远只有一个日志。

| 字段                                           | 来源与含义                                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| request_id                                     | 聊天为 session 内 idempotency_key；明确提交为 core_event_id。后台初始化事件为 null，没有虚构 HTTP 请求                                                                                    |
| participant_id／experiment_id／conversation_id | 固定 assignment／session／conversation 的数据库关联，不能由请求中的 participant_id 冒充                                                                                                   |
| state_before                                   | 聊天的 generation_context.stage；事件的 previous_state                                                                                                                                    |
| state_after                                    | 聊天按迁移 created_at 不晚于模型日志 created_at 选最高版本，pending 使用回合 created_at；事件取 current_state。时间为数据库事务时间，并非精确提交顺序；该值是重建诊断，不是查询时当前阶段 |
| event                                          | 聊天为 null，不伪造事件；明确事件为后端 core 已验证事件名                                                                                                                                 |
| model_name／prompt_version                     | 固定请求模型名与内容哈希版本；非供应商修订号；明确事件无调用时为 null                                                                                                                     |
| response_latency                               | model_run_log.latency_ms，毫秒，pg numeric 可能序列化为字符串；包含生成／重试／校验。租约恢复使用既有 0 作为恢复标记，非真实模型速度                                                      |
| validator_result                               | 已保存 status／violations／auditEvents；没有结果时为 null 或既有空对象，不伪造通过                                                                                                        |
| fallback_count                                 | 一个 orchestration 是否采用兜底，非收费重试次数；明确事件为 null，重试数仍在 model_runs.retry_count                                                                                       |
| turn_id／model_run_id／error_code／logged_at   | 区分回合、多个安全日志、受控错误码和实际记录时间，不记录供应商原始异常秘密                                                                                                                |

request_id 是使用者提交的数据，不应承载秘密。以上仅供已认证管理员；现有安全 stdout marker 仍只输出 ID 和操作结果，关键内容在数据库持久保存。读取会增加管理员审计，但不会增加实验事件或变量。

## 7. 当前是否达到正式实验条件

**未达到。** 本轮 401 项 Vitest 与 13 项真实浏览器测试通过，总计 414 项；本轮新增 17 项 API／服务稳定性用例、1 项浏览器用例。[测试](acceptance/step6-round15/test-results.json)、[浏览器](acceptance/step6-round15/browser-results.json)、[汇总](acceptance/step6-round15/summary.json)保留实际状态。

阻塞项包括真实模型及研究者语义验收、正式量表／必填字段／结构化场景／拒答与自愿退出方案、全量无截断导出、独立持久数据库／正式部署及备份恢复、目标规模的持续容量和权限／运维验证。当前 bootstrap 单一管理员、进程内限流、无后台恢复队列／消息分页、未知供应商版本与 token_usage 等边界仍保留。

下一轮建议按[检查清单](pre-experiment-checklist.md)逐项明确研究方案和目标规模，优先完成全量归档及真实模型审核，然后在正式同等环境验收；无需优先扩展视觉功能或重写核心状态机。
