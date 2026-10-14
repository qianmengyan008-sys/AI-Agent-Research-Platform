# AI Agent 在线对话研究平台

用于心理学实验的全新独立平台。技术栈：React + TypeScript + Vite、Node.js + Express + TypeScript、PostgreSQL。

当前完成 Step 1 工程初始化、Step 2 独立状态机，以及AI 编排层和可替换 Model Adapter（含 OpenAI 兼容 HTTP 实现）。不会修改、连接或复用 WorkBuddy 生产服务、数据库、凭据或部署配置。

Step 6.2 已连接 PostgreSQL 业务服务与 API：参与者登录、固定分配、当前表单、聊天持久化、显式状态提交、管理员配置与完整业务记录快照 JSON 导出。Step 6.3 已接入最小参与者登录／说明／对话／明确提交页面，以及只读管理员查询／完整记录下载页面。DeepSeek Flash 单次真实smoke已通过（HTTP200）；正式Prompt下的完整实验与语义验收尚未完成，工程原型不代表正式实验就绪。

最新第31次交付：[给GPT反馈](docs/thirty-first-round-feedback.md) · [验收报告](docs/thirty-first-round-delivery-report.md) · [模型对比配置/预算/人评说明](docs/round31-model-comparison-guide.md)。保留GPT/DeepSeek可切换Adapter，补25轮连续诊断；32配对与连续fixture已验收，455 Vitest＋18浏览器通过。GPT密钥/模型名仍未注入，真实对比not_run；云环境要求已存草稿，需配置并发布。Render授权和公网URL仍待取得，导师与正式门禁false。

第30次历史交付：[给GPT的反馈](docs/thirtieth-round-feedback.md) · [验收报告](docs/thirtieth-round-delivery-report.md) · [1—28轮简短进度汇报](docs/research-progress-brief.md) · [线上验收与用户操作清单](docs/round30-online-acceptance-checklist.md)。不改代码，复验452 Vitest＋18浏览器与30人多轮fixture通过；继续Render方案。线上URL尚未创建，需平台授权/Secret/费用确认；本人完整体验、语言审核及线上30人真实验证后再邀请老师，导师与正式门禁暂未放行。

第29次历史交付：[Render 托管部署六步](docs/render-hosted-deployment-guide.md) · [给 GPT 的反馈](docs/twenty-ninth-round-feedback.md) · [验收报告](docs/twenty-ninth-round-delivery-report.md) · [真实并发预算](docs/round29-real-concurrency-plan.md)。最终目标已改为公网托管网站，参与者只用浏览器；本机30与45人混合路径、Docker实际重启和452 Vitest／18 Playwright通过。公网URL尚未创建，需研究者完成Render仓库授权、Secret填写、账单确认与Blueprint部署；online self-test／导师／正式门禁均false。原Windows包仅作调试排障。

第28次历史交付：[Windows 本地三步启动](docs/windows-local-researcher-preview.md) · [给 GPT 的反馈](docs/twenty-eighth-round-feedback.md) · [验收报告](docs/twenty-eighth-round-delivery-report.md)。本人体验先本地启动，无需服务器／域名。解压整个项目，双击 Start-Researcher-Preview.bat，按提示安全输入 Secret，在本机浏览器打开窗口显示的实际地址。Windows真机首次启动待确认；本地维护与三账号入口已在 Linux／PowerShell Core 验证，mentor_test_ready=false。

第27次历史交付：[给 GPT 的反馈](docs/twenty-seventh-round-feedback.md) · [验收报告](docs/twenty-seventh-round-delivery-report.md) · [服务申请与服务器逐步操作](docs/preview-deployment-operations.md)。已明确独立 VM／测试域名方案，内部登录、完整导出、构建与 18 项浏览器回归通过；一次真实 Flash smoke HTTP200。本轮没有外部网址或已部署服务器，需研究者／运维完成注册、DNS 与安全配置，导师门禁保持 false。

