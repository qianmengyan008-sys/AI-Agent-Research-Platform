# 第44次人工核验结果补充（研究者本轮直接反馈）

数据库：ai-agent-research-staging-db；详情页未找到Backups、Recovery、备份下载或类似入口；备份时间/频率、保留期限/可恢复范围均未显示。

页面原文：“Your database will expire on November 19, 2026. The database will be deleted unless you upgrade to a paid compute plan.”

PostgreSQL18，Free，Available，Singapore (Southeast Asia)，约6.89%/1GB，数据库名ai_agent_research。Web DATABASE_URL键存在，值隐藏；研究者没有发送或展开Secret。External Database URL/PSQL Command因PostgreSQL inbound IP rules未开放而不可直接使用。

研究者未修改Networking、未显示密码，未点击Upgrade、Restore、Delete、Suspend、Restart、Manual Deploy或Rollback。

研究者提供GPT对当前Render官方文档的核验结果：

1. Free Render Postgres不提供recovery capabilities。
2. Free Render Postgres不创建logical backups。
3. Free数据库需要自行使用pg_dump等方式做外部备份。
4. Free Postgres创建30天后到期，到期后有14天升级宽限期，之后数据库及数据会被删除。

本轮直接要求：更新第44次报告，将Free PostgreSQL备份/恢复能力更新为由官方文档确认；不要再要求找Backups/Recovery页面。核对Live ea9867d与work/交付版本；设计PostgreSQL18完整pg_dump及独立隔离恢复，明确Codex/研究者分工。任何Networking、资源创建、升级或费用须先说明理由/风险/费用并获明确批准。当前不授权资源修改或部署。

证据分层：以上为研究者直接提供的人工结果及GPT官方文档核验结果，不声称Codex独立访问Render后台或成功读取官网正文。GPT检索的逐字正文/独立查询时间未在本轮另附。
