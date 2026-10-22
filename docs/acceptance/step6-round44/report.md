# 第44次反馈：Render环境核验与数据库保全

**结论：仍阻塞；本轮不部署。** 本轮只读核对仓库与附件，新增交付文档和本地测试证据；没有访问Render管理后台、连接线上数据库、重启服务、触发迁移、修改环境变量/API Key、升级资源、清库或重置账号。mentor_test_ready=false、formal_ready=false。

本轮日期：2026-10-22（北京时间）。按附件转述，数据库2026-11-19到期，距本轮查询日28天，存在数据删除风险；不能把未核实的宽限期当作保全保障。

## CONFIRMED FROM USER SCREENSHOTS

**证据边界**：本轮仅收到第44次DOCX，里面是截图事实的文字转述，没有嵌入截图；未另行收到第43次原截图/交付包。因此本节严格标为“附件对研究者截图的报告”，不是Codex重新登录Render验证。

附件报告：Web服务ai-agent-research-staging，Free、Docker、Singapore，仓库qianmengyan008-sys/AI-Agent-Research-Platform，分支work；Live短哈希ea9867d，前次ff87369，Dashboard手动部署成功。地址https://ai-agent-research-staging.onrender.com/；Dockerfile为./Dockerfile、context为根目录，Auto-Deploy Off，Health Check /api/ready，子域名Enabled。

附件报告Environment中ADMIN_ACCESS_TOKEN、ADMIN_DEVELOPMENT_MODE、DATABASE_URL、DB_POOL_SIZE、DEEPSEEK_API_KEY、DEEPSEEK_MODEL_NAME、GPT_API_BASE_URL、GPT_API_KEY键存在且值隐藏；GPT_MODEL_NAME区域仅在截图下缘部分可见，不推断完整列表或任何值。

数据库据附件转述为ai-agent-research-staging-db、Free、Available、PostgreSQL18、Singapore，约6.89%/1GB，提示2026-11-19到期且不升级会有删除风险，外部连接受入站规则限制。**同名数据库和DATABASE_URL键存在不能证明Web实际连接该库，也不能证明有可靠备份。**

## VERIFIED IN REPOSITORY

核验时本地及GitHub work为 **3f81fc143a99dc877aeb32829a6ea7d4e563ba0e**。第41次最终交付 **879d59184d771851e36a92b7d7601bc39dd99964**；其实现提交 **45b699fd3b9ed33d3939e3d025f27dea708703c2**，不能混称同一提交。本轮无新的业务实现，最终文档交付以round44-delivery标签为准（父提交3f81fc1）。

- ea9867d完整映射为`ea9867dfb9dd64778bdbaccf2cb3855ff27d9441`，提交标题Deliver feedback 35 evidence, screenshots, synthetic login workbook and complete round38 report。
- ff87369完整映射为`ff87369c55a27f8ff91b091d76767b8777cccaba`，标题Deliver round 37 screenshot-based payment and quotation evidence。到ea9867d有74个变更文件，其中增加账号管理/Excel、消息气泡及前轮证据，完整列表保存在repository-audit.json。
- ea9867d到核验时HEAD有6个后续提交、180个差异文件，其中35个非docs文件；逐文件精确列表和完整提交号见repository-audit.json。不能由部署标题直接推断已包含后续功能。

| 后续提交 | ea9867d尚未包含的内容                                                  |
| -------- | ---------------------------------------------------------------------- |
| 3ee1940  | 第39轮服务端聊天驱动、持久开场/卡片、完整管理员历史及004聊天通知迁移。 |
| c21f903  | 第40轮日常四身份/短回复、情感短气泡与归属、日常持续使用及相应回归。    |
| da385a1  | 第39/40轮证据及交付报告。                                              |
| 45b699f  | 第41轮只读验收闸门、10项测试与CI证据保存。                             |
| 879d591  | 第41轮最终文档/验收证据。                                              |
| 3f81fc1  | 第42轮只读核验文档与本地回归证据。                                     |

按附件所报Live=ea9867d，其Git内容**不包含上述后续修改**，与work HEAD不一致；当前实际后台Live是否仍为该值未重新访问确认。render.yaml、Dockerfile、核心experiment-core、原ai-orchestrator及research材料从ea9867d到核验HEAD无差异。

**第43轮缺口**：当前work的docs目录与本地标签中未找到第43轮报告/标签，本轮也未收到第43轮文件或原截图；不编造对应提交和报告，不覆盖第41、42轮历史。DOCX中的第43轮事实仅保留其原文及来源说明。整个项目ZIP包含仓库已有历史及本轮成果，不冒称包含未提供的第43轮原包。

### 连接、启动、迁移及健康检查

Dockerfile构建执行npm ci和npm run build，运行入口是`node --use-env-proxy --import tsx scripts/hosted-server.mjs`。该入口调用createHostedDeployment；`scripts/hosted-platform.mjs`从**DATABASE_URL**读取pg.Pool连接（必须存在），DB_POOL_SIZE只控制池上限，默认10、连接超时10秒。render.yaml声明数据库引用只是期望配置，不证明实际已注入的目标。

启动先检查数据库隔离，再加载database/migrations并执行migrate默认up。迁移通过advisory lock串行化、核对research_meta.schema_migration中的id/checksum，按事务应用待执行迁移。其后会在锁下执行固定测试实验/账号bootstrap：复用已有记录并校验哈希/分组，缺失时会创建。**所以启动/重启应用不是纯只读动作**，本轮没有为验证而启动线上服务。packages/database/src/cli.ts也从DATABASE_URL读取，up/down均不是当前授权操作。