第26次历史交付：[给 GPT 的反馈](docs/twenty-sixth-round-feedback.md) · [验收报告](docs/twenty-sixth-round-delivery-report.md) · [最短部署步骤](docs/researcher-preview-guide.md) · [人工审核模板](docs/researcher-human-review-template.md)。本轮按用户选择先交付部署包，没有外部预览 URL。三条真实 DeepSeek 浏览器合成链路完成；认知路径 9 次重试／8 轮兜底仍需审核。人工自由体验与语言审核待完成，mentor_test_ready=false。

[Step 2 完整反馈、代码入口与迁移示例](docs/step2-feedback.md)

[第三轮反馈文档的逐项复核与实际验收结果](docs/third-round-feedback.md)

[最新：第25次导师整改反馈](docs/twenty-fifth-round-feedback.md) · [PDF参数落实反馈](docs/mentor-parameters-freeze-feedback.md) · [逐项验收报告](docs/twenty-fifth-round-delivery-report.md)。已落实导师配置、统一0–100评分、轮次守卫、固定故事、超时恢复及完整导出。448项Vitest、18项Playwright通过；最终冻结代码真实认知20轮/情感14轮完成，37次请求全部HTTP200，认知7次重试/4次兜底。人工语言审核及非脚本体验待完成，导师测试未放行。ZIP包含三份Word、两原件、JSON及9张合成截图。

最近真实smoke已安全接入DeepSeek Secret，请求/响应模型均deepseek-flash，HTTP200，首可见token2260.68ms，总响应2277.17ms，请求1/重试0；这是技术连接验证，未完成正式实验语义审核。导师PDF参数已落实，人工语义/非脚本审核待完成，pilot_ready=false。[测量证据](docs/acceptance/step6-round22/confirmed-deepseek-smoke.json)。

[第21次Flash专项历史反馈](docs/twenty-first-round-feedback.md)及其not_run报告代表当时未注入环境，不覆盖后续真实smoke成功。[模型配置](docs/round21-deepseek-flash-guide.md) · [语义审核工具](docs/round19-semantic-review-guide.md) · [历史双模型比较](docs/round20-model-comparison-guide.md)。

[第六轮历史成果](docs/sixth-round-feedback.md)（其中真实 Adapter 尚未实现的描述已被本轮实现更新）。

[第五轮历史成果](docs/fifth-round-feedback.md)（本轮更新了上下文投影、评分保护与超时接口）。

[第四轮历史成果](docs/fourth-round-feedback.md)（其中单次调用后立即兜底的描述已被第五轮有限重试机制取代）。

## 目录结构

```text
apps/
  api/                   Express + TypeScript；src 和 tests
  web/                   React + TypeScript + Vite
packages/
  contracts/             共用 API 类型
  experiment-core/       版本化路径定义、事件枚举、纯迁移函数、测试与示例
  ai-orchestrator/       当前语言编排、上下文投影、输出校验、超时、重试与异常接口
  model-adapter/         可替换 HTTP / Mock Adapter、参数管理、内部日志与实验测试
  database/              pg 迁移执行器与真实 PostgreSQL 测试
database/migrations/     版本化 PostgreSQL up/down SQL
docs/                    架构、数据库、状态机、开发计划
```

## 工具与安装

使用 Node.js 24（本环境 24.19.0）及 npm 11（本环境 11.9.0）。`.node-version` 固定 Node 版本；依赖声明使用精确版本，并提交 npm 锁文件。所有命令在仓库根目录运行。

```bash
npm install
npm run build
```

已有锁文件的 CI 或新环境使用 `npm ci`。仓库 `.npmrc` 将缓存写到被忽略的 `.npm-cache/`，避免云环境用户目录不可写。无需数据库或模型密钥即可完成本轮构建。

## 开发与启动

分别使用两个终端：

```bash
# 终端 1：API，默认 127.0.0.1:3001
npm run dev:api
```

