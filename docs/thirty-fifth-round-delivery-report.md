# 第35次交付：两年正式部署决策与安全预备

2026-10-20（UTC+8）。对应附件《第32次反馈（正式部署需求补充修订版）》，按仓库最新序号归档为第35次，未覆盖历史第32次模型对比或第34次免费Staging交付。本报告可直接交给GPT继续指导。

## 当前结论

正式长期托管目标已明确，但平台、支付方式、可靠报价和预算尚未获批。本轮完成了两方案决策材料、独立Production基础设施预备入口、认证加密备份工具、私有存储/调度设计和本地真实恢复演练，并确认暂停前的本地30人HTTP/SQL测试已经通过。

**没有创建收费资源，没有支付，没有删除或重建已有环境/数据库，没有执行真实模型压力测试，没有取得真实公网URL。formal_ready=false。** 完整自动化和源码范围证据见acceptance/step6-round35，平台执行与研究审批未完成项不会标PASS。

## 本轮交付文件

| 附件要求                     | 实际交付                                                                                                                 | 完成边界                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 最多两个平台决策、支付和成本 | round35-platform-decision.md/.docx、round35-cost-worksheet.json                                                          | Render与阿里云中国站托管候选；官方价格读取失败、账户不可读，金额及总价保持null，不能宣称报价或支付已确认   |
| 正式独立Blueprint和环境变量  | 根render-production.yaml、scripts/production-preparation.mjs、round35-production-and-approval.md/.docx                   | 新production命名、独立数据库、关闭招募的基础设施入口；不是旧paid staging简单改名，不提供正式实验运行       |
| 异地备份脚本与私有存储设计   | scripts/encrypted-backup.mjs、production-backup-job.mjs、deploy/backup-retention-review.json、backup-storage-review.json | PG17逻辑备份、AES256-GCM、S3安全预检、地区/版本化检查、失败告警与非0退出；未部署运行器/定时器/真实对象存储 |
| 恢复手册和演练               | round35-backup-restore-runbook.md/.docx、local-backup-restore.json                                                       | 真实本地pg_dump/加密/解密/pg_restore与业务导出校验PASS；异地下载恢复NOT RUN，不能宣称自动云备份通过        |
| 30人验收计划与模板           | round35-concurrency-plan.md/.docx、round35-acceptance-results-template.json                                              | 本地真实HTTP/SQL+模拟模型证据保留；真实托管/模型/人工验收明确区分，预算未批准不执行                        |
| 非开发者逐步指南             | round35-researcher-next-step.md/.docx                                                                                    | 现在只做平台核价方向与预算边界选择，不让研究者一次填一堆Secret或点收费部署                                 |
| PASS/BLOCKED/NOT RUN状态表   | 下表及delivery-status.json                                                                                               | 代码预备、云资源、URL、备份恢复、并发、人工和招募分别记录，不给笼统完成率                                  |

## 已验证的工程行为

1. 新预备入口拒绝staging范围、错误数据库标识和任何开启招募的值；/api/ready检查实际数据库为空，拒绝含数据数据库但不改动数据。其他路由503，没有生成参与者、加载mentor-test-v1或模型调用。HTTP200只表示基础设施检查通过，响应明确research_ready=false与formal_ready=false。
2. 本地恢复演练使用3个合成账号、3条路径，6条消息、3条模型运行日志及4个变量。21张表计数一致，消息/状态/变量/模型日志快照相同，约束、complete=true导出、登录/历史和权限隔离通过。错误密钥、密文篡改、覆盖已有恢复文件均被拒绝。
3. 备份失败告警的本地模拟验证区分通知成功和失败，两种情况下备份作业仍失败；没有静默转为成功。实际通知端点未配置或发送。
4. 已确认先前被暂停的30人本地测试完成：认知/情感/日常各10，6波180个唯一轮次，真实HTTP/SQL，模拟模型162次（2重试、1兜底），外部模型请求0。首发消息P95=327.40ms是模拟200ms模型的本地结果，不代表真实供应商或云上容量。峰值PG连接10、等待49，不能据此认定现有付费规格足够。

本轮最终npm run check退出0：465项Vitest（28文件）、18项Playwright及类型/Lint/格式/构建全部通过。新增3项专项包括正式预备门禁、本地恢复/隔离与失败通知分支。最新完整回归结果以delivery-status.json和verified-check.log为准。初始类型检查发现新增测试访问可能为空的数组元素；修正显式边界检查后，下一次检查发现新增声明/证据JSON格式，已格式化。保留失败和最终日志，没有删测试或放宽断言。

