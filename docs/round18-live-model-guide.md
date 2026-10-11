# 第十八轮：解除真实模型验收阻塞的操作指南

当前实际状态：真实业务命令退出 2／not_run，MODEL_API_KEY 与 MODEL_NAME 缺失，外部调用 0。已有配置草稿只是要求清单，MODEL_API_KEY 尚未绑定。以下是后续操作，不是已完成记录。

## 1. 在 Codex 云环境设置配置

进入这个项目使用的云环境设置，找到秘密／环境变量设置；不同客户端入口名称可能不同。MODEL_API_KEY 必须在秘密设置中安全填写或绑定，目标域使用你实际选择的 HTTPS 服务域，不发到聊天或写进 Git。

| 设置                            | 如何填写                                                           | 当前实例                                               |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| MODEL_API_KEY                   | 绑定自己账户的密钥；既有要求目标 api.openai.com                    | 缺失，要求未绑定                                       |
| MODEL_NAME                      | 明确填写账户可访问且支持 Chat Completions 参数的模型名             | 缺失；gpt-4.1-mini 只是既有示例                        |
| MODEL_PROVIDER                  | openai-compatible                                                  | 未设置；真实入口会把默认 mock 切换为 openai-compatible |
| MODEL_API_BASE_URL              | OpenAI 为 https://api.openai.com/v1；兼容服务填自己的 HTTPS 根地址 | 未设置，默认 OpenAI                                    |
| MODEL_TEMPERATURE               | 研究者批准的值；既有默认 0.2                                       | 本轮未运行真实模型                                     |
| MODEL_MAX_TOKENS                | 研究者批准的上限；既有默认 512                                     | 本轮未运行真实模型                                     |
| MODEL_TIMEOUT_MS                | 每次尝试期限，1–60000ms；默认 10000                                | 本轮未运行真实模型                                     |
| MODEL_MAX_ATTEMPTS              | 含首次的总预算，1–3；默认 2                                        | 本轮未运行真实模型                                     |
| MODEL_ACCEPTANCE_MAX_LATENCY_MS | 正数；默认 10000，整次生成工程耗时门槛                             | 不等于正式研究延迟签核                                 |

既有 draft 已声明 MODEL_API_KEY 与 MODEL_NAME，无需新增同名要求。自定义兼容服务须同时调整网络允许域和密钥允许目标；域名不含 URL 路径。保留 TLS 验证。不要把密钥绑定给不相关地址。

保存配置后，确认运行实例已收到更新；如果客户端要求发布／重启，按其实际界面执行。保存或发布草稿不证明当前实例已注入变量，也不证明供应商账号权限有效。

## 2. 只检查存在性，再手动运行

从 /workspace/AI-Agent-Research-Platform 运行以下检查。它不打印变量值或秘密：

```bash
node -e "for (const k of ['MODEL_API_KEY','MODEL_NAME']) console.log(k+': '+(process.env[k]?.trim()?'present':'absent'))"
```

两项均 present 才能解除“缺配置”阻塞；真实命令成功与否还取决于账号、模型、协议、网络、Docker 等。随后执行已有入口：

```bash
npm run live:business:e2e -- /tmp/round18-real-business.json
```

此命令会产生服务商用量：正常 18 个语言回合，默认最多 36 次 Adapter 尝试，配置上限 3 次时最多 54。只用合成身份、自己的临时 PostgreSQL、随机 loopback API；忽略外部 DATABASE_URL，不在正式库建实验或迁移。临时服务和容器结束后清理，报告保留合成记录。不要把真实付费调用加进 npm run check 或安装脚本。

## 3. 判读结果与审核

| 报告状态                           | 退出码 | 下一步                                                               |
| ---------------------------------- | ------ | -------------------------------------------------------------------- |
| not_run                            | 2      | 修复实际运行环境的密钥／模型名注入；调用 0                           |
| failed                             | 1      | 诊断配置、Docker、网络或运行失败；报告可能没有已知调用次数，不猜为 0 |
| provider_or_flow_failed            | 1      | 查看实际保留的路径／失败模型日志，不声明完整模型链路通过             |
| latency_threshold_exceeded         | 1      | 路径可能完成，但整次工程延迟超标，分析测量再调整批准的配置           |
| completed_with_guard_interventions | 0      | 人工检查所有重试、校验拒绝与兜底；不当作无干预通过                   |
| completed                          | 0      | 工程路径和结构检查完成；仍需逐条语义审核                             |

参数在 settings；路径内 analysis_export.runs／analysis_rows.model_run_log 提供 model_name、provider、temperature、max_tokens、latency_ms、retry_count、validator_result、fallback_count。path.latency 是整次生成的 p50／p95／max。实际字段以报告为准，延迟包含编排重试和校验，不是供应商纯网络延迟；Adapter 次数不是账单。

按[人工审核表](round18-semantic-review-template.md)阅读每条最终回复及保留的 Validator 记录，并记录问题定位、审核者和决定。现有日志不保证保存所有被拒绝候选的完整正文，不能伪造未保留内容。所有语义结论应附实际消息 ID／阶段／引用；缺数据记未验收。

既有程序始终 formal_ready=false、semantic_review=pending_researcher_review。人工签核应保留独立记录，不能直接改历史机器报告来伪造通过。提交合成结果前检查内容与凭据泄露；正式参与者原始记录不能直接上传 GitHub。

## 4. 正式实验仍需独立验收

真实合成业务通过不解除以下门禁：正式量表与实验变量 schema、拒答／退出流程、全量可核对归档、独立持久数据库与安全管理权限、正式 HTTPS 部署、备份恢复、目标规模持续负载和真实模型 20–30 轮负载。

真实业务入口是合成工程验收，不会自动建立可供正式参与者使用的持久平台。生产准备仍按[实验前清单](pre-experiment-checklist.md)和[验收清单](experiment-acceptance-checklist.md)执行。正式服务 ADMIN_DEVELOPMENT_MODE 保持 false；需要 Pilot 诊断时仅在内部研究环境显式启用并认证管理员。
