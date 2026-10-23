# Windows / D盘：Render Staging PG18备份工具

**2026-10-23 Windows验收前审查：暂不运行备份。** 本地负面测试发现空SHA收据可能被误判通过、收据写入故障后可能残留成功外观的文件，尚未修复。当前审查未授权真实备份、加密、恢复或部署，也不要发送任何备份或收据。详见[审查报告](../../docs/acceptance/windows-preflight-review-20261023/report.md)。以下流程仅作后续参考，不表示已获操作授权。

**现在只接收工具包，不要提前安装、改Render或备份。** D盘至少1GB空间：研究者已确认足够；关闭VPN后能正常打开Render：研究者已于2026-10-23确认。不发送公网IP、URL、密码、管理员Token或API Key。

本工具面向**仅有内部测试账号/合成数据的Staging**。如发现正式被试数据，停止使用未加密流程。工具不自动安装软件、不自动联网改规则、不创建数据库服务、不上传文件、不部署、不恢复或清空数据库。正常备份只执行pg_dump自带的一致性导出，不编排额外长事务快照，不要求停止数据库服务。读出仍有I/O/锁开销，异常即停。

## 文件和当前验证范围

- `Prepare-Render-Backup.ps1`：检查Windows、本地D盘>=1GB、项目外的非链接目录、pg_dump/pg_restore均为18。准备检查不连接数据库、不创建备份目录。
- `Backup-Render-Staging.ps1`：隐藏输入连接URL；只接受Render外部主机名、指定数据库与TLS验证；全库custom dump，错误/超时退出并清理该次不完整dump；成功后自动校验/生成收据。不得把URL加到命令行参数。
- `Verify-Render-Backup.ps1`：对照原收据复算SHA256/大小、再运行pg_restore --list，不连接数据库，不把TOC明细打印出来。
- `Encrypt-Render-Backup.ps1`、`encrypt-local.mjs`：可选；本机已有Node18+时，以隐藏输入口令进行scrypt+AES256GCM加密，并实际解密/哈希往返校验。没有Node或失败就明确未加密，不伪造成功。
- `RenderBackup.Common.ps1`：内部共用函数，不单独运行。`tests/`：开发者合成回归，不给研究者运行。

已在Linux PowerShell7.5与真实合成PostgreSQL18验证实际脚本，不是只用字符串模拟pg_dump。**原生Windows PowerShell5.1、D盘及Windows ACL分支尚需用户机器验收；Linux结果不冒称Windows或线上验收。** 脚本避免PS7专用语法，目标兼容Windows自带PowerShell5.1。研究者无需Docker、Python、npm或理解SQL。

## 后续逐步执行单（仅获明确指导/批准后，一步一结果）

