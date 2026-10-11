# 第十轮反馈：Step 6.1 PostgreSQL 与平台架构准备

供 GPT 复核与指导下一轮 Codex 工作。依据 [第十轮需求原文](inputs/tenth-round-requirements.docx)，本轮进入 Step 6.1，完成数据库设计、首批迁移和真实 PostgreSQL 集成测试，交付 API、后台、参与者端、开发顺序和测试计划。

**结论：Step 6.1 首批数据库实现与工程检查通过。** 全量 341 个测试通过，其中新增 20 个真实 PostgreSQL 17.7 测试。API 业务、登录、管理员后台、聊天页面和导出服务尚未实现或接入数据库；没有部署或连接 WorkBuddy。

第十轮明确要求开始数据库 + migration，更新了第九轮“未完成真实模型前不实施数据库”的范围。本轮按新要求落地数据库，不再重复因模型密钥缺失而停止数据库工作。真实模型仍缺 MODEL_API_KEY / MODEL_NAME，未运行，不代表正式实验已就绪。

## 修改原因、文件和实验影响

新增 database/migrations 下 001_configuration、002_runtime 的 up/down SQL，packages/database 下独立 pg 迁移执行器、CLI、类型配置及集成测试。更新根工作区、脚本、精确锁文件和 Vitest 范围；CI 预拉取固定 PostgreSQL 镜像。新增数据库／API／页面计划文档、需求原文与验收 JSON，并更新 README 和云环境安装／启动说明。

新增依赖 pg=8.23.1、@types/pg=8.23.1，隔离为 @research/database 工作区。没有修改 experiment-core、ai-orchestrator、model-adapter、API 源码或前端页面。实验阶段、事件、关键变量、评分规则和语言策略保持原样；SQL 约束为这些事实提供持久化结构，没有新增正式刺激或量表。

全部数据库验证使用自己创建的随机命名 PostgreSQL 容器与合成数据，未连接外部／生产数据库。不要求模型凭据或外部 DATABASE_URL 就能运行测试。

## 七项交付与入口

| 输出要求              | 本轮材料                                                                      |
| --------------------- | ----------------------------------------------------------------------------- |
| 1. 数据库 ER 设计     | [ER 与变量映射](step6-1-database-er.md)，19 张业务表与关系图                  |
| 2. migration 文件结构 | [迁移说明](../database/README.md)，4 个 SQL 文件、账本与 CLI                  |
| 3. API 设计文档       | [API 契约](step6-api-design.md)，用户建议接口全部对应，明确尚未实现           |
| 4. 管理后台模块       | [页面与实施计划](step6-ui-and-test-plan.md)，实验／条件／分配／只读观测／导出 |
| 5. 参与者页面         | 同上，登录／说明／对话／当前表单／恢复；禁止内部状态与诊断曝光                |
| 6. 开发顺序           | 同上，6.1 数据库 → 6.2 API → 6.3 后台 → 6.4 参与者 → 6.5 联调                 |
| 7. 测试计划           | 同上，将已测数据库能力与未来 API／权限／导出测试明确区分                      |

## 1. 数据库 ER 与配置结构

配置关系为 Experiment → Template Version → Condition → Agent Version / State Machine Version / 逐阶段 Prompt Version Mapping → Participant Assignment → Session / State / Conversation。已发布资源冻结，运行参与者固定分配；新模板和 Prompt 版本保留旧记录，不覆盖历史。

19 表：experiment、template_version、agent、agent_version、state_machine_version、prompt_version、condition、condition_prompt、participant、experiment_assignment、experiment_session、experiment_state、conversation、conversation_turn、message、state_transition、experiment_variable、model_run_log、admin_event。另有 participant_message 最小字段视图及 research_meta.schema_migration 账本。

实体字段使用规范化关系：Participant 的 condition 和 assigned_agent 从固定分配查询；Conversation 的 turn / role / content / timestamp 拆分为回合与消息；版本和 path_type 分别属于模板和状态机版本。条件、分配、消息、变量来源和模型 Prompt 使用复合外键防止跨实验或会话混用。

现有 core key 保留：raw_expression 对应 stereotype_text、confirmed_belief 对应 confirmed_viewpoint、rating_1/2 对应 initial_rating/second_rating。source 尚未采集；scene_state / scene_phase 来自可信策略，未来服务再按版本保存，不读取模型输出作事实。没有因字段名称自动判断否定表达是负面观点。

## 2. migration 实现与运行

001 创建配置资源及不可变触发器；002 创建参与者运行数据、日志、审计、索引和最小投影。迁移账本保存文件 ID 和 up/down 的联合 SHA-256；advisory lock 串行化迁移进程；每个文件的 DDL 和账本在同一事务中提交。重复 up 不重复创建，历史或校验和不符拒绝执行，失败回滚当前文件。

状态快照完整保存 definitionSignature、receipts、variables、stage、version 等字段；core_version 与快照一致。普通聊天只使用独立 chat_revision，不累加 core.version。事件和变量追加保存；确认观点与两次评分禁止修改或另写替代 revision。服务端合法事件和原子写入仍需下一阶段 ExperimentService 实现。

在明确的独立目标安全配置 DATABASE_URL 后，可运行：

```bash
npm run db:migrate -- up
```

