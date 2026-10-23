# Render Staging备份工具：Windows验收前审查

审查日期：2026-10-23（北京时间）。仓库AI-Agent-Research-Platform，分支`work`，审查起点HEAD **9723950**（完整`9723950d20c5baad93452b8a91da0739ba2d893d`）。本轮交付标签`windows-preflight-review-20261023`。原任务及提取文本保存在docs/inputs/windows-preflight-review-20261023.docx/.md。

**总体审查未通过：2项异常边界测试失败；Windows PowerShell5.1实际兼容性未验证；官方ZIP精确目录/依赖未核实。暂不进入真实备份。** 本轮没有连接、读取、导出或修改真实Render数据库，没有修改Render/Networking/Environment/API Key/计费，没有重置任何账号或历史，没有部署、恢复或创建Render资源。没有新增提交任何dump、备份收据、数据库内容或密钥。

## 逐项审查与证据

| 项目                | 结论                                | 代码证据及实际限制                                                                                                                                                                                                                          |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows5.1语法      | 未验证；静态未发现明确的PS7专属语法 | 生产5个PS1均为ASCII，避免5.1把无BOM UTF8中文误读；未见??、三元运算、ForEach-Object -Parallel等。实际AST解析引擎是7.5.4，解析成功不是5.1解析成功。                                                                                           |
| 参数绑定/.NET       | 静态审阅，Windows分支未验证         | Common使用.NET Framework4.5+已有的ProcessStartInfo、ReadToEndAsync、WaitForExit、SecureStringToBSTR；ASCII参数定义未见明确5.1专属缺陷。Uri/Split/引号绑定在.NET Framework实机仍NOT RUN。                                                    |
| 外部进程退出码/编码 | 本地合成检查通过，Windows未验证     | Common:45起UseShellExecute=false，直接Process.ExitCode；退出7保留，stderr未发布；空参数、空格、引号、尾反斜杠、Unicode在Linux往返通过。加密入口将非ASCII JSON转义后经stdin传入，不把口令放argv。Windows CRT/控制台/本地化编码未验证。       |
| 路径/D盘/ACL        | 静态审阅，Windows实机NOT RUN        | Common:4起要求绝对路径、本机固定D盘>=1GB、项目外路径，并拒绝已有路径链ReparsePoint；129起新时间/GUID目录，icacls只限制新子目录。NTFS权限、中文用户名、D盘实际情况及icacls退出码尚未实测；Linux chmod不代替Windows ACL。                     |
| 超时                | 本地合成检查通过                    | Common:45起进程默认180秒，连接10秒、锁10秒。独立Node进程1秒超时被终止并返回PROCESS_TIMEOUT。180秒是单个调用上限，不是整个流程总时长；Windows Kill/读管道未实测。                                                                            |
| Prepare只做前置检查 | 静态及本地PG18检查通过              | Prepare:5–6只调用Assert-BackupRoot/Get-PgTools；仅执行两个客户端--version，不创建备份目录、不发数据库连接、不访问Render、不读取.env或导出环境变量。本地目录不存在检查通过。                                                                 |
| URL/密码隔离        | 静态及本地检查通过，非渗透证明      | Backup:10隐藏Read-Host，15的argv只有导出选项和目标文件；Common:115起连接信息只进入pg_dump子进程环境，父环境不变，PG*继承项先清除。进程错误被入口通用文案处理，收据只写摘要。不声称字符串内存绝对擦除，也不能防恶意同用户进程/操作系统抓取。 |
| TLS严格验证         | 静态/解析测试通过，实际连接NOT RUN  | Common:118–119真实模式始终verify-full/system，即使URL写require也不降级；fixture仅回环，虚构Render主机解析不发起连接。system是libpq/OpenSSL信任源，不等于已验证Windows原生证书库可用；证书失败必须停止。                                     |
| Verify不连接数据库  | 静态及本地PG18检查通过              | Verify调用Get-PgTools的--version及Get-BackupVerification的SHA/大小/PGDMP/pg_restore --list；没有-d或恢复命令，也不改原收据。但空SHA原收据负面测试未通过，见R1。                                                                             |
| 普通失败清理/旧备份 | 常规测试通过；异常收据边界未通过    | 每次独立时间/GUID目录；正常错误端口不留partial dump/成功收据，既有备份文件未被主动覆盖。Write-PrivateReceipt直接WriteAllText，catch只删dump，见R2。                                                                                         |
| 可选加密            | 静态审阅；本轮未运行                | stdin隐藏口令、scrypt+AES256GCM、目的文件wx、解密/哈希往返后才ENCRYPT_OK；缺Node或异常报ENCRYPT_FAILED。保留原明文，错误后可能保留密文供私下处理，不得把文件存在当成功。full_restore_verified=false；往返不等于数据库恢复。                 |

