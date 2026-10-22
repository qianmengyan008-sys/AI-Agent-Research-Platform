# 第44次反馈附件原文与交付授权

本轮用户直接请求：提供GitHub反馈链接，完整项目ZIP包含发给GPT的反馈和本轮验收成果。附件作为核验依据，当前不授权部署、改配置或操作线上数据。以下为原文提取；附件对截图的描述不能替代本轮未提供的原截图或独立后台访问证据。

---

第44次反馈：Render 环境核验与数据库保全

依据研究者于 2026-10-21 提供的 Render 设置截图

本轮目标

依据研究者于2026-10-21新提供的Render Web Service Settings、Build、Deploy、Environment截图，更新第43次反馈。保留第43次及之前的历史证据，不覆盖旧报告。本轮只读核验；暂不部署；不修改配置、不升级、不清库、不重置账号、不触发迁移。

1. 研究者截图已确认的事实

1.1 Web Service 概况

服务名：ai-agent-research-staging；Render方案：Free。

当前页面Live提交短哈希：ea9867d。

GitHub仓库：qianmengyan008-sys / AI-Agent-Research-Platform；分支：work。

服务地址：https://ai-agent-research-staging.onrender.com/

区域：Singapore (Southeast Asia)；运行方式：Docker。

Dockerfile Path：./Dockerfile；Docker Build Context Directory：.（仓库根目录）。

Auto-Deploy：Off；Health Check Path：/api/ready；Render Subdomain：Enabled。

1.2 环境变量

截图明确显示以下键存在，值全部隐藏：

ADMIN_ACCESS_TOKEN

ADMIN_DEVELOPMENT_MODE

DATABASE_URL

DB_POOL_SIZE

DEEPSEEK_API_KEY

DEEPSEEK_MODEL_NAME

GPT_API_BASE_URL

GPT_API_KEY

GPT_MODEL_NAME（截图下缘可见其区域，完整列表需研究者在Render页面内确认）

可以确认DATABASE_URL环境变量存在，但无法从截图确认它实际指向哪一个数据库。不得要求研究者发送、复制或截图暴露完整连接串、API Key、管理员Token、Deploy Hook或其他Secret。不得将环境变量导出文件提交GitHub或放入反馈包。

1.3 数据库状态（来自第43次数据库截图）

数据库服务：ai-agent-research-staging-db；方案Free；状态Available。

PostgreSQL版本18；区域Singapore (Southeast Asia)；存储使用量约6.89% / 1 GB。

Render页面提示数据库将于2026-11-19到期；除非升级到付费计算方案，否则数据库将被删除。

截图显示数据库名ai_agent_research，用户名research_admin。

数据库页面提示外部流量受到PostgreSQL入站规则限制。

以上信息不能证明Web Service的DATABASE_URL实际指向该数据库，也不能证明已经存在可恢复备份。

1.4 部署证据

Render Deploys页面显示当前Live提交ea9867d，最近部署标题包含feedback 35与round38。

状态：Deploy succeeded | Live；触发方式：Dashboard手动部署。

前一条部署提交：ff87369。

部署标题只能作为线索，不能替代Git提交内容核验；不得据此直接声称第41次或后续交付已经上线。

2. Codex 必须完成的仓库只读核验

读取当前仓库状态、work分支HEAD、ea9867d与ff87369的提交信息及变更文件。

核对第41次、第43次及当前交付对应的提交、文件和报告；说明ea9867d是否包含预期修改。

明确Render Live commit与当前仓库HEAD是否一致；若不一致，列出准确差异。

阅读render.yaml、Dockerfile、数据库连接初始化代码、迁移流程和健康检查实现，说明应用从哪个环境变量读取数据库连接，以及/api/ready检查什么。

不打印Secret，不读取或输出真实密钥值；不更改任何文件或配置。

对没有证据支持的结论统一标记NOT VERIFIED。

3. 研究者已完成的手动核验

研究者已经进入Render Dashboard → ai-agent-research-staging → Settings，并提供General、Build、Deploy、Environment截图。已确认DATABASE_URL键存在但值未暴露；分支为work；Auto-Deploy为Off；Health Check Path为/api/ready；当前Live commit显示为ea9867d。研究者不需要再次进入Web Service Settings重复检查这些项目。

4. 研究者下一步唯一必要的手动检查：数据库备份/恢复入口

打开Render Dashboard中的ai-agent-research-staging-db数据库详情页，查找Backups、Recovery、备份下载或类似选项。

反馈是否找到备份/恢复入口，以及页面显示的保留期限、恢复范围、备份时间（如果有）。

记录是否显示升级、到期或付费提示。

安全要求：只浏览页面，不点击Restore、Delete、Upgrade、Suspend、Restart或任何会改变资源状态的按钮。不公开数据库密码、完整连接串、Token或API Key。若未找到入口，只报告“数据库详情页未找到备份/恢复入口”，不要据此断言平台完全不支持备份。必要时提供裁剪后的截图，避免包含任何Secret。

5. 官方文档核实与备份方案（由 Codex 负责）

通过当前Render官方文档核实Free PostgreSQL的到期和删除规则、当前套餐可用的备份/导出/恢复方式、保留期限和限制，并附来源链接及查询日期。

基于实际可用权限，设计数据库备份与隔离恢复验证流程。

备份范围至少考虑参与者/登录账号及密码哈希、实验条件分配、对话会话与消息、状态机状态与事件、评分、变量与研究配置、审计记录和迁移账本（以实际schema为准）。

不将真实研究数据、备份、密码或Secret提交GitHub；备份加密，密钥与备份文件分开保管。

记录备份时间、来源数据库标识、文件SHA-256、恢复目标、恢复后表计数和约束验证结果。

优先在独立隔离的测试数据库验证恢复，不要覆盖现有staging数据库。

在实际完成并验证恢复前，不得宣称备份可靠。

若必须付费、开放外部连接或创建资源，先说明理由、费用、风险和替代方案，等待研究者明确批准；不得自行购买或升级。

6. 部署与数据安全停止条件

本轮禁止点击Manual Deploy、Rollback或更改部署分支。

不得修改DATABASE_URL、API Key、管理员Token、Deploy Hook或其他Secret。

不得修改Auto-Deploy设置。

不得清空或重置数据库、删除账号或历史会话。

不得运行破坏性迁移。

不得升级套餐、购买服务或新建收费资源。

在没有备份与恢复计划的情况下，不执行会影响数据库的操作。

如果仓库提交、Render Live commit、服务名、数据库目标或迁移状态对不上，停止并先报告差异。

7. 报告产出

新增目录docs/acceptance/step6-round44/，至少生成report.md、delivery-status.json、manual-checklist.md。不要覆盖历史轮次报告。

CONFIRMED FROM USER SCREENSHOTS

VERIFIED IN REPOSITORY

RESEARCHER VERIFIED IN RENDER

VERIFIED FROM OFFICIAL RENDER DOCS

NOT VERIFIED

8. 本轮验收标准

已确认截图可证实的配置，不把隐藏值推断为已核实。

已明确当前Live commit与交付内容的关系。

已说明DATABASE_URL的配置读取逻辑，但不暴露其值。

已查阅当前官方文档并给出可执行备份/隔离恢复计划。

明确数据库2026-11-19到期风险。

未触发部署、未更改配置、未修改或删除数据。

未把测试或推断写成已验证的线上事实。

预期状态：部署与备份能力仍待核验；本轮不部署。
