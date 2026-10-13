# 第28次交付验收报告：本地研究者体验优先

结论：本地启动与维护包通过已可运行的 Linux／PowerShell Core 工程验收；研究者 Windows 真机首次运行待确认，researcher_self_test_ready 为有条件就绪；mentor_test_ready=false。公网入口不再阻塞本人自测。没有冒充研究者的非脚本会话或语言签署。

## 附件逐项验收

| 要求                          | 结果           | 证据／限制                                                                  |
| ----------------------------- | -------------- | --------------------------------------------------------------------------- |
| Windows 少步骤入口            | 已提供         | 根目录六个 .bat 与 Start-Researcher-Preview.ps1；真机双击待确认             |
| 中文检查环境                  | 通过可执行检查 | Node24／npm11／Docker检测；错误 Node major 拒绝并中文提示                   |
| Secret 不回显／不落文件或参数 | 实现与检查通过 | Read-Host AsSecureString、BSTR 清零、进程环境继承；输入项不写永久变量       |
| 自动可用端口                  | 通过           | helper port0，由 OS 分配；不关闭原4173监听                                  |
| 三个账号获取                  | 通过           | View 仅输出 owner 本机参与者凭据；测试捕获校验，未将密码记入材料            |
| 停止／重启保持记录            | 通过工程范围   | 真实 PG 模板回复回归；已有9会话重启前后实验数据哈希一致                     |
| R002／R003 新轮次             | 通过           | 新建固定分配，原 R001 保留，不删旧会话                                      |
| 完整 JSON 导出                | 通过           | complete=true、per_table_limit=null，数据质量八项零异常                     |
| 原参与者页面可用              | 通过已验证环境 | Chromium 三账号登录、进入原聊天页，截图无密码                               |
| 20轮认知审核材料              | 通过提取       | 输入／最终文本／Validator／重试／兜底／阶段版本与明确提交；缺失败候选已标记 |
| 三条完整非脚本本人体验        | 未完成         | 需研究者本机操作，脚本登录不算自由体验                                      |
| 六维人工语言审核              | 待完成         | 新名称与模板可用，所有决定待审核                                            |
| A／主要 B 精准整改            | 尚无人工决定   | 不先扩大词库，不改冻结逻辑，保留风险待判断                                  |
| 导师测试放行                  | 不通过         | 缺本人体验、审核、必要整改复验与签署                                        |

## 运行验证

全检查 npm run check 退出0，450项 Vitest、18项 Playwright；两个新增回归分别覆盖本地持久化生命周期与离线认知证据提取。普通检查不调用外部模型。本轮没有新付费模型调用，不重复既有真实 smoke 或制造新的脚本会话代替本人体验。

PowerShell7.4.6 Linux 已实际完成 Start／重复Start／Stop／Restart／NewRound／Export。Node错误版本分支按预期拒绝；PowerShell源文件UTF8 BOM适配 Windows5.1读取中文，.bat 使用项目目录引号与进程 RemoteSigned。Windows内核、PowerShell5.1、WSL2／Docker Desktop、Windows ACL 及双击完整链路 not_run。这些为首次用户本机验证项，不是购买服务器的理由。

本轮启动入口自己管理子进程与本地受保护控制通道。Stop 不猜 PID 杀其他程序；Windows 子进程通过 IPC 正常关闭。manager意外退出时 helper可收到 disconnect关闭；已死亡的 manager锁识别后恢复，不清数据库。初始化中强制关闭造成的 bootstrap锁仍需按指南处理，不能把异常关闭恢复称为全断电／备份恢复验收。

实现提交：c9686a641d37d605032292d4ee5552a1f7e638fa。保护范围：apps/api/src、apps/web/src、experiment-core、AI Orchestrator／Validator、Model Adapter、contracts／database、research配置、数据库迁移、依赖与锁无修改。变化仅在本地封装、原 Preview启动兼容、审核名称、离线提取器、回归和文档。源ZIP不含 .git时使用更新的 build metadata 记录该实现提交。

## 认知风险专项

20轮已完整整理至 cognitive-review/cognitive-turn-audit.json／.md／.docx。9次重试、8轮兜底；已记录的拒绝原因 EMPTY_REPLY14、BELIEF_ANCHOR_MISSING3。此为第26次合成身份固定脚本真实记录，而不是本轮研究者自由体验。

最终呈现可以供自然度／回应性审核；原始失败候选缺失，不能只凭拒绝代码断言 Validator过严、Prompt冲突或供应商模型错误。暂不进行未经证据支持的词库／Prompt／状态机修复。历史生成前后投影采用 accepted_core_version／generation_context与明确source_turn_id事件，随后参与者提交单列；每轮完整历史snapshot不可用且未重建冒充原件。

## 两个就绪门禁

| 结论                                 | 状态                                    | 含义                                                                     |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------ |
| local_launch_package_ready           | true                                    | 已通过所能执行的工程验证，能交付本地启动包                               |
| researcher_self_test_ready           | conditional_on_user_local_prerequisites | 安装环境、自己的 Secret 与成功启动后可以本人体验；本机首次启动未由云确认 |
| user_machine_launch_verified         | false                                   | 未访问研究者电脑，不能声称 Windows真机已经就绪                           |
| human_nonscripted_completed_sessions | 0                                       | 本轮自动化不代替本人三条完整会话                                         |
| mentor_test_ready                    | false                                   | 人工六维、A／主要B整改复验与签署未完成                                   |
| external_staging                     | deferred                                | 本人体验通过后再进入导师远程阶段                                         |

## 成果索引

| 材料                 | 路径                                                |
| -------------------- | --------------------------------------------------- |
| 给 GPT 的反馈        | docs/twenty-eighth-round-feedback.md / .docx        |
| 本验收报告           | docs/twenty-eighth-round-delivery-report.md / .docx |
| Windows三步说明      | docs/windows-local-researcher-preview.md / .docx    |
| 原始需求             | docs/inputs/round28-local-preview-requirements.docx |
| 本轮检查／截图／门禁 | docs/acceptance/step6-round28/                      |
| 20轮完整审核材料     | docs/acceptance/step6-round28/cognitive-review/     |
| 同会话人工模板       | docs/researcher-human-review-template.md / .docx    |

整个项目 GitHub不可变提交 ZIP 包含上述全部材料、Windows入口、原代码、此前真实完整导出；排除运行私有目录、模型密钥、实际账号密码、admin_token、数据库凭据、node_modules和dist。先解压再双击Start，首次自动安装构建。真正本人体验的导出保存在本机私有目录，不自动提交公开仓库。

云环境启动指引已更新草稿，说明本地优先、自动端口和保护历史；安装脚本、网络和Secret绑定不变。保存不代表发布，如需后续任务采用，环境设置审核、保存并发布。此配置审核不阻止当前下载或自己的电脑启动。

源码 ZIP 在不含 .git、目录名含空格的独立临时目录实际 npm ci、PowerShell构建／启动／初始化并验证 HTML／health通过。最终PS前置检查和build metadata也已复验，未调用模型。证据见 source-zip-startup.json；该验证仍为 Linux PowerShell Core，不是 Windows真机。验证临时数据库已清理，不影响原体验历史。
