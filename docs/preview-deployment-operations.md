# 研究者内部体验部署：服务申请与逐步操作

本轮沿用“暂未准备部署目标，先交付部署包与最短操作步骤”的选择。已确定方案，不再等待平台自动产生地址：**独立 Linux 虚拟机 + 自有测试域名 + Caddy HTTPS + 本项目 Node 服务 + 同机 PostgreSQL 专用持久化卷**。建议使用 DigitalOcean Droplet（Ubuntu 24.04、至少 2GB 内存，建议 4GB 给构建与数据库留余量），也可由运维在已有独立服务器运行同样部署包。本轮未注册付费服务、未购买服务器，未产生公网网址。

## 需要申请或准备的服务

| 必须／可选           | 服务                                   | 由谁完成                                         | 安全与费用影响                                                    |
| -------------------- | -------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 必须                 | 独立测试 VM，默认 DigitalOcean Droplet | 研究者／运维注册、创建项目和服务器；选择新服务器 | 产生云资源费用，以平台控制台价格为准；不要选 WorkBuddy 主机       |
| 必须                 | 域名或已有域名的测试子域名             | 域名管理员建立 DNS A 记录                        | 新域名可能付费；只改新子域名，不改生产域名解析                    |
| 必须                 | DeepSeek 服务器可用 Secret             | 研究者在新服务器安全配置                         | 发生实际模型用量；Codex 代理绑定不会自动迁移到新服务器            |
| 必须                 | SSH 公钥与限定的管理权限               | 运维生成并配置                                   | 私钥不传聊天／GitHub；22 端口仅允许运维来源 IP                    |
| 必须                 | 测试访问范围                           | 研究者提供允许体验者范围，运维配置               | 稳定来源 IP 可限制 443；否则依赖高强度独立账号并限于合成体验      |
| 已包含，无需再申请   | PostgreSQL 数据库                      | 部署工具在独立 VM 创建                           | PostgreSQL 不开放公网，使用专用 Docker volume，不能算云托管数据库 |
| 已包含，无需单独注册 | Caddy／HTTPS 证书                      | 运维安装并配置 Caddy                             | 常规公开域名可自动签发证书；DNS 和 80/443 可达才会成功            |
| 可选，长期保存建议   | 异机加密备份或云快照                   | 运维配置                                         | 对话与凭据属于受保护材料；存储、备份可能付费，恢复需另外验收      |

