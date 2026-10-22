# 内部Staging快速迭代规则（第45轮起）

本规则替代旧文档中把完整生产灾备演练套到每次Staging迭代的部分；不改变Production要求，也不授权自动部署。Render autoDeploy仍Off。

## 一次建立真实备份基线

当前线上据研究者确认为ea9867d，尚未上线的改动含004迁移、账号/聊天/历史持久化，因此第一次更新前必须取得**真实PG18全库custom dump**并满足：pg_dump退出0、pg_restore --list退出0、大小>0、SHA256成功、脱敏receipt生成并与实际文件复核。合成fixture收据不能代替真实备份。

Staging最低门槛不要求先完成独立或异地恢复；原有本地PG17/本轮合成PG18恢复仅为工程证据。Production仍需长期数据库、自动备份、隔离/异地恢复、30人以上真实托管并发、数据保留与隐私审批。

## 每轮固定判断

1. 完整npm run check并保存成功和失败日志；修改Prompt/适配器/气泡规则时，补受影响路径真实模型格式检查，与Mock/人工质量验收分开。
2. 交付明确三字段：database_schema_changed、migration_changed、account_or_persistence_changed。分别记录**本轮变更**和**实际Live到目标累计变更**；部署判断必须看累计范围，不能因本轮仅文档就忽略未上线004。
3. 首次真实备份基线已验证、三个字段均false时，不要求重复dump或灾备演练；核对准确提交后研究者可手动部署并进行本轮人工测试。单纯前端/独立Prompt文件在这一类；Prompt与持久化逻辑混在同一文件时，自动分类保守提示风险，需要代码范围审阅，不靠文件名声称未改写入。
4. 任一字段true，先对当前实际Live做一次新Windows备份并核验收据，记录绑定的Live完整SHA、源库与备份时间；再申请本次Staging部署。旧备份不能替代当前新迁移前备份。
5. 部署后确认实际Live完整SHA=批准目标，先/api/ready，再旧账号登录、刷新/退出重登、历史保留、管理员时间戳/记录；完整人工测试受影响路径。
6. 账号丢失/串组、历史/评分异常或500/数据库异常立即停写，保留脱敏证据，不清库/重置/盲回滚；004有数据后旧应用回退不安全。

## 只读工程闸门

`npm run acceptance:gate -- <本轮状态JSON> <完整候选SHA>`：状态需deployment_environment=staging、baseline_live_commit为完整实际Live SHA；CLI通过git diff自动取得累计变更，不能只信自报false。首次真实receipt必须scope=internal-staging-test-data-only、源/客户端主版本18、退出码/大小/SHA/覆盖摘要有效；合成scope被拒绝。风险变更另要求新receipt绑定当前Live。

通过只表示“可申请 Staging 部署：备份已由研究者完成并验证”，**不是已经部署或自动获得执行权限**。研究者仍须核验receipt与实际文件，机器记录本身不证明真实备份；该命令不连接Render或数据库。当前无真实receipt，结论必须“仍阻塞：等待真实备份”。

旧evaluateIteration保留原严格路径用于既有/非Staging证据；不借此降低正式实验门槛。人工测试不能由本地脚本代填；线上未部署时保持NOT RUN。
