# 第45次反馈原文与执行边界

用户本轮上传附件，正文未另填。结合持续任务执行工具包及本地合成测试准备；不把附件解释为实际Render网络/资源/部署授权。用户随后确认D盘空间足够，VPN关闭后访问Render尚未测试。以下为原文提取。

---

第45次反馈：建立 Staging 快速迭代与 Windows 备份流程

基于 AI-Agent-Research-Platform-round44-followup-delivery.zip

一、当前结论与本轮方向

根据 round44-followup-delivery，当前 Render Live 为 ea9867dfb9dd64778bdbaccf2cb3855ff27d9441；当前仓库核验 HEAD 为 24fe003aa06fbf2d9c427fac25081f99977edaa6，两者不一致。Live 之后有 7 个后续提交、194 个差异文件，其中 35 个为非 docs 代码/迁移文件。

Live 尚未包含第39轮聊天驱动/卡片与迁移004、第40轮日常四身份/短回复与情感短气泡、第41轮迭代验收闸门等后续改动，因此当前线上体验不是最新内部测试版本。

Free Render Postgres 为 PostgreSQL 18，数据库 ai_agent_research，当前约占 1GB 的 6.89%，页面显示 2026-11-19 到期。研究者已确认数据库详情页没有 Backups/Recovery 入口。Render 官方文档也确认 Free Postgres 不提供托管备份或恢复，需要使用 pg_dump 等方式自行导出。

第44次 follow-up 没有新增业务代码、没有连接线上数据库、没有执行备份或恢复。当前阻塞点已经从“继续寻找备份按钮”转为“做一次真实 PG18 外部备份，并恢复 Staging 的正常迭代节奏”。

二、区分内部 Staging 与正式 Production 的验收门槛

请不要继续把正式生产级灾备门槛机械地套到每一次内部 Staging 迭代。该平台目前仍处于研究者/导师内部测试阶段，数据库中应仅包含测试账号与内部体验数据；正式参与者尚未放行。

内部 Staging：第一次包含数据库迁移的部署前，必须取得当前真实 PG18 的完整逻辑备份，并完成文件完整性校验。之后若某轮只改前端、Prompt 表达或不触及数据库 schema，可以直接在自动回归通过后部署并进行人工测试，无需每轮重新做完整灾备演练。

如果某轮新增/修改数据库 migration、账号/分组逻辑、历史消息持久化或数据写入方式，则再次做部署前备份，并明确迁移风险。

正式 Production：仍要求长期托管数据库、自动备份、异地/隔离恢复演练、30人以上真实托管并发、数据保留与隐私审批。上述正式门槛不能因为 Staging 放宽而取消。

三、本轮请 Codex 先交付 Windows 可操作的 PG18 备份工具包

研究者当前使用 Windows 电脑，系统盘空间紧张但 D 盘可用。请优先设计“在 D 盘运行、不依赖 Docker、不要求用户理解 PostgreSQL 命令”的备份流程。现在先完成工具和说明，不修改 Render Networking，也不连接真实数据库。

建议新增 tools/windows-render-backup/（目录名可按仓库规范调整），至少包含：

1. Prepare-Render-Backup.ps1：检查 Windows、备份目录、可用空间、pg_dump/pg_restore 主版本是否为18；拒绝使用低于18的客户端备份PG18源库；不读取仓库中的 Secret。

2. Backup-Render-Staging.ps1：只在研究者显式运行时启动；从本机交互式安全输入读取 External Database URL 或等价连接参数，输入过程不回显、不写入脚本/日志/Git；对整个 ai_agent_research 数据库执行 custom-format pg_dump，不限定 public schema，不遗漏 research、research_meta 和迁移账本；使用 --no-owner/--no-acl，失败即退出。

3. Verify-Render-Backup.ps1：执行 pg_restore --list、文件大小检查和 SHA-256 校验，生成不含数据和 Secret 的 receipt JSON/文本，包括备份时间、PG客户端版本、文件大小、SHA256、退出码和对象清单摘要。

4. 可选 Encrypt-Render-Backup.ps1：如果现有 scripts/encrypted-backup.mjs 和本机 Node 条件可安全复用，则进行 AES-256-GCM 加密；若本机不具备依赖，不得伪装已加密，明确标记“内部测试备份，未完成加密，仅允许保存在研究者私有 D 盘，不得用于正式被试数据”。

5. README-WINDOWS.md：逐屏/逐步写给非开发者，明确文件应放 D 盘、如何安装/准备 PostgreSQL 18 客户端工具、如何确认 pg_dump --version、如何运行脚本、如何判断成功、如何撤销临时网络规则。

6. 提供合成 PostgreSQL18 数据库的自动化测试或 fixture，证明脚本能导出、识别错误版本、生成校验收据；不要用真实研究数据库测试。

备份工具不得自动修改 Render Networking、不得自动显示或保存数据库密码、不得上传备份到 GitHub、不得自动触发部署。

四、备份内容与安全要求

本次备份必须是整个业务数据库，而不是分析 CSV 或只备份 public schema。至少覆盖实际存在的 research、research_meta、schema_migration，以及参与者账号哈希、实验分配、会话、消息/通知、状态、事件、评分、变量、配置、审计等对象。以实际 schema 为准，不得硬造不存在的表。

