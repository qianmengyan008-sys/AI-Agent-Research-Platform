# 第45次交付：Windows备份工具与Staging快速迭代

**门禁结论：仍阻塞：等待真实备份。** 2026-10-22已完成工具、说明及本地合成回归；2026-10-23补齐交付与准备核验结果；没有连接真实数据库、执行真实备份/恢复、修改Render Networking/配置、升级、创建Render资源、部署、清库、重置账号或修改API Key。

基线为`5694123df60169d7aa48eb6dd619b7b6e5a79448`；已测实现与当前候选部署代码提交完整SHA为 **`e1741c9e7e740651a8403ed06595f5df90e7666f`**。最终文档交付以`round45-delivery`标签为准，后续提交只补报告/证据/ZIP。候选不是部署批准；真实备份完成后必须再次核对最新完整目标SHA与004，再单独申请一次明确Staging部署批准。

## 已交付文件及用途

| 文件                                                                   | 用途                                                                                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| tools/windows-render-backup/Prepare-Render-Backup.ps1                  | Windows、本地D盘空间>=1GB、项目外非链接目录、两项PG18工具预检；不连接数据库。                                                                        |
| Backup-Render-Staging.ps1                                              | 显式运行后隐藏读取外部URL；整个ai_agent_research custom dump，含research/research_meta；no-owner/no-acl，真实模式验证Render主机名和TLS，失败即退出。 |
| Verify-Render-Backup.ps1                                               | 复核原收据大小/SHA256、PGDMP格式、pg_restore --list、实际研究对象覆盖；不输出TOC或数据。                                                             |
| Encrypt-Render-Backup.ps1 / encrypt-local.mjs                          | 可选本机Node18+，隐藏口令经stdin传递、scrypt+AES256GCM，并实际解密/哈希往返；缺依赖或失败不标已加密。保留原明文，不能冒称已安全删除。                |
| RenderBackup.Common.ps1                                                | 共用进程隔离、版本/TLS/路径检查、超时与脱敏收据逻辑；不读取仓库Secret。                                                                              |
| README-WINDOWS.md                                                      | 非开发者逐步操作，点击/运行什么、预期和停止条件；Windows使用无需Docker/npm/SQL。                                                                     |
| tests/Run-Synthetic.ps1 / apps/api/tests/windows-render-backup.test.ts | 实际调用脚本的本地PG18合成回归，测试数据与真实Render隔离。                                                                                           |
| scripts/staging-iteration-policy.mjs/.d.mts、对应测试                  | Staging最低真实备份门槛，拒绝合成收据，纯UI后续可复用首次备份，风险变更需当前Live新备份。                                                            |
| scripts/iteration-acceptance.mjs                                       | 显式Staging CLI模式，通过Git累计diff分类；原严格路径继续保留。                                                                                       |
| package.json / .github/workflows/ci.yml                                | 完整check保留全部测试；PG18/PowerShell独立阶段，不降低原有并发数或断言。                                                                             |
| .gitignore / README / docs                                             | 排除真实dump/receipt/密文/凭据；反馈原文、快速迭代规则、验收日志与小工具ZIP。                                                                        |

原始反馈DOCX和提取全文见docs/inputs/round45-feedback.docx、round45-requirements.md。完整文件清单及用途分组见changed-files.json。工具小包windows-pg18-backup-toolkit.zip包含运行脚本、共用加密模块、指南与哈希manifest，**不含数据库dump、真实数据、Secret或Windows客户端安装包**。

## 合成PG18实际结果

运行环境：Codex临时目录的PowerShell **7.5.4 / Linux**；本地一次性PostgreSQL **18.6**及实际18.6 pg_dump/pg_restore；固定postgres:18-bookworm镜像digest记录在测试源码。不是只检查静态字符串，也不使用真实数据库。

| 专项          | 实际结果                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 准备检查      | 真实18.6客户端通过，不连接数据库；未创建备份目录。                                                                              |
| 错误版本      | PG17/16版本输出与预检分支拒绝；错误版本预检不读取连接URL。错误版本测试用受控version fixture，不声称对真实Render尝试过17客户端。 |
| 完整导出      | 实际PowerShell Backup脚本成功生成custom PG18 dump；没有schema过滤；research/research_meta与迁移账本覆盖检查通过。               |
| 错误连接      | 回环错误端口返回失败，不生成成功收据，不留下该次partial dump；stdout/stderr未暴露凭据。                                         |
| 文件/收据     | 文件>0、SHA256与Node独立计算一致、pg_restore --list可读；收据不含URL、主机名、密码或TOC明细。                                   |
| 再次验证/篡改 | Verify成功；追加篡改后与原收据哈希不匹配，正确拒绝。                                                                            |
| 可选加密      | 实际AES256GCM加密及解密/哈希往返通过；中文口令通过ASCII JSON传输避免旧控制台编码污染；口令不落收据或argv。                      |
| 合成独立恢复  | 完整pg_restore退出0；独立restored_fixture数据库与源库**23张表全部行内容一致**，消息非空、账号哈希/分配/状态/通知/账本保留。     |

合成收据见synthetic-backup.receipt.json；恢复收据见synthetic-pg18-restore.json；逐次脚本退出码见powershell-synthetic-executions.json。scope固定为synthetic-local-pg18，Staging门禁会拒绝把它充作真实备份。合成dump本体不上传GitHub，也不能用于研究者线上恢复。

**原生Windows PowerShell5.1、D盘/Windows ACL、研究者电脑的TLS信任链和真实Read-Host交互：NOT RUN。** 代码按PS5.1语法设计，但Linux PowerShell测试不是Windows验收。研究者后续实际运行时仍需按步确认，失败停止、不降级TLS验证。

