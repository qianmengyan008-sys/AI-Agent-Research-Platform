# 第二十轮反馈：GPT／DeepSeek 可切换 Adapter 与配对对比

日期：2026-10-11（北京时间）。依据[用户要求](inputs/twentieth-round-requirements.md)。本轮聚焦模型差异，保持实验逻辑不变。**切换与对比工具完成；真实双模型测试缺配置 not_run，人工评分未执行。**

## 给 GPT 的反馈

现有 OpenAI 兼容 HTTP Adapter 保持通用，不在业务代码固定模型。新增 MODEL_PROVIDER=gpt 别名（内部仍 openai-compatible）和独立 GPT／DeepSeek 环境配置；MODEL_PROVIDER=deepseek 沿用既有兼容协议。两家可分别选择模型名、HTTPS 地址、密钥，替换仅发生在 Model Adapter 构造时。公共参数统一用于配对比较。

当前 GPT_API_KEY／GPT_MODEL_NAME／DEEPSEEK_API_KEY／DEEPSEEK_MODEL_NAME 均未注入，旧 MODEL_API_KEY／MODEL_NAME 也缺失。实际运行真实对比入口返回退出 2、not_run、外部调用 0。真实延迟、流程错误率、状态违规次数、人工质量评分均为 null，不能用本机演示选出胜者。

| 修改原因                               | 修改文件                                                           | 验证内容                                                    | 是否影响实验设计                                 |
| -------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------ |
| 环境选择 GPT 或 DeepSeek，保留通用接口 | packages/model-adapter/src/config.ts                               | 两家密钥／模型／地址分离，scoped 优先，原通用配置兼容       | 否；返回既有 provider 值，未改业务条件           |
| 同一测试集对比而不改实验阶段           | packages/model-adapter/examples/provider-comparison.ts             | 两路径全部16阶段＋16既有回归，32案例/家，初始Prompt哈希相同 | 否；隔离快照、明确模拟前置事件，不用模型输出推进 |
| 可复现的真实／模拟对比入口             | packages/model-adapter/examples/compare-providers.ts、package.json | 两家配置齐全才真实调用；--fixture 明确标本机演示            | 否；独立验收命令，不参与业务请求                 |
| 配置、指标和隔离必须可验证             | packages/model-adapter/tests/provider-comparison.test.ts           | 新增9项，范围、参数、失败、错误语言和无模型调用检查         | 否；仅合成数据和注入传输                         |
| 交付可审阅报告及配置操作               | .env.example、README、本轮反馈／报告／指南与验收目录               | 文件、Word、JSON、链接与完整回归                            | 否；示例无凭据                                   |

experiment-core、AI Orchestrator、Validator、Prompt、数据库、迁移、前端、业务服务及历轮验收逻辑均未修改。无新依赖，锁文件未改；只增加 Adapter 配置、对比验收与辅助文档。

## 本轮验收

[Acceptance Report](twentieth-round-acceptance-report.md)与[模型切换／对比指南](round20-model-comparison-guide.md)包含操作、度量定义和人工评分流程。[实际真实对比](acceptance/step6-round20/real-model-comparison.json)为 not_run；[本机64条演示](acceptance/step6-round20/fixture-model-comparison.json)不是 GPT／DeepSeek 实际性能。

本轮 426 项 Vitest＋15 项 Playwright＝441 passed、0 failed／skipped，新增 9 项 Adapter／对比测试。两家初始请求相同、共同参数一致、状态快照和变量不因回复变化。人为坏回复可被现有 Validator 捕捉；状态仍不变，人工分数仍空。数据库、三路径压力、重放、失败、恢复及七张截图重新留存本轮证据。

## 对比结论与下一步

**尚无真实模型差异结论，无优劣排名。** 两家的真实延迟、规则流程错误和状态违规次数均未测量；人工质量审核未完成，Pilot／正式实验不放行。

云环境草稿已保存两家独立密钥与模型名／地址要求，新增允许域api.deepseek.com；未注入密钥、未更新运行实例、未发布。

在云环境设置分别安全绑定 GPT_API_KEY、DEEPSEEK_API_KEY，指定 GPT_MODEL_NAME、DEEPSEEK_MODEL_NAME，再手动执行 compare:models。工具不共享密钥或端点，不会偷偷只跑一家的“对比”。默认每家32个案例，共64轮；默认最多128次 Adapter 尝试，上限192。真实调用会产生服务商用量，不纳入安装或普通 check。

研究者按记录中的五项待评分维度审阅原始回复，并记录审核者和日期；建议盲评、批准评分准则、重复配对采样后再比较。Validator 流程错误率是规则代理指标，不能替代语义审核。整个项目 ZIP 包含源码、历轮成果、反馈 Word、Acceptance Report Word、对比表 Word、本轮真实／模拟报告、配置示例、测试和截图，可整体上传 GPT。
