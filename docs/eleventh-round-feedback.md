# 第十一轮反馈：Step 6.2 业务服务与 API 验收

日期：2026-10-11。依据本轮上传的《Codex 第十一次反馈：Step6 业务系统开发前数据库与服务层设计要求》继续开发。原始文件保存在 [本轮需求](inputs/eleventh-round-requirements.docx)。本轮范围为业务后端，没有部署或开发复杂前端。

## 给 GPT 的反馈

已完成 Controller → Service → Repository 分层，并将既有纯状态机、AI 编排、可替换模型接口接入 PostgreSQL 业务流程。控制器只负责 HTTP 与认证入口，服务决定业务操作，仓储执行 SQL。实验阶段只能由显式结构化提交触发 core 合法迁移；聊天与模型输出不推进阶段、不写实验变量。未改动 experiment-core、AI 编排或模型 Adapter 源码。

数据库追加 003_application，不改写 001/002：登录会话保存摘要、状态使用随机 state_token、提交回执保证幂等、生成回合使用过期租约防止迟到覆盖。旧版无拥有者的 pending 回合升级为失败并修复 chat_revision；不改变核心实验状态。

| 要求           | 本轮结果                                                                         |
| -------------- | -------------------------------------------------------------------------------- |
| 目录与模块划分 | controllers、services、repositories 已落地，详细文件清单见服务文档               |
| 实验配置服务   | 草稿、条件、Agent／路径／阶段策略绑定、发布冻结、固定分配与合法初始化            |
| 参与者服务     | 随机盐 scrypt 密码、8 小时随机 Bearer 会话、注销、自己的配置／状态／消息         |
| 对话服务       | 先保存 user／回合，再调用编排和 Validator，保存就绪 assistant 与日志；失败不迁移 |
| 显式实验提交   | 只允许当前阶段字段，core 校验事件，状态／变量／迁移／回执原子保存                |
| 管理员服务     | 创建／查询、分配、配置发布、查看对话、审计与限量 JSON 导出；不开放直接状态修改   |
| 自动化验收     | 370 测试全部通过；新增 28 个服务／HTTP API 测试与 1 个数据库升级测试             |

## 六项交付材料

1. 目录结构：[服务与 API 文档](step6-2-business-api.md)的目录与职责。
2. Service 设计：ExperimentService、ParticipantService、ConversationService、ModelRunService、AdminService；见同一文档和 apps/api/src/services。
3. Repository 设计：连接／事务 UnitOfWork 及配置、参与者、状态、对话仓储；见 apps/api/src/repositories。
4. Endpoint 清单：已实现方法、字段、身份和错误边界，见服务文档的 endpoint 表格。
5. 用户消息完整数据流：认证 → 锁定自己的会话 → 幂等保存 → 事务外编排 → Validator → 新事务核对版本／租约 → 文本与日志入库；见服务文档。
6. 测试结果：[全量 Vitest JSON](acceptance/step6-round11/test-results.json)、[服务与 API 结果](acceptance/step6-round11/service-api-results.json)、[验收摘要](acceptance/step6-round11/summary.json)。Word 反馈与 Markdown 内容一致。

## 验收依据

所有数据库和业务 API 测试使用真实 PostgreSQL 17.7、隔离临时 Docker 容器与合成参与者。HTTP 验证通过 Supertest 调用 Express，非线上网页验收。模型使用本地合成 LanguageGenerator，外部模型调用为 0；真实 LLM 与语义验收继续 pending，不能将本轮三条路径流程测试解释为真实模型验收。

| 检查                 | 结果                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| 全量 Vitest          | 370 passed，0 failed，0 skipped，15 个测试文件                              |
| 新增业务服务／API    | 28 passed：认证、自己的数据、越权拒绝、配置冻结、消息／日志、显式提交、导出 |
| PostgreSQL migration | 21 passed：001／002／003、事务／并发锁、约束及旧回合升级                    |
| 三条路径业务流程     | 认知 9、情感 7、日常 1 个合成语言回合，分别完成对应后端路径                 |
| 并发与恢复           | 重复请求只生成一次；生成中拒绝状态提交；租约过期后旧 worker 不覆盖新结果    |
| 原子性               | 注入变量写入失败，确认状态、迁移、变量和回执一起回滚                        |
| 工程检查             | npm run check 全部通过：类型、lint、格式、370 测试、全部工作区构建          |

登录 token 不能替换 participant_id，其他参与者回合返回 404；未知字段／非法事件拒绝。状态只展示 opaque state_token 和当前表单，不向参与者提供内部 stage、variables、Validator、模型日志。重复提交内容相同返回保存结果，内容不同冲突。模型错误不把供应商响应／秘密直接发给用户。

## 运行与交付方式

普通复现：仓库根目录 npm ci，然后 npm run check，需要 Docker，不需要模型密钥或外部数据库。独立开发数据库通过安全设置提供 DATABASE_URL，显式 npm run db:migrate -- up，再 npm run dev:api。启动不自动迁移、不创建账号、不加载 .env；未配置数据库时只保持旧 health 骨架。

管理员采用独立高熵 Bearer token；服务端只保存其原始字节 SHA-256 的 ADMIN_ACCESS_TOKEN_HASH，未配置则管理员路由关闭。原始 token、真实密码、数据库连接凭据不得提交 Git 或聊天。详细配置见服务文档与 .env.example。云环境启动说明同步更新为业务 API 流程，保存的是草稿，发布后才用于后续任务。

整个 GitHub 项目 ZIP 包含原始本轮要求、源代码与迁移、此反馈 Markdown／Word、服务设计与接口文档、验收 JSON，以及历史各轮成果。下载使用本轮提交 SHA 对应的 archive 链接；解压后优先将本反馈与服务文档交给 GPT，完整 JSON 用于核对证据。

## 仍待完成的事项

管理员／参与者业务页面尚未开发，未配置外部持久数据库或部署。管理员目前是单一 bootstrap 身份，可管理本独立平台全部实验，没有多人账号／项目细分权限。登录失败限流是进程内实现，尚无分布式认证治理。

导出明确 complete=false、每表最多 1000 条，没有全量分页、完整版本资源包、CSV／ZIP 任务；不能直接用于正式研究全量归档。消息查询也尚未分页。租约通过发送／查询恢复，尚无独立 worker 队列或主动推送，也不承诺供应商恰好一次收费。

阶段策略必须明确提供，或显式选择 demo_policies=true。工程策略与量表不能代替研究者批准。数据库暂无生产 RLS／细分数据库角色，token_usage 仍为空；正式备份恢复与模型语义验收尚未完成。建议下一轮先复核接口与配置，再授权最小管理员／参与者页面，同时规划正式导出、角色权限与后台任务；不把本轮原型视为实验上线许可。
