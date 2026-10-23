第46轮反馈：修复 Render Staging 备份工具校验阻塞项

目标：修复已复现的 R1/R2 缺陷，重新验证后再指导研究者执行本机前置检查

一、当前证据与状态

研究者上传的项目 ZIP 内含 docs/acceptance/windows-preflight-review-20261023/report.md 和 review-status.json。报告结论为 NOT PASSED：R1、R2 两项异常边界测试失败；Windows PowerShell 5.1、Windows ACL/D 盘实机及官方 ZIP 完整依赖仍未验证。

R1：原收据 sha256 为空时，Verify-Render-Backup.ps1 仍可能输出 VERIFY_OK。当前校验缺少严格的收据字段与 SHA256 格式门槛。

R2：收据写入过程中抛出异常时，备份入口会删除本次 dump，但可能留下看似成功的收据。

研究者本机已下载并解压 PostgreSQL 18.6-5 Windows x64 binaries。截图显示两个文件在同一目录：D:\postgresql-18.6-5-windows-x64-binaries\pgsql\bin\pg_dump.exe 和 pg_restore.exe；同级可见 lib、share 等目录。截图仅证明目录/文件可见，不证明原生 Windows 执行、TLS 或导出功能已验证。

脚本参数支持 -PgBin；目前默认路径是 D:\PostgreSQL18\pgsql\bin。研究者实际路径与默认路径不同。不要要求研究者为了迁就默认路径而搬动或重命名官方归档目录；优先在后续指引中通过 -PgBin 显式传入其实际 bin 路径。

二、必须修复的缺陷

R1：Verify 必须拒绝缺失或畸形的原始收据

在 Verify-Render-Backup.ps1 入口及必要的共用校验函数中，先验证原始收据结构，再执行文件哈希和 pg_restore --list。

sha256 必须是恰好 64 位十六进制字符串（大小写均可）；拒绝缺失、null、空字符串、全空白、长度不符和非十六进制字符。

bytes 必须是正整数；pg_dump_exit_code 必须是整数且等于 0。对缺失、null、字符串伪装数字或不合理值明确失败。

只有原收据有效、实际文件大小与收据匹配、SHA256 与收据匹配、PGDMP/pg_restore --list 校验成功时，才能输出 VERIFY_OK。任何一项不满足都必须非零退出并输出 VERIFY_FAILED，不打印 TOC 明细。

增加负面回归测试，至少覆盖空 SHA、空白 SHA、畸形 SHA、缺失字段、错误退出码及大小不匹配；确保之前能误报成功的用例现在必定失败。

R2：收据写入必须避免留下成功外观的半成品

将收据先写入本次私有运行目录中的唯一临时文件，确保写入完成、流关闭后再以不覆盖现有文件的方式发布为 staging.receipt.json；优先使用同目录原子发布方案。

若写入、flush、close 或发布步骤任一失败，只能清理本次尝试创建的 dump、临时收据，以及能确认由本次尝试创建的最终收据。绝不能删除或覆盖旧备份/旧收据。

异常清理不得掩盖原始错误；清理失败时应明确报告残留风险，不得输出 BACKUP_OK。

增加故障注入测试，至少覆盖：临时收据部分写入失败、关闭/发布失败、发布前目标已存在。测试必须证明不产生成功外观的孤儿收据、旧备份不被覆盖。

三、测试与报告要求

先确认当前工作分支与 HEAD；若当前仓库不等于审查报告的 work / 9723950d20c5baad93452b8a91da0739ba2d893d，不得盲目套用报告结论，先说明实际基线。

修复后重跑 Review-Local.ps1，R1/R2 所有新增负面测试必须通过；不得删除、跳过、反转断言或把失败探针改成只记录不失败。

重跑真实本地合成 PostgreSQL 18 fixture 的备份、收据、校验与错误路径测试；如环境允许，执行已有的 AES256GCM 往返和独立合成恢复测试。仅使用本地合成数据。

运行相关 lint/format 和项目必要检查；逐项报告命令、退出码、通过/失败/未运行，不能将历史测试结果标成当前轮结果。

静态审查 Windows PowerShell 5.1 兼容性，但必须明确原生 Windows PowerShell 5.1 实机仍 NOT RUN，除非确实有该环境证据。

更新 README-WINDOWS.md：在 R1/R2 修复与测试通过前，明确禁止真实备份；给出研究者实际 PostgreSQL bin 路径的 -PgBin 用法，但不得声称已完成 Windows 本机验收。

不要执行真实 Render 连接，不要请求研究者提供 URL、密码、IP、Token 或 API Key。

四、严格禁止事项

不连接、读取、导出或修改真实 Render 数据库；不修改 Render Networking、Environment、计费或服务配置。

不触发 Manual Deploy、Rollback、Restore、Delete、Suspend、Restart；不创建或删除任何 Render 资源。

不运行真实 Render 模式的 Backup-Render-Staging.ps1，不生成真实数据库 dump/receipt，不把真实备份或恢复标记为成功。

不关闭 TLS 验证、不扩大 IP 白名单、不清库、不重置账号或对话历史，不修改业务路径/Prompt/实验分组。

不把 dump、收据、数据库内容、密钥或含敏感信息的截图提交到 GitHub。

五、Codex 交付格式

六、通过标准

R1/R2 负面测试必须真实通过；所有结果可追溯且未夸大验证范围；旧备份保护和失败清理边界有测试证据；README 明确指出真实操作仍需单独批准。若任一关键测试失败或未运行，继续保持 NOT PASSED，并给出具体阻塞项，不允许指导研究者连接真实数据库。

交付项 | 必须包含
基线 | 当前 branch、HEAD SHA、与报告基线的关系
改动 | 修改文件清单、每项缺陷的修复机制
R1/R2 验收 | 每个负面用例的结果，证明错误收据/异常写入不再误报成功
测试 | 命令、退出码、通过/失败/未运行及运行环境
Windows 状态 | PowerShell 5.1、ACL、实际 D 盘路径是否已实测；未测一律写 NOT RUN
研究者下一步 | 只给出一个下一步手动动作和准确命令；默认不执行真实备份
安全状态 | 明确：真实 Render 备份未执行、真实恢复未验证、部署未授权
