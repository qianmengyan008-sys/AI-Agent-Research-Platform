# Step 5 模型服务配置与验收操作

本轮已实现 OpenAI Compatible HTTP Adapter，常规自动化测试使用真实适配器连接本地模拟 HTTP 服务；真实外部模型验收是单独的 live:e2e 命令。本轮当前环境缺少 MODEL_API_KEY 和 MODEL_NAME，因此真实模型报告为 not_run，不能视为真实模型验收通过。

## 环境变量

| 变量               | 默认／示例                | 说明                                                                               |
| ------------------ | ------------------------- | ---------------------------------------------------------------------------------- |
| MODEL_PROVIDER     | mock                      | 常规开发默认离线；真实选择 openai-compatible 或 deepseek                           |
| MODEL_API_BASE_URL | https://api.openai.com/v1 | 兼容 API 根地址，不含 /chat/completions；DeepSeek 默认 https://api.deepseek.com/v1 |
| MODEL_API_KEY      | 无                        | 只通过云环境安全设置注入，不放入 Git 或聊天                                        |
| MODEL_NAME         | gpt-4.1-mini 为配置示例   | 真实调用必须明确填写账户可用且支持本协议的模型名称                                 |
| MODEL_TEMPERATURE  | 0.2                       | 0–2；应由研究者批准                                                                |
| MODEL_MAX_TOKENS   | 512                       | 整数 1–32768，实际上限还受供应商约束                                               |
| MODEL_TIMEOUT_MS   | 10000                     | 每次尝试的截止时间，整数 1–60000ms                                                 |
| MODEL_MAX_ATTEMPTS | 2                         | 包含首次的总尝试预算，整数 1–3                                                     |

根目录 .env.example 仅作为示例，不自动加载。优先使用 Codex 云环境设置注入变量；本仓库没有 dotenv 依赖。不要把真实 .env 文件或密钥提交到 Git。

已通过 cloud-environment-onboarding:setup 工作流保存变量建议和 MODEL_API_KEY 的安全绑定需求，目标域为 api.openai.com。保存草稿不等于密钥已输入、运行环境已更新或环境已发布。当前未鉴权请求已得到 api.openai.com 的 HTTP 401，证明该次网络请求到达服务，不证明账号权限或模型访问有效。

如果使用自定义兼容服务，需要设置自己的 HTTPS baseURL 和模型名，并把对应域加入云环境网络与秘密绑定的允许目标；不要直接复制陌生地址。DeepSeek 使用相同 HTTP 兼容实现和独立配置预设，当前没有真实调用验收。Claude 原生协议尚未实现。

## 调用示例

```typescript
const { generator, settings } = createConfiguredGenerator(serverEnvironment);
const result = await orchestrate(trustedCurrentStageRequest, generator, {
  timeoutMs: settings.timeout_ms,
  maxAttempts: settings.max_attempts,
});
// Participant output contains text only. Backend owns logs and version checks.
const reply = participantReply(result);
```

供应商只接收 model、messages、temperature、max_tokens、stream=false。PromptBundle 的调试字段、完整 state、未来流程、tools、实验变量写入接口和管理员元数据均不发送。temperature / max_tokens 的供应商兼容性必须按所选模型确认；不支持 Chat Completions 或这些参数的模型需要另一个 adapter。

HTTPS endpoint 不能含 URL 账号、密码、查询或 fragment；拒绝重定向，避免把 Authorization 发送到重定向目标。HTTP 只允许显式本地测试的 loopback 地址，环境配置不能打开不安全 HTTP。

Adapter 单次 generate 只请求一次。429、5xx 和连接异常可重试；401/403、无效请求和异常响应格式不重复请求，直接进入编排层兜底。回复文字违规仍由 Validator 拦截并受统一次数预算重新生成。没有供应商内部隐藏重试或额外 prompt 拼接，当前也没有 Retry-After 退避调度；如需长期限流调度，应后续单独实现。

读取成功响应最多 1 MiB，验证 choices[0].message.content 为文本，拒绝非空工具调用或 function_call。服务商错误正文、密钥和传输错误详情不会进入实验回复或运行日志。