## 两项失败及原因

**R1：原收据sha256为空时，Verify可能误报成功。** Verify-Render-Backup.ps1:8–13没有先要求原SHA为64位十六进制；Common.ps1:146默认ExpectedSha256为空，153只有其为真才比较。在受控本地mock清单和假的PGDMP前缀文件下，实际Verify入口收到`sha256:""`、匹配大小、dump退出0的合成收据后，退出0并输出VERIFY_OK。mock仅替代客户端和目录定位，不替代Get-BackupVerification/Verify判断；这是哈希闸门缺口，不是一个真实可恢复archive的证明。建议后续修复为入口强制收据字段/64位SHA、两项退出码及类型检查；空/空白/畸形SHA必须拒绝。

**R2：收据写入异常后可能残留成功外观的收据。** Common.ps1:171–175检查存在后直接WriteAllText；Backup-Render-Staging.ps1:22–26只删除dump，没有清理本次收据或进行原子发布。在临时复制脚本中，对Write-PrivateReceipt注入“写完JSON后抛异常”，实际备份入口退出1、删除本次dump，却残留1份pg_dump_exit_code=0的收据。它是写入/关闭失败边界的故障注入证据，不是声称在真实Windows磁盘上发生过该异常。建议后续使用本次私有目录内临时文件、成功关闭后不覆盖式发布，并在失败时只清理本次已创建的临时/最终收据，不能删旧备份。

任务授权明确允许修复的是“可明确复现的Windows PowerShell5.1兼容性缺陷”。本轮未证实这类专属缺陷，R1/R2是跨平台正确性问题，**未修改生产脚本**，没有擅自扩展到备份实现重构。审查探针故意退出1，不能当成全部通过，也不作为隐藏已知问题的绿色CI测试。本次审查完成不等于工具已获真实操作放行。

## PG18 ZIP与目录约定

脚本参数默认值完全一致：Prepare、Backup、Verify均为`D:\PostgreSQL18\pgsql\bin`，Get-PgTools仅准确查找该目录中的`pg_dump.exe`、`pg_restore.exe`，不递归搜索，不去PATH里选别的PG版本。两项--version必须退出0并且为18主版本；不是只检查文件名。

| 对象                      | 本轮可确定内容                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 两个EXE                   | 默认完整路径分别是D:\PostgreSQL18\pgsql\bin\pg_dump.exe、D:\PostgreSQL18\pgsql\bin\pg_restore.exe。这是脚本契约，不是ZIP层级证据。 |
| 具体ZIP版本/顶层目录      | NOT VERIFIED。未取得研究者所下载的具体ZIP或其中央目录，不能断言它必有pgsql顶层。                                                   |
| DLL名称及位置             | NOT VERIFIED。不能把Linux libpq依赖或其他版本的DLL名单当Windows18事实；保留实际官方包的全部依赖及相对位置，不单拷EXE。             |
| lib/share/运行库/证书依赖 | 精确清单NOT VERIFIED；实际包若包含这些目录则完整保留，不能虚构具体文件。--version只验证启动依赖，不验证TLS与所有导出功能。         |

只读访问官方EDB页面 https://www.enterprisedb.com/download-postgresql-binaries ，普通权限和提升后的访问均被网络代理以403拒绝。没有绕过代理、下载/执行Windows二进制、猜测版本号或ZIP内部结构。外部资料核实因此未完成，与研究者电脑是否能下载无关。README已明确区分约定路径和未取得的ZIP证据。

