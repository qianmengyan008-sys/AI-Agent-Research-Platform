# 当前唯一手动检查：现有数据库的备份/恢复入口

附件已经记录Web Settings、Environment键、work分支、Auto-Deploy Off及Live短哈希。**不用重复检查这些Web项目**，也不用展开DATABASE_URL。

1. Render Dashboard → 原项目/服务列表 → 现有 **ai-agent-research-staging-db** 数据库详情页。
2. 只浏览 **Backups / Recovery / 备份下载** 或实际类似入口。记录有没有找到、界面显示的备份时间、频率、保留期限或恢复范围，以及到期/升级/付费提示。没有显示的填“未显示”。
3. 只回复下面的非敏感信息；可选截图先裁掉所有Secret。未找到就原样写“数据库详情页未找到备份/恢复入口”，不能据此推断Render整体不支持备份。

```text
数据库服务名：
备份/恢复入口：已找到（页面名称） / 数据库详情页未找到备份/恢复入口
备份时间/频率：未显示 / ……
保留期限/可恢复范围：未显示 / ……
到期、升级或付费提示：无 / 未显示 / 原文摘要……
```

只浏览，不点击 **Restore、Delete、Upgrade、Suspend、Restart、Manual Deploy、Rollback**；不改入站规则、不新建数据库、不付费。名称不符、异常、到期风险或需升级才能继续时停止，不自行处理。密码、完整连接串、API Key、管理员Token、Deploy Hook不发送、不截图、不导出到GitHub。

当前实际结果：**待研究者返回，NOT VERIFIED**。页面到期日期据附件为2026-11-19，不等待临近日期才安排保全；当前不授权任何修改资源的操作。
