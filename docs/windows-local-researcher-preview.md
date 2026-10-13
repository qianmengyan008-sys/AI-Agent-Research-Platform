# Windows 本地研究者体验：三步开始

本轮优先让研究者在自己的电脑、自己的浏览器自由对话。**不需要购买服务器、配置域名或先通过人工语言审核。**导师远程体验的 staging 方案保留为之后阶段。

## 你必须手动完成的三件事

1. 安装 [Node.js 24](https://nodejs.org/en/download)（随附 npm 11）和 [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)，打开 Docker Desktop，使用 Linux containers。Windows 10/11 x64；Docker 可能要求启用 WSL2／虚拟化并重启。建议 8GB 内存与足够镜像空间。不要在本机连接 WorkBuddy 或生产数据库。
2. 下载整个项目 ZIP。若 Windows 标记文件来自互联网，在 ZIP“属性”中勾选“解除锁定”，再解压；确认解压目录里直接有 package.json 和 Start-Researcher-Preview.bat。不要只下载单个 .bat。无需设置全局执行策略；脚本仅在自己的 PowerShell 进程使用 RemoteSigned，组织强制策略如有阻止应交由 IT 处理。
3. 双击 **Start-Researcher-Preview.bat**。首次会安装依赖、构建并拉取固定数据库镜像，请等待。按提示安全输入自己的 DEEPSEEK_API_KEY（不会回显）；成功后把窗口中显示的本地地址粘贴到这台电脑的浏览器。

地址格式为 `http://127.0.0.1:实际显示的端口`，工具由系统分配空闲端口，不需要排查 4173 是否被占用。端口每次启动可能不同，以启动窗口为准。这是你的本机地址，不是当前 Codex 云环境可共享的网址。首次依赖／镜像下载需要联网；对话需要访问 DeepSeek HTTPS 服务。

密钥只在当前 PowerShell／Node 子进程环境中使用，不写入参数、Git、Word、.env 或日志。已有安全进程环境变量可直接复用。服务停止后新一轮启动可能需重新安全输入，不要求保存为系统／用户永久变量。不要把密钥输入聊天框，也不要将含密钥的终端或文件截图给别人。

## 最短操作入口

| 双击文件                       | 功能                                                    | 数据是否保留                             |
| ------------------------------ | ------------------------------------------------------- | ---------------------------------------- |
| Start-Researcher-Preview.bat   | 检查环境、安全输入 Secret、构建并启动，显示实际本机 URL | 保留；已运行时提示现有地址               |
| Stop-Researcher-Preview.bat    | 通过本地受保护控制通道停止 Web/API；不删除数据库卷      | 保留；可重新启动                         |
| Restart-Researcher-Preview.bat | 检查条件后停止并重新启动；显示新端口                    | 保留原会话，可能重新输入 Secret          |
| New-Researcher-Round.bat       | 服务运行时新建 R002、再点则 R003，固定三条路径          | 旧轮次和旧会话不变                       |
| Export-Researcher-JSON.bat     | 服务运行时导出完整 JSON，显示保存路径                   | 保存到私有目录 exports，不覆盖旧导出     |
| View-Researcher-Accounts.bat   | 在本机窗口显示 experiment_id、账号、路径和参与者密码    | 不显示模型密钥、admin_token 或数据库密码 |

保留启动窗口。Ctrl+C 也可停止；首次安装／初始化尚未完成时请勿直接强制关窗。数据库容器可能仍在 Docker 后台运行，停止 Web 不会清空它。可以停止 Docker Desktop；下次体验需先重新打开 Docker Desktop。不要删除 Docker volume 或 `.researcher-preview-private`，二者共同保存当前体验状态与凭据。

## 三个账号与登录

双击 View-Researcher-Accounts.bat，只在自己的电脑查看登录信息。首次默认账号如下；密码与 experiment_id 是你电脑第一次启动时随机生成的，不在 GitHub 包内：

| 参与者编号 | 固定路径   | 体验重点                                             |
| ---------- | ---------- | ---------------------------------------------------- |
| R001-COG   | 认知       | 确认观点是否漂移、两次评分对象、四阶段重构与兜底体验 |
| R001-EMO   | 情感       | 回应性、人物／场景、重复、指代与结束行为             |
| R001-DAILY | 日常／中性 | 自然聊天、不主动引入干预、可以明确提交结束           |

进入“参与者入口”，填写实验编号、参与者编号、密码，点击“登录实验”及“开始／继续对话”。自然输入，**不要照着自动化脚本聊天**。评分和观点确认仍必须本人明确填写；其他阶段保持已批准的后台兜底规则。日常路径自由聊天后点击“提交当前填写”结束。

中断后重新登录同一账号继续原会话；已完成账号不能重置为新会话。要重新完整体验，点击 New-Researcher-Round.bat 获取新 R002／R003 账号。管理员读取诊断的既有入口保留；本机 owner 的 admin_token 在私有 credentials.json，只供管理员安全获取，不能发送或提交公开仓库。

## 同一会话导出与六维审核

完成认知、情感、日常各一个非脚本会话后，点击 Export-Researcher-JSON.bat，记录其输出文件路径。导出 complete=true、per_table_limit=null；参与者端不出现 stage、Prompt、Validator 或重试诊断。管理员现有“下载完整 JSON”也仍可用。

可由指导 GPT／开发者使用以下离线命令整理**同一导出**，不调用模型、不填假的人工分数：

```bash
node scripts/researcher-review-package.mjs 完整导出.json 新的审核目录
node scripts/cognitive-turn-audit.mjs 完整导出.json 新的认知审核目录 认知session_id
```

多个已完成认知会话时第二条必须明确 session_id。默认审核包拒绝覆盖已有审核决定。原导出没有逐消息的 turn 外键，工具只有在全 ready、连续轮次、严格用户／AI 交替时才配对，否则拒绝或标记无法判断，不编造历史关联。

人工六维：流程忠实度、对用户输入的响应性、语义准确性／指代清晰度、语言自然度、中性与非诱导性、重复与机械感。每项填写“通过／需修改／无法判断”，保留原文及 session_id／turn_id。A 类必须修复复验；主要 B 类整改后新一轮复验；C 类可延期。模板见 docs/researcher-human-review-template.md。

## 缺失条件或故障时

| 提示／现象             | 最短处理                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| 缺 Node／版本不对      | 安装 Node 24，重新打开启动窗口                                                             |
| Docker 缺失／未启动    | 安装并打开 Docker Desktop，确认 Linux containers 就绪                                      |
| 镜像／依赖下载失败     | 检查网络，保留官方摘要／TLS 校验；重新启动，不跳过安装                                     |
| 脚本策略阻止           | 解除锁定下载的 ZIP 后重新解压；组织策略联系 IT，不修改全局策略                             |
| LOCAL_MANAGER_LOCKED   | 等待正在初始化的启动窗口；可先正常 Stop。已死亡的本地 manager 锁会自动识别；不要删除数据库 |
| bootstrap.lock 残留    | 确认已停止本项目初始化进程后，仅处理该锁文件，不删除凭据或数据卷；联系指导者               |
| 关闭／重开页面后未登录 | 重新登录原账号，聊天与状态仍由数据库保存                                                   |
| 模型回复未能生成       | 刷新或按现有“重试同一消息”恢复；记录该轮供管理员定位，不重置实验                           |

本轮在 Linux + PowerShell 7.4.6 验证启动／停止／新轮次／导出等操作，另用真实 PostgreSQL 验证重启保存消息。当前云环境没有 Windows 内核，因此 Windows PowerShell 5.1、Docker Desktop／WSL2、Windows ACL 和双击 .bat 的完整真机链路尚需你首次运行确认。该限制不要求先购买服务器；如遇具体故障，先诊断本地条件，再考虑独立 VM。

## 两个独立就绪结论

researcher_self_test_ready：**有条件就绪**。本地体验包与维护链路已通过工程验证，你完成上述安装、Secret 与启动后即可本人体验；你的电脑首次启动状态尚未由当前云会话确认。人工语言审核不阻止开始体验。

mentor_test_ready：**false**。三条本人非脚本会话、同会话六维人工审核、A／主要 B 问题整改复验与签署仍未完成。当前认知样例 9 次重试／8 轮兜底尚待判断，不能只因流程结束就放行导师。
