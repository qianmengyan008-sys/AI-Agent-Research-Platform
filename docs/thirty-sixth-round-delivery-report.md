# 第36次交付：阿里云中国站核价与三档成本情景

2026-10-20（UTC+8）。对应用户侧《第33次反馈：基于round35交付的部署决策与后续验收》，仓库继续编号为第36次，不覆盖历史交付。本报告可直接交给GPT继续指导。

## 核实结论

本轮未能取得阿里云中国站支付/地域和实时价格证据。官方价格页普通及提升权限访问均HTTP403；支付/SAE文档普通访问403，后续提升权限读取被中止，结果未知。没有读取账户页面，不能判断是源站、访问链路或账户问题，不能据此声称该账户不能付款或该地域不存在。

**支付可用性、SAE常驻/新加坡地域、RDS PG与异地OSS、HTTPS/出口、三档24个月总价均BLOCKED。** 未创建收费资源、付款、录入Secret、部署、调用模型或改研究逻辑。Render仅保留备选，未核实其账户支付、PITR窗口及续费成本，不能转为自动推荐购买。

附件允许在无法读取准确报价时改用控制台逐屏核价；本轮已提供该路径。没有猜人民币价格，没有再要求研究者先报预算。三档都拆分了完整成本，但数值与合计仍标“待控制台核价”，不是已取得的三张官方报价。

## 本轮材料

| 要求                 | 交付                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一页中文决策表       | round36-decision-one-page.md/.docx：优先阿里云、Render备选，已核实/阻塞/用户事项明确区分                                                                  |
| 三档人民币24个月成本 | round36-three-scenario-costs.md/.docx/.json：递增目标规格、统一计费假设；Web、DB/PITR、异地存储/请求/运行器、网络/HTTPS、日志、税、运维与模型费用全部单列 |
| 逐屏核价指南         | round36-single-step-quote-guide.md/.docx：当前只进费用与成本首页；后续收到反馈后逐屏，不要求现在付款/Secret                                               |
| OSS兼容性审查        | round36-oss-compatibility-review.md/.docx：逐项列出S3安全API与OSS待适配能力，不是改Endpoint即完成                                                         |
| 部署前证据清单       | round36-predeployment-checklist.md/.docx：30人、HTTPS、权限、恢复/导出、预算硬限额、异地备份/告警和人审逐项门禁                                           |
| 状态与来源记录       | acceptance/step6-round36/delivery-status.json、official-source-status.json、validation.json                                                               |

三档Web目标分别为1vCPU/2GiB×1、2vCPU/4GiB×1、2vCPU/4GiB×2；RDS目标递增。**均为待验证的核价目标，不是已确认可买的规格，也不是30并发已达标配置。** 任何候选不能满足常开/持久化/HTTPS/备份或地域资格，就应剔除重报，不偷偷降低硬要求。

费用计算按实际24个月逐期费用累加，区分优惠和续费，不把首月折扣乘24；税如已含不重复计入；模型依赖实际服务商和用量单独计算。两年服务期不等于所有数据必须存两年。未确认金额在JSON保持null，不把null或缺失项目当0。

## 备份与30人容量审查

实际脚本调用get-bucket-location、get-public-access-block（四项AWS开关）、get-bucket-policy-status、get-bucket-versioning、put-object（AES256服务端加密）和head-object（长度检查）。尚未验证OSS对这些接口/语义的兼容性；需原生适配、安全策略等效核验、实际上传下载SHA256/GCM认证与独立恢复，不删安全检查。物理异地、生命周期、依赖运行器/调度、缺失心跳和真实通知均未验收。平台PITR与异地逻辑备份分开核价和恢复验证。

容量只提出候选规格与验证顺序：托管30独立HTTP/SQL会话搭配模拟模型，随后单独批准请求/token/金额硬上限后才真实模型压测。多实例累计连接、事务/锁等待、CPU/RSS、模型RPM/TPM等必须实测，不能将本地P95当线上指标，也不先打真实压力请求。

## 本轮修改与验证

**无应用代码改动。** 仅新增本轮文档、Word、结构化核价/状态表和原附件。experiment-core、AI Orchestrator、Model Adapter、Validator、Prompt、研究材料/规则/轮次、数据库schema/迁移、模型路由、全部部署配置及B001/B002保持e38bec7基线不变。

本轮不重跑应用构建/测试、不发模型请求。执行文档格式检查、三档结构/金额缺失值检查、状态门禁检查、Git差异及归档完整性检查，结果见validation.json；上一轮465项Vitest和18项Playwright仅为历史证据，不冒称本轮重新通过。未触发部署或合并main。

## 更新状态

| 项目                                     | 本轮状态              |
| ---------------------------------------- | --------------------- |
| 代码基线/历史本地工程证据                | 保留，不扩大发布结论  |
| 中国站支付、目标地域、规格组合、三档费用 | BLOCKED，待控制台证据 |
| 创建收费资源/线上部署                    | NOT RUN               |
| 实际HTTPS URL                            | null                  |
| 托管30会话/真实模型并发                  | NOT RUN               |
| 自动异地备份及真实异地恢复               | NOT RUN               |
| 研究者自由体验与40条人审                 | NOT RUN，0/40         |
| mentor_test_ready / formal_ready         | false / false         |

## 当前只需一个手动动作

打开 https://usercenter2.aliyun.com/home ，用本人中国站账号登录，**只告诉我是否看到“费用与成本”首页，或页面显示的非敏感提示**。不点充值、付款或创建资源，不录入密钥；现在不需要截图、账号、余额、订单或支付信息。得到反馈后再指导下一步核对支付/计价页面。

预算上限继续未定，只有取得可审阅的三档完整费用预览，才让研究者选择平台、预算以及是否授权购买。

## GitHub交付

work分支，固定标签round36-delivery。完整ZIP含全部跟踪源码和历史材料、本轮原附件、反馈/Word、三档表及核价/兼容/门禁材料，没有运行时Secret或本轮真实参与者数据。精确提交以GitHub标签指向为准。

完整ZIP：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/archive/refs/tags/round36-delivery.zip

本轮反馈：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round36-delivery/docs/thirty-sixth-round-delivery-report.md

三档情景：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round36-delivery/docs/round36-three-scenario-costs.md
