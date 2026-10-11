# 正式实验前检查清单（第十五轮）

日期：2026-10-11（北京时间）。**当前结论：尚未达到正式心理学实验运行条件。** 下表区分已执行的隔离工程验收与尚未执行的正式环境验收。每次变更实验配置、部署版本或模型，研究负责人均需重新填写正式栏，不沿用合成模型通过记录。

| 检查             | 本轮实际工程结果                                                           | 正式环境放行条件                                                                    | 正式状态             |
| ---------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------- |
| 数据库迁移       | 隔离 PostgreSQL 17.7 执行 001／002／003，迁移与业务测试通过                | 独立持久数据库已确认；备份可恢复；迁移 checksum 与提交匹配                          | 未执行               |
| API 启动         | 浏览器连接真实 Express／Vite，API 子进程重启测试通过                       | 正式 HTTPS、进程重启、代理、监控与数据库就绪；health 只能证明进程存活               | 未执行               |
| Participant 登录 | 真实浏览器登录、错误提示、越权与重新登录恢复通过                           | 使用获准的测试账号在目标环境复测登录、说明与退出；账号名单保密                      | 未执行               |
| Assignment 正确  | 已发布条件固定 Agent／Prompt／core／模型配置；多参与者隔离通过             | 研究者签核条件、路径、账号分配和全部固定版本；核对实验说明                          | 未签核               |
| AI 调用          | MockAdapter／本机 OpenAI 兼容 fixture 正常；失败／兜底／迟到保护通过       | 配置 MODEL_API_KEY 和明确 MODEL_NAME 后进行获准的真实模型端到端验收及研究者语义审核 | 未执行               |
| 状态机推进       | 认知／情感完整流程、明确提交、十类干扰测试通过                             | 正式量表、必填字段、拒答／退出方案与阶段内容由研究者确认后复测                      | 未签核               |
| 数据完整保存     | 8 类数据库结构检查，真实进程恢复／新连接／浏览器恢复通过；故障注入正确报错 | 正式环境完整性报告全部为 0，备份恢复和容量／权限验证通过                            | 未执行               |
| 导出可用于分析   | analysis_rows 固定资源、消息、事件和变量可追溯；合成例可查看               | 全量无截断归档、分析 schema 与缺失值约定经研究者审核；记录完整版本包                | 阻塞：complete=false |

本轮机器没有 DATABASE_URL、MODEL_API_KEY、MODEL_NAME、ADMIN_ACCESS_TOKEN_HASH。已有模型密钥配置需求尚无绑定；不再次索取聊天中的密钥。真实模型、外部数据库迁移、正式部署和真实参与者运行均未执行。

## 执行与留证顺序

1. 固定本次 Git commit、实验版本、Condition、Agent／Prompt／core 版本、请求模型名及参数；记录责任人与验收日期。
2. 在经授权的独立目标配置 DATABASE_URL，显式执行 npm run db:migrate -- up。启动不迁移、不播种账号；不要将测试容器或 WorkBuddy 作为目标。核对 research_meta.schema_migration 的 id／checksum 与本提交 migration 文件。
3. 配置 ADMIN_ACCESS_TOKEN_HASH，并在两个终端执行 npm run dev:api、npm run dev:web 做开发核对；正式部署另有 HTTPS／进程管理要求。GET /api/health 是 scaffold 健康检查，不能替代登录和业务查询。
4. 管理员核对发布条件和分配，通过授权合成账号跑完路径、下载 JSON，验证本轮 data_quality 的 8 个计数为 0。complete=false 即使质量计数为 0 也不能放行正式归档。
5. 需要研究者调试时，显式设置 ADMIN_DEVELOPMENT_MODE=true、重启自己管理的 API，用管理员认证和页面复选框读取诊断；正式参与者环境默认 false。调试不得修改实验状态。
6. 通过安全环境设置配置真实模型凭据及明确模型名，再运行已经授权的 npm run live:e2e -- /tmp/step5-live-e2e.json。它验证模型与 core／编排，不替代目标数据库、页面和研究者语义验收；将通过审核后的脱敏报告留存，不将密钥、token、真实研究数据提交到 GitHub。
7. 根据目标招募规模在正式同等资源环境做持续负载、延迟分位数、模型额度与故障恢复验证。当前 6 人并发／30 轮本机测试不能外推正式容量。
8. 完成研究者审批、正式量表／必填来源／场景 schema、参与者拒答和自愿退出方案、全量导出、数据保留权限与备份恢复后，再填写放行结论。聊天里提出“提前结束”本轮不会自动结束；正式退出流程尚需明确设计。

## 可重复的工程验收

Node 24、Docker 与可信 Chromium 为前提。从项目根目录执行 npm ci、npm run check。无需真实模型 key 或外部数据库；不要将 MockAdapter 成功解释为真实模型成功。

```bash
mkdir -p docs/acceptance/step6-round15
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round15 npm test -- --reporter=json --outputFile=docs/acceptance/step6-round15/test-results.json
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round15 BROWSER_REPORT_PATH=docs/acceptance/step6-round15/browser-results.json npm run test:browser
```

以上显式命令更新合成 UUID／时间／截图；普通 npm run check 保留历史验收材料。[本轮完整报告](step6-round15-stability.md)、[机器检查单](acceptance/step6-round15/pre-experiment-checklist.json)、[验收汇总](acceptance/step6-round15/summary.json)。
