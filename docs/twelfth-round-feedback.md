# 第十二轮反馈：业务服务联调与完整实验链路

日期：2026-10-11。依据 [本轮原始要求](inputs/twelfth-round-requirements.docx)，聚焦数据可靠性、调用闭环与恢复；暂未开发页面、部署或高级权限系统。

## 给 GPT 的反馈

本轮在上一轮业务后端上小步修复和验证，保持 Controller → Service → Repository 分层。新增研究变量持久化投影，扩大管理员导出的版本／状态追溯字段，补足真实进程中断与 Adapter 协议联调证据。纯状态机、已发布 v1 路径、AI 编排／Validator 与模型 Adapter 源码不变；模型输出不创建事件、不推进阶段、不修改实验变量。

| 修改原因                                            | 修改文件                                                                                                        | 实验设计影响                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 租约过期的迟到回复不能依赖其他查询才能阻止          | services/recovery.ts、conversation-service.ts、participant-service.ts                                           | 修复运行可靠性，不改变阶段规则                                  |
| 研究变量需要实际持久保存并可追溯                    | services/research-variables.ts、participant-service.ts、experiment-service.ts、repositories/state-repository.ts | 新增研究命名投影；认知捕获可显式提交 source，既有字段和阶段不变 |
| 导出应关联谁、版本与当前状态                        | repositories/conversation-repository.ts                                                                         | 增加状态／Prompt／固定版本字段，仍为限量导出                    |
| 上轮直接注入生成器不足以证明 Adapter 闭环和进程恢复 | tests/business.test.ts、tests/restart-worker.ts                                                                 | 只用合成数据和临时数据库，不影响真实研究                        |

## 八项交付

1. 当前 API 目录结构。
2. Service 层职责与身份边界。
3. Repository 层 SQL／事务与来源保存。
4. 一次完整消息链和独立显式事件提交。
5. 数据库写入示例、认知／情感研究变量。
6. 状态迁移及进程恢复示例。
7. 实际测试结果和复现命令。
8. 已知问题和正式实验前的待办。

以上逐项完整整理在 [本轮联调文档](step6-round12-integration.md)。继承的 endpoint 方法／字段见 [Step 6.2 API](step6-2-business-api.md)，本轮提交 source 与导出字段扩展已更新。

## 验收结果

| 检查               | 实际结果                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| 全量 Vitest        | 377 passed，0 failed，0 skipped；15 个文件                                                        |
| 业务服务／HTTP API | 合计 35 passed，本轮新增 7 项                                                                     |
| 认知完整链         | MockAdapter／真实 PostgreSQL，9 个语言回合、10 次合法迁移；保存六个研究键                         |
| 情感完整链         | MockAdapter／真实 PostgreSQL，7 个语言回合、8 次合法迁移；保存四个研究键                          |
| 日常控制路径       | 1 个语言回合、2 次迁移、0 个实验变量                                                              |
| HTTP Adapter 闭环  | 本机协议 fixture → OpenAICompatibleAdapter → 编排／Validator → 消息／日志；独立显式提交与重复回执 |
| 中断／重启         | 真实 Node 子进程 SIGKILL，重新启动独立进程／Pool，恢复身份、失败回合、新回复和合法状态提交        |
| 失败与非法输入     | 生成失败、安全兜底、完全 blocked、重复网络请求、非法阶段／变量均不产生非法迁移                    |
| 工程检查           | npm run check 全部通过：类型、lint、格式、377 测试与工作区构建                                    |

[全量测试 JSON](acceptance/step6-round12/test-results.json)、[服务验收结果](acceptance/step6-round12/service-api-results.json)、[验收摘要](acceptance/step6-round12/summary.json)。认知／情感／日常数据库记录、HTTP Adapter 和真实进程恢复样例均位于同一验收目录，并包含在项目 ZIP。

全部样例都是合成实验。外部真实模型调用为 0，不把本机协议 fixture 或 MockAdapter 解释为真实 LLM 验收。本轮没有新接入外部数据库，不影响 WorkBuddy 或正式参与者。

## 需要 GPT 核对的语义与边界

source 只在认知首次捕获时接受参与者明确填写，为保持 v1 兼容仍可省略；缺失不推断、不补造。研究别名保存 experiment_variable，保留原核心名和 source_transition_id，不修改 v1 snapshot 定义。历史数据不自动回填。

character_profile／scene_state 当前是显式阶段文本；scene_phase 为后端合法 event.toStage，relationship_state 为显式关系阶段文本。它们不是模型推断的正式复杂世界状态；后续正式人物／场景 schema 需单独研究设计。模型固定参数和 model_name 已保存，尚未采集供应商独立修订号及 token_usage。

导出仍 complete=false、每类最多 1000 条；未实现全量分页／CSV／ZIP 任务。管理员仍单一 bootstrap 身份，没有业务页面、生产角色／RLS 或部署。恢复依赖访问和租约到期，尚无后台队列或主动推送。研究者语义审核、量表、真实模型与备份恢复仍待验收。

建议 GPT 先复核本轮八项材料、事件／变量语义和恢复证据，明确正式 source／场景 schema，再决定下一轮最小业务页面或正式导出范围。不要将工程闭环完成当作正式实验上线。

云环境启动草稿已保存本轮复现说明，凭据和网络设置未变；草稿需在环境设置审核、保存并发布后用于后续任务。
