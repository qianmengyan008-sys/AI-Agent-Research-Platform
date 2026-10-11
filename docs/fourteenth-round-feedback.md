# 第十四轮反馈：Step 6 完整业务闭环与平台可用性

日期：2026-10-11。依据 [本轮原始要求](inputs/fourteenth-round-requirements.docx)，优先稳定性、追溯、恢复和分析导出，没有增加架构模块、修改核心状态机／AI 编排／模型 Adapter 或历史 migration。

## 给 GPT 的反馈

参与者已从真实浏览器完成认知／情感流程，经 Vite、Express、业务 Service、Repository、PostgreSQL 与 MockAdapter／Validator 保存消息、事件和研究变量。每步安全日志沿用后端诊断 marker；普通聊天无状态事件，明确填写才由后端 core 验证推进。

| 修改原因                                             | 文件                                                                           | 是否影响实验设计                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 分析导出需明确关联参与者、条件、路径与固定资源       | AdminService、ConversationRepository                                           | 增加 analysis_rows 和稳定排序，不改原变量或干预内容                |
| 管理员需可选检查状态／事件／变量／模型日志           | app.ts、routes.ts、server.ts、AdminService、contracts、Admin.tsx、.env.example | 默认关闭且只读；只追加查询审计，无状态干预                         |
| 明确拒绝后不能被旧重试键锁住；保留草稿后标签仍要稳定 | Participant.tsx、styles.css；管理员同步操作锁                                  | 修复页面可用性，不改变状态推进条件                                 |
| 配置冻结与恢复必须有实际证据                         | business.test.ts、browser.spec.ts                                              | 新增 4 个 API／服务和 4 个浏览器验收，不连接真实参与者或生产数据库 |

## 七项交付

[本轮完整材料](step6-round14-usability.md)按要求整理：完整系统架构图、前后端调用流程、Participant 完整结果、Admin 完整结果、数据导出示例、状态恢复结果、已知问题。

[验收目录](acceptance/step6-round14/)包含本轮全部测试 JSON、安全日志、分析导出、接口诊断、认知／情感完整记录、真实进程恢复／新连接恢复／浏览器失败恢复，以及四张真实页面截图。Word 反馈与本文件一致，原始需求和历史成果也保存在整个项目 ZIP。

## 实际验收

| 检查               | 结果                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Vitest             | 384 passed，0 failed，0 skipped，15 个文件；业务服务／API 42 项                           |
| Playwright         | 12 passed，0 failed，0 skipped；真实 Chromium／Vite／Express／PostgreSQL                  |
| 合计               | 396 项；本轮新增 4 项 API／服务、4 项浏览器测试                                           |
| 认知完整浏览器流程 | 9 个语言回合、18 条消息、10 次迁移、9 个模型日志；六个研究键入库                          |
| 情感完整浏览器流程 | 7 个语言回合、14 条消息、8 次迁移、7 个模型日志；四个研究键入库                           |
| 权限／开发模式     | 默认关闭，只有管理员可启用查看；参与者无阶段／事件／Prompt／Validator／模型日志投影       |
| 幂等／顺序／恢复   | 双击一次生成两槽位；网络丢失同键重放；旧状态拒绝后可刷新；已保存 source 与 version 不回退 |
| 冻结资源           | 新实验与不同策略不影响旧完成记录；已发布条件修改拒绝                                      |
| 工程检查           | npm run check 全部通过：类型、lint、格式、测试、构建、浏览器；结果保存在验收 summary      |

本轮真实的是浏览器／HTTP／数据库业务链路；模型输出仍为 MockAdapter 或本机协议 fixture，外部真实模型调用为 0，不将这些结果解释为真实 LLM／正式心理学实验验收。

## 分析导出与开发模式说明

新增 analysis_schema=participant-research-v1／analysis_rows，同时保留 research-json-v1 原始数组。每行关联 participant_id、experiment_id、condition、path_type、agent_version、prompt_version、model_version、timestamp、state_transition、conversation_history、experiment_variables、current_state、model_runs 和固定参数。

model_version 只表示固定 requested_model／provider；未知 supplier_revision=null，不编造供应商版本。analysis_rows 基于限量快照，仍 complete=false／每类最多 1000 条，不能当正式全量归档。实际下载样例保存在验收目录。

ADMIN_DEVELOPMENT_MODE 默认 false，只有显式 true 且管理员认证后才能读取诊断。浏览器验收 fixture 为测试特意开启；普通服务保持关闭。开发模式没有修改运行中实验的接口，读取会追加 DEVELOPMENT_VIEWED 审计，不改变状态／变量／模型。参与者界面始终关闭诊断。

## 仍需研究者确认的边界

source 保持 v1 兼容选填，人物／场景仍是显式文本，正式量表／复杂场景 schema、真实模型语义验证、全量导出与持久数据库／部署仍未完成。Agent 当前固定名称与阶段角色／策略，未实现完整编辑器或同实验新模板版本管理服务。

单一 bootstrap 管理员、进程内限流、无后台生成队列／RLS／生产备份演练、未知 token_usage／供应商修订号、消息无分页等限制保留。刷新需要重新登录，但实验状态和变量通过数据库恢复。本轮不构成正式上线许可。

建议 GPT 先复核七项材料和分析字段语义，再确定正式研究必填字段、量表、全量归档与真实模型审核范围，不优先扩展视觉功能。
