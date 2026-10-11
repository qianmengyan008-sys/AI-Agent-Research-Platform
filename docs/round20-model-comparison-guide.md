# GPT／DeepSeek 切换与同组对比操作

只改变 Model Adapter，核心状态机、编排、Validator 和 Prompt 不变。两个模型都走现有兼容 HTTP 接口，模型名和地址来自环境，业务代码没有绑定具体模型。

## 环境切换

| 变量             | GPT                                              | DeepSeek                                                |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------- |
| MODEL_PROVIDER   | gpt                                              | deepseek                                                |
| 模型名           | GPT_MODEL_NAME（明确指定账户可用型号）           | DEEPSEEK_MODEL_NAME（明确指定账户可用型号）             |
| HTTPS API 根地址 | GPT_API_BASE_URL，默认 https://api.openai.com/v1 | DEEPSEEK_API_BASE_URL，默认 https://api.deepseek.com/v1 |
| 安全密钥绑定     | GPT_API_KEY，目标为实际 GPT 服务域               | DEEPSEEK_API_KEY，目标为实际 DeepSeek 服务域            |

GPT 内部 provider 仍记 openai-compatible，DeepSeek 记 deepseek，避免改动已有日志／数据契约。OpenAI-compatible／mock 原通用选择继续兼容；自定义兼容服务仍可设自己的 HTTPS 根地址。MODEL_NAME／MODEL_API_BASE_URL／MODEL_API_KEY 保留通用后备，所选 provider 的 scoped 值优先（显式空值也优先，必须修正或移除）。

两家比较则严格要求两套 scoped 密钥与模型名，不回退到共用密钥或地址。scoped 地址未设置时使用对应默认 HTTPS 域。避免把旧通用 MODEL_API_BASE_URL 留作另一家的地址；日常切换推荐设置对应 scoped 地址。密钥只放云环境安全设置，不发聊天、不写 Git。根 .env.example 不自动加载。

共同参数：MODEL_TEMPERATURE（默认0.2）、MODEL_MAX_TOKENS（512）、MODEL_TIMEOUT_MS（10000）、MODEL_MAX_ATTEMPTS（2，范围1–3）。模型必须支持既有 Chat Completions 文本与参数协议；不兼容型号不能靠改实验逻辑绕过。

环境选择在构造 Adapter／启动服务时应用，需要重启对应实例。已有固定实验分配与模型版本不自动改写；正式研究中不能无记录更换模型。新比较入口使用合成、隔离的库外快照，不修改进行中的实验。

## 同组对比入口

配置两家的 scoped 变量并确认实际注入后，从项目根目录手动执行：

```bash
npm run compare:models -- /tmp/round20-real-comparison
```

生成 JSON 与 Markdown，输出已存在时不覆盖，使用新前缀。真实调用默认64轮，最多128次尝试；配置上限3次时最多192。必须手动执行，可能产生供应商用量；不放进 npm run check／安装脚本。

任一 scoped 密钥／模型名缺失则整体 not_run、退出2，两家均不调用，指标保持null。配置或意外运行失败退出1，不假设未知调用为0。已执行全部案例但有生成失败／状态变化时 completed_with_errors、退出1。完成采样退出0不意味着语义通过或正式就绪。

## 公平性和指标解释

两条路径共16个当前阶段，另复用16个既有拒答、观点、评分、场景及跳步骤回归，共32个固定案例。每个 provider 都从同一合法前置状态构建独立快照；同一输入、Prompt／策略、参数和suite_sha256，两边初始Prompt哈希必须相同。交替AB／BA先后顺序；每家失败不会取消另一家或丢掉难例。

这是独立当前阶段语言对比，不是参与者实际多轮剧情、生产数据库端到端或正式实验验收。前置事件来自既有后端模拟器，不由模型生成。若要比较持续对话、更多种子或目标网络环境，须另行采用批准的同组采样，不改实验逻辑。

| 指标               | 定义与限制                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 延迟 p50／p95／max | 整次编排墙钟毫秒，含重试、校验和兜底；不是供应商纯HTTP延迟                                                                                                |
| 流程错误率         | 有任一 STAGE_JUMP／CURRENT_STAGE_RESTRICTION／CONTROL_INSTRUCTION／BACKEND_DISCLOSURE／WRONG_SCENE 的案例数÷32；捕捉所有尝试中的规则违规，是Guard代理指标 |
| 状态违规次数       | 模型生成期间完整后端快照（含变量）发生变化的案例数；语言违规与实际状态写入是两项不同指标                                                                  |
| 生成失败／兜底     | 单独记录失败案例、重试、fallback，不把安全兜底当原始模型质量通过                                                                                          |
| 人工语言质量       | clarity／logic／reference／non_repetition／experiment_fidelity，初始全null；human_passed、reviewer、reviewed_at等待研究者                                 |

candidate_outputs 保留实际 Adapter 返回的原始候选文本，与最终 output（可能为兜底）分开；失败不保留供应商异常正文，超时后才完成的迟到候选不重构。审核应逐条看原始候选和恢复记录，不把安全兜底误评为模型原始质量。

语言质量可采用经研究者批准的1–5分尺度，明确锚点和评分者一致性；建议隐藏供应商标签盲评。上述维度只是待填写框架，本轮没有人工打分、平均分或胜者。程序不自动汇总未经批准的评分。

## 本机演示和正式门禁

```bash
npm run compare:models -- /tmp/round20-fixture-comparison --fixture
```

显式 local-fixture、两个Mock合成回复、外部调用0。该结果只验证同组采样与指标计算；本机亚毫秒差异不能外推 GPT／DeepSeek 延迟或质量。HTTP 参数和密钥选择另由注入传输测试验证，没有向供应商发送测试密钥。

真实报告须研究者审核合成内容后妥善保存。全量归档、研究方案／退出流程、持久数据库、HTTPS／权限／备份和目标容量继续阻塞正式实验；切换模型或完成对比不自动解除这些门禁。