注册入口：[DigitalOcean](https://cloud.digitalocean.com/)。部署说明：[Droplet 创建](https://docs.digitalocean.com/products/droplets/how-to/create/)、[云防火墙](https://docs.digitalocean.com/products/networking/firewalls/)、[Node.js 下载](https://nodejs.org/en/download)、[Docker Ubuntu 安装](https://docs.docker.com/engine/install/ubuntu/)、[Caddy HTTPS](https://caddyserver.com/docs/automatic-https)。这些是操作入口，不代表本轮已取得账户授权或已创建资源。

## 研究者必须手动完成的部分

研究者完成服务账号注册与付款、选定服务器／地域、域名 DNS 权限、安全提供服务器的 DeepSeek Secret，以及确定体验人员。运维可以代为完成安装、DNS、端口、服务启动、账号分发和检查。研究者本人必须完成三条非脚本体验与人工语言审核；自动化程序不能替代签署。

不要发送 API 密钥、SSH 私钥、root 密码或 admin_token。Codex 的 Environment Secret 在当前云环境可用，但服务器是不同安全域：不得从代理变量提取密钥或把代理占位符复制到服务器。服务器应使用由研究者在 DeepSeek 控制台安全管理的实际部署密钥。

## 从下载到 HTTPS 的操作顺序

下列 SERVER_IP、测试域名、ZIP 文件路径都是占位符，必须替换。命令由负责该独立服务器的运维执行；本轮只验证项目安装与内部服务，没有在外部服务器执行 systemd、DNS 或 TLS。

1. 创建 Ubuntu 24.04 独立 VM，配置 SSH 公钥，记录公网 IP。在防火墙允许管理来源访问 22；允许证书验证需要的 80；443 可按研究者来源限制。不要开放 4173 或 5432。
2. 安装 Node.js 24／npm 11、Docker、Caddy、unzip。使用发行版签名包或官方校验流程，不关闭 TLS／签名验证。确认 `node -v`、`npm -v`、`docker info`、`caddy version`；service 默认 Node 路径是 `/usr/bin/node`，与实际安装路径不同时修改 ExecStart。
3. 从本轮 GitHub 链接下载整个项目 ZIP，用 SFTP 或本机终端传入服务器；私有仓库需先以你的 GitHub 账号下载，不要把下载令牌写进命令或 ZIP：

```bash
scp '/你的本机路径/项目.zip' root@SERVER_IP:/tmp/researcher-project.zip
```

4. 在服务器以运维身份创建专用用户、目录并解压。以下命令针对全新独立主机；如果已有 research 用户或目录，先检查，不能覆盖原项目：

```bash
sudo useradd --create-home --shell /bin/bash research
sudo usermod -aG docker research
sudo mkdir -p /srv/AI-Agent-Research-Platform
sudo unzip /tmp/researcher-project.zip -d /srv/researcher-unpack
```

GitHub ZIP 有一层顶级目录。将该目录**内容**复制到 `/srv/AI-Agent-Research-Platform/`，确认 package.json 直接位于这个路径，然后：

```bash
sudo chown -R research:research /srv/AI-Agent-Research-Platform
sudo -u research bash -lc 'cd /srv/AI-Agent-Research-Platform && npm ci && npm run build'
sudo -u research docker pull postgres:17.7-alpine@sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2
```

Docker 组具有服务器管理能力，因此此权限仅用于专用测试主机。不要在共享生产服务器随意授予。

5. 在服务器安全创建 Secret 文件，再启用服务：

```bash
sudo install -m 600 /srv/AI-Agent-Research-Platform/deploy/researcher-preview.env.example /etc/researcher-preview.env
sudoedit /etc/researcher-preview.env
sudo install -m 644 /srv/AI-Agent-Research-Platform/deploy/researcher-preview.service /etc/systemd/system/researcher-preview.service
sudo systemctl daemon-reload
sudo systemctl enable --now researcher-preview
sudo systemctl status researcher-preview --no-pager
```

在 sudoedit 中填写 DEEPSEEK_API_KEY，端口保留 4173；不要截图此文件，不要打印密钥。启动工具只创建自己的数据库／账号，不使用外部 DATABASE_URL，不连接 WorkBuddy。若日志出现端口占用，先核实已有监听者，不能停止不属于本部署的进程；当前云验证曾遇到 4173 已占用，使用受支持的 4184 覆盖完成检查，未终止原进程。

6. 域名管理员建立测试子域名 A 记录指向 SERVER_IP；只有服务器支持 IPv6 才设置 AAAA。编辑 Caddyfile，用实际域名替换模板中的 `{$STAGING_DOMAIN}`，保留 `reverse_proxy 127.0.0.1:4173`。不要仅在交互 shell 设置变量便假定 Caddy systemd 会继承它。校验和重载：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

7. 从研究者自己的另一台设备打开实际 HTTPS 域名。证书有效、首页和 JS 资源加载、三个账号能登录，才算对外入口通过。服务器内部 health 200 不能单独证明浏览器、数据库、模型或外部 HTTPS 可用。本轮不提供未创建的域名示例作为点击链接。

## 账号、完整流程与数据导出

首次启动生成该服务器的 experiment_id、R001-COG／R001-EMO／R001-DAILY 账号及密码，保存在服务目录的 `.researcher-preview-private/credentials.json`（父目录 700，文件 600）。运维只在私下把参与者账号交给研究者；admin_token 另交管理员。GitHub 归档中的 UUID 是合成验收样例，不能用于新部署登录。

浏览器选择“参与者入口”，填写实验编号、参与者编号、密码，再点击“开始／继续对话”。认知路径明确确认观点并两次填写评分；情感路径按当前填写表达；日常自然聊天后明确提交结束。三条路径固定在后台，不能由聊天改条件。研究者自然表达，不复制 QA001 测试台词。

中断后重新登录同一账号继续原会话。完成后如需新一轮，在有安全 Secret 注入的维护终端使用 `new-round R002`；不删除旧会话或数据库。普通 shell 不会自动继承 systemd 的 EnvironmentFile，维护命令需由运维安全注入配置；不要把真实密钥放在 CLI 参数。

管理员登录后选择实验，点击“下载完整 JSON”。检查 complete=true、per_table_limit=null、data_quality，并保留 session_id／turn_id／版本。异常可在只读开发诊断查看阶段、Validator、模型运行、重试与兜底；这些数据不显示给参与者。按 `docs/researcher-human-review-template.md` 审核同一体验，不再生成一组模型回复冒充人工体验。

## 持久化与版本冻结

| 项目             | 当前状态与边界                                                                     |
| ---------------- | ---------------------------------------------------------------------------------- |
| 开发环境         | Codex 工作目录与本地 Docker，任务运行验证；不是长期体验托管                        |
| Preview 环境     | 独立 VM，固定 Flash／mentor-test-v1，账号与导出仅供研究者内部体验；本轮未外部部署  |
| 正式实验环境     | 尚未建立，不复用测试身份与 Preview 数据，不在本轮执行                              |
| 数据保存         | 独立 Docker volume 与私有凭据目录都需保留；仅服务重启会保留会话                    |
| 服务器删除／故障 | 本地 volume 不能抵御主机丢失；需要异机备份／快照及恢复验证                         |
| 版本冻结         | 使用本轮不可变 GitHub 提交 ZIP，不在测试中 git pull main；保留完整导出版本与源 ZIP |

本轮只给出已可运行项目的部署操作，不改变实验逻辑、Prompt、模型接口或实验参数。没有人工语言审核签署就不能放行导师；内部入口的部署可以先进行。

## 外部部署后的验收登记

| 项目                                       | 运维／研究者填写                     |
| ------------------------------------------ | ------------------------------------ |
| 实际 HTTPS URL、部署提交、服务器／地域     | 待填写                               |
| TLS、外部首页和 JS、登录测试               | 待在目标服务器验证                   |
| DeepSeek 实际模型、HTTP／异常与延迟        | 待在目标服务器验证，不只写配置模型名 |
| 认知／情感／日常 session_id 与最终状态     | 待本人完成非脚本体验                 |
| 数据保存、完整导出、异常可定位             | 待目标服务器验收                     |
| 重启恢复、备份恢复                         | 重启与备份恢复分别记录，不能混用     |
| 人工六维审核、A／主要 B 问题整改复验、签署 | 待完成，mentor_test_ready=false      |
