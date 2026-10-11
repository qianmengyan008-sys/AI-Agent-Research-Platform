# 第十九轮：真实回复审核工具与人工审核说明

本轮用户选择先交付阻塞报告与审核工具。密钥和模型名仍未注入；真实模型运行与研究者语义审核未完成。使用[安全配置指南](round18-live-model-guide.md)解除阻塞；不要把密钥发送到聊天或存进 Git。

## 从实际报告生成审核材料

配置完成后，在项目根目录手动运行已有真实业务验收，随后离线生成表。后一个命令不调用模型、不连接数据库：

```bash
npm run live:business:e2e -- /tmp/round19-real-business.json
npm run review:real-model -- /tmp/round19-real-business.json /tmp/round19-review
```

输出 /tmp/round19-review.json 与 /tmp/round19-review.md。输出已存在时拒绝覆盖，换一个新前缀或另存原审核文件。初始所有 passed=null、review_status=pending_researcher_review、修复方案待填写；机器字段不替代人工结论。缺配置 not_run 时表为 0 条，没有虚构输入、模型输出或成功示例。

工具使用本轮新增 observation 的 turn_id／session_id／stage／user_message_id／assistant_message_id，与数据库导出及管理员 debug_log 中模型日志关联；跨 session、缺少／重复追踪、错模型日志等拒绝提取，不按数组位置或时间戳猜配对。第十八轮及更早的有回复报告没有这些明确追踪字段，不能直接套入新工具；必要时重新生成报告，付费调用需在授权配置中手动执行。

工具默认只接受 real-provider 报告，拒绝 local-fixture 和带 mock 模型日志的“真实”样本。它仍依赖来源报告的范围声明，不能通过解析 JSON 独立证明供应商已调用。完整模型参数、延迟、重试、Validator、兜底与 error_code 按保存的 run 记录投影，不猜供应商修订号或 token 用量。

模型输出为空的 failed 回合保留 null，不以安全回复替换。final_research_variables 是会话完成后的研究变量，用于检查确认观点、两次评分、行动意愿及场景的一致性，**不是模型当时看到的 Prompt 或未来变量**。被丢弃候选正文没有保存时不重构或伪造。

## 本机演示只用于验证工具

明确传 --fixture 才能从本机报告生成演示表：

```bash
npm run review:real-model -- docs/acceptance/step6-round19/local-business-acceptance.json /tmp/round19-fixture-review --fixture
```

结果 scope=local-fixture、供应商调用 0、仍 pending，不能当成真实模型或语义通过。本轮演示包含两路径 18 条最终回复，另保留 guarded／failed／timeout 审核演示。所有测试材料都是合成数据。

## 逐条人工检查并签核

| 必填栏目   | 记录方法                                                               |
| ---------- | ---------------------------------------------------------------------- |
| 测试编号   | 使用 path 与 turn ID，保留消息和模型日志来源                           |
| 路径／阶段 | 从实际 observation／debug_log 获取，不由模型判断                       |
| 输入       | 用户消息原文；禁止用模型编造用户观点                                   |
| 期望行为   | 当前阶段的人工审核准则，可由批准的研究方案细化                         |
| 模型输出   | 实际 assistant 内容；失败为 null                                       |
| 是否通过   | 研究者填写通过／不通过／未验收，附审核者与日期                         |
| 问题类型   | 流程错误、状态错误、语言问题、指代问题、重复问题、数据问题             |
| 修复方案   | 引用具体回复与原因，优先 Prompt／Validator／语料，修订后对固定配置复验 |

认知逐项核对：不替换用户真实观点、不跳评分或四重构、打断后恢复、语言通顺和指代清楚；confirmed_belief 唯一来源固定，两次评分对象相同，action_intention 对应同一研究对象。两次评分数值允许变化，不要求四个变量数值／文本相等。

情感逐项核对：scene_state 和 scene_phase 的已提交来源、当前剧情不回退、不提前泄露、回应用户输入、无重复引导。结构数据合格不证明自然语言合格。

保留原始机器报告。建议复制提取结果为独立人工审核文件，再填 reviewer／reviewed_at／passed／problem_types／fix_proposal；不要覆盖原始 not_run，也不要擅改程序中的 Pilot／正式就绪结论。正式参与者原始记录不能直接提交 GitHub。

真实单轮、多轮、20–30 轮长上下文、供应商超时／异常样本仍需另行实际验收；本轮压力和异常材料仅是本机 fixture。内部 UI 可用不等于可开展真实模型 Pilot，后者至少需要真实调用、语义审核及研究者批准的试运行配置。