## 复现常规检查与本地 HTTP 流程

```bash
npm ci
npm run check
npm run example:http
npm test -- --reporter=json --outputFile=/tmp/step5-tests.json
```

这些命令不调用真实模型，不需要模型密钥。example:http 在临时 loopback 端口启动测试服务，通过实际 HTTP 请求运行完整认知和情感路径，以及 13 个实验回归场景、单轮、三轮连续对话和长上下文，结束后关闭服务。

## 真实模型验收命令

在云环境设置安全填写 MODEL_API_KEY 和 MODEL_NAME，确认 MODEL_API_BASE_URL 对应自己的服务、允许网络目标和账户权限后，从仓库根目录执行：

```bash
npm run live:e2e -- /tmp/step5-live-e2e.json
```

此命令明确选择真实供应商：当 MODEL_PROVIDER 为默认 mock 时，切换为 openai-compatible，不会把 mock 当作真实验收。Node 的 --use-env-proxy 使用云平台已有 HTTP(S)_PROXY / NO_PROXY 路由，保留 TLS 证书校验。

只使用合成参与者数据。正常完整流程有 16 次阶段调用，另有 13 个回归输入和 5 次上下文专项调用，共 34 次生成；默认最多 68 次 HTTP 尝试，配置上限 3 次时最多 102 次。真实模型请求会产生服务商用量；没有额外握手或无关请求。

退出与报告语义：

| 报告状态                           | 退出码 | 含义                                                   |
| ---------------------------------- | ------ | ------------------------------------------------------ |
| not_run                            | 2      | 缺少 MODEL_API_KEY / MODEL_NAME，未调用供应商          |
| failed / provider_or_flow_failed   | 1      | 配置异常、供应商失败或当前流程被阻断；可能包含部分调用 |
| completed                          | 0      | 合成流程完成，所有最终回复均通过文字规则且未发生恢复   |
| completed_with_guard_interventions | 0      | 合成流程完成，但出现重试／兜底／违规拦截，需要逐项查看 |

零退出码不证明语义符合实验设计。semanticReview 始终标为 pending_researcher_review。真实报告保存模型参数、每次候选输出、校验、恢复、日志、后端迁移和最终快照；应逐项核对是否有构念漂移、评分暗示和故事动作越界。

realProviderCalls 记录实际进入 Adapter.generate 的尝试数，包含失败尝试，不是供应商账单或成功回答数。若供应商持续失败，本次路径停止，不能由本地兜底伪造真实完整模型结果。

## 运行日志和边界

experimentLog 生成服务端记录：conversation_id、participant_id、state_before、state_after、model_name、prompt_version、temperature、max_tokens、retry_count、response_latency（毫秒）、validator_result、fallback_count（当前合成会话累计兜底数）。state_before / state_after 是阶段、版本和生命周期的控制快照，不含观点、评分或聊天正文。完整合成状态另存于验收记录，不是生产参与者日志。

participantReply 只投影 text。管理员日志、完整 Prompt、供应商错误和控制快照不展示给参与者。当前只提供日志对象和 JSON 验收记录，没有管理员页面、日志数据库或生产日志持久化。

状态机未修改；模型输出不能写变量或提交事件。正式实验服务仍需数据库原子保存、异步回复版本再核对、授权、退出实验和数据导出等后续工作。用户在合成测试中要求提前结束不会让模型改状态；真实参与者撤回／退出机制应由后端另行定义，不能靠语言模型自行决定。

第八轮补充：retry_count 为编排层重试次数（attempts − 1），包含文本违规后的重新生成，不仅是传输重试。response_latency 记录整次编排耗时，包含重试、校验和兜底。旧调用者未提供模型参数时记为 null，不猜测参数。localFaultInjection 中的异常与拦截为本地注入，不计真实供应商调用；真实供应商错误必须根据实际报告记录，不为测试刻意向服务提交坏密钥。completed 要求所有案例执行且状态不变、最终未 blocked、无生成失败；semanticReview 尚待研究者审核，业务层门禁仍须人工确认。