## 完整工程回归与失败记录

最终`npm run check` **退出0**：业务与策略Vitest **514项/34文件**，独立PG18/PowerShell **9项/1文件**，合计 **523项/35文件**；Playwright **25项通过**。最终失败0、跳过0；类型、lint、格式及构建通过。新增18项包含在523内，不再累加。测试时设置PWSH_EXECUTABLE_PATH指向临时运行时，CI使用已有pwsh；未在研究者电脑安装工具。

完整原始日志full-check.log与browser-results.json保留。不是只挑成功测试；本轮失败也逐一归档：

- first-powershell-fixture-failure.log：首轮9专项中5项失败，成功路径失败引发后续依赖项失败。修正合成非TLS连接与系统根证书配置冲突后通过；真实Render模式始终verify-full，未放松TLS。
- first-full-check-failure.log：原有45用户fixture在登录请求出现HTTP500，1项失败/522通过；第40轮已有同类未确证现象。本轮未改应用代码/连接池/断言，根因仍未确认；单独复跑2项通过，日志hosted-isolated-pass.log。不把它说成已修复的线上故障。
- client-library-fixture-failure.log：独立PG18阶段7项失败/2通过，Linux测试提取libpq后缺libldap-2.5.so.0及配套库；补齐固定镜像依赖，专项9项通过。属于测试运行环境修正，不是Windows或Render库变更。
- browser-initial-failure.log / browser-initial-failure.json：一次首例等待“实验编号”输入框超过30秒，24项通过/1项失败；原因未证实。没有延长测试超时、增加Playwright自动重试或弱化断言；最终完整重跑25项通过，失败上下文仍保留。

PG18/PowerShell fixture改为完整check内独立阶段，以免和原有并发fixture互抢机器；所有测试仍执行，30/45用户原断言不变。这一编排变化不证明上述500/浏览器超时的根因，也不是线上并发证据。当前线上/真实模型三路径完整验收和人工语义审核仍NOT RUN，本轮真实模型调用0。

## Staging规则与三字段

本轮相对5694123：**database_schema_changed=false；migration_changed=false；account_or_persistence_changed=false**。业务代码：**未修改**；数据库migration：**未修改**；Render配置：**未修改**。研究材料、核心状态机、Validator、Prompt、研究参数、API Key均未修改。新增的是备份工具、只读门禁、测试及CI/文档，保护范围逐项见protected-scope.json。

但部署看的是**实际Live到候选的累计范围**，不是只看本轮文件：ea9867d到候选仍包含004和此前账号/聊天/历史写入改动，累计三个字段均为true，必须先真实备份。live-to-target.json记录精确差异。

首次真实PG18最低备份校验后，后续纯前端/独立Prompt表达且三字段全false，不要求每轮重复完整dump或隔离/异地灾备演练；风险变更任一true，再做当前Live的新备份。混合持久化与Prompt的文件需范围审阅，自动分类保守提示风险，不仅凭“文案修改”绕过写入审查。

Staging最低要求仅是dump退出0 + list可读 + bytes>0 + SHA256 +真实收据，不把合成完整恢复当作先决条件。Production仍要求长期托管数据库、自动备份、隔离/异地恢复、30人以上真实托管并发、保留/隐私审批；formal_ready=false未放宽。

当前只读`acceptance:gate`退出**2（预期阻塞）**：缺首次真实PG18收据、当前Live新备份与源库身份确认，见staging-gate.log。它不连接Render或自动部署，收据JSON仍需研究者对实际文件复核，不能靠填假字段放行。

## 迁移004与当前候选

候选完整SHA：**e1741c9e7e740651a8403ed06595f5df90e7666f**；研究者确认的Live：ea9867dfb9dd64778bdbaccf2cb3855ff27d9441。代码层迁移差异只有004_chat_timeline.up/down；001–003未修改。正常up在源账本尚无004时会新增chat_notice、索引和不可变触发器，不删除/更新原账号、会话或评分。实际线上迁移账本尚未读取，所以不能伪称确定会再次执行004；已应用时不应重复执行。

004有记录后down拒绝，旧Live应用不认识004，不盲目Rollback。真实备份最低验证完成后，再核对实际账本与最终完整目标SHA，只请求一次本次Staging部署批准。**现在不要Manual Deploy**。

## 研究者下一步与人工测试闭环

准备结果已收到：**D盘至少1GB：足够；关闭VPN后访问Render：2026-10-23已确认可以**。不需要截图个人文件、不发公网IP或Secret。现在不用安装工具或修改Render。两项准备均已完成，不再重复要求测试。关闭VPN能访问Dashboard不等于数据库端口已放行或公网出口固定；之后按“一步一结果”指导，仅在明确批准后新增临时/32。

[Windows逐步指南](../../../tools/windows-render-backup/README-WINDOWS.md)的0–9步骤逐项列出运行/点击什么、预期与停止条件：收工具→后续指导下载PG18完整二进制包到D→Prepare→明确批准临时IPv4/32→隐藏输入URL备份→Verify→可选加密→撤销本次规则→回报脱敏收据。PG工具开源无许可费，使用已有电脑不要求新建Render实例，但流量/存储费用或任何新增资源须先核实并获批，不承诺总成本为0。

原生Windows准备/备份结果尚未执行，不能提前勾通过。后续真实备份收据通过并明确获批部署后，核对Live完整SHA与目标一致，/api/ready，再用既有测试账号做登录/刷新/重登/历史保留/管理员时间戳，并完整人工测试认知、情感、日常及管理员对话记录。本轮没有线上部署，所有线上人工项仍NOT RUN；异常立即停写，不清库、不重置、不盲回滚。

**门禁结论：仍阻塞：等待真实备份。**
