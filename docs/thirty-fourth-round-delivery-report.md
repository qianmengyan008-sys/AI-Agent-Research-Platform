# 第34次交付：免费 Staging 与双模型内部体验

2026-10-17（UTC+8）。本报告可直接交给 GPT 继续指导。对应附件《第31次反馈：执行Render公网部署与双模型研究者体验》；用户本次明确将当前体验环境改为免费，其要求优先于附件中的付费套餐条款。

## 完成了什么

根目录render.yaml的Web计划由standard改为free，PostgreSQL由basic-1gb改为free。**除此两项，根Blueprint配置不变**：继续work分支部署、Docker、./Dockerfile、/api/ready、Singapore、自动部署关闭，全部环境变量及B001/B002双模型设置保持原样。没有改API Key或Codex Environment。

原付费Blueprint逐字节保存在deploy/render-paid.yaml：Standard Web + Basic 1GB PostgreSQL。未来正式部署方案仍保留，但不作为当前体验前置条件。此文件仍沿用原隔离staging资源命名，未来正式部署应先核对目标资源、隔离和正式验收；本轮没有把正式部署配置应用到任何平台。

实验状态机、AI Orchestrator、Model Adapter、Prompt、Validator、研究材料、研究变量、数据库迁移、账号种子及运行批次完全未改。修改仅涉及部署YAML、文档和验收材料；原始反馈附件仅作存档。

## 验收证据与限制

| 类别              | 结果                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Blueprint静态核对 | 根配置对比87902d4仅两个plan变化，均为free；付费副本与旧根配置逐字节一致；引用DB、区域、变量、健康检查、自动部署和批次保持一致           |
| 本轮专项回归      | 重新执行现有双模型托管、传输审计、分层人评专项：3个文件/3项测试通过，含隔离PostgreSQL实际业务验证；结果和日志见acceptance/step6-round34 |
| 完整回归/容器     | 本轮未重跑全套或重建镜像，因为应用和Dockerfile未变；第33次462项Vitest、18项浏览器及22项容器通过证据原样保留                             |
| Render平台        | 未登录用户Render账户，未执行平台Blueprint校验、创建资源或查看其账单/账户资格；只能声称本地配置核对完成                                  |
| 公网与托管DB      | external_url=null；/api/ready、外部TLS/设备、真实托管持久化、权限和完整导出均待实际网址验收                                             |
| 真实模型请求      | 本轮未执行，不扩大付费测试；实际响应模型名和延迟尚待部署后测量；原164条真实样本保留                                                     |
| 人工审核          | 40条分层包仍有0条人工评分；两模型各三条路径共6次本人体验尚未完成，不代签、不宣布模型优胜                                                |

Render官方文档链接为https://render.com/docs/free 和 https://render.com/docs/blueprint-spec。本次运行环境未能取得其页面，未冒称最新平台在线校验通过；最终字段/免费资格/套餐可用性以Render实际创建预览为准。若平台拒绝字段，保留脱敏原始错误后作最小部署配置修正，不改研究逻辑或增加付费资源。

## 免费版边界

Free PostgreSQL **30天到期、无备份**；Free Web会休眠，冷启动不适合正式响应时延评估。只允许研究者及导师内部体验，不用于正式数据收集。到期前应保存受控完整导出，不把私人数据放GitHub。免费托管不消除GPT/DeepSeek模型API费用。

当前不启动30人真实模型并发。正式研究仍需稳定托管、备份恢复、人工语言审核及完整线上门禁，不因测试通过或免费URL可打开自动放行。

## 研究者现在只需做什么

按docs/round34-render-free-one-page.md/.docx操作：退出旧的付费预览，用work分支最新render.yaml重新加载Blueprint，确认两个Free及Singapore，在Render安全填写两项模型Secret，核对实际GPT接口地址，点击部署并回传真实HTTPS URL。不要求购买服务器、办理国际支付或手改代码。若尚无资源，无需处理迁移；若已有数据，不删除或重建任何服务/数据库，先反馈资源状态。

如果免费预览仍要求银行卡，停止创建并提供脱敏提示；不能承诺平台对所有账户免验证，不要求研究者为本轮购买付费套餐。当前取得公网网址的阻塞是账户侧免费资源创建操作及平台是否接受该账户资格，不能通过Codex代码绕过。

## 当前是否放行

| 项目           | 当前判定            | 后续条件                                                       |
| -------------- | ------------------- | -------------------------------------------------------------- |
| 研究者线上自测 | 等待部署，当前false | 真实URL和安全/功能初验通过后，安排本人6次会话                  |
| 导师内部体验   | 当前false           | 研究者体验、人评及必要线上验收完成后单独确认；明确免费环境限制 |
| 30人真实并发   | 本免费环境不放行    | 另行选择可靠资源并确认预算，不能用免费体验环境替代             |
| 正式数据收集   | false               | 正式部署、稳定性/备份恢复、人工和研究门禁全部完成              |

## GitHub交付

发布到work分支，固定标签round34-delivery；不合并main、不触发线上部署。完整ZIP含全部跟踪源码、免费及原付费Blueprint、附件存档、发给GPT的本报告及Word、一页操作清单及本轮验收证据。没有运行时密钥、node_modules或私人会话数据。

完整ZIP：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/archive/refs/tags/round34-delivery.zip

本轮反馈：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round34-delivery/docs/thirty-fourth-round-delivery-report.md

免费Blueprint：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round34-delivery/render.yaml

旧付费配置仅另存保留，未替用户创建任何付费资源。
