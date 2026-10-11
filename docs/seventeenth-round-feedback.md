# 第十七轮反馈：Step 6 真实验收闭环与正式实验准备

日期：2026-10-11（北京时间）。依据[本轮原始要求](inputs/seventeenth-round-requirements.docx)补强 Acceptance Report 的路径结构断言与 Pilot Mode。**工程回归通过，真实模型仍 not_run，正式条件未满足。**

## 给 GPT 的反馈

真实命令实际执行退出 2，MODEL_API_KEY 未绑定、MODEL_NAME 未配置，外部调用 0、数据库未启动。不会把本机协议服务当真实模型结果。既有业务真实验收入口保留，正式模型及语义报告仍需配置后手动执行和研究者审核。

| 修改原因                                                 | 文件                                           | 是否影响实验设计                                                                          |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 验收不能只检查变量存在，应核对冻结／来源／阶段与固定对象 | apps/api/src/acceptance/business-acceptance.ts | 新增纯只读 inspectPathRecords，纳入完成判定；不改运行中状态／Prompt／变量                 |
| 结构检查必须能识别错误导出                               | apps/api/tests/business.test.ts                | 两条路径验证正常报告，并拒绝 15 个内存副本；数据库历史不改                                |
| 研究者需要明确 Pilot 内部测试入口                        | Admin.tsx、browser.spec.ts                     | 沿用默认关闭的管理员只读开关，补用途标签及 opt-in／只读／参与者隔离测试，无新实验模式变量 |
| 正式报告须区分环境、功能、异常与语义                     | 本轮 Acceptance Report／机器摘要／反馈文档     | 逐项标 engineering passed、real not_run、semantic pending、formal not_ready               |

纯状态机、编排、Adapter、migration、依赖、服务授权与 Participant 流程均未改。Pilot Mode 读取只增加管理员审计，不增加模型调用或实验事件。

## 八项交付

[正式 Acceptance Report](seventeenth-round-acceptance-report.md)提供真实模型结果、环境／功能／异常验收、认知专项、情感专项、导出示例、压力／Pilot、阻塞项与正式就绪结论。报告 Word、反馈 Word 和原始要求都放在项目 docs；[验收目录](acceptance/step6-round17/)有本轮全部机器报告及七张真实截图，全部进入整个项目 ZIP。

| 验收         | 实际结果                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------- |
| 真实模型命令 | not_run／退出 2；缺密钥与明确模型名；调用 0、数据库未启动                                       |
| Vitest       | 409 passed、0 failed／skipped，15 文件；业务／API 67 项                                         |
| Playwright   | 15 passed、0 failed／skipped，真实浏览器／Vite／Express／PostgreSQL                             |
| 合计         | 424 passed；本轮新增 2 项业务、1 项浏览器用例                                                   |
| 认知结构     | 唯一确认观点冻结、两评分同一固定对象及来源、四重构、完整顺序与分析历史一致；8 个错误副本拒绝    |
| 情感结构     | 场景值来自明确提交、scene_phase 与 event 对应、完整顺序；7 个错误副本拒绝                       |
| Pilot        | 默认关闭、管理员显式勾选、五项只读诊断；退出后参与者无内部数据，数据库实验内容不变              |
| 压力／恢复   | 三路径各 30 轮、6 人各 5 轮并发，共 120 合成回合；超时／SIGKILL／新连接／3 次刷新／网络重放通过 |
| 工程检查     | npm run check 退出 0：类型、lint、格式、全部测试和构建通过；状态保存在本轮 summary              |

认知本机协议链路含评分中断，9 明确阶段／10 语言回合／20 消息；情感含规则询问，7 明确阶段／8 回合／16 消息。18 次本机 Adapter 生成不等于真实供应商调用。评分语义、新观点、剧情回溯和提前结局仍必须由研究者审核真实回复。

## 正式结论与下一步

**formal_ready=false。** 真实模型配置、语义审核、正式持久数据库／HTTPS／备份／权限与容量尚未验收；导出 complete=false／每类 1000，字段齐全不解除全量归档阻塞。正式量表、必填来源、结构化场景、拒答与自愿退出方案仍待研究者明确。

建议 GPT 先审阅 Acceptance Report 和结构拒绝证据，再指导安全配置模型、手动运行 npm run live:business:e2e -- /tmp/round17-real-business.json 并审核真实结果；并行明确正式研究 schema、全量归档和目标环境验收。无需优先扩展架构或重写状态机。
