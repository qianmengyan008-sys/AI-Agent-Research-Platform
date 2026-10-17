# 第33次交付报告：分层人评与双模型公网部署准备

2026-10-17（UTC+8）。对应附件《第30次反馈：真实双模型对比后的人评与公网部署推进》，按仓库既有交付序号记为第33次。本报告可直接交给 GPT 继续审阅。目标是研究者真实网址体验与人工模型选择，没有扩展实验逻辑。

## 本轮结论

当前执行进程已核实 GPT_MODEL_NAME=gpt-4；GPT/DeepSeek 的模型名、接口地址及两项密钥变量均存在，只记录存在性，不输出秘密或接口地址。用户报告 Environment 已保存，本次没有修改或重建 Environment。该检查不等于新的付费 smoke、Render 环境同步或公网部署验收；先前真实 GPT 返回 gpt-4-0613 的证据保留在第32次交付。

已完成分层人评材料、双模型批次路由和数据库日志记录、部署配置及操作清单。尚无人评分、无真实公网 URL，不能宣布哪个模型最好，也不能邀请导师正式验收。

## 逐项验收及证据

| 要求                 | 本轮结果与边界                                                                                                           | 材料                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 约30–40条分层人评    | 从已有164条真实采样确定性抽取40条，覆盖全部27条重试/兜底/异常；认知21、情感19，DeepSeek27、GPT13                         | acceptance/step6-round33/human-review/review.json、review.md、review.docx |
| 保留异常与候选       | 原候选、最终呈现、兜底来源、校验标记、近期上下文和来源SHA均保留；覆盖五项指定异常及GENERATOR_FAILURE                     | 同上                                                                      |
| 六项人评及两项判断   | 六维1–5分，愿意继续、明显脚本感；全部未评分、未签署，平均值为空；模型选择pending                                         | 同上                                                                      |
| 双模型staging        | render.yaml增加GPT Secret占位及gpt-4，保留DeepSeek；B001/B002独立实验与账号；管理员看到模型和批次                        | render.yaml、scripts/hosted-platform.mjs、deploy/hosted-operator.js       |
| 不允许批次中途切模型 | 按数据库冻结配置选择已登记生成器；配置不匹配拒绝启动；并发请求元数据隔离                                                 | acceptance/step6-round33/hosted-dual-model.json及专项测试                 |
| 数据库模型身份       | 现有JSON中记录provider、requested model、实际response model、HTTP尝试；实际未返回模型时记空，不伪造；保留Prompt/研究版本 | apps/api/src/services/model-transport-audit.ts及专项测试                  |
| 一页部署操作         | 明确GitHub work分支、账号授权、费用、两项Secret、兼容接口地址、实际URL及后续验收                                         | round33-render-one-page.md/.docx                                          |
| 公网入口             | 未创建Render资源，没有平台授权，external_url=null；不以本机Preview替代                                                   | acceptance/step6-round33/delivery-status.json                             |

抽样强制收录异常，模型数量不等，不可直接比较总体均分或推算总体错误率。先比较匹配案例与同层样本，再结合研究者自由体验。六维评分由人完成，Codex不代签、不把自动校验当人工质量评分。若人工体验接近，再参考连续对话重试/兜底证据作模型选择。

## 修改范围与保持不变的部分

业务服务层增加服务器侧冻结模型配置登记与按批次路由，现有conversation记录增加传输审计JSON；托管启动支持可选独立双批次，管理员领取表显示对应模型。新增离线分层审核脚本和3项专项测试。没有新增数据库字段或迁移。

相对于第32次基线5e46bd5，experiment-core、AI Orchestrator、Model Adapter、Validator、Prompt、研究配置/材料内容、冻结实验参数及数据库schema均未修改。评分和观点确认仍由参与者明确提交。新增的原反馈附件仅作为输入存档，不是更换研究材料。

当前默认MODEL_PROVIDER仍为deepseek；没有凭工程数据自动决定导师测试模型。运行中的批次不能通过参与者输入换模型。

## 自动化与部署验证

此前checkpoint完整检查已通过462项Vitest（27文件）、18项Playwright，以及类型、lint、格式和构建。初始类型/格式失败及修复后的日志均保留在checkpoint目录，不隐藏失败记录。

本次恢复交付后重新执行npm run check退出0：462项Vitest（27文件）、18项Playwright及全部类型/lint/格式/构建通过。最新Docker镜像构建及22项本地容器检查通过，包括三路径浏览器登录、鉴权、导出及Web重启后数据保留。此容器用单模型初始化和模板轮次，没有真实模型调用；双模型路由另由隔离PG专项验证。Docker首次因默认buildx目录只读失败，改用/tmp下本地CLI配置后成功，没有改变Environment。完整结果见acceptance/step6-round33/delivery-status.json及对应日志。双模型专项使用隔离PostgreSQL与模拟HTTP，验证旧批次保留DeepSeek、新批次GPT、并发身份隔离、完整导出和参与者无管理员权限；不是新的真实模型采样。没有扩大付费模型测试量。

即便本地Docker/回归通过，也不证明Render已接受Blueprint、托管TLS/数据库已连接、外部设备可用或真实并发通过。平台校验以实际部署结果为准，不用本地YAML解析代替。

## 反馈给GPT：剩余任务和放行条件

1. 研究者在Render完成仓库授权、费用确认、两项Secret输入与部署，回传控制台真实HTTPS URL；不需要手改代码、数据库或服务器。
2. Codex收到URL后检查健康、权限、导出、真实托管持久化与外部访问；失败则保留脱敏证据并精准处理，不改实验核心绕过。
3. 研究者填写40条人工语言审核，并使用真实URL完成三条非脚本路径；按结果决定默认模型，不提前宣布优劣。
4. 人工及功能门禁满足后再测3–5台设备，最后按已批准预算执行30人真实模型并发。导师放行前须完成线上和人工验收；正式招募另行批准。

当前researcher_online_self_test_ready=false、mentor_test_ready=false、formal_ready=false。平台代码与部署材料已准备，公网与人工审核尚未闭环。

## GitHub交付与下载

本轮发布work分支和固定标签round33-delivery，不合并main、不触发部署。完整项目ZIP由GitHub按标签生成，包含全部跟踪源码、原反馈附件、发给GPT的本报告、Word版、一页部署说明及本轮验收材料；不包含node_modules、运行时私密目录、环境Secret或真实参与者数据。

完整ZIP：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/archive/refs/tags/round33-delivery.zip

反馈报告：https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform/blob/round33-delivery/docs/thirty-third-round-delivery-report.md

下载ZIP后解压，先阅读本报告，再阅读round33-render-one-page.md。ZIP用于保存或交给GPT审阅，参与者只需部署后的浏览器网址。