```bash
# 终端 2：前端，127.0.0.1:5173
npm run dev:web
```

`npm run dev` 等同于启动前端。根目录开发命令先构建共享包；修改共享包后重新运行对应开发命令。Vite 将 `/api` 代理到本地 API，无需开放 CORS。

构建后可以使用 `npm run start:api` 和另一个终端的 `npm run preview:web` 验证产物。preview 端口为 4173，仅用于本地检查，不是生产部署。API 可通过 `PORT` 覆盖端口，但更改后需同时更新 Vite 代理目标。

```bash
curl --fail http://127.0.0.1:3001/api/health
```

预期响应：`{"status":"ok","service":"research-api","mode":"scaffold"}`。这是进程健康检查，不检测数据库或研究流程。业务页面改为参与者与管理员入口；此 health 继续兼容旧 API 检查。

## 自动化检查

```bash
npm run check
```

该命令依次执行类型检查、ESLint、Prettier 检查、Vitest 测试及全部工作区构建。当前 Vitest 448 项、Playwright 18 项全部通过，共 466 项，覆盖纯状态机、编排／Adapter、真实 PostgreSQL／API 和真实浏览器页面。需要 Docker 及 Chromium；优先自动使用 /usr/bin/chromium，或设置 CHROMIUM_EXECUTABLE_PATH，或先 npx playwright install --with-deps chromium。npm test 会先构建共用包，无需手动准备编译产物。

完整认知路径示例：

```bash
npm run example:cognitive --workspace @research/experiment-core
```

AI 编排层认知、情感与违规兜底示例：

```bash
npm run example:ai
```

该示例只使用本地固定文本，不访问模型服务、不修改实验状态。阶段策略是工程演示材料，输出规则目前只做确定性文本检查，未验证真实模型语义行为。

完整认知与情感调用流程（合成数据）：`npx tsx packages/ai-orchestrator/examples/export-acceptance.ts`。异常记录通过返回的 auditEvents 或可选 auditSink 交给后端；尚无管理员查询页面；业务 API 现在会持久化生成日志。

Model Adapter 验收示例：`npm run build:packages` 后执行 `npm run example --workspace @research/model-adapter`。本轮新增 OpenAI 兼容 HTTP Adapter；实际外部模型验证仍需安全配置密钥与模型名。默认每次生成超时 10 秒，最多尝试 2 次，取消后不重试。

本轮本地 HTTP 端到端示例：`npm run example:http`。云环境安全配置真实密钥与模型名后，运行 `npm run live:e2e -- /tmp/step5-live-e2e.json`；该命令明确调用真实服务，缺配置退出 2，不混同 mock。完整说明见 [模型服务操作文档](docs/step5-model-integration.md)。

单独运行：`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`、`npm run build`。`npm run format` 用于格式化新代码；已有四份研究设计文档不纳入自动重排。

## 后续任务

第十一轮明确授权 Step 6.2：已实现业务服务／仓储／API，下一步由研究者复核配置和接口，再完善正式字段、模型语义验收与全量导出。真实外部模型仍 pending，不代表实验就绪；收费真实验收与研究者语义审核需继续完成。自动化测试随实现持续添加。

## 第一轮设计

[第二轮成果及真实首页截图](docs/second-round-deliverables.md) · [工程初始化验收记录](docs/step1-report.md)

- [系统与模块架构](docs/architecture.md)
- [数据库设计](docs/database.md)
- [状态机设计](docs/state-machine.md)
- [开发计划与验收](docs/development-plan.md)

核心约束：后端控制实验状态；模型仅生成当前阶段的语言；关键变量入库；每次实现变更经过自动化测试。

[Step 6 数据库与业务层设计提案](docs/step6-business-design.md)：支持配置版本、复现、审计与受控异步生成。第九轮历史提案；数据库实施范围现已由第十轮明确更新，未实现部分继续作为设计参考。

