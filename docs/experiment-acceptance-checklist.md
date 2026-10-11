# Experiment acceptance checklist（第十六轮）

日期：2026-10-11（北京时间）。本轮正式结论为 **not_ready**。工程检查通过、真实模型未运行和研究者未签核是三个不同状态。此清单用于每次固定提交／实验配置的验收；不因历史测试通过而自动放行。

| 类别 | 检查项                   | 本轮证据                                                                                  | 正式目标状态                       |
| ---- | ------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------- |
| 环境 | Node 24／npm 11          | 实际 Node 24.19.0／npm 11.9.0                                                             | 目标环境待验证                     |
| 环境 | 数据库迁移／可用性       | 隔离 PostgreSQL 17.7，001／002／003 及 checksum／恢复回归                                 | 独立持久库、备份恢复待验证         |
| 环境 | 必要变量                 | DATABASE_URL／MODEL_API_KEY／MODEL_NAME／ADMIN_ACCESS_TOKEN_HASH 均未设置；密钥需求未绑定 | 阻塞                               |
| 环境 | 真实模型配置             | OpenAI 兼容接口已选定；真实命令实际执行，退出 2／not_run／调用 0                          | 阻塞                               |
| 功能 | 登录／分配／说明         | 真实 Chromium 与业务 API 验收；已发布版本固定、隔离账号                                   | 目标环境待验证                     |
| 功能 | 认知完整流程             | 本机真实 HTTP Adapter→编排→API／core→数据库完成，含评分中断                               | 真实模型语义待审核                 |
| 功能 | 情感完整流程             | 本机协议服务完整路径，含询问规则，场景仅明确提交时更新                                    | 真实模型剧情语义待审核             |
| 功能 | 明确推进／数据保存       | 聊天不推进；重复明确提交只推进一次；8 类质量计数正常为 0                                  | 正式量表与必填字段待签核           |
| 功能 | 导出                     | 固定资源、消息、事件、变量及 model_run_log 示例可追溯                                     | 阻塞：complete=false／1000 限制    |
| 异常 | 网络中断／重复消息       | 丢失回复同键重放，不多调用模型、不新增消息槽位                                            | 目标环境待复测                     |
| 异常 | 模型失败／超时／违规     | 实际本机注入测试保留 state／变量；违规拦截且输出安全兜底                                  | 真实供应商故障记录未获得           |
| 异常 | 多次页面刷新             | 3 次 reload／重新登录，分配、变量、消息和事件完全相同                                     | 目标环境待复测                     |
| 异常 | 服务重启／恢复           | 本轮重新执行真实 API SIGKILL／新进程、新连接及 lease 恢复                                 | 正式备份／主机恢复待验证           |
| 压力 | 长对话／多用户           | 三路径各 30 轮／同实验 6 人各 5 轮并发，120 合成回合                                      | 目标规模、真实额度和持续压力未运行 |
| 调试 | 管理员可见、参与者不可见 | 默认关闭；管理员身份加开关；状态／事件／变量／耗时／Validator／异常只读                   | 正式权限与运维待审核               |

## 真实验收操作

先通过云环境设置安全配置 MODEL_API_KEY、明确 MODEL_NAME；按选择设置 MODEL_API_BASE_URL、MODEL_TEMPERATURE、MODEL_MAX_TOKENS、MODEL_TIMEOUT_MS、MODEL_MAX_ATTEMPTS。MODEL_PROVIDER 默认 mock 时，真实命令强制选择 openai-compatible，绝不把 mock 当真实调用。既有网络／密钥目标为 api.openai.com；自定义服务需按域名配置代理目的地，保留 TLS 校验。

新命令从项目根目录执行：

```bash
npm run live:business:e2e -- /tmp/round16-real-business.json
```

该命令只用合成账号，创建自己命名的临时 PostgreSQL 容器，显式执行迁移，启动随机 loopback Express API，执行登录、固定分配、聊天、明确推进、同键重放、刷新查询、管理员诊断与导出，然后关闭自身服务和容器。**它忽略外部 DATABASE_URL，不在正式库建账号或迁移。** 数据库原始临时记录被清理，报告含合成导出。Docker 及已有固定镜像是前提。

认知 9 个阶段＋评分中断额外 1 个语言回合，情感 7 个阶段＋询问规则额外 1 个回合，共 18 次正常生成；默认 2 次尝试最多 36 个 Adapter 调用，配置 3 次最多 54。失败会停止当前路径；没有自动付费重跑，也不自动运行旧 live:e2e 命令。Adapter 次数不是供应商账单。

MODEL_ACCEPTANCE_MAX_LATENCY_MS 为可选非秘密工程门槛，默认 10000ms，必须正数。报告保存每路径 p50／p95／max 与门槛结果，超过门槛不能作为“工程延迟通过”。正式可接受延迟仍应由研究者签核。

| 状态                               | 退出码 | 解释                                                            |
| ---------------------------------- | ------ | --------------------------------------------------------------- |
| not_run                            | 2      | 缺密钥或模型名；数据库和模型均不启动                            |
| failed                             | 1      | 配置／环境／未能完成报告；不假定供应商调用为 0，未知次数为 null |
| provider_or_flow_failed            | 1      | 模型失败／阻塞或流程不合法；保留可取得的数据库部分记录          |
| latency_threshold_exceeded         | 1      | 路径完成但工程延迟门槛未通过                                    |
| completed                          | 0      | 两条合成业务路径和结构检查完成，没有发现重试／兜底              |
| completed_with_guard_interventions | 0      | 路径完成但存在重试／校验拦截／兜底，必须逐项审核                |

completed 永远不等于 formal_ready；semantic_review 始终 pending_researcher_review。报告不包含凭据、原始供应商异常或完整 Prompt。供应商实际稳定性、评分暗示、新观点、剧情回溯／提前结局等需要研究者逐条阅读已验证的合成回复和 guard 记录。

本命令不替代真实模型 20–30 轮持续负载、正式数据库备份／权限／HTTPS 部署、真实参与者拒答／退出、量表／场景 schema 或全量归档验收。既有[正式实验前清单](pre-experiment-checklist.md)中的阻塞项继续有效。

## 本轮工程复现

Node 24、Docker、Chromium 为前提。npm ci 后执行 npm run check，仅运行本机 fixture／合成数据，不调用收费模型。

```bash
mkdir -p docs/acceptance/step6-round16
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round16 npm test -- --reporter=json --outputFile=docs/acceptance/step6-round16/test-results.json
RESEARCH_ACCEPTANCE_DIR=docs/acceptance/step6-round16 BROWSER_REPORT_PATH=docs/acceptance/step6-round16/browser-results.json npm run test:browser
```

真实报告默认应保存在 /tmp，审核脱敏后再提交。当前[真实报告](acceptance/step6-round16/real-model-business-report.json)只有 not_run 元数据，不需要真实模型数据脱敏。
