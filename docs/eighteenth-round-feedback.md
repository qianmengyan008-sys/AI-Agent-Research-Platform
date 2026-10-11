# 第十八轮反馈：真实模型验收与正式实验就绪评估

日期：2026-10-11（北京时间）。依据[原始要求](inputs/eighteenth-round-requirements.docx)。**工程测试通过；真实模型 not_run；正式实验 not_ready。**

## 给 GPT 的反馈

本轮附件继续要求真实模型与正式就绪验收，没有提出需要重写的功能。核对运行环境和云环境草稿后，MODEL_API_KEY 未绑定、MODEL_NAME 未注入；DATABASE_URL 与 ADMIN_ACCESS_TOKEN_HASH 也未配置。实际运行真实业务验收命令，退出 2、not_run、供应商调用 0、数据库未启动。真实端到端验收仍未完成，不能由本机模拟服务代替。

本轮不修改应用代码、测试、依赖或迁移，而是重新运行既有测试，生成全新 UUID／时间／截图的证据，明确哪些工程检查通过、哪些正式条件仍缺。复用既有核心和验收入口符合“稳定性优先、不要扩展架构”的要求。

| 修改原因                        | 修改文件                                                                     | 测试／验证                              | 是否影响实验设计                  |
| ------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------- | --------------------------------- |
| 对照第十八轮要求做实际就绪评估  | docs/eighteenth-round-acceptance-report.md、对应 Word                        | 逐项引用本轮实际机器报告                | 否；不批准或修改研究条件          |
| 给 GPT 可审阅的反馈与新验收证据 | docs/eighteenth-round-feedback.md、对应 Word、docs/acceptance/step6-round18/ | 409 Vitest、15 Playwright，七张真实截图 | 否；合成身份、独立临时 PostgreSQL |
| 解除反复出现的模型配置阻塞      | docs/round18-live-model-guide.md、docs/round18-semantic-review-template.md   | 对照当前实际变量、入口与配置草稿        | 否；说明操作，人工审核仍未执行    |
| 保存本轮原始要求与更新最新入口  | docs/inputs/eighteenth-round-requirements.docx、README.md                    | Word 完整性与链接检查                   | 否                                |

## 八项交付

1. [真实模型结果](acceptance/step6-round18/real-model-business-report.json)：not_run，缺密钥与明确模型名，外部调用 0。真实延迟、重试、Validator、兜底测量为 null，未伪造参数。
2. [Acceptance Report](eighteenth-round-acceptance-report.md)：环境、功能、异常、路径、导出、Pilot、压力、阻塞与正式条件；同内容 Word 已打包。
3. [认知路径](acceptance/step6-round18/cognitive-special-acceptance.json)：冻结观点、两次同对象评分、四重构、评分中断恢复通过本机结构检查；8 个错误副本拒绝。
4. [情感路径](acceptance/step6-round18/emotional-special-acceptance.json)：场景明确来源、阶段顺序、规则询问不改状态通过本机结构检查；7 个错误副本拒绝。
5. [实际合成导出](acceptance/step6-round18/analysis-export.json)：包含要求的 11 类分析字段；complete=false、每类最多 1000，仍非正式全量归档。
6. [压力结果](acceptance/step6-round18/stress-results.json)：三路径各 30 回合、6 人各 5 回合并发，120 合成回合／240 消息槽位；不是供应商或正式容量测试。
7. [当前阻塞](acceptance/step6-round18/experiment-acceptance-checklist.json)：真实配置、语义审核、研究 schema／退出、全量归档、正式持久库／HTTPS／备份／容量。
8. [汇总](acceptance/step6-round18/summary.json)：409 Vitest＋15 Playwright＝424 passed；本轮新增用例 0。formal_ready=false。

消息网络重放、重复提交、超时、失败、API SIGKILL、新连接和页面连续刷新由真实 PostgreSQL／API／浏览器重新验证。违规与故障由本机合成注入，不能视为观察到真实供应商异常。Pilot 默认关闭、仅管理员认证并勾选后只读可见，参与者无诊断。

## 请 GPT 指导的下一步

优先按[操作指南](round18-live-model-guide.md)在 Codex 云环境设置安全绑定 MODEL_API_KEY 和明确 MODEL_NAME，确认运行环境实际注入后，使用既有真实业务入口。先审核合成真实回复与 guard intervention，再逐项解除正式实验门禁。模型名示例不证明账户有权限；不在聊天中发送密钥。

语义审核应按[审核表](round18-semantic-review-template.md)逐条引用实际回复：评分对象是否漂移、是否暗示评分、模型是否代写新观点、是否剧情回退或提前泄露。结构验收和 completed 都不能自动批准正式实验。

ZIP 包含整个源码项目、全部历史成果、本轮反馈 Word、正式报告 Word、原始要求和本轮验收目录；可下载后整个上传给 GPT。无需再次优先扩展架构。