PostgreSQL 官方说明 pg_dump 能在数据库继续被其他用户访问时生成一致性导出。当前 Staging 数据量很小，因此先采用单个 custom-format dump（-Fc）即可，不必为了内部测试增加复杂的长事务快照编排；如果实际执行时出现锁、超时或性能异常立即停止。

外部连接必须使用 Render 提供的 External Database URL/主机名和 TLS；不要连接解析后的固定 IP。凭据只在研究者本机短暂使用，不能发到聊天、Codex、GitHub 或截图。

当前 Free 数据库没有托管恢复能力，因此备份成功的最低 Staging 标准是：pg_dump 退出码0 + pg_restore --list可读取 + SHA256生成成功 + 文件大小大于0 + 备份收据生成。正式 Production 前仍必须补做独立恢复演练。

五、研究者执行备份时的 Render 网络规则

Render 官方支持对 Postgres 设置 IPv4 CIDR 入站 allowlist。若使用研究者电脑进行 pg_dump，优先临时添加当前稳定公网 IPv4 的 /32 规则，只允许这一台出口地址连接。

不要添加 0.0.0.0/0；不要删除或覆盖现有 workspace/数据库规则；只新增一条带清晰备注的临时 /32 规则。备份完成并通过校验后，立即删除本次新增规则，确认 External Database URL 再次不可从未授权网络访问。

研究者使用 VPN 才能访问 ChatGPT，但 VPN 可能改变公网出口 IP。因此正式执行前必须先判断备份时使用的网络出口是否稳定。若关闭 VPN 后仍能访问 Render Dashboard，优先使用 VPN 关闭后的固定/稳定公网 IPv4；若必须使用 VPN，则先确认同一节点的公网 IPv4 在备份期间不会变化。不要把真实公网 IP 发到 ChatGPT 或 Codex。

六、第一次备份成功后的 Staging 迭代流程

请把以下流程固化为每轮交付的标准判断，而不是每次重新讨论：

1. Codex 完成代码修改并运行完整自动化回归。

2. Codex 在交付报告中明确回答 database_schema_changed=true/false、migration_changed=true/false、account_or_persistence_changed=true/false。

3. 如果三个字段均为 false：不要求重复备份，研究者可在确认提交号后执行 Render Manual Deploy → Deploy latest commit。

4. 如果任一字段为 true：先使用当前 Windows 备份流程对线上 Staging 做一次新备份并生成收据，再申请部署。

5. 部署完成后必须核对 Live commit 与目标 commit 一致，先访问 /api/ready，再用既有测试账号做人工 smoke。

6. 每轮人工 smoke 至少包含：旧账号登录、刷新/退出重登、历史记录保留、管理员时间戳记录；此外完整测试本轮受影响路径。

7. 出现账号丢失、分组改变、历史消失、评分异常、500/数据库异常时立即停止继续写入，不清库、不重置账号、不盲目 Rollback。

七、当前这次部署的特殊要求

当前 Live ea9867d 到最新核验 HEAD 之间不仅有 UI 改动，还包含 migration 004_chat_timeline 和聊天/历史/账号相关变更。因此这一次不能按“纯前端更新”处理。

在第一次真实 PG18 备份生成并通过最低校验前，继续禁止 Manual Deploy。

备份完成后，Codex 必须再核对 migration 004 是增量迁移、不会删除已有账号/会话/评分数据，并给出目标部署提交的完整 SHA。然后才请求研究者一次明确的 Staging 部署批准。

这次部署成功后，研究者应优先人工测试认知、情感、日常三条路径，以及管理员对话记录和现有账号登录；随后再继续下一轮业务迭代。

八、本轮研究者手动操作

现在不要改 Render，不要 Manual Deploy，不要安装数据库工具。先让 Codex 按本反馈生成并测试 Windows 备份工具包和逐步说明。

研究者现在只需要做两个不涉及 Secret 的准备核验：

1. 在 Windows 资源管理器确认 D 盘至少还有 1 GB 可用空间（当前数据库约69MB，建议留更大余量）。只回复“足够/不足”，不需要截图个人文件。

2. 在方便时测试：关闭 VPN 后是否仍能正常打开 Render Dashboard。只回复“可以/不可以”。不要发送公网 IP。

收到备份工具包后，再由本对话按“一步一截图/结果”的方式指导研究者安装 PostgreSQL 18 客户端到 D 盘、添加临时 /32、执行备份、校验并撤销规则。现在不要提前操作。

九、Codex 完成后必须返回

1. Windows 备份工具文件清单及每个文件用途。

2. 合成 PG18 测试结果：成功路径、错误版本、错误连接、输出文件与SHA256校验。

3. 研究者逐步操作指南，每一步写明：点击/运行什么、预期看到什么、失败时停止条件。

4. 明确说明本轮是否修改业务代码、数据库 migration、Render 配置；如没有，写“未修改”。

5. 当前目标部署提交完整 SHA，以及 ea9867d 到目标提交之间会执行哪些 migration。

6. 给出部署前门禁结论，只能是“仍阻塞：等待真实备份”或“可申请 Staging 部署：备份已由研究者完成并验证”。未实际备份前不得写后者。