## 没有修改的内容

相对ac02e88，第34次免费根render.yaml、deploy/render-paid.yaml、Dockerfile、原staging启动器和服务、实验核心、AI Orchestrator、Model Adapter、Prompt、Validator、研究材料/参数/轮次/评分、数据库schema/迁移及模型路由全部不变。本轮新增预备模式和独立运维工具，不接管当前B001/B002，不迁移或混合测试/正式数据。API Key、管理员Token、账号种子和数据库连接不打印、不写仓库。

当前正式业务运行入口与已批准材料加载器仍BLOCKED。研究者尚未批准正式Prompt/配置、知情同意、退出/保留政策及模型选择，不能把mentor-test-v1或内部体验说明当正式研究材料。将RESEARCH_RECRUITMENT_ENABLED改true也无法解锁本轮预备入口。

## 状态表

| 项目                                | 状态    | 说明                                                          |
| ----------------------------------- | ------- | ------------------------------------------------------------- |
| 基础设施预备代码与安全门禁          | PASS    | 本地隔离PG验证；不等于正式业务完整支持                        |
| 正式业务/批准材料加载               | BLOCKED | 研究者批准的版本清单、正式配置和启用实现尚缺                  |
| 本地加密及真实数据库恢复            | PASS    | 只证明本地合成数据恢复与业务完整性                            |
| 官方实时报价/实际支付核验           | BLOCKED | 来源访问受阻、无账户页面；总成本未知                          |
| 平台选择及资源费用批准              | BLOCKED | 等研究者选择核价方向和给预算边界，取得报价后另行批准购买      |
| 云资源创建/Render平台Blueprint校验  | NOT RUN | 未授权创建、未登录平台；不能断言用户账户里没有已有资源        |
| 真实HTTPS URL与线上健康/权限/持久化 | NOT RUN | external_url=null                                             |
| 自动定时异地备份/告警实际送达       | NOT RUN | 脚本已准备，运行器/依赖/身份/存储/调度尚未部署                |
| 异地对象存储真实恢复                | NOT RUN | 不能由本地恢复PASS代替                                        |
| 30人本地HTTP/SQL+模拟模型           | PASS    | 最新报告已确认完成，不代表生产容量                            |
| 30人托管HTTP/SQL与真实模型压测      | NOT RUN | 无平台、预算/供应商配额未批；真实执行器和硬费用限额需后续实现 |
| 本人两模型×三路径体验               | NOT RUN | 等实际URL和安全检查                                           |
| 40条人工语言审核                    | NOT RUN | 0条人工评分，不代签                                           |
| 导师放行                            | BLOCKED | 线上、体验、人审等门禁未满足                                  |
| 正式招募与数据收集                  | BLOCKED | formal_ready=false，预备入口根本不接受参与者                  |

## 平台、费用和剩余人工动作

最多两个方案详见平台决策报告。考虑现有银联/支付宝/微信支付条件，建议优先核验阿里云中国站的合规托管和人民币付款渠道，但未验证具体账户，不能保证支付宝/微信/银联或地域资格。若Render账户实际可付款，也可选Render。没有要求伪造地址、借不明银行卡、绕过验证或购买无人维护的服务器。

本轮无法提供可靠金额：价格页访问失败，未取得账户价格和支付信息。月费及24个月总额保持未知，公式和每项成本均给出；不将虚构价格或促销首月当两年报价。两年运维需指定维护人或托管服务，Codex会话不代替长期值守。

现在只需研究者回复：**优先核价的平台，以及24个月总预算上限（人民币）**。这是核价方向，不是购买批准。之后逐屏处理授权、准确费用预览、研究者批准、Secret录入与部署；每次只要求一个动作。后续若发现已有资源或数据，先只读检查并设计无损方案，不删除或重建。

## GitHub成果

发布work分支和固定标签round35-delivery，不合并main，不触发部署。项目ZIP包括全部跟踪源码、本轮新增脚本、Blueprint、原附件、本报告/Word、各项设计及验收成果；不包含依赖目录、运行时秘密或私人导出。

完整ZIP：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/archive/refs/tags/round35-delivery.zip

反馈报告：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round35-delivery/docs/thirty-fifth-round-delivery-report.md

平台决策：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round35-delivery/docs/round35-platform-decision.md
