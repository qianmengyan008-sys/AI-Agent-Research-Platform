# Step 1 工程初始化验收记录

## 依据与范围

依据上传的《Codex 第一轮开发指令》中“当前任务：先完成 Step 1”，本轮只完成 TypeScript monorepo、工程配置、README 和可运行的前后端骨架。原有四份研究设计文档保留。

## 文件与用途

| 位置                                                  | 内容与原因                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 根目录 package.json / package-lock.json               | npm workspaces、精确依赖版本、构建/开发/检查命令与可复现锁文件                                                                       |
| tsconfig.json / tsconfig.base.json                    | 工作区引用、共用严格类型配置                                                                                                         |
| eslint.config.js / .prettierrc.json / .prettierignore | 代码检查与格式化；不重排原有研究设计文档                                                                                             |
| .gitignore / .npmrc / .node-version                   | 忽略生成文件、使用可写缓存、固定 Node.js 版本                                                                                        |
| vitest.config.ts                                      | API 骨架测试入口                                                                                                                     |
| .github/workflows/ci.yml                              | 推送/PR 时执行 npm ci 与 npm run check                                                                                               |
| packages/contracts                                    | package.json、tsconfig.json、src/index.ts：共享路径与健康接口类型                                                                    |
| packages/experiment-core                              | package.json、tsconfig.json、src/index.ts：领域类型边界，尚未实现 transition                                                         |
| apps/api                                              | package.json、tsconfig.json、tsconfig.tests.json、src/app.ts、src/server.ts、tests/app.test.ts：Express 启动、健康接口与测试         |
| apps/web                                              | package.json、tsconfig.json、vite.config.ts、index.html、src/main.tsx、src/App.tsx、src/styles.css：React 首页、连接检查与 Vite 代理 |
| README.md                                             | 当前能力、安装、启动、验证和下一步说明                                                                                               |

安装时用户目录 npm 缓存不可写，改用被忽略的仓库 .npm-cache/。首次构建中 Vite 的嵌套版本导致插件类型冲突，统一为 Vite 8.3.4 后通过；没有放宽 TypeScript 检查或关闭下载校验。

## 本机验证结果

- Node.js 24.19.0、npm 11.9.0。
- npm install 成功；npm ci 从锁文件重新安装成功。
- 清除本轮生成的 dist 和 tsbuildinfo 后，npm run check 成功。
- 全部四个工作区类型检查、ESLint 与 Prettier 检查通过。
- Vitest：1 个测试文件、2 个测试通过、0 个跳过。
- 两个测试分别验证健康接口契约，以及本阶段未开放实验修改接口。
- 四个工作区构建通过，生成 API JavaScript 与前端静态资源。
- 开发命令 npm run dev:api / npm run dev:web 实际启动成功；健康接口、前端代理、HTML 和引用的 JavaScript 请求通过。
- 构建产物命令 npm run start:api / npm run preview:web 实际启动成功，同样的 HTTP 检查通过。
- 无效 PORT 会使 API 启动失败，符合预期。
- 本轮启动的验证进程已经停止。

上述前端验证是 HTTP 资源与代理检查，没有运行浏览器点击或前端端到端测试。GitHub CI 工作流已创建，但尚未推送触发远端执行。没有实现或验证数据库、登录、状态迁移、实验并发/恢复、后台或导出。

## 运行命令

在仓库根目录：

```bash
npm install
npm run build
npm run check
```

开发时分别在两个终端运行：

```bash
npm run dev:api
```

```bash
npm run dev:web
```

下一步为 Step 2：实现纯函数 transition 及正常路径、非法事件和重复事件测试。数据库恢复与请求并发在后续 PostgreSQL / API 实现阶段验证。
