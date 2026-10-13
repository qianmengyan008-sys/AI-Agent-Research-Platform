# 第28次交付：Windows 本地研究者体验入口与认知逐轮审核

日期：2026-10-13（UTC+8）。附件原题“第26次反馈”，原件完整保留；仓库延续第27次交付后使用第28次编号。

## 给 GPT 的本轮反馈

已按策略调整优先开放本地自测。研究者不需要先购买服务器、注册云平台、设置域名或等待公网 HTTPS，也无需先完成人工语言审核才能开始对话。本轮新增 Windows .bat／PowerShell 最短入口，复用既有 Node24、Docker、PostgreSQL、Web/API 与固定分配；没有第二套实验实现，没有视觉重做。

Start 安全检查与构建后通过现有 Preview 启动；自动选择空闲端口并显示本机地址，保留原有监听进程。Secret 只在进程环境中继承，没有密钥 CLI 参数、Git／Word／日志／.env／用户永久环境变量写入。Windows 私有目录配置当前用户／SYSTEM ACL 分支，参与者密码在本机独立账号查看入口获取，模型／管理员／数据库密钥不在那里显示。

| 交付文件                                         | 最短操作                                                    |
| ------------------------------------------------ | ----------------------------------------------------------- |
| Start-Researcher-Preview.bat / .ps1              | 安装 Node24、打开 Docker Desktop，双击启动并安全输入 Secret |
| Stop-Researcher-Preview.bat                      | 停止 Web/API，保留数据库与旧记录                            |
| Restart-Researcher-Preview.bat                   | 重新构建／启动，原 session 与数据不重置                     |
| New-Researcher-Round.bat                         | 依次创建 R002／R003，旧账号不变                             |
| Export-Researcher-JSON.bat                       | 完整 JSON 保存到私有 exports，显示普通本机路径              |
| View-Researcher-Accounts.bat                     | 本机查看 experiment_id／账号／路径／参与者密码              |
| docs/windows-local-researcher-preview.md / .docx | 三步中文说明、故障提示与人工体验说明                        |

## 修改边界

实现提交 390b4626e7d32a24c5fb4b8726287caafd79acfd。只增加本地生命周期封装、Windows入口、离线逐轮审核与两项有意义的回归，现有 researcher-preview.mjs 仅支持 port0 实际端口及本地 IPC 优雅关闭；现有审核工具的六维名称按附件统一。experiment-core、正式 StagePolicy／Prompt、mentor-test-v1、AI Orchestrator／Validator、Model Adapter、数据库迁移、前端源文件及依赖锁不变。

## 本轮验收及限制

npm run check 实际 450 Vitest +18 Playwright，通过类型／lint／格式／构建与既有真实 PostgreSQL 测试。新回归通过专用临时 PG 保存一个情感首轮固定模板回复，停止／重启后消息、状态、迁移和 session 保留；R002／R003 新建、完整导出及控制通道拒绝未授权请求均通过。此模板轮不是外部模型生成。

另外实际运行 PowerShell 7.4.6（Linux）启动／重复启动／停止／重启／新轮次／导出；三个固定 R001 账号通过真实 Chromium 登录、进入聊天，但没有发送人工自由对话。现有 9 个会话的状态／消息／变量／迁移／turn／run 在重启前后哈希一致。账号查看输出在内存中检查，未打印到验收日志。

没有新增外部模型调用，本轮重点不是重复 smoke 或新脚本跑完整三条路径。PowerShell 官方发行包经过官方 SHA256 校验；默认缓存目录只读的问题用支持的 XDG 临时目录配置纠正，没有关闭验证。

当前只有 Linux 机器，Windows PowerShell 5.1／Docker Desktop WSL2／ACL／双击 .bat 的完整 Windows 真机链路 not_run。UTF8 BOM、兼容脚本语法、引号路径、非回显输入和不改全局策略已检查；不能把这些代替 Windows 真机通过。你的首次本机运行状态未确认。

## 认知20轮审核结论

| 证据             | 已提取结果                                                                              |
| ---------------- | --------------------------------------------------------------------------------------- |
| 来源             | 第26次固定脚本真实浏览器合成认知会话，未重新生成                                        |
| 轮数／重试／兜底 | 20／9／8，40% 轮次兜底仍需人工审查                                                      |
| 已记录拒绝事件   | EMPTY_REPLY 14 次，BELIEF_ANCHOR_MISSING 3 次                                           |
| 每轮材料         | 输入、最终呈现、来源、Validator audit、重试／兜底原因、生成前后阶段／版本、随后明确提交 |
| 原始失败模型候选 | 原历史导出没有保存，值为 null，不能补造                                                 |
| 原因裁定         | 现有材料不能区分 Validator 过严、Prompt／格式冲突或模型未遵循                           |
| 人工语言决定     | 六维全部待审核，无人工评分或签署                                                        |

state_before／state_after_generation 是记录可支持的阶段／版本投影；自动迁移严格通过 source_turn_id 关联，参与者之后的明确提交单独列出，不把提交造成的变化算作模型决策。历史逐轮完整 snapshot 没有保存，明确标为不可用。严格配对失败时工具拒绝输出，不猜测消息关系。

EMPTY_REPLY 事件占主导，现有证据不支持先扩大观点锚点词库。当前不能确定任何具体修复已经必要且正确，故未改 Validator、Prompt 或模型解析。研究者先体验并审核最终呈现；若确认 A／主要 B，再针对有证据的失败类型最小修复并新轮次复验。

## 独立就绪结论

researcher_self_test_ready：有条件就绪——本地体验包工程链路已验证，研究者安装 Node24／Docker Desktop、输入自己可用的 Secret 并启动后可立即体验；当前会话无法证明研究者电脑已经准备好。user_machine_launch_verified=false。人工审核不是开始本人体验的前置条件。

mentor_test_ready=false——本人三条非脚本完整会话、同一次体验的六维审核、A／主要 B 整改复验及签署尚未完成。formal_ready=false。外部 staging 后移至这些门禁通过后的导师／多人远程阶段。

## 接下来由研究者完成

下载整个 ZIP，按本地中文指南完成三步。分别自然完成认知／情感／日常各至少一个完整会话，不抄 QA 台词；可以质疑、补充、离题或短回复。评分和观点确认必须明确提交；日常点击当前填写结束。保存同一完整导出，在六维模板记录真实感受和 A/B/C 问题。自动化不能替你完成本人体验，本轮不会把脚本或模型生成评分冒充该结果。