| 步             | 点击/运行什么                                                                                                                                                                          | 预期结果                                                                                           | 失败停止条件                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 当前准备     | 两项准备均已完成，保留确认结果；无需重复测试。                                                                                                                                         | 空间足够；VPN关闭后可以打开Render Dashboard。                                                      | 不要发送IP或个人文件截图。VPN关闭后可访问已确认；不自行改网络。                                                                                                          |
| 1 收工具       | 将完整项目ZIP下载/解压到D盘，文件夹重命名为`D:\AI-Agent-Research-Platform`。不要只复制一个ps1；保留tools和scripts相对目录。                                                            | 在`D:\AI-Agent-Research-Platform\tools\windows-render-backup`看到上述文件。                        | 压缩包不完整/路径不同就先反馈路径类型，不猜命令。备份绝不能放项目里。                                                                                                    |
| 2 准备PG18工具 | 经后续指导访问 https://www.postgresql.org/download/windows/ → 官方所链接的EDB Windows binaries/ZIP下载，选择18主版本、Windows x64；下载与完整解压到D盘。若只看到安装器或版本不明先停。 | `D:\PostgreSQL18\pgsql\bin\pg_dump.exe`与pg_restore.exe存在；保留同包DLL、lib/share，不只拷贝exe。 | 不要默认安装数据库服务到C盘，不运行其他来源exe。下载/浏览器临时缓存可能仍少量使用C盘，工具不承诺Windows系统零写C盘。                                                     |
| 3 预检查       | 开始菜单打开**Windows PowerShell**，普通用户即可；运行下方“准备”命令。                                                                                                                 | `PREPARE_OK`，两条版本均含PostgreSQL18。                                                           | `PREPARE_FAILED`、DLL错误、17/其他主版本、权限或空间不足都停；不继续备份。                                                                                               |
| 4 明确网络批准 | 确认备份期间稳定出口后，经单独明确批准，在该数据库Networking新增**一条当前公网IPv4/32**临时规则，备注此次备份；记录你自己新增的是哪条。                                                | 仅该出口可尝试数据库连接。                                                                         | 不开放0.0.0.0/0，不替换/删除原规则；共享VPN出口并非只有你能用，优先可信稳定出口。无批准不做；IP不发给聊天。                                                              |
| 5 真实备份     | 仅确认数据库为ai_agent_research且只有内部测试数据后，运行“备份”命令；输入提示中私下粘贴Render External Database URL，不要在命令行、聊天、截图中粘贴。                                  | 输入不回显；`BACKUP_OK`，显示新的私有目录；有staging.dump与staging.receipt.json。                  | `BACKUP_FAILED`、TLS/连接/锁/超时立即停止，不连续重试/扩大网络。URL必须为Render提供的外部主机名，不能用解析后的固定IP。不要使用ADMIN_ACCESS_TOKEN或API Key当数据库密码。 |
| 6 重新校验     | 用上一步实际目录替换下面命令中`<本次目录>`，运行“校验”。                                                                                                                               | `VERIFY_OK`，原收据SHA256/大小匹配且目录清单可读。                                                 | 失败保留私有证据，不能把坏文件记成功，不能修改收据“修正”SHA。                                                                                                            |
| 7 可选加密     | 仅本机已有Node18+且可复用完整项目时运行“加密”；隐藏输入12字符以上新口令两次，口令另处私存，不发聊天。                                                                                  | `ENCRYPT_OK`，新增.dump.enc及其receipt；有AES256GCM和往返验证记录。                                | 无Node/失败就保持UNENCRYPTED标记；不要为赶进度虚称加密。原始明文仍在，全部仅留研究者私有D盘，不上传。                                                                    |
| 8 关闭访问窗口 | 无论成功还是中途失败，均撤销**本次新增**的临时规则，其他规则保持。确认未授权出口仍无访问权限；不要通过反复公开Secret来测试。                                                           | 临时规则移除；收据/备份在私有D盘；原Render设置恢复。                                               | 无法辨认哪条规则就停并反馈非敏感情况，不删除全部规则。                                                                                                                   |
| 9 回报最低结果 | 只回报BACKUP/VERIFY是否成功及脱敏receipt JSON，不发.dump/.enc/URL/口令/IP；收据必须对应这次真实文件。                                                                                  | 最低门槛：dump退出0、list退出0、bytes>0、SHA256及收据有效。                                        | 文件校验不是完整恢复，也不是部署批准。先由Codex核对004风险与完整目标SHA，再单独请求本次Staging部署批准。                                                                 |

### 准备命令（获指导后）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI-Agent-Research-Platform\tools\windows-render-backup\Prepare-Render-Backup.ps1"
```

`ExecutionPolicy Bypass`只用于本次子进程，不修改机器永久执行策略；只运行本项目已核对版本。若组织策略禁止，不尝试绕过组织权限，停止反馈。

### PG18 ZIP目录约定与尚未核实项

脚本默认准确查找`D:\PostgreSQL18\pgsql\bin\pg_dump.exe`和`D:\PostgreSQL18\pgsql\bin\pg_restore.exe`，两个文件都须存在且各自`--version`退出0并报告18主版本。脚本不递归搜索、不自动移动文件、不使用PATH中的其他pg_dump；`-PgBin`可以指定经核对的实际bin目录，但当前先不要运行命令。

这是一项目录配置约定，**不是已核实的EDB ZIP内部结构**。本轮官方EDB下载页面请求被网络代理拒绝（403），没有取得研究者正在下载的具体ZIP，也没有检查其中央目录。因而ZIP顶层目录、精确DLL名称、lib/share内部文件及Windows运行库依赖均为**未核实**，不得凭Linux包或旧版本猜测。应完整保留实际官方包中的依赖DLL和其原相对位置；包内若有lib/share也完整保留，不要只拷贝两个exe、从其他网站补DLL或安装数据库服务来绕过错误。`--version`成功只证明两个客户端可以启动，不验证TLS证书链或备份能力。

当前唯一人工动作：用资源管理器打开已下载的官方PG18 Windows x64 ZIP，仅查看能否在同一个bin目录下找到`pg_dump.exe`和`pg_restore.exe`及其上级目录名称，不运行任何exe/脚本。不确定版本、来源或层级时停止，不猜测解压路径、不继续备份。

### 备份命令（仅真实操作获批后）

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI-Agent-Research-Platform\tools\windows-render-backup\Backup-Render-Staging.ps1" -InternalTestOnly
```

