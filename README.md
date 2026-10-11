# AI Agent 在线对话研究平台

用于心理学实验的全新独立平台。技术栈：React + TypeScript + Vite、Node.js + Express + TypeScript、PostgreSQL。

当前完成 Step 1 工程初始化、Step 2 独立状态机，以及AI 编排层和可替换 Model Adapter（含 OpenAI 兼容 HTTP 实现）。不会修改、连接或复用 WorkBuddy 生产服务、数据库、凭据或部署配置。

状态机目前独立运行，尚未连接 API 或页面。尚未实现数据库、登录、管理员后台或聊天。模型 Adapter 已实现，本轮真实外部模型验证因缺少配置尚未运行。首页仍用于检查前后端连接，不代表实验系统已就绪。

[Step 2 完整反馈、代码入口与迁移示例](docs/step2-feedback.md)

[第三轮反馈文档的逐项复核与实际验收结果](docs/third-round-feedback.md)

[最新：第八轮反馈与本轮验收成果](docs/eighth-round-feedback.md) · [Word 反馈](docs/eighth-round-feedback.docx) · [模型配置与运行](docs/step5-model-integration.md)。项目 ZIP 包含 docs/acceptance/step5-round8/ 下的全量测试报告、本地 HTTP 路径记录和真实模型 not_run 状态。

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

该命令依次执行类型检查、ESLint、Prettier 检查、Vitest 测试及全部工作区构建。当前 307 个测试覆盖状态机、编排层和原有 API 骨架。真实数据库并发、持久化恢复、迁移、权限与导出尚未实现或验证。npm test 会先构建共用包，无需手动准备编译产物。

完整认知路径示例：

```bash
npm run example:cognitive --workspace @research/experiment-core
```

AI 编排层认知、情感与违规兜底示例：

```bash
npm run example:ai
```

该示例只使用本地固定文本，不访问模型服务、不修改实验状态。阶段策略是工程演示材料，输出规则目前只做确定性文本检查，未验证真实模型语义行为。

完整认知与情感调用流程（合成数据）：`npx tsx packages/ai-orchestrator/examples/export-acceptance.ts`。异常记录通过返回的 auditEvents 或可选 auditSink 交给后端；尚无管理员查询页面或数据库日志持久化。

Model Adapter 验收示例：`npm run build:packages` 后执行 `npm run example --workspace @research/model-adapter`。本轮新增 OpenAI 兼容 HTTP Adapter；实际外部模型验证仍需安全配置密钥与模型名。默认每次生成超时 10 秒，最多尝试 2 次，取消后不重试。

本轮本地 HTTP 端到端示例：`npm run example:http`。云环境安全配置真实密钥与模型名后，运行 `npm run live:e2e -- /tmp/step5-live-e2e.json`；该命令明确调用真实服务，缺配置退出 2，不混同 mock。完整说明见 [模型服务操作文档](docs/step5-model-integration.md)。

单独运行：`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`、`npm run build`。`npm run format` 用于格式化新代码；已有四份研究设计文档不纳入自动重排。

## 后续任务

按第八轮指令，完成真实 Adapter 实现、本地 HTTP 实验验收及回归测试集；真实外部模型验收因 MODEL_API_KEY / MODEL_NAME 未配置而 pending，不代表 Step 5 全部通过。真实模型验收通过并经研究者审核后，才进入数据库、API 业务、参与者页面和后台开发；不沿用旧计划自动进入数据库任务。自动化测试随实现持续添加。

## 第一轮设计

[第二轮成果及真实首页截图](docs/second-round-deliverables.md) · [工程初始化验收记录](docs/step1-report.md)

- [系统与模块架构](docs/architecture.md)
- [数据库设计](docs/database.md)
- [状态机设计](docs/state-machine.md)
- [开发计划与验收](docs/development-plan.md)

核心约束：后端控制实验状态；模型仅生成当前阶段的语言；关键变量入库；每次实现变更经过自动化测试。
