# Step 6.2 服务层、仓储与已实现 API

本轮实现 Node/Express 业务后端，不开发复杂 UI 或部署。真实 PostgreSQL 集成验证使用合成数据和本地 LanguageGenerator；外部 LLM 仍未验收。

## 目录与职责

```text
apps/api/src/
  controllers/routes.ts             认证入口、HTTP 路由、参与者安全投影
  services/
    experiment-service.ts           创建草稿、条件、策略验证、发布、分配与 core 初始化
    participant-service.ts          密码／会话、自己的配置与状态、明确结构化提交
    conversation-service.ts         持久化回合、幂等／并发、编排、结果回写与租约过期处理
    model-run-service.ts            固定模型参数核对；只通过 AI Orchestrator 调用模型
    admin-service.ts                观测和受控限量 JSON 导出
    common.ts                       输入校验、规范化哈希、安全错误及身份类型
    index.ts                        服务组合
  repositories/
    context.ts                      独立读连接／事务 UnitOfWork
    experiment-repository.ts        SQL 配置、版本、条件和发布审计
    participant-repository.ts       SQL 账号、固定分配与认证会话
    state-repository.ts             SQL 权威快照、迁移／变量、提交回执
    conversation-repository.ts      SQL 回合、消息、租约、模型日志与导出
```

控制器不写 SQL、不调用模型；服务不写 SQL；仓储不决定路径或生成语言。纯 experiment-core 和 AI 包源码未改。模型输出没有提交事件／变量的接口。

## 配置、身份与数据库

追加 003_application migration，不改已执行的 001/002：认证会话保存 token_hash 和过期时间；状态增加随机 opaque state_token；提交保存幂等回执；消息回合保存 lease_token／lease_until 和所选非秘密生成配置。升级时将旧版无拥有者的 pending 回合标失败，修复聊天计数，不修改核心状态。

实验创建后为 draft。条件必须指定已注册 path_version、Agent 名称及明确 StagePolicy；只在显式 demo_policies=true 时使用工程演示策略。发布前使用合成内存快照验证每个当前阶段策略能被既有 ContextManager 接受，检查完整覆盖。该过程不保存参与者数据、不调用模型，也不能代替研究者语义批准。

分配固定已发布条件、Agent、状态机和 Prompt。初始化通过 core EXPERIMENT_STARTED，并保存 backend 类型迁移记录。普通管理员路由没有修改正在运行 state 的功能。管理员操作写 admin_event；人工干预仍未开放。

参与者密码采用随机盐 + Node scrypt，至少 12 字符。登录返回随机 256 bit Bearer token，数据库只存规范化 SHA-256，8 小时过期；注销删除会话。请求每次由 token 查出启用账号，participant_id 不能作为身份。失败登录有进程内账号维度一分钟 10 次限制；不是分布式限流或生产账号系统。

管理员采用独立 bootstrap Bearer 凭据，服务端只配置 ADMIN_ACCESS_TOKEN_HASH（对随机管理员 token 原始字节的 SHA-256，64 位小写十六进制）。服务端不保存明文，哈希可以作为非秘密配置；管理员本人保存高熵原始 token。无哈希则管理员接口关闭。当前一个 bootstrap 管理身份有全部本独立平台实验权限；尚无多人账号、细分研究项目角色或 UI。

## 启动与配置

普通检查只需要 Docker，不需要任何真实秘密：npm ci、npm run check。自动测试启动／清理自己创建的 PostgreSQL 17.7 容器，禁止连接 WorkBuddy。

独立开发数据库安全注入 DATABASE_URL 后，先 npm run db:migrate -- up，再启动 npm run dev:api 或构建后 npm run start:api。启动不自动迁移、不加载 .env、不创建演示账号。未设置 DATABASE_URL 时保持 health 骨架，业务路由不启用。

ADMIN_ACCESS_TOKEN_HASH 可配置管理员校验摘要；不要把原始管理员 token、密码或带凭据的数据库连接串提交 Git／聊天。RESEARCH_CODE_COMMIT 可记录部署代码提交，未配置为 development，正式研究前应固定。MODEL_PROVIDER 默认 mock；真实服务地址／密钥／名称由既有模型设置管理。创建实验时固定当前非秘密模型参数，后续运行参数不一致会失败，不能静默换模型。

start/dev 命令启用 Node --use-env-proxy，保留平台路由和 TLS 校验。health 保留旧 mode=scaffold 契约，只代表进程健康，不代表业务数据库或真实模型就绪。当前没有外部数据库配置或在线部署。

## 已实现 endpoint

所有路径以 /api 开头。管理员与参与者使用各自 Bearer 凭据；请求中的 actor/participant_id 不能替代认证。