默认备份根目录为`D:\Research-Backups`，每次在其下建带时间和随机标识的新目录，仅限制**该新子目录**ACL，不改D盘根或其他个人目录。命令不能携带URL/密码。输入期间不共享屏幕、不启用Transcript/调试追踪；不要让云剪贴板同步连接串，使用后清理本机剪贴板历史。凭据仅短暂存在进程内存和pg_dump子进程环境；同一受损用户环境仍可能读内存，因此仅在可信电脑操作，不声称内存绝对无痕。工具不读取仓库.env或导出Render环境变量。

### 校验命令

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI-Agent-Research-Platform\tools\windows-render-backup\Verify-Render-Backup.ps1" -DumpFile "D:\Research-Backups\<本次目录>\staging.dump"
```

只有实际出现`VERIFY_OK`才通过；不要原样输入尖括号。最初receipt记录未加密：`UNENCRYPTED_INTERNAL_TEST_ONLY`。完整TOC和数据库内容不进入收据；收据仅有时间、工具/源主版本、大小、SHA、退出码及覆盖摘要。不要手工把synthetic-local-pg18测试收据改成真实收据。

### 可选加密命令

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\AI-Agent-Research-Platform\tools\windows-render-backup\Encrypt-Render-Backup.ps1" -DumpFile "D:\Research-Backups\<本次目录>\staging.dump"
```

加密依赖已存在的Node18+，无需npm install。本包不自动下载Node；缺失时标明**内部测试备份，未完成加密，仅允许保存在研究者私有D盘，不得用于正式被试数据**。加密成功也保留原dump和原收据，当前脚本不自动删除明文；请按后续私有存储/清理指导处理，勿把SSD删除当安全擦除。口令丢失无法解密；加密收据的salt/算法参数不是密钥。完整恢复由后续受控流程指导，不能仅凭加密往返就勾完整恢复成功。

## TLS/异常停止规则

实际Render模式强制`PGSSLMODE=verify-full`和`PGSSLROOTCERT=system`。这里的system是libpq/OpenSSL的信任源设置，不保证具体Windows二进制自动读取Windows证书管理器中的全部根证书；实际包的信任源尚未验证。若证书/主机名验证失败，停止，由工程方指导指定可信CA，**不降级关闭验证**。URL里的自定义options/非认可query被拒绝，避免意外执行连接配置。pg_dump设置连接10秒、显式lock-wait-timeout 10秒、单个外部进程180秒的上限；这是每个调用的限时，不是整个备份流程总计180秒。普通导出失败路径清理本次dump，旧备份不被主动删除或覆盖。收据写入异常的清理仍有本轮已复现缺口，不能声称所有失败都不会留下收据。

`.ps1`的`-SyntheticFixture`只给开发者，强制回环数据库，不能用于Render，收据标synthetic并被Staging闸门拒绝；不能以此绕过Windows/D盘/TLS检查。

## Staging与Production

首次含迁移的部署前先有真实PG18最低校验备份。以后纯前端/独立Prompt表达且schema/migration/account_or_persistence全false，完整自动回归后可由研究者核对目标手动部署，无需每轮完整灾备；任一true则做当前Live的新备份。本次从ea9867d累积含004及账号/历史写入改动，**仍阻塞：等待真实备份**。

每次部署后核对实际Live完整SHA，/api/ready，旧账号登录/刷新/重登/历史/管理员时间戳，并完整测试受影响路径。任何账号、分组、历史、评分或500异常停写，不清库、不重置、不盲回滚。Production仍要求长期数据库、自动备份、独立/异地恢复、30人以上真实托管并发、数据保留/隐私审批；本工具的最低Staging校验不授予正式可用。

## 开发者合成回归

`apps/api/tests/windows-render-backup.test.ts`实际启动一次本地PG18 fixture并调用这里的PowerShell脚本，覆盖版本拒绝、错误连接、全库dump、收据、独立SHA/TOC、篡改拒绝、可选加密往返及PG18独立恢复。需要Docker和pwsh；研究者备份不需要它们。没有真实数据库或外部模型调用。

CI的完整`npm run check`先跑既有业务/并发与策略测试，再单独跑`test:windows-backup`的PG18/PowerShell fixture，最后构建及浏览器测试；所有测试仍执行，断言与并发用户数不变。独立阶段减少不同容器压力测试互相抢机器，不是线上并发性能证据。