004只新增chat_notice及不可变约束；源库实际迁移账本未取得，不能断言004已应用或未应用。旧ea9867d只含001–003；004有记录后down拒绝，旧应用不认识004，不能盲目Rollback或删除数据来回退。

`/api/ready`仅执行池连接上的`SELECT 1`：成功返回status=ready/database=ok，失败503 DATABASE_UNAVAILABLE。它不核实目标数据库身份、账号/评分/历史完整性、备份可恢复性或迁移账本。上述代码在ea9867d与核验HEAD均存在。本轮没有探测该线上URL，以免冷启动间接触发启动流程。

## RESEARCHER VERIFIED IN RENDER

仅据附件，研究者已完成Web General/Build/Deploy/Environment查看；**不要求再次重复Web设置核验**。这些结果的来源是研究者报告，Codex无独立后台访问证据。

当前唯一必要手动检查：Render → 原项目 → **ai-agent-research-staging-db**详情 → 只查看Backups/Recovery/下载备份或类似入口，返回是否找到、备份时间/频率、保留或恢复范围、升级/到期/付费提示。见[manual-checklist.md](manual-checklist.md)。不要点Restore/Delete/Upgrade/Suspend/Restart，不发送密码、连接串、Token或Key；找不到就写“数据库详情页未找到备份/恢复入口”，不据此断言平台无备份能力。实际结果仍待研究者返回。

## VERIFIED FROM OFFICIAL RENDER DOCS

**本轮未能取得官方当前文档正文：NOT VERIFIED。** 查询日期2026-10-22，访问以下官方文档URL初次及提权重试均报Tunnel connection failed: 403 Forbidden：

- https://render.com/docs/free
- https://render.com/docs/postgresql-backups
- https://render.com/docs/postgresql-creating-connecting
- https://render.com/docs/postgresql-version-upgrades

尝试通过GitHub获取文档也未成功，见official-docs-attempts.json。以上是**待核实的官方来源链接，不是本轮已读证据**。未据记忆补写Free备份可用性、精确保留期、到期宽限/删除规则或报价。附件报告的到期提示仍应作为需要尽快保全的风险处理。官方政策核实是本轮未完成项，不宣称验收全部通过。

## 本轮测试及实际验收

完整 `npm run check` 退出0：**505项Vitest /33文件、25项Playwright通过**，失败0、跳过0；包含类型、lint、格式、构建、认知/情感/日常、账号隔离及本地备份恢复回归。见full-check.log/browser-results.json。没有新增/放宽测试断言，也没有本轮自动化失败运行。此前失败日志保留在原轮目录。

测试仍为本地合成数据与测试模型替身。本轮真实模型调用0，真实模型完整三路径与人工语义审核NOT RUN；线上人工smoke、线上旧账号复验NOT RUN。既有数据库恢复用本地PostgreSQL17合成实例，不能替代附件所报PostgreSQL18源库的备份/恢复验收，也不等于异地恢复。

本轮只新增docs/inputs/round44-feedback.docx、提取原文round44-requirements.md及docs/acceptance/step6-round44/内报告、状态、只读清单、差异记录、官方请求失败记录、保全计划和测试日志；不改旧报告。业务代码、研究材料、状态机、Validator、运行时Prompt、参数、账号/分组、数据库结构、迁移、环境变量、API Key、render.yaml、Dockerfile均**未修改**。

## NOT VERIFIED

实际Web连接目标、当前后台Live完整哈希、线上迁移账本、完整数据库备份与SHA256/私有位置、线上或异地隔离恢复、旧账号基线、当前Free备份/导出/PITR能力及保留政策、PostgreSQL18实测恢复均未验证。第43轮原包和原截图未提供。原四头像、真实模型完整三路径、人评、30人托管并发、14自然日续用/批准替代方案及隐私/招募审批仍独立阻塞。

## 保全方案与后续顺序

[backup-restore-plan.md](backup-restore-plan.md)提供待批准的分步方案：先确认源库关联与连接权限；匹配Postgres18工具及独立18恢复目标；完整dump包含research和research_meta迁移账本、账号哈希、分配、消息/通知、状态/事件/评分/变量、配置/审计与约束；加密私存、密钥分开、记录密文SHA256；在不覆盖原staging的隔离目标恢复，先比表计数/约束/快照，再在另一个授权隔离副本验证旧测试账号/分组/历史/评分。先不启动Hosted应用以免自动迁移和bootstrap改变恢复基线。

该方案**未执行**。现有production备份脚本固定专用production库/scope及PG17，禁止直接用于PG18 staging或改scope绕过保护。若需要开放网络、付费或创建资源，先说明实际选项、费用/风险及替代方案，再等待明确批准；不自行升级。只有实际完成恢复后才可说备份可靠。

**现在不部署、不请求部署批准**：先收唯一人工备份入口结果并补足官方政策/关联证据，再确定安全备份操作。所有数据保全条件与迁移兼容性核实后，才请求一次明确部署批准。本轮GitHub与ZIP是代码/反馈/证据交付，不包含真实研究数据库备份、密钥或线上账号密码，也不代表新版本已上线。
