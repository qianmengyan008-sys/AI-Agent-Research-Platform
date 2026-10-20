# 正式环境与研究审批边界

当前基线ac02e88，work分支。本轮新增render-production.yaml，资源名明确区分production：ai-agent-research-production-preparation和ai-agent-research-production-db；数据库名ai_agent_research_production。根render.yaml和deploy/render-paid.yaml保持原样，前者继续供短期免费体验，后者只是历史付费staging。

## 已实现：基础设施预备模式

新入口scripts/production-preparation.mjs与原staging启动器分离。只有RESEARCH_DATABASE_SCOPE=isolated-production、RESEARCH_RECRUITMENT_ENABLED=false及指定Production数据库名都匹配才启动。/api/ready实际查询数据库名称，并要求public/research没有用户表，拒绝误连测试数据库或带数据的数据库；不删除任何表。

只有基础设施检查通过时返回HTTP200，字段包括mode=production-preparation-only、formal_ready=false、research_ready=false、recruitment_enabled=false。这不是正式应用就绪。所有实验、登录、导出及页面路由均返回503，不能创建账号、招募或调用模型。将招募变量改成true也会拒绝启动，不存在一个可绕过审批的开启按钮。

此入口不加载mentor-test-v1、任何内部体验指导语或B001/B002，不执行迁移，也不生成正式参与者。原应用只接受staging的限制没有被绕过；正式业务启动和正式配置加载器仍为BLOCKED，不能宣称已支持正式研究全过程。

本地测试使用新建临时数据库验证空库健康、拒绝含数据数据库、拒绝staging范围和开启招募；确认没有创建实验表，数据不被改动。云上Blueprint校验、数据库TLS与真实HTTPS均NOT RUN。

## Blueprint是待批准的候选，不要现在部署

付费Web Standard与PostgreSQL Basic 1GB仅为待核价的Render预备方案，尚未证明满足30真实模型并发。只有研究者选Render并批准资源/费用后，才在work分支选择**render-production.yaml**，核对预览确实为production名称和独立DB。不能直接沿用根render.yaml或staging数据库。若Render页面不能选自定义Blueprint路径，停止，先让Codex核对平台操作方式，不通过覆盖根配置解决。

如果最后选阿里云，使用同一预备入口及安全边界，具体SAE/RDS/OSS资源配置在核价与账户权限确认后生成，不把Render YAML当作阿里云配置。

## 环境变量和Secret清单

| 名称                                                                         | 属性/来源                      | 用途                                                     |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| NODE_ENV=production                                                          | 非秘密                         | Node运行模式；不等于研究已批准                           |
| RESEARCH_DATABASE_SCOPE=isolated-production                                  | 非秘密                         | 正式隔离范围                                             |
| RESEARCH_RECRUITMENT_ENABLED=false                                           | 非秘密且固定关闭               | 预备入口拒绝其他值                                       |
| PRODUCTION_DATABASE_NAME=ai_agent_research_production                        | 非秘密                         | 与实际current_database核对                               |
| DATABASE_URL                                                                 | 新Production数据库自动绑定     | 不复用staging或输出连接串                                |
| ADMIN_ACCESS_TOKEN、RESEARCH_BOOTSTRAP_SECRET                                | 独立生成Secret                 | 预留给将来获批正式服务，当前入口不使用、不创建账号       |
| DEEPSEEK_API_KEY、GPT_API_KEY                                                | 目标平台Secret手填             | 与Codex绑定独立；当前入口不使用、不调用                  |
| GPT_API_BASE_URL、GPT_MODEL_NAME、DEEPSEEK_API_BASE_URL、DEEPSEEK_MODEL_NAME | 平台手填受控配置               | 不预设或覆盖已验证实际接口；未定默认模型，正式配置待审批 |
| BACKUP_KEY_BASE64                                                            | 32字节随机密钥的base64，Secret | 加密备份；需独立安全保存与恢复权限，不进Git              |
| BACKUP_KEY_ID                                                                | 非秘密版本标识                 | 关联加密密钥版本，旧备份密钥需按保留期安全保存           |
| BACKUP_BUCKET、BACKUP_SOURCE_REGION、AWS_REGION、可选BACKUP_ENDPOINT_URL     | 私有存储配置                   | 不同地区、账户核验后才能运行备份                         |
| AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY及可选AWS_SESSION_TOKEN              | Secret或最小权限工作负载身份   | 当前S3参考实现；OSS是否兼容必须另验                      |
| BACKUP_ALERT_WEBHOOK_URL                                                     | Secret                         | 失败通知端点，不能写入文档                               |
| BACKUP_RETENTION_APPROVED=true                                               | 仅获批后设置                   | 备份保留策略获准后才能运行；默认缺失则拒绝               |
| PGSSLROOTCERT（可选）                                                        | 可信CA配置                     | 备份强制verify-full，不关闭TLS验证                       |

不要一次性要求研究者现在填写这些值；目前只做平台和预算方向决定。Secret只在选定平台的安全设置界面填入，Codex Secret不会自动迁移。

## 正式业务启用还需要什么

由研究者批准正式Prompt与逐阶段材料、研究参数/轮次、知情同意和参与者说明、退出/撤回处理、数据保留/删除与备份期限、模型选择和人工审核结论，形成带版本与内容哈希的审批清单。未来正式启动器必须校验清单与实际材料完全匹配，拒绝mentor-test-v1，使用独立正式批次而非B001/B002。

这部分不能由Codex凭现有测试材料推定批准，因此本轮没有新增正式研究内容，也没有实现可开启的正式业务运行。基础设施、应用与研究放行是三个不同门禁；均需要真实证据，formal_ready始终false。

已有服务/数据库状态尚未知，不能认为“未由Codex创建”就等于账户内没有资源。后续先只读列出名称、状态和数据有无，发现已有数据先设计无损迁移；不删除/重建，不将内部体验记录混入正式研究数据。