本轮真实测试已执行该根目录 CLI 的重复 up。未绑定生产数据库，API 启动不自动迁移。down 每次撤销最后一个版本，删除相应数据，属于开发库／空库演练；不代表生产备份恢复已验证。

## 3. API 设计

采用 /api 前缀对应 POST /auth/login、GET /experiment/current、POST /conversation/message、GET /experiment/state、GET /admin/participants、GET /admin/conversations、GET /admin/export，并补充发布、结构化提交、消息查询、退出和导出任务接口。

参与者 GET /experiment/state 返回 opaque 并发标记与当前表单投影，不返回原始 stage／variables／Validator／日志。普通聊天不能提交任何 state 或 variable 字段；阶段提交由后端映射合法 core event。管理员 GET 只读，导出创建使用 POST；没有任意 PATCH 正在运行的 state 路由。

这些接口本轮均未实现；现在只有原 /api/health。认证 Cookie、CSRF、登录限流、实验范围权限、生成任务租约和迟到版本核对需 Step 6.2 增加代码与集成测试。

## 4. 管理后台和参与者端

管理后台只规划核心：创建实验／条件、版本发布、创建和分配参与者、只读查看状态与对话、审计导出。人工干预只能走研究协议允许的 Admin Event，记录操作者、时间、原状态和原因；数据库 admin_event 当前仅为记录，不执行状态修改。

参与者端规划登录、说明、聊天、当前表单、保存消息加载与恢复。只显示研究所需内容，不显示内部阶段代码、变量对象、系统日志、Validator、完整 Prompt 或供应商错误。退出是明确的后端操作，不由模型判断。

本轮没有开发这些页面，没有把数据库测试截图或 health 页面当作在线实验平台。

## 5. 实际测试结果与验收边界

npm ci 已成功；npm run check 通过类型、ESLint、格式、全量测试及 7 个工作区构建。全量 341 通过、0 失败、0 跳过、14 个测试文件。本地结果不是 GitHub CI 的已确认状态。

PostgreSQL 镜像版本 17.7-alpine，以摘要 sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2 固定。测试通过 TCP 连接真实容器服务，SQL 由 PostgreSQL 执行，不是字符串断言或数据库 mock。容器只绑定本机随机端口，使用合成凭据和 tmpfs，结束清理自身资源。

| 测试范围   | 实际结果及限度                                                                              |
| ---------- | ------------------------------------------------------------------------------------------- |
| 迁移       | 空库 19 表、重复 up、CLI、校验和、并发锁、失败回滚、逆序 down/up 通过                       |
| 配置       | 草稿不可分配、跨实验拒绝、发布模板／条件／Prompt 冻结、固定分配和会话不能换绑通过           |
| 变量和事务 | 确认观点与评分不可覆盖；失败事务中的状态、迁移、变量和聊天计数回滚通过                      |
| 状态恢复   | 新数据库连接加载完全相同 core 快照，下一合法事件可通过；不声称进程重启和任务租约已测        |
| 模型日志   | 故障仅写日志，不改变状态／变量；跨实验 Prompt 日志拒绝；token_usage 未知为 null             |
| 消息与权限 | 消息唯一顺序、参与者字段投影、只读 DB role 不可读账号或改 state；应用身份与行级权限仍待实现 |
| API／导出  | 新业务路由和导出服务未实现，测试计划已列出；没有伪造通过结果                                |

[完整自动化报告](acceptance/step6-round10/test-results.json)、[数据库实际测试和迁移校验和](acceptance/step6-round10/database-results.json)、[本轮汇总](acceptance/step6-round10/summary.json) 均包含在项目 ZIP。

## 6. 已知限制与下一阶段

首批 schema 不等于生产可用业务系统。数据库拥有者仍可写状态；管理员应用角色、权限接口和唯一 ExperimentService 入口尚待实施。投影视图不按登录用户过滤，不能直接作为授权查询。发布服务还需验证路径 JSON、逐阶段 Prompt 完整覆盖、内容 hash 与研究配置，不能只依赖 JSON 字段存在。

模型 token_usage 仅有可空字段，当前 Adapter 未采集实际供应商用量，不能推测填值。auth_session、generation_job、逐尝试日志和 export_job 等下一步用新增迁移实现，不将未完成表写成已建成。生产备份恢复、数据保留、完整任务恢复、真实模型语义和浏览器联调仍未验证。

下一轮优先 Step 6.2：配置发布与账号／会话、当前投影、显式提交和消息保存 API，继续真实数据库集成、权限与恢复测试；后台和参与者 UI 按后续独立步骤推进。真实模型配置与语义验收继续单独处理，不能把数据库通过当成真实模型或正式实验通过。

## 交给 GPT 的复核提示与材料

请 GPT 按第十轮更新后的范围验收 Step 6.1，复核 SQL、迁移、真实 PostgreSQL 测试和七项设计材料。确认哪些限制属于下一阶段，并安排小范围 API 工作；不要判定登录、聊天、后台、导出或部署已经实现。

项目 ZIP 包含源码、历轮材料、第十轮需求、本轮 Markdown／Word、ER/API/页面与测试设计、4 个 SQL migration 和完整验收 JSON。环境设置已更新 Docker/PostgreSQL 测试准备指导；配置草稿保存不代表已发布，未来环境应按界面保存并发布更新。真实密钥未进入仓库。
