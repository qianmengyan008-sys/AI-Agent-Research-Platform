# 实际可用GPT模型与真实对比执行说明

2026-10-14，仓库第32次交付。此前GPT与DeepSeek均已安全注入，但初始GPT_MODEL_NAME=gpt-4.1并非此账户可用模型。服务models接口HTTP200，生成403/model_not_found；不是本轮确认的密钥缺失、地区错误或自动审批拒绝。

## 自动发现与验证

```sh
node --use-env-proxy scripts/gpt-model-access-smoke.mjs /tmp/new-gpt-smoke
```

工具读取现有GPT_API_BASE_URL不作修改，安全使用GPT_API_KEY查询/models，只从实际列表选可用GPT对话模型，排除embedding/audio/realtime/image等类型。此次实际列表只有gpt-4和text-embedding-ada-002，选择gpt-4，不再使用假设名称gpt-4.1。

该工具只做一次max_tokens32、temperature0.2的中性中文问候，stream=true；不连数据库或状态机。首token是开始请求到收到首个非空SSE delta.content的首个可见文本块，不是供应商内部tokenizer时间。总响应时间到流结束；无法读取SSE时保留空值并报错，不能把完整非流式响应时间冒充首token。

| 本次smoke指标    | 实测       |
| ---------------- | ---------- |
| 请求模型         | gpt-4      |
| 返回模型         | gpt-4-0613 |
| HTTP             | 200        |
| 首个可见文本块   | 2801.00ms  |
| 总响应           | 3090.69ms  |
| GPT_API_BASE_URL | 保持原值   |

本轮对比执行进程已自动采用GPT_MODEL_NAME=gpt-4。云环境草稿同时保存该建议值；配置工具不会自动覆盖平台已有绑定值，因此如需未来任务持久沿用，请在环境设置保存/发布并核对模型名。密钥与API地址不改，不将其内容写入材料。

## 真实对比执行

```sh
GPT_MODEL_NAME=gpt-4 node --use-env-proxy --import tsx scripts/real-model-comparison.mjs /tmp/new-real-comparison
```

这些是工程执行命令，不要求参与者安装或操作。该有费用工具只在明确执行模型验收时手动使用，普通install/start/check不会运行。先32个独立配对案例，再在无访问/生成/状态失败时执行认知/情感各25轮连续语言诊断；预计64＋100正常生成，最大328实际HTTP尝试，不会开启30人真实并发。

两模型共同temperature0.2、max_tokens512、timeout10000ms、max_attempts2。记录实际HTTP状态、请求/返回模型、usage、原候选、最终呈现及原Guard标签；usage缺失保留未提供，最终费用以供应商账单为准，不将“记录tokens0”当作零费用证明。共享参数不因某模型失败而暗改。

400/401/403/404作为配置/访问错误停止后续外部请求；被控制器跳过的案例与生成兜底不算真实模型完成案例。失败运行的比较时延/流程错误率/状态违规数均为null，独立保存HTTP失败时间。429/5xx/网络错误按原Orchestrator预算记录，不扩大重试上限。

## 研究边界与人评

原32案例使用demoPolicy，保持双方完整初始Prompt相同；不是正式冻结研究Prompt验收。连续模式使用mentorPolicy、认知REFRAME_MEDIA_ALGORITHM/情感RELATIONSHIP当前阶段，25轮保持阶段不变；双方基础政策/状态/当前输入相同，各有自己的历史。完整Prompt在自然回复不同后可能不同，不能声称始终完全一致。Context Manager仍只投影有限近期历史；保存25轮不代表读取全历史或完成实验全路径。

报告流程错误率是现有Validator跨尝试标签代理，状态违规数指生成前后快照变化。后端只接收自然文本，因此零快照变化不代表模型可以自主正确推进阶段。评分/观点确认/正式状态转移仍由原平台控制，不变更冻结参数。

六维人工评分为中文清楚、逻辑、指代、不重复、实验一致性、非标准表达理解，1–5或null；真实样本按来源SHA生成独立审核表，记录审核人/时间/问题等级与意见。研究者未评分时保持null，不按时延或模型名称自动选“最佳模型”。人工完整路径体验、线上并发/持久化及导师放行另有条件。