## Step 6.1 PostgreSQL

[数据库迁移与执行](database/README.md) · [ER 设计](docs/step6-1-database-er.md) · [API 设计](docs/step6-api-design.md) · [页面／开发与测试计划](docs/step6-ui-and-test-plan.md)。普通检查现在需要 Docker daemon（云环境与 GitHub Ubuntu runner 已支持），数据库测试自动创建并清理独立 PostgreSQL 17.7 容器。执行 npm run test:database 可单独复现。所有测试不需要外部数据库或模型密钥。迁移目标由安全 DATABASE_URL 显式配置；不自动连接任何既有数据库。

## Step 6.2 业务后端

[服务、仓储、接口与数据流](docs/step6-2-business-api.md)。独立数据库安全配置 DATABASE_URL 后，显式迁移再启动 API；未配置则只启用原健康检查。管理员配置非秘密 ADMIN_ACCESS_TOKEN_HASH，参与者通过数据库会话认证。聊天不推进阶段，结构化提交由后端 core 处理。管理员导出当前为同一只读快照的完整业务记录，complete=true、per_table_limit=null并附record_counts；诊断展示仍每类最多1000条。正式材料/完整版本包及大规模归档容量仍待验收，多管理员权限与后台生成队列暂缓。

[第十二轮完整业务联调与恢复](docs/step6-round12-integration.md)：原路径版本不变，研究命名变量与合法事件同事务保存；本地 HTTP Adapter fixture 和真实进程 SIGKILL／重启验收仍是合成模型测试。

## Step 6.3 最小页面与浏览器联调

[第十三轮九项联调材料](docs/step6-3-frontend-integration.md)。参与者凭据仅保存在页面内存，刷新后重新登录恢复数据库实验。管理员界面只读，无运行中状态干预。npm run test:browser 单独运行真实 Chromium、Vite、Express、临时 PostgreSQL 链路，模型为合成 MockAdapter。三张真实页面 PNG 包含在验收目录和项目 ZIP 中。

[第十四轮完整闭环与分析导出](docs/step6-round14-usability.md)：新增按参与者关联的 analysis_rows，以及默认关闭、管理员专用的只读开发模式（ADMIN_DEVELOPMENT_MODE=false）。正式全量导出和真实模型验收仍未完成。

[第十五轮稳定性与正式实验准备](docs/step6-round15-stability.md) · [正式实验前检查清单](docs/pre-experiment-checklist.md)：管理员只读调试关联、8 类数据库质量检查、十类干扰、三路径各 30 轮与 6 人并发验收。真实模型完整会话、正式版本包和正式部署仍待验收；完整业务记录导出已于第25次整改。

[第十六轮真实业务验收入口](docs/step6-round16-acceptance.md) · [Experiment acceptance checklist](docs/experiment-acceptance-checklist.md)：手动执行 npm run live:business:e2e -- /tmp/round16-real-business.json。缺凭据报告 not_run，不启动数据库或模型；配置齐全后仅在合成临时数据库验证真实模型业务链路。正式语义、全量导出和部署仍未验收。

[第十七轮 Acceptance Report](docs/seventeenth-round-acceptance-report.md)：增强固定路径、冻结观点／评分来源／场景事件的只读结构验收，并明确管理员 Pilot Mode。真实模型仍 not_run，正式全量归档、研究者语义及目标环境验收仍未完成。

导师候选参数入口为 [research/mentor-test-v1.json](research/mentor-test-v1.json)。新建实验指定 research_profile=mentor-test-v1，条件不传demo_policies；原有分配保持旧版本。只需本地隔离验证可运行 `node --use-env-proxy --import tsx apps/api/acceptance/mentor-profile-e2e.ts --output /tmp/mentor-local.json`；加 `--real` 会真实调用DeepSeek，需现有Secret，输出不要上传真实参与者数据。具体放行边界见本轮报告。
