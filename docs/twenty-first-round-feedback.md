# DeepSeek Flash 专项反馈（第21次交付）

日期：2026-10-12（北京时间）。依据[原始附件](inputs/round21-deepseek-flash-requirements.docx)，附件标题为“第二十轮反馈”。为保留上一轮已交付的双模型比较成果，本次使用第21次交付编号，不覆盖历史材料。

**本轮选择 deepseek-flash，只做单模型前置检查；GPT／双模型比较不作为门禁。真实 smoke 尚未发送，正式语义审核未执行，pilot_ready=false。**

## 给 GPT 的反馈

已按指定选择 provider=deepseek、requested_model=deepseek-flash、HTTPS根地址https://api.deepseek.com/v1。非秘密配置通过命令环境变量明确应用；运行时 DEEPSEEK_API_KEY 仍未安全注入。用户在聊天中提供的密钥未复制到工具参数、仓库、报告或图片。请通过云环境 Secret 安全绑定，聊天中出现的密钥建议撤销并更换。

实际前置检查退出2／not_run，缺DEEPSEEK_API_KEY，Adapter调用0、外部调用0、request_sent=false。response_model／HTTP状态／真实延迟均null。用户提供的“路由到DeepSeek V4.1 Flash”仅为未核实路由信息，不作为实际供应商标识。没有伪造成功调用或完整真实对话。

新增单次 smoke 与 per-call metadata：至多一次Adapter请求，不经过实验Prompt或状态迁移，不重试；记录请求模型、响应model字段、HTTP状态、总延迟、失败层级。响应model未返回就留null，不推断供应商版本；并发请求不共享“上次响应模型”。原generate文本接口保持兼容。

| 修改原因                     | 修改文件                                                                        | 测试结果                                               | 是否影响实验设计                   |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| 区分请求名与供应商响应标识   | model-adapter/src/providers/openai-compatible-adapter.ts、src/index.ts          | 元数据、缺失标识、并发隔离、原接口兼容                 | 否；新增可选测量接口，不改业务状态 |
| 单次最小协议验证、失败即停   | model-adapter/examples/deepseek-flash-smoke.ts、smoke-deepseek.ts、package.json | 独立DeepSeek密钥、一次请求、不重试、受控错误层级       | 否；技术问候不属于研究Prompt       |
| 长尾统计不采用武断1秒门槛    | 同上latencySummary及flash-smoke.test.ts                                         | P50/P95/max、严格超过3s/5s、retry/fallback、空样本null | 否；只读诊断                       |
| 保留输入、准确交付与差异清单 | 本轮反馈／报告／指南／Word、README、验收目录与原始Word                          | 435 Vitest＋15 Playwright，450 passed                  | 否；研究要求未擅自签核或改状态机   |

本轮新增9项测试，无新依赖／迁移，锁文件未改。experiment-core、AI Orchestrator、Validator、Prompt、数据库、前端、业务服务与阶段设计均冻结。未发现真实协议不兼容证据，因此没有猜测新增供应商专用协议。

## 十项输出

1. [安全配置摘要](acceptance/step6-round21/environment-check.json)：DeepSeek Flash非秘密选择已应用，密钥未注入；不要求GPT。
2. [smoke结果](acceptance/step6-round21/deepseek-flash-smoke.json)：not_run／退出2、没有发送真实请求。
3. [真实认知路径记录](acceptance/step6-round21/real-cognitive-result.json)：not_run，无真实对话；本机HTTP回归另存。
4. [真实情感路径记录](acceptance/step6-round21/real-emotional-result.json)：not_run，无真实对话；本机场景记录不代表正式故事。
5. [历史回归](acceptance/step6-round21/test-results.json)：435 Vitest、15真实浏览器，450 passed；数据库/API、干扰、压力、恢复及7张截图重新生成。
6. [真实语义审核表](acceptance/step6-round21/real-model-semantic-review.md)：0条，人工评分未执行；同内容Word已打包。
7. [延迟与重试／兜底](acceptance/step6-round21/latency-report.json)：真实样本0、P50/P95/max与超过3s/5s统计null；本机统计明确分开。
8. [模型名对应关系](acceptance/step6-round21/model-identity.json)：requested_model=deepseek-flash、response_model=null、路由未核实。
9. [剩余问题](acceptance/step6-round21/research-requirements-gap.json)：安全密钥、正式Prompt冻结、规定互动轮次、正式场景/开场、气泡、行动意愿对象等尚未验收。
10. [Acceptance Report](twenty-first-round-acceptance-report.md)：pilot_ready=false，依据为真实smoke未通过、正式Prompt未确认、语义未签核；不是双模型配置阻塞。

## 下一步

先按[操作指南](round21-deepseek-flash-guide.md)在云环境Secret绑定新DEEPSEEK_API_KEY并保存配置，核对实际注入后执行一次smoke。失败即停，修复对应鉴权／网络／模型／参数／协议问题，不改状态机规避。

正式StagePolicy、prompt_version、研究者批准的开场、固定场景与每个重构规定轮数尚未提供。既有真实业务入口明确使用demo_policies=true，不能当正式Prompt验收。smoke通过也不自动继续整套实验、签核语言质量或设pilot_ready=true。需先提供/冻结正式研究材料，明确缺口再按授权复验。

ZIP包含整个源码、全部历史成果、原始要求Word、反馈Word、Acceptance Report Word、真实审核表Word、本轮报告、测试和截图。所有素材没有明文密钥。
