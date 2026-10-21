# 第42轮：线上只读核验准备报告

结论：**仍阻塞；不部署**。本轮仅核对本地/GitHub交付证据并补充文档，没有访问Render管理后台、连接线上数据库或运行线上迁移。没有修改API Key、环境变量、数据库、账号或任何业务代码。

## 版本核对

- 核验时远程 `work` 头：`879d59184d771851e36a92b7d7601bc39dd99964`。
- `round41-delivery`：同为 `879d59184d771851e36a92b7d7601bc39dd99964`，与核验时work一致。
- 第41轮实现：`45b699fd3b9ed33d3939e3d025f27dea708703c2`，是上述交付提交的祖先。45b699f不是最终交付；之后仅新增17个交付文档/证据文件，实验运行代码无差异。
- 第41轮ZIP逐一比对1,427个受控文件，无差异；SHA256 `b65f53aae69be28d811a3a3d6584f98b3f274131edf710b8e55c51d47ecaadfd`。见baseline-audit.json。
- 本轮没有新的业务实现提交。本轮最终交付以 `round42-delivery` 标签为准，仅追加本轮文档和证据；其父提交为879d591。核验时work与后来文档交付提交分开记录，不能把新文档提交声称为线上Live。
- 实际当前Live完整提交：**NOT VERIFIED**。历史截图ea9867d不是本轮核验结果。本轮不选定或批准部署目标。

## 变化范围

只新增 `docs/inputs/round42-requirements.md`、原始附件 `round42-feedback.docx`，以及 `docs/acceptance/step6-round42/` 内基线核对、只读操作清单、机器状态、报告、测试日志与浏览器结果。未覆盖上一轮证据。

研究材料、核心状态机、Validator、运行时Prompt、模型适配器、气泡规则、模型参数、账号分组、数据库表、迁移、环境变量、API Key及render.yaml全部**未修改**。render.yaml中Free、数据库引用及autoDeploy=false仅是仓库期望配置，不能当作当前Render配置已验证。

## 本轮自动测试

完整命令 `npm run check`，实际结果记录于delivery-status.json与full-check.log。三路径、隔离、历史及本地恢复均使用仓库既有自动化回归，不新增或放宽断言；不使用线上数据库。

退出码 **0**；**505项Vitest / 33文件、25项Playwright通过**；失败0、跳过0，类型、lint、格式和构建检查通过。见full-check.log及browser-results.json。本轮没有自动化失败运行，也没有新增/放宽测试断言。

第41轮额外11项数据安全测试原本包含在505项内，本轮不额外累加。上一轮失败日志继续保留。本轮真实模型调用0次；真实模型三路径完整验收、人工语义审核、线上人工测试 **NOT RUN**。本地自动点击及模拟模型回复不是人工或线上验收。

## 只能由研究者登录Render确认的事实

实际Live提交、分支、部署时间和服务方案；DATABASE_URL是否存在（隐藏值不展开）；实际数据库服务名/状态/版本/方案、到期和数据保留提示、备份/下载/恢复/PITR选项、界面显示的备份频率和可恢复范围。请返回实际显示值；看不到就写未显示或无法确认，不猜测。

仓库只能说明期望服务为ai-agent-research-staging、期望数据库为ai-agent-research-staging-db，不能证明真实连接。DATABASE_URL隐藏时应记“值被隐藏，无法从界面确认关联”，不要求显示、复制、下载或发送连接串、用户名、密码、Token或任何Secret。当前也不要求研究者跑SQL查看迁移账本。

当前实际Live、源库关联、迁移账本、线上完整备份位置/SHA256、隔离或异地恢复、旧账号会话/分组/历史/评分基线全部 **NOT VERIFIED**。此前本地临时合成Postgres加密恢复成功不能填作线上备份证据。

## 研究者现在只做这一组（3–5分钟）

详见 [readonly-checklist.md](readonly-checklist.md)，包括可复制回复模板。

1. https://dashboard.render.com/ → 现有项目 → ai-agent-research-staging → Deploys → 查看Live，记录哈希（短哈希就注明）、实际分支、部署时间及时区、方案。不点击Manual Deploy。
2. 同一Web服务 → Environment（或服务Settings）→ 只确认DATABASE_URL存在与否。值隐藏就保持隐藏，不点眼睛、复制、Export，不编辑。若进入Workspace settings，先停止并记录页面标题，不寻找或修改工作区设置。
3. 返回原项目服务列表 → 现有ai-agent-research-staging-db → Info/Recovery/Backups或实际对应页 → 记录非敏感数据库元信息、到期/保留和备份恢复能力。不点击Restore/Delete/Upgrade/Create Database。
4. 返回模板或已裁掉Secret的截图。服务缺失、数据库名不符、异常或到期风险、连接无法确认、要求升级付费时停止，不修复/升级/创建。隐藏连接不展开，未知继续标NOT VERIFIED。

人工只读核验实际结果：**待研究者返回，NOT RUN**。当前不做应用登录/聊天、账号生成、25–35分钟线上smoke或部署。

## 收到结果后才制定方案

先逐项对照实际Web/数据库/Live版本，不确定的保持NOT VERIFIED。再根据真实套餐、权限和可用恢复能力，制定完整Postgres备份、私有加密保存和独立隔离恢复方案：覆盖账号哈希、参与者、分配、会话、消息/通知、状态、变量、事件、评分、研究配置及迁移账本；记录SHA256、源库/隔离目标、表计数/约束/恢复登录证据，密钥与备份分开，不入GitHub。

若Free能力不足，先说明事实、选项及费用影响并等待选择，不升级/付款，不创建新服务绕过。不得用专用production备份脚本处理staging或改scope绕过保护。部署前保存既有测试账号的脱敏历史/评分/分组基线。实际备份、隔离恢复、目标提交/数据库关联与迁移兼容性核实后，才请求一次明确部署批准；当前不请求、不部署。

后续线上内部测试仍按第41轮清单，在获批并部署后执行。原始四头像、真实模型完整三路径及人评、30人真实托管并发、14自然日或批准替代方案、异地恢复与正式招募/隐私审批仍独立阻塞。mentor_test_ready=false、formal_ready=false。
