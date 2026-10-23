# 第46轮：Render备份校验阻塞项修复验收

日期：2026-10-23（北京时间）。交付标签：`round46-delivery`。

**结论：R1/R2本地修复验收通过；仅可进入Windows本机Prepare前置检查。原生Windows/ACL/TLS与真实Render备份仍未验收，真实备份、网络修改、恢复及部署均未授权。** 本轮只使用本地合成数据，未连接/读取/导出/修改真实数据库，未改API Key、Render、计费、账号、实验分组或历史。

## 基线与授权核对

开始执行时分支`work`，HEAD完整SHA **01f4206f30e3e3db3ebd9ab54abb0543222c11dc**；它是任务所引审查起点`9723950d20c5baad93452b8a91da0739ba2d893d`的直接后续提交。01f4206只增加审查探针、证据和README，Prepare/Backup/Verify/Encrypt/Common/encrypt-local生产文件与9723950相同，因此本轮复核源代码与R1/R2机制后实施修复，没有盲套旧报告。两个原有失败断言仍保留，未反转、跳过或降格为只记录。

本轮反馈原件与提取全文位于docs/inputs/round46-feedback.docx、round46-requirements.md。之前未通过的审查报告保持原样，代表修复前状态；本报告及当前代码代表修复后状态。

## 修改文件与修复机制

| 文件                                                | 修改目的/机制                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tools/windows-render-backup/RenderBackup.Common.ps1 | 新增Assert-OriginalReceipt，要求对象结构、64位十六进制SHA、正整数bytes及整数0的dump/list退出码。Get-BackupVerification显式收到ExpectedSha256时也拒绝空/畸形值，备份首次计算哈希时可不传期望值。收据IO改为唯一临时文件CreateNew、不共享写入、UTF8无BOM、Flush(true)、关闭后同目录两参数File.Move不覆盖式发布。状态只记录本次确实创建的临时/最终文件，失败只删除这些文件；清理错误不替换原错误。 |
| Verify-Render-Backup.ps1                            | UTF8读取原收据，先严格验证结构/类型和值，再核对文件大小，之后才运行哈希和PGDMP/清单校验。所有失败走VERIFY_FAILED与非零退出，无TOC明细。有效大小写SHA都接受。                                                                                                                                                                                                                                   |
| Backup-Render-Staging.ps1                           | 向收据写入器传递本次ownership状态；异常时先清理本次收据，再清理本次dump，始终保存最初错误。清理失败输出BACKUP_CLEANUP_INCOMPLETE/残留风险及BACKUP_FAILED，非零退出，绝不输出BACKUP_OK。                                                                                                                                                                                                        |
| tests/Review-Local.ps1                              | 保留原6项通用检查和R1/R2断言，扩展为49项。故障注入改在写/flush/close/发布/删除的IO边界，让原子发布、归属记录、异常清理的生产代码实际执行；不再通过替换整个Write-PrivateReceipt绕过归属逻辑。所有负面断言仍要求非零拒绝、无成功标记、旧文件不变。                                                                                                                                               |
| tests/Run-Synthetic.ps1                             | 增加review操作，使既有完整check实际执行49项探针。                                                                                                                                                                                                                                                                                                                                              |
| apps/api/tests/windows-render-backup.test.ts        | 增加2个Vitest用例：整合49项探针；用实际PG18 archive验证大写SHA正例和7项错误收据负例。原9项（含真实本地加密往返/隔离恢复）保持并全部重跑。新测试只设置自身合理超时，未放宽任何原断言、原并发用户数或浏览器重试。                                                                                                                                                                                |
| README-WINDOWS.md、README.md                        | 更新修复状态、实际-PgBin目录及唯一下一步Prepare；保留真实操作需单独批准、Windows实机NOT RUN。                                                                                                                                                                                                                                                                                                  |
| docs/inputs、docs/acceptance/step6-round46          | 原始任务、本报告、逐项结果、原始日志、结构化状态与可下载工具包。没有新增提交dump、备份收据、数据库内容或密钥。                                                                                                                                                                                                                                                                                 |

Prepare、Encrypt、encrypt-local.mjs、scripts/encrypted-backup.mjs **未修改**。业务代码、状态机、Prompt、Validator、研究材料/参数、数据库结构/迁移、账号/分组/历史、Render配置及API Key **未修改**。保护范围核对见protected-scope.json。

