# AI Agent 在线对话研究平台

用于心理学实验的全新独立平台。技术栈：React + TypeScript + Vite、Node.js + Express + TypeScript、PostgreSQL。

当前完成第一阶段 Step 1 工程初始化：TypeScript monorepo、React/Vite 首页、Express 进程健康接口及基础检查工具。不会修改、连接或复用 WorkBuddy 生产服务、数据库、凭据或部署配置。

尚未实现实验状态迁移、数据库、登录、管理员后台或聊天，也未接入模型。首页用于检查前后端连接，不代表实验系统已就绪。

## 目录结构

```text
apps/
  api/                   Express + TypeScript；src 和 tests
  web/                   React + TypeScript + Vite
packages/
  contracts/             共用 API 类型
  experiment-core/       状态机领域边界；迁移逻辑在 Step 2 实现
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

该命令依次执行类型检查、ESLint、Prettier 检查、Vitest 测试及全部工作区构建。测试覆盖健康接口契约与本阶段不开放实验修改接口。状态机、并发、恢复、数据库迁移、权限与导出测试随后续实现添加；当前不能声称这些功能已验证。

单独运行：`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm test`、`npm run build`。`npm run format` 用于格式化新代码；已有四份研究设计文档不纳入自动重排。

## 后续任务

按上传文档的顺序：Step 2 纯状态机 → Step 3 PostgreSQL migration → Step 4 API → Step 5 参与者页面 → Step 6 管理员后台 → Step 7 完整自动化回归。自动化测试从当前步骤开始，不延迟到 Step 7。真实模型接入另在之后进行。

## 第一轮设计

[第二轮成果及真实首页截图](docs/second-round-deliverables.md) · [工程初始化验收记录](docs/step1-report.md)

- [系统与模块架构](docs/architecture.md)
- [数据库设计](docs/database.md)
- [状态机设计](docs/state-machine.md)
- [开发计划与验收](docs/development-plan.md)

核心约束：后端控制实验状态；模型仅生成当前阶段的语言；关键变量入库；每次实现变更经过自动化测试。
