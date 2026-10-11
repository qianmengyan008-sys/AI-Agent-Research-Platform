# AI Agent 在线对话研究平台

用于心理学实验的全新独立平台。技术栈：React + TypeScript + Vite、Node.js + Express + TypeScript、PostgreSQL。

当前完成 Step 1 工程初始化、Step 2 独立状态机，以及AI 编排层和可替换 Model Adapter（含 OpenAI 兼容 HTTP 实现）。不会修改、连接或复用 WorkBuddy 生产服务、数据库、凭据或部署配置。

Step 6.2 已连接 PostgreSQL 业务服务与 API：参与者登录、固定分配、当前表单、聊天持久化、显式状态提交、管理员配置与限量 JSON 导出。前端仍为连接检查页面；业务页面尚未开发。外部真实模型仍未验收；工程 API 原型不代表正式实验就绪。

[Step 2 完整反馈、代码入口与迁移示例](docs/step2-feedback.md)

[第三轮反馈文档的逐项复核与实际验收结果](docs/third-round-feedback.md)

[最新：第十二轮反馈与本轮验收成果](docs/twelfth-round-feedback.md) · [Word 反馈](docs/twelfth-round-feedback.docx) · [模型配置与运行](docs/step5-model-integration.md)。项目 ZIP 包含 docs/acceptance/step6-round12/ 下的全量测试、服务／HTTP API 和 PostgreSQL 验收；历轮真实模型 not_run 报告继续保留。

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

预期响应：`{"status":"ok","service":"research-api","mode":"scaffold"}`。这是进程健康检查，不检测数据库或研究流程。页面的“检查后端连接”按钮调用同一接口。

## 自动化检查

```bash
npm run check
```

该命令依次执行类型检查、ESLint、Prettier 检查、Vitest 测试及全部工作区构建。当前 377 个测试全部通过，覆盖状态机、编排层、真实 PostgreSQL 和业务 API。业务服务／API 共 35 项，本轮新增 7 项，验证 Model Adapter 协议闭环、真实 API 进程重启、Validator 拦截、网络幂等和研究变量持久化。npm test 会先构建共用包，无需手动准备编译产物。

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

第十一轮明确授权 Step 6.2：已实现业务服务／仓储／API，下一步由研究者复核配置和接口，再开发管理员与参与者页面。真实外部模型仍 pending，不代表实验就绪；收费真实验收与研究者语义审核需继续完成。自动化测试随实现持续添加。

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

[服务、仓储、接口与数据流](docs/step6-2-business-api.md)。独立数据库安全配置 DATABASE_URL 后，显式迁移再启动 API；未配置则只启用原健康检查。管理员配置非秘密 ADMIN_ACCESS_TOKEN_HASH，参与者通过数据库会话认证。聊天不推进阶段，结构化提交由后端 core 处理。导出目前 complete=false、每表最多 1000 条；正式全量导出、多管理员权限与后台生成队列仍待开发。

[第十二轮完整业务联调与恢复](docs/step6-round12-integration.md)：原路径版本不变，研究命名变量与合法事件同事务保存；本地 HTTP Adapter fixture 和真实进程 SIGKILL／重启验收仍是合成模型测试。
