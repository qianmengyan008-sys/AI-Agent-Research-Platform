# 第44次报告更新：人工核验完成，PG18外部备份待批准

**结论：仍阻塞；不部署，不修改资源。** 本次补充仅更新文档，不连接线上数据库、不开放网络、不创建恢复实例、不升级、不改Secret、不清库/重置账号、不执行迁移。初版第44轮报告/状态/方案已保存在researcher-followup/initial-*，原round44-delivery标签不变。

## RESEARCHER VERIFIED IN RENDER

研究者本轮直接确认：数据库ai-agent-research-staging-db；PostgreSQL18，Free，Available，Singapore (Southeast Asia)，约6.89%/1GB，数据库名ai_agent_research。

已检查详情页，**未找到Backups、Recovery、下载备份或类似入口**；备份时间/频率、保留期限/可恢复范围未显示。该人工核验已经完成，**不再要求寻找这些页面或重复Web设置核验**。

页面原文：“Your database will expire on November 19, 2026. The database will be deleted unless you upgrade to a paid compute plan.” 应在**2026-11-19到期前**完成外部备份和隔离恢复验证。

Web DATABASE_URL键存在且保持隐藏；研究者没有展开/发送Secret。外部连接受PostgreSQL inbound IP rules限制，External Database URL/PSQL Command目前不可直接使用。研究者未修改Networking，未点击升级、恢复、删除、挂起、重启、部署或回滚。

本节证据是研究者直接人工反馈，完整脱敏记录见docs/inputs/round44-researcher-verification.md；Codex没有独立登录Render后台。Web实际连接目标与该数据库的关联仍未取得可核实证据，不能从同名资源推断。

## VERIFIED FROM OFFICIAL RENDER DOCS

**已由官方文档确认；证据渠道：研究者提供GPT对当前官方文档的核验结果。** 此项已从初版NOT VERIFIED更新，不再把Free是否提供备份/恢复列为未知。

1. Free Render Postgres不提供recovery capabilities。
2. Free Render Postgres不创建logical backups。
3. 需要自行使用pg_dump等方式进行外部备份。
4. 创建30天后到期，到期有14天升级宽限期，之后数据库及数据删除。

相关官方来源：https://render.com/docs/free 、https://render.com/docs/postgresql-backups 。Codex本环境此前请求403的记录仍保存在official-docs-attempts.json；这份失败记录仅描述**Codex直接抓取通道**，不否定研究者提供的官方文档核验。未冒称本环境已重新读取到原文；GPT逐字正文与独立查询日期本轮未另附。14天宽限不是可依赖的可连接/备份窗口，不等到到期后再导出，也不将其当作免费恢复能力。

## VERIFIED IN REPOSITORY：Live与交付关系

本次核验前GitHub work HEAD与当前初版第44轮交付均为 **24fe003aa06fbf2d9c427fac25081f99977edaa6**。研究者确认的Live短哈希ea9867d在Git中唯一映射为 **ea9867dfb9dd64778bdbaccf2cb3855ff27d9441**，**二者不一致**。

从Live到核验HEAD有7个后续提交、194个差异文件；其中非docs变更仍为35个。精确文件/提交列表见researcher-followup/repository-audit.json。

| 提交    | Live尚未包含的后续内容                                 |
| ------- | ------------------------------------------------------ |
| 3ee1940 | 第39轮聊天驱动、持久开场/卡片、完整历史及004通知迁移。 |
| c21f903 | 第40轮日常四身份/短回复、情感短气泡与归属、持续历史。  |
| da385a1 | 第39/40轮完整交付证据。                                |
| 45b699f | 第41轮验收闸门与CI证据保存实现。                       |
| 879d591 | 第41轮最终交付，区别于实现45b699f。                    |
| 3f81fc1 | 第42轮只读核验交付。                                   |
| 24fe003 | 第44轮初版报告/反馈/方案，未上线。                     |

本次补充交付以 **round44-followup-delivery** 标签标识，父提交24fe003，仅更新文档，不把补充报告提交混称为线上版本。原round44-delivery和其他历史标签保留；当前仓库没有第43轮原包，仍不编造或覆盖它。

Docker入口仍为scripts/hosted-server.mjs，调用hosted-platform.mjs，从DATABASE_URL读取pg.Pool。启动会自动检查/应用迁移并执行bootstrap，故启动/重启不是只读核验。/api/ready只SELECT 1，不能证明源库身份、账号历史或备份完整。render.yaml的autoDeploy=false未修改；不触发手动部署。当前实际线上迁移账本未知，不能仅按Live代码推断它必为001–003。

## PostgreSQL18备份与隔离恢复设计

