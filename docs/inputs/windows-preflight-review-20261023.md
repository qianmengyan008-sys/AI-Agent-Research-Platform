Codex 任务单：Render Staging 备份工具 Windows 验收前审查

目标：先完成代码与文档审查，不连接真实数据库、不部署、不修改 Render

一、已知背景

项目：AI-Agent-Research-Platform；Render Web Service：ai-agent-research-staging；PostgreSQL 数据库：ai-agent-research-staging-db。

备份工具位于 tools/windows-render-backup。研究者已收到 README-WINDOWS，且已确认 D 盘至少有 1GB 可用空间、关闭 VPN 后可正常打开 Render。

工具说明声称：Linux PowerShell 7.5 与真实合成 PostgreSQL 18 已验证；原生 Windows PowerShell 5.1、D 盘路径及 Windows ACL 分支尚未完成用户机器验收。

当前没有执行真实 Staging 备份。数据库外部连接、临时入站规则、加密、恢复和任何部署均未获本任务授权。

二、本轮授权范围

请在当前仓库/工作分支中检查备份工具的源代码和文档；如发现可明确复现的 Windows PowerShell 5.1 兼容性缺陷，可做最小修复并补充本地测试。只允许静态审查和不触碰真实 Render/真实数据库的本地合成测试。

检查 Prepare-Render-Backup.ps1、Backup-Render-Staging.ps1、Verify-Render-Backup.ps1、Encrypt-Render-Backup.ps1、RenderBackup.Common.ps1、encrypt-local.mjs、README-WINDOWS 及相关测试。

核对脚本是否兼容 Windows PowerShell 5.1；重点检查语法、参数绑定、外部进程退出码、编码、路径处理、ACL、超时和异常清理。

核对 README 约定的 PG18 二进制目录 D:\PostgreSQL18\pgsql\bin 与脚本实际查找逻辑是否一致；明确 EDB Windows x64 ZIP 解压后必须存在的文件和依赖目录。不要猜测 ZIP 的内部目录结构。

确认 Prepare 脚本只做本机前置检查，不连接数据库、不创建备份目录、不访问 Render、不读取仓库 .env 或导出环境变量。

确认备份脚本不会将连接 URL/密码写入命令行参数、日志、错误文本、收据或临时文件；TLS 必须保持严格验证，不得降级关闭证书/主机名验证。

确认失败路径不会留下被标记为成功的收据，不覆盖旧备份，不删除旧备份；验证脚本只检查 SHA256、文件大小及 pg_restore --list，不连接数据库。

检查可选加密失败时是否如实报告未加密，且不会伪造加密成功；不要把加密往返验证描述为完整数据库恢复验证。

如果需要测试，只使用本地合成 fixture；不要使用 Render 外部数据库 URL、真实账号、正式被试数据或真实 API 凭据。

三、明确禁止事项

不得连接、读取、导出或修改真实 Render 数据库；不得要求研究者把数据库 URL、密码、IP、管理员 Token、API Key 或 Deploy Hook 发到聊天或仓库。

不得修改 Render Networking、Environment、服务配置、数据库配置或计费方案。

不得触发 Manual Deploy、Rollback、Restore、Delete、Suspend、Restart，也不得新建/删除数据库服务。

不得运行 Backup-Render-Staging.ps1 的真实 Render 模式；不得把真实备份步骤标记为已完成。

不得关闭 TLS 校验、扩大 IP 白名单、清空数据库、重置账号或更改现有测试账号/实验分组/对话记录。

不得将备份、收据、数据库内容、密钥或含敏感值的截图提交到 GitHub。

四、请返回的结果格式

五、验收标准

只有当审查证据明确、所有未验证项被如实标记、没有触碰真实数据库/Render，且给出与实际脚本一致的 Windows PowerShell 5.1 前置检查指引时，本轮才算完成。

不得因为 Linux PowerShell 或合成数据库测试通过，就宣称 Windows 用户机器验收通过；不得因为 pg_dump/pg_restore 清单校验通过，就宣称数据库已完成恢复演练。

六、给研究者的当前边界

研究者正在手动准备官方 PostgreSQL 18 Windows x64 二进制 ZIP。Codex 本轮只做上述代码/文档审查；不要要求研究者在审查结果返回前运行真实备份。

项目 | 必须报告的结果
仓库定位 | 分支名、审查时 HEAD 短 SHA；不得包含任何凭据。
Windows 5.1 静态审查 | 通过 / 未通过 / 未验证；逐项列出具体证据和文件路径。
PG18 ZIP 目录约定 | 脚本要求的准确目录、必要 exe/DLL/lib/share 文件；与 README 是否一致。
安全检查 | URL/密码不进命令行和日志、TLS 严格验证、失败清理、收据校验、旧备份不覆盖，逐项给结论。
改动清单 | 如有修复，列出文件、改动理由和风险；没有改动则明确写未修改。
测试结果 | 实际运行的本地测试命令、退出码和摘要；没有运行的测试标注 NOT RUN，不得声称通过。
下一步人工操作 | 只给出研究者下一步需要点击/运行的单一动作；明确失败时停止条件。
状态声明 | 必须明确：尚未进行真实 Render 备份、尚未验证恢复、尚未授权部署。
