# 研究者自由体验：部署包与最短操作步骤

本轮按用户选择先交付部署包，未配置公网服务器、域名或部署平台，因此没有可供研究者访问的外部 URL。云环境回环端口仅用于工程验证，不能当作共享链接。已经复用原参与者页面与只读管理员页面；不改实验状态机、Prompt、冻结参数或模型适配器。导师测试尚未放行。

## 服务器前提

准备一台独立 Linux 测试服务器及域名，安装 Node.js 24、npm 11、Docker 和 Caddy。用 HTTPS 域名只开放 443/80；4173 与 PostgreSQL 保持回环绑定。不连接 WorkBuddy，不使用生产参与者数据。下列 systemd 示例针对 Linux；托管平台需按其运行目录、启动命令和持久化卷调整，不能直接宣称已部署。

## 最短步骤

1. 建立专用系统用户 research。示例目录为 `/srv/AI-Agent-Research-Platform`，该目录由 research 拥有；给予运行 Docker 的权限。Docker 组具有服务器管理能力，仅授予负责此独立测试实例的运维账号。
2. 在该目录解压本轮整个项目 ZIP，或克隆 `https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform.git` 后切换到反馈报告列出的本轮代码提交。以 research 身份在项目目录执行：

```bash
npm ci
npm run build
docker pull postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2
```

3. 将 `deploy/researcher-preview.env.example` 复制至 `/etc/researcher-preview.env`，由管理员通过安全编辑或服务器 Secret 管理器填入服务器可用的 DEEPSEEK_API_KEY。文件权限设为 600；不通过聊天、GitHub、截图或 ZIP 传递密钥。Codex 的代理 Secret 不应当复制为服务器密钥。工具固定本次部署为 deepseek-flash / mentor-test-v1，但通用 Model Adapter 的可切换架构不变。
4. 核实 `command -v node`。如不是 `/usr/bin/node`，修改 service 的 ExecStart。将 `deploy/researcher-preview.service` 安装到 `/etc/systemd/system/`，运行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now researcher-preview
sudo systemctl status researcher-preview --no-pager
```

5. 在 Caddy 配置中将 `{$STAGING_DOMAIN}` 换为实际 staging 域名，反向代理到同机 127.0.0.1:4173。域名 A/AAAA 与防火墙须匹配服务器；配置验证后重载 Caddy。用另一台设备打开实际 `https://你的测试域名`，检查首页、登录及对话；这一步才形成可访问 URL，本轮未在外部服务器执行。
6. 由运维在服务器私下读取 `.researcher-preview-private/credentials.json`，将 experiment_id、R001 三个账号密码分别交给研究者；admin_token 只交研究管理员。GitHub ZIP 不包含可用密码、管理员凭据或密钥。

## 账号与开始方式

| 固定账号   | 路径         | 用途                           |
| ---------- | ------------ | ------------------------------ |
| R001-COG   | cognitive_v1 | 第一轮人工认知路径自由体验     |
| R001-EMO   | emotion_v1   | 第一轮人工情感路径自由体验     |
| R001-DAILY | daily_v1     | 第一轮人工日常控制路径自由体验 |

所有账号共享当前独立实例的 experiment_id，路径在后台固定分配，不能由聊天改变。进入参与者入口，填写实验编号、参与者编号、密码，点击“登录实验”及“开始／继续对话”。自然输入，不抄自动化测试台词。评分与观点确认必须明确填写；开放阶段可按已经批准的后台轮次兜底推进。日常路径自然聊天后，点击“提交当前填写”结束。

刷新页面后重新登录同一账号可继续原会话。原会话一旦完成仍保留记录，不能重置冒充新实验。要重做一轮，在服务环境已安全注入 Secret 的运维终端运行：

```bash
node --use-env-proxy --import tsx scripts/researcher-preview.mjs new-round R002
```

三个 R002 账号会固定分配到同样路径；旧 R001 记录保持不变。不要把真实密码直接作为 CLI 参数。运行工具需要 Secret 仍在环境中；systemd 的 EnvironmentFile 不会自动注入普通 shell，可通过运维安全的 Secret 注入方式执行维护命令。

## 导出与同一体验的审核

管理员使用 admin_token 进入后台，选择实验，点击“下载完整 JSON”。开发模式仅管理员可见且页面只读。部署入口另外拦截管理员 POST 写入请求；账号创建仅由服务器维护工具执行。

也可在安全维护终端执行：

```bash
node --use-env-proxy --import tsx scripts/researcher-preview.mjs export /安全目录/完整导出.json
node scripts/researcher-review-package.mjs /安全目录/完整导出.json /新的安全目录/审核包
```

审核包保存同一完整导出与逐会话统计、逐轮文本及六维待审核项。不另外跑一组脚本冒充该研究者体验。原导出缺少 message-to-turn 外键；仅连续全 ready 且用户/AI 严格交替时工具配对，否则标记无法判断，回查原时间线。不填写假的人工分数。正式研究者记录、密码及导出不得提交公开 GitHub；本轮 GitHub 样例仅为合成测试身份。

## 持久化与恢复边界

独立 PostgreSQL 使用专用 Docker volume；服务重启保留账号和记录。`.researcher-preview-private` 同时保存数据库连接凭据与账号凭据，应权限 700/600，并与数据库卷一起安全备份。不要删除该目录或 volume 来重做体验。工具不使用环境中的 DATABASE_URL。脚本崩溃留下 bootstrap.lock 时，先确认没有仍在运行的初始化进程，再只删除该锁文件并重试；不删除数据库。

云环境进程和 Docker 卷不保证跨任务恢复；已保存启动指引也不代表公网部署或永久托管。本轮不会关闭正在使用的独立数据库或清空其记录。正式部署的备份恢复、访问权限与服务器容量仍需在目标服务器验收。