## 本轮实际测试

| 命令/范围                                                                                                                                                                                                 | 退出码  | 结果                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwsh -NoProfile -File tools/windows-render-backup/tests/Review-Local.ps1 -EvidenceFile <临时审查JSON>`（实际引擎/tmp/round45-powershell/opt/microsoft/powershell/7/pwsh）                                | 1       | 8项检查：6通过、2失败（R1/R2）；解析/编码源检查、argv往返、退出7/环境隔离、超时、TLS解析均通过。仅临时本地mock；不是真实PG archive、Windows或恢复测试。                         |
| `PWSH_EXECUTABLE_PATH=/tmp/round45-powershell/opt/microsoft/powershell/7/pwsh npx vitest run apps/api/tests/windows-render-backup.test.ts --testNamePattern '^(?!.*(?:AES256GCM\|actually restores)).*$'` | 0       | 实际本地PostgreSQL18.6 fixture：7通过，2有意未执行（加密、独立恢复）。版本/Prepare/全库合成dump/校验/错误连接/篡改等通过；未使用Render URL或真实账号。实际shell命令见下面说明。 |
| 原生Windows PowerShell5.1/Windows D盘/ACL/真实交互                                                                                                                                                        | NOT RUN | Linux PowerShell7.5.4不能代替。                                                                                                                                                 |
| 本轮加密、独立恢复、完整npm run check/浏览器/线上人工验收                                                                                                                                                 | NOT RUN | 没有把第45轮历史结果重新标成本轮执行。未运行真实Render备份或恢复。                                                                                                              |

另已执行`npm run lint`及`npm run format:check`，均退出0，日志见lint.log、format.log；不抵消两项功能检查失败。

上表正则的Markdown转义仅为表格显示；实际运行正则是`^(?!.*(?:AES256GCM|actually restores)).*$`。原始日志见local-review.log、pg18-targeted-regression.log；结构化检查见local-review-results.json（它是审查结果，不是备份收据）。本地PG18 fixture自动创建并停止一次性Docker容器，仅使用合成数据；本轮生成的合成dump/收据仅在临时目录，不新增上传GitHub。

## 文件改动及风险

- 新增tools/windows-render-backup/tests/Review-Local.ps1：可重复的本地审查探针；只启动本地Node/PowerShell，不连接DB，使用独立GUID临时目录与受控mock，结束只清理自身目录。已知两项未通过时退出1，不自动修复。
- 更新tools/windows-render-backup/README-WINDOWS.md：置顶未通过和停止提示；说明默认目录与ZIP证据缺口、system信任源限制、单进程超时、收据异常清理缺口。本轮禁止发送任何备份/收据，历史步骤仅作后续参考。
- 新增docs/inputs/windows-preflight-review-20261023.docx/.md和本目录审查报告、结果、日志：保留任务与证据，不含备份文件/收据或真实凭据。
- Prepare、Backup、Verify、Encrypt、Common、encrypt-local.mjs：**未修改**。业务代码、状态机、研究材料、Prompt、Validator、数据库结构/迁移、账号/历史、Render/API Key：**未修改**。

风险：生产脚本仍保留R1/R2，不应执行真实备份；新增探针不等于修复。后续修复后应重新执行负面检查、PG18合成回归，再进行原生Windows本机前置检查；真实备份、临时网络和部署继续分别需要明确授权。

## 研究者现在唯一下一步

**用资源管理器打开已下载的官方PostgreSQL18 Windows x64 ZIP，仅查看两个EXE所在的bin目录及其上级目录名称。** 不运行EXE/脚本，不改Render，不发IP/URL/密码或任何收据。如不能确认来源、18主版本或同一bin目录中两个文件均存在，立即停止，不猜测解压层级、不继续备份。D盘空间和VPN关闭可访问Render已确认，不要求重复核验。

**状态声明：尚未进行真实Render备份；尚未验证真实数据库恢复（本轮也未运行合成恢复）；尚未授权部署。**
