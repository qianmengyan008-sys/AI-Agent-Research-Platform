# 第十二轮：业务联调、数据追溯与进程恢复

本轮目标是完成业务闭环，不扩展 UI／高级权限／部署。下文数据库示例均来自自动测试的真实临时 PostgreSQL，数据是合成样例，非真实参与者、非真实 LLM 验收。

## 1. 当前 API 目录

```text
apps/api/src/
  app.ts / server.ts                  HTTP 组合与进程启动
  controllers/routes.ts               HTTP 路由与认证入口，无 SQL 或直接模型调用
  services/
    experiment-service.ts             实验／版本／条件／发布／分配／初始化
    participant-service.ts            创建、密码验证、会话、自己的实验、显式提交
    conversation-service.ts           消息生命周期、幂等、生成、结果保存
    model-run-service.ts              固定参数核验 → AI Orchestrator
    admin-service.ts                  查询、授权与审计导出
    research-variables.ts             v1 变量到研究命名的确定性映射
    recovery.ts                       过期回合处理，拒绝迟到覆盖
    common.ts / index.ts              校验、身份、组合
  repositories/
    context.ts                        连接与事务 UnitOfWork
    experiment-repository.ts           配置与版本 SQL
    participant-repository.ts          身份、会话与分配 SQL
    state-repository.ts                状态／事件／变量／幂等回执 SQL
    conversation-repository.ts         回合、消息、日志与限量导出 SQL
apps/api/tests/
  business.test.ts                     35 个真实 PostgreSQL 服务／HTTP 测试
  restart-worker.ts                    专用于中断／重启测试的合成子进程
```

## 2. Service 层

ExperimentService 固定发布版本与条件、Agent／状态机／Prompt，不开放运行中状态修改。ParticipantService 认证后才返回自己的实验；结构化提交核对 state_token、当前字段与 core 合法 event，再保存状态与变量。ConversationService 普通聊天只保存消息与 chat_revision；生成成功不会推进阶段。AdminService 使用独立管理员认证，导出审计记录先写入，再使用 repeatable-read 快照。

researchVariables 是确定性持久化投影，不修改已发布 v1 的定义、核心变量名或阶段顺序。source 只允许认知 STEREOTYPE_CAPTURE 的显式 data.source；不会从聊天／模型输出推断。保持 v1 兼容，source 可省略，省略则不生成记录。要求完整来源的正式研究须在客户端强制采集或另建经过审核的新路径版本，不能把缺失来源填成猜测值。

## 3. Repository 层

仓储只执行参数化 SQL，不判断实验路径，不调用模型。状态快照、state_transition、experiment_variable 和 submission_receipt 在同一事务内保存，任何失败都回滚。研究命名的补充变量也在该事务内写入同一 source_transition_id。补充变量不进入 core.snapshot.variables；既有核心快照与 receipt 仍可按 v1 规则重放，source 同时保存在 transition.validated_payload 和变量表。

本轮复用既有 21 张业务表和 001／002／003 三个 migration，没有改写历史 migration。历史数据没有批量补齐研究别名或不存在的 source。新增投影用于本轮以后的合法提交。

管理员限量 JSON 增加 states 和 prompts，并在 assignments 中加入 Agent／状态机版本标识、模板版本与固定 model_settings。与 runs 的 prompt_version_id／model_name、messages 的 session_id、transitions／variables 的来源外键一起构成追溯链。仍 complete=false、每类最多 1000 条，不保证完整大数据导出。

## 4. 一次完整消息调用链

```text
POST /auth/login → 数据库会话 token → ParticipantService.authenticate
  → 固定 Experiment Assignment → 当前数据库状态
  → ConversationService 锁自己的 session/state
  → 保存 user、assistant 占位、幂等回合和生成租约 → 提交事务
  → ModelRunService 核对已固定参数
  → AI Orchestrator → Model Adapter → 生成自然语言
  → Response Validator → 有限重试／安全兜底／blocked
  → 新事务核对会话、core_version、chat_revision、租约
  → 保存通过校验的 assistant 与 model_run_log
  → 聊天结束，核心状态不变
独立显式 POST /experiment/submissions
  → 当前表单字段／事件验证 → core.transition
  → 原子保存新状态、迁移、变量、研究投影与幂等回执
```

因此附件中“根据事件调用状态机”落实为独立显式提交。普通消息不能携带任意 event 或修改实验变量，模型成功回复不隐式触发提交。

## 5. 数据库写入与研究变量示例

认知首次显式提交：

```json
{
  "request_id": "capture-001",
  "state_token": "客户端从当前状态获取的随机 UUID",
  "data": { "response": "参与者明确提交的原始表达", "source": "参与者明确填写的来源" }
}
```

事件合法后，表内保存 stereotype_text（旧核心名）、raw_expression（同值研究名）、source；都链接同一迁移记录。confirmed_viewpoint → confirmed_belief，initial_rating → rating_1，second_rating → rating_2；action_intention 使用既有键。confirmed_belief 及评分投影只跟随对应合法提交，聊天不能覆盖。

