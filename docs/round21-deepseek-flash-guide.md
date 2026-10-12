# DeepSeek Flash：安全配置、一次 smoke 与研究前置条件

本轮固定请求 deepseek-flash；“DeepSeek V4.1 Flash”是用户提供的路由说明，尚未由真实响应或供应商资料核实。保留可替换Adapter和历史比较工具，本轮不需要GPT配置或双模型比较通过。

## 安全设置

在项目使用的云环境Secret设置中安全填写/绑定DEEPSEEK_API_KEY；只读取此变量，不从GPT_API_KEY或通用MODEL_API_KEY回退。不要把密钥发到聊天、写入命令、文件、日志或截图。聊天中出现的密钥建议更换；正式研究前使用专用密钥。

非秘密变量使用：MODEL_PROVIDER=deepseek，DEEPSEEK_MODEL_NAME=deepseek-flash，DEEPSEEK_API_BASE_URL=https://api.deepseek.com/v1。若实际使用其他兼容服务，必须核实其HTTPS根地址，并使网络/秘密绑定目标与真实服务域匹配，不复制Codex CLI config.toml/wire_api配置。

既有DEEPSEEK_API_KEY需求与api.deepseek.com目标已保存；本轮更新单模型/Flash变量建议。保存草稿不等于注入、应用到实例或发布。GPT相关历史配置保留，但本工具不读取GPT，不把它作为DeepSeek前置。

## 最小真实调用

先仅检查存在性，不打印秘密值：

```bash
node -e "console.log('DEEPSEEK_API_KEY: '+(process.env.DEEPSEEK_API_KEY?.trim()?'present':'absent'))"
```

从项目根目录执行，使用新的输出文件，已存在的结果不会覆盖：

```bash
MODEL_PROVIDER=deepseek DEEPSEEK_MODEL_NAME=deepseek-flash DEEPSEEK_API_BASE_URL=https://api.deepseek.com/v1 npm run smoke:deepseek -- /tmp/deepseek-flash-smoke.json
```

最多一次Adapter请求：temperature默认0.2、max_tokens512、timeout10000ms；configured_max_attempts可为2，但smoke_max_attempts=1、retry_count=0。stream=false、不发送启用thinking/reasoning的参数；这不证明供应商内部默认行为已关闭，真实响应/耗时仍需核对。只请求一句技术问候，不使用演示或正式研究Prompt，不连接数据库。

| 状态      | 退出码 | 处理                                                        |
| --------- | ------ | ----------------------------------------------------------- |
| not_run   | 2      | 缺安全注入/模型选择不符，无外部请求                         |
| failed    | 1      | 停止后续真实测试；依据失败层级诊断                          |
| completed | 0      | 一次技术调用完成；仅鉴权/返回结构/基础耗时证据，不放行Pilot |

Model Adapter逐调用测量返回requested_model、response_model、http_status、latency_ms、text和受控error_code；并发调用独立。供应商没返回model则null，不从请求文字推断；路由V4.1声明仍需供应商证据。HTTP200但JSON/choice/content不符合兼容协议或回复为空也失败。

失败层级包括鉴权、限流、供应商可用性、网络、超时、响应格式。HTTP400若无法安全区分模型/端点/参数，就明确not_determined，不臆测具体原因。错误正文和私密传输细节不进入报告。http_status为null表示未收到响应，request_sent可能未知；Adapter尝试次数不是账单或成功调用数。

## smoke之后先冻结正式材料

smoke失败即停止；成功后也先确认正式研究材料。当前既有live:business:e2e入口构造demo_policies=true，必须先采用研究者确认的正式StagePolicy才能称正式语义验收。不得把附件流程描述或模型自行补写当正式Prompt。

请研究者给出：每个stage的正式policy及唯一prompt_version、认知四重构的明确轮数、来源字段规则、评分量表与行动意愿对象、固定开场/场景骨架/转场关键事件、角色首轮命名规则、最多3气泡的最终组装校验、告别和拒答/退出方案。尚未批准或工程未支持的项目见[差异清单](acceptance/step6-round21/research-requirements-gap.json)。本轮不改core来填研究设计空白。

当前generateWithMetadata只为选择使用它的调用返回response_model；smoke报告已经保存对应关系。业务服务仍用既有generate文本接口，数据库model_runs尚无专门response_model列，不能声称已经完成全链路响应模型归档。正式业务复验需关联逐调用元数据，保留最终Prompt版本；数据库迁移/流程改动应另行按明确范围执行。

## 性能与人工审核

latencySummary按实际样本计算P50/P95/max、严格超过3000ms/5000ms的次数，以及累计retry/fallback；没有样本保持null，不设置1秒硬门槛。耗时是相应操作整体墙钟时长，不拆出未经测量的网络/推理/Validator子耗时。

真正的语言流畅、逻辑、指代、重复与实验忠实度由研究者逐条审核。历史real-model-semantic-review工具不自动打分或批准；现有业务报告只保留最终消息/Validator，不保证所有被拒候选正文。比较工具的候选保留能力不等于已接入单模型业务日志。缺失原始候选不重构，不把安全兜底当原始模型质量。

只有真实业务流程、正式Prompt、规定互动/场景约束和人工语义签核均有证据后，才讨论Pilot放行。正式部署、全量归档、研究方案/退出、目标库/HTTPS/备份与容量仍单独验收。