详见[backup-restore-plan.md](backup-restore-plan.md)，包含完整范围、命令骨架、快照边界、校验标准、费用风险和分工。方案**尚未执行**。

优先路径A：研究者已有受控电脑，匹配PG18客户端与私有磁盘，若后续明确批准，仅临时允许稳定出口的单一IP；不升级Render、不建Render新服务。当前外部连接受阻，不能承诺在完全不改变访问条件时立即导出。既有可访问内部受控环境是候选B，但可用性尚未证实，不假设Free有Shell，也不添加公开HTTP导出接口绕过限制。

获批准后的完整流程：私下确认Web/源库目标；凭据只在本机受控文件/Secret中配置；用同一只读快照采集基线并完整custom pg_dump；覆盖research及research_meta、账号哈希、分配、会话、消息/通知、状态/事件/评分/变量、配置、审计、约束与迁移账本；AES256GCM加密私存，密钥分开，记录UTC/北京时间、源标识、密文SHA256/大小及快照边界。只读dump仍有连接、锁及I/O压力，应限时监控，不能声称零运行影响。

恢复只在**另行批准的独立PG18空目标**进行：从最终密文取回、SHA256与GCM校验、事务恢复，核对同快照表计数/分块摘要、约束/序列/账本及业务关联。原样核对前不启动Hosted应用；第二个批准副本才运行与账本兼容的代码，关闭真实模型，用既有测试账号实际登录并核对分组/历史/评分/隔离。源库不重置密码，不运行恢复或down。Postgres角色/ACL映射另记，不能把no-owner/no-acl导出说成全实例权限也已原样恢复。

现有production-backup-job.mjs固定PG17与专用production库/scope，**不能直接用于PG18 staging，也不能改scope绕过保护**。此前本地PG17合成恢复PASS不代表本次PG18或线上恢复通过。

## 谁能做什么，哪些步骤需要批准

| 事项                             | Codex当前权限内                                                   | 必须由研究者/授权受控环境完成                                                                                   |
| -------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 仓库对比、schema审阅、方案与报告 | 已完成；无线上访问                                                | 不用重复找备份页面。                                                                                            |
| 网络访问                         | 只能提出最小规则和风险；当前不改                                  | 决定是否批准精确临时IP/期限；批准后本人在Render添加并撤销该规则，保留原规则，不开放0.0.0.0/0。                  |
| Secret与源库关联                 | 不索要聊天连接串/密码                                             | 本人私下配置并核实目标，不改Web DATABASE_URL/API Key。                                                          |
| 导出/加密/校验                   | 具备明确授权、受控访问和安全存储后才可执行或给出命令，当前NOT RUN | 选择机器/OS、私有存储与密钥保管；本机执行时由研究者按指导操作。                                                 |
| 隔离恢复                         | 计划已完成，当前不创建实例                                        | 另行批准具体本地/已有受控恢复资源；用私有旧测试账号验收。                                                       |
| 费用                             | 不购买、不升级，不声称总费用零                                    | 开源PG18无许可费；使用已有机器无需新增云实例，但流量/存储计费及额度需先核实。任何新增费用必须先确认报价并批准。 |
| 部署                             | 继续禁止                                                          | 备份、恢复、关联、旧账号与迁移证据齐全后另行决定；备份批准不等于部署批准。                                      |

当前无需点击任何按钮或运行命令。若采纳A路径，下一组仅先确认受控电脑/OS、稳定出口与已有私有存储条件，不发送Secret；再给出具体网络/资源/费用清单并请求执行批准。

## 测试、改动和剩余阻塞

本次补充**仅改文档**，没有新增代码/迁移或修改实验材料、状态机、Validator、Prompt、研究参数、API Key、数据库、账号/分组、render.yaml或Dockerfile。

初版第44轮完整npm run check退出0、505项Vitest/33文件及25项浏览器通过的原日志继续保留；**它是初版工程回归，未在本次文档补充中重跑或当作新测试**。本次执行文档格式、状态一致性、变更范围与打包校验，记录在researcher-followup/。本次未执行PG18 dump/restore、线上登录、人评或真实模型调用。自动化失败记录没有删除。

Free平台能力与人工页面核验已完成；仍未完成的是源目标关联/实际迁移账本、经授权的访问路径、真实完整备份文件/SHA256/私有位置、PG18隔离/异地恢复、旧账号基线。本轮不把“无托管备份”推断为必须付费升级，也不继续要求找按钮。

原头像、真实模型三路径与人评、30人托管并发、14自然日/批准替代方案及隐私/招募审批仍为独立阻塞。**仍阻塞，不部署。**