情感：persona_snapshot → character_profile；relationship_response → relationship_state。四个接触／误解／解除／共同经历阶段的显式文本产生追加 scene_state revision；每次合法迁移保存 scene_phase=event.toStage，包括合法初始化与结束。scene_state 是最近显式场景阶段的参与者文本，不是模型推断的结构化世界状态；character_profile 也是显式文本，复杂 JSON 人物设定另待研究者定义。

[认知数据库记录](acceptance/step6-round12/cognitive_v1-database-records.json)含 18 条消息、10 次迁移、15 条变量、9 个模型日志；[情感记录](acceptance/step6-round12/emotion_v1-database-records.json)含 14 条消息、8 次迁移、21 条变量、7 个日志；[日常记录](acceptance/step6-round12/daily_v1-database-records.json)含 2 条消息、2 次迁移、0 条变量、1 个日志。每个文件都有身份、固定版本、当前快照及 Prompt 策略。

## 6. 状态迁移与恢复示例

认知 assignment-start：INIT(version=0) → STEREOTYPE_CAPTURE(version=1)，actor_type=backend。

随后 user／assistant 消息成功保存，仍为 STEREOTYPE_CAPTURE(version=1)。只有上述 capture 提交被验证后，才发生 STEREOTYPE_SUBMITTED：STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION(version=2)，actor_type=participant。同 request_id 同内容的网络重复返回原回执，不重复创建迁移；同键不同内容为 409。

进程中断验收真实启动 Node API 子进程和新的 PostgreSQL Pool，在 user／generating 回合已落库后发送 SIGKILL。再启动不同 Node 进程，沿用数据库会话 token 恢复身份与状态。为避免等待生产租约时长，测试明确将持久 deadline 设置为过去。当前实验查询恢复过期回合为 failed，assistant 保持 null，同幂等键重放返回 failed，新键生成后可显式提交。恢复日志与数据见 [真实进程恢复样例](acceptance/step6-round12/process-recovery.json)。这是测试进程重启，不是 PostgreSQL 主机断电／高可用演练。

模型失败保存 user 与安全错误日志，状态及变量不变；使用新 request_id 恢复。Validator 违规输出不得作为 assistant 落库；安全兜底通过校验才显示，若所有兜底仍违规则 blocked，assistant 为 failed/null。生成完成时也处理过期租约，不依赖其他请求先查询；当前实验查询和显式提交能恢复过期回合。

## 7. 测试与复现

仓库根目录 npm ci，确保 Docker daemon 可用后 npm run check。指定验收输出可运行：

```bash
mkdir -p docs/acceptance/step6-round12
ROUND12_ACCEPTANCE_DIR=docs/acceptance/step6-round12 npm test -- --reporter=json --outputFile=docs/acceptance/step6-round12/test-results.json
```

该命令更新合成样例 UUID／时间；不连接外部模型，不需要真实密钥。只清理自己创建的 Docker 容器。普通 npm test 不生成新数据库样例文件。

全量测试 377 passed／0 failed／0 skipped，15 个文件。本轮增加 7 项业务测试（服务测试合计 35），补强完整路径变量和版本断言：本地 OpenAI 兼容 HTTP Adapter 与真实 PostgreSQL 闭环、违规输出安全兜底、完全 blocked、模型失败恢复与网络重复、非法研究变量、无查询的过期迟到、SIGKILL 后真实 API 重启。

[HTTP Adapter 闭环](acceptance/step6-round12/http-adapter-chain.json)走 OpenAICompatibleAdapter 的 HTTP 协议访问本机 fixture，证明业务编排能穿过 Adapter；仍是合成响应，外部真实模型调用为 0。[测试 JSON](acceptance/step6-round12/test-results.json)记录实际测试；工程检查以验收 summary 为准。

## 8. 当前已知问题

没有正式业务 UI、部署或外部持久数据库。真实模型、研究者语义审查和正式量表仍未验收。固定的 model_settings／model_name 标识请求的模型与参数，供应商返回的独立修订号目前未采集，不能宣称已保存未知的供应商 model_version；token_usage 仍为空。

配置的策略可包含不安全兜底，运行 Validator 会阻止展示，但发布时没有证明每个兜底在所有研究上下文中都安全。scene_state／character_profile 当前是文本，尚非正式复杂场景 schema。source 保持兼容可选，历史别名不回填；这些区别需 GPT 和研究者明确复核。

单一 bootstrap 管理员身份、进程内登录限流、限量 JSON 导出、消息无分页、无独立生成队列／主动推送与生产 RLS／备份恢复演练仍待完成。恢复依赖访问或生成结束，未过期的中断回合继续显示 generating，过期后才转 failed；不会自动重复付费。两个不同 request_id 即使文本相同也被视作两个显式请求，不承诺跨键去重或供应商恰好一次计费。