## R1验收：不再误报有效收据

入口要求sha256为字符串且匹配`\A[0-9a-fA-F]{64}\z`；bytes只接受Int32/Int64且>0，不接受数字字符串/浮点/布尔/null；dump和list退出码也只接受整数0。缺少字段、非对象JSON或解析失败均拒绝。校验字段位于文件哈希和外部工具调用之前；探针用调用标记验证无效元数据没有启动工具。

受控本地mock：2项有效收据（大小写SHA）通过；33项负例全部正确拒绝，包括空/空白/null/缺失/过短/过长/非hex/非字符串/尾换行SHA，bytes缺失/null/0/负数/字符串/浮点/布尔/过大数值，dump退出码缺失/null/非0/字符串/浮点/布尔，list退出码缺失/非0/字符串，文件大小不匹配，非法JSON结构与有效格式但不匹配的SHA。所有错误都非零、VERIFY_FAILED、无VERIFY_OK。

实际本地PG18 archive另验证：大写SHA接受；空SHA、null SHA、64位非hex、字符串bytes、大小不匹配、字符串dump退出码、失败list退出码共7项负例均拒绝。并保留实际PG18归档校验及文件篡改拒绝测试，不用mock成功替代真实archive测试。

每个用例的实际结果均见[case-results.md](case-results.md)，49项原始输出见local-review.log。JSON为审查结果，不是备份收据。

## R2验收：原子发布、归属清理与旧文件保护

8项故障检查全部通过：

| 注入位置                   | 实际结果                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 临时文件部分写入后失败     | 退出1；本次dump/临时/最终收据均无残留；旧文件哈希不变。                                                                                                    |
| Flush失败                  | 同上。                                                                                                                                                     |
| Close失败                  | finally尝试关闭后清理；退出1；无本次文件残留；旧文件不变。                                                                                                 |
| 发布前失败                 | 退出1；关闭后的完整临时收据也被清理；无最终收据。                                                                                                          |
| 发布成功后抛错（原R2场景） | 归属状态确认本次已发布文件，删除本次最终收据与dump；退出1，无成功外观孤儿收据。                                                                            |
| 发布前目标被其他操作创建   | File.Move拒绝覆盖；保留原目标内容，只清理本次临时文件/dump，退出1。                                                                                        |
| 开始写入前目标已存在       | 不覆盖/删除已有目标；退出1，无本次临时文件/dump残留。                                                                                                      |
| 部分写入后，清理删除又失败 | 退出1；仅残留1份8字节.tmp，最终收据0、dump0；明确输出BACKUP_CLEANUP_INCOMPLETE；最初SYNTHETIC_ORIGINAL_WRITE_FAILURE仍保留，未被清理异常替换；旧文件不变。 |

每项都额外保护独立previous-backup目录中的旧dump和旧收据，通过前后SHA比较证明未改动。正常成功路径由实际PG18 backup/Verify验证，输出BACKUP_OK之前文件已写完、flush、close和发布；不把目录存在、临时文件存在或负面拒绝当备份成功。

同目录不覆盖式发布解决异常路径中间文件的可见性问题，不承诺断电/进程强杀后的绝对持久性。若权限/磁盘故障阻止删除，程序只能明确失败和残留风险，不能谎称全部清理完成。实际文件系统/Windows ACL行为仍需实机证据。

## 本轮实际运行的检查

环境：Linux；PowerShell7.5.4位于/tmp/round45-powershell/opt/microsoft/powershell/7/pwsh；实际本地合成PostgreSQL18.6及18.6客户端；一次性回环Docker fixture，模型为MockAdapter。没有真实API调用或Render连接。