| 方法与路径                             | 内容                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| POST /auth/login                       | experiment_id、participant_code、password；返回 token、expires_in                                   |
| POST /auth/logout                      | 删除当前登录会话                                                                                    |
| GET /experiment/current                | 自己的研究说明、固定 Agent 展示名、当前表单投影                                                     |
| GET /experiment/state                  | state_token、界面 status、form；生成中额外 pending_turn_id；不含 stage、variables、Validator 或日志 |
| POST /experiment/submissions           | state_token、request_id、data；只允许当前阶段字段，由后端映射 event；原子保存快照／迁移／变量／回执 |
| POST /conversation/message             | text（≤4000）、state_token、request_id；返回 turn_id、status、text（只返回已校验就绪文本）          |
| GET /conversation/messages             | 仅自己的就绪消息，最多 1000 条                                                                      |
| GET /conversation/turns/:id            | 自己的回合状态；越权返回 404；访问时处理过期租约                                                    |
| GET/POST /admin/experiments            | 查询／创建实验草稿；POST name、instructions                                                         |
| POST /admin/experiments/:id/conditions | code、path_version、agent_name、policies 或显式 demo_policies=true                                  |
| POST /admin/experiments/:id/publish    | 验证并冻结发布版本                                                                                  |
| POST /admin/participants               | experiment_id、participant_code、password；返回编号记录 ID，不返回 hash                             |
| POST /admin/assignments                | participant_id、condition_id；固定分配和合法初始化                                                  |
| GET /admin/participants                | experiment_id 查询参与者分配和只读内部状态                                                          |
| GET /admin/conversations               | experiment_id 查询对话和生成状态                                                                    |
| GET /admin/export                      | experiment_id；权限验证、访问审计、repeatable-read 数据快照，返回限量研究 JSON                      |

其他 mutation 路由不存在；未知请求字段拒绝。400 输入、401 未认证、404 非自己的资源、409 状态／幂等／生成冲突、429 登录失败上限。数据库与模型错误不通过 HTTP 直接输出。

参与者消息示例（合成占位，不是已发布账号或秘密）：

```json
{
  "request_id": "client-turn-001",
  "state_token": "00000000-0000-4000-8000-000000000001",
  "text": "我想聊聊刚才的感受。"
}
```

模型失败时返回 failed 和 text=null，已保存 user 消息及安全日志；用户可查回合并用新 request_id 重试，不能让失败推动实验阶段。

## 用户消息数据流

```text
Bearer → ParticipantService 查会话 → 服务身份
  → ConversationService 开始事务
  → StateRepository 锁自己的会话／状态，核对随机 state_token
  → 幂等回合、user 消息、assistant 占位、生成租约、chat_revision 保存并提交
  → 读取固定当前 StagePolicy／路径／模型设置／当前阶段历史
  → ModelRunService → AI Orchestrator → LanguageGenerator → Model Adapter → 模型
  → Validator／有限重试／兜底
  → 新事务重查 core_version、chat_revision、租约、会话状态
  → 就绪文本及 model_run_log 保存；过期／迟到结果不展示
```

普通聊天仅增加 chat_revision，不调用 transition。显式 submissions 才通过 core 当前合法 event 推进。数据、状态、迁移、变量和回执在同一事务中写入，失败全回滚。重复请求同规范化内容读取原结果，不再次生成；内容不同同键返回冲突。

不会在长模型调用期间占用数据库事务。每会话仅一个生成回合；期间结构化提交返回 GENERATION_PENDING。过期租约在消息发送／回合查询时标 failed，并保存 GENERATION_LEASE_EXPIRED；不自动重新付费调用。恢复后旧 worker 不能覆盖结果，新请求可重新发送。尚无独立后台调度队列、断网主动推送或供应商恰好一次计费保证。

## 测试与限制

本轮 28 个服务／API 测试和 1 个迁移升级测试；全量测试报告为验收依据。真实 PostgreSQL 上验证配置创建／发布／分配、密码与会话、自己的数据、非法修改、消息和日志、显式推进、三条路径完成、并发幂等、租约与迟到保护、事务回滚、重连、导出权限和字段排除。

测试的模型为本地合成 LanguageGenerator，不是实际 LLM，正式模型与语义审核仍 pending。管理员导出 complete=false、每表最多 1000 条，尚无全量分页、完整发布清单、CSV／ZIP 导出任务；参与者消息也没有分页。token_usage 仍未知为空。场景、量表与刺激仅工程演示或研究者配置，不能宣称正式实验上线。

## 第十二轮联调更新

认知首次捕获的 submissions.data 可补充 source（明确来源文本），其他阶段不能提交 source。服务保存原核心键及研究别名，详见 [第十二轮文档](step6-round12-integration.md)。当前查询／提交／生成结束会恢复过期租约。导出增加 states、prompts、固定 Agent／状态机版本和 model_settings，仍 complete=false。业务测试现在为 35 项。