| 命令                                                                                                                                         | 退出码 | 当前轮结果                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| `pwsh -NoProfile -File tools/windows-render-backup/tests/Review-Local.ps1 -EvidenceFile <临时审查JSON>`（实际使用上列pwsh路径及临时XDG目录） | 0      | 49检查全部通过，0失败；包含原两项失败断言和本轮新负例。                                                                    |
| `PWSH_EXECUTABLE_PATH=/tmp/round45-powershell/opt/microsoft/powershell/7/pwsh npm run test:windows-backup`                                   | 0      | 11项全部通过、0跳过；实际全库合成dump、SHA/清单/篡改/错误连接、49项探针、实际错误收据、AES256GCM往返及独立合成恢复均执行。 |
| `PWSH_EXECUTABLE_PATH=/tmp/round45-powershell/opt/microsoft/powershell/7/pwsh npm run check`                                                 | 0      | 类型、lint、format、构建通过；业务/策略514项+备份11项=Vitest525项/35文件，Playwright25项通过；失败0、跳过0、浏览器重试0。  |

49项脚本检查已被包含在11项中的一个集成测试内，不把49再累加到525。以上均为本轮实际执行，不沿用第45轮结果。直接探针、专项和完整check本轮首次均通过，没有隐藏失败运行；原审查R1/R2失败记录保留在历史目录，不改写历史。完整原始日志full-check.log、pg18-targeted-regression.log、local-review.log及browser-results.json随交付保留。

隔离恢复测试实际将本地合成dump恢复到同一临时PG18服务器中的独立restored_fixture数据库，逐行比较源/目标全部research/research_meta表（测试要求>20张）、非空消息、账号哈希、分配及迁移账本，全部通过。它不是独立主机/异地灾备，也不是Windows或真实Render数据库恢复。加密往返验证和数据库恢复为两个分别执行的测试，不混为一谈。本轮不上传两者的dump/receipt。

## Windows5.1、目录与安全状态

静态未见新增PS7专属语法；5个生产PS1都是ASCII。使用的PSCustomObject属性访问、UTF8读取、.NET FileStream/CreateNew/Flush(Boolean)/Dispose、两参数File.Move均为Windows5.1/.NET Framework可用API；没有使用Core专用覆盖式Move重载。实际解析器仍是PS7，不当作PS5.1语法验收。

| 项目                                                              | 状态                                         |
| ----------------------------------------------------------------- | -------------------------------------------- |
| 原生Windows PowerShell5.1执行                                     | NOT RUN                                      |
| Windows ACL、D盘、中文用户名/路径、native argv/.NET Framework绑定 | NOT RUN                                      |
| 研究者PG18.6-5实际exe启动/DLL/TLS                                 | NOT RUN；仅任务单确认文件可见，不是执行证据  |
| 归档精确DLL/运行库依赖清单                                        | NOT VERIFIED；保留官方依赖和相对目录，不猜测 |
| 真实Render备份/恢复/旧账号线上保留验证                            | NOT RUN；本轮没有部署或连接数据库            |
| 线上人工三路径/真实模型语义验收                                   | NOT RUN；本地浏览器回归不代替线上验收        |
| 真实备份、Networking、部署授权                                    | 未获批准、未执行                             |

真实模式verify-full/system、隐藏Read-Host、凭据仅进入子进程环境、父PG环境不变、原始错误不发布等边界保持；Prepare仅本地--version、Verify仅本地文件与--list，不连接数据库。没有读取仓库.env或显示任何真实Secret。TLS/原生Windows运行未验证，失败必须停止而非降级。

## 研究者唯一下一步：本机Prepare

实际PG目录以本轮任务单为准：`D:\postgresql-18.6-5-windows-x64-binaries\pgsql\bin`，不要搬动/重命名它。工具包保持D:\AI-Agent-Research-Platform下的tools/scripts相对目录。仅在普通Windows PowerShell中运行这一条本机预检查：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI-Agent-Research-Platform\tools\windows-render-backup\Prepare-Render-Backup.ps1" -PgBin "D:\postgresql-18.6-5-windows-x64-binaries\pgsql\bin"
```

预期PREPARE_OK，两条工具版本为18；不连接数据库、不创建备份目录。不需要任何URL、密码、IP、Token或API Key。若路径不存在、DLL错误、非18、PREPARE_FAILED、权限/空间或组织执行策略阻止，立即停止，不移动PG目录、不继续备份、不改Render。Bypass只作用于此次子进程，不修改永久策略，不绕过组织限制。只回报预检查成功/失败与脱敏版本文本，不发Secret或任何收据。

**状态声明：真实Render备份未执行；真实数据库恢复未验证；部署未授权。R1/R2本地通过不代表Windows或线上验收通过，Staging真实备份门禁仍阻塞。**
