# DeepSeek Flash Acceptance Report（第21次交付）

日期：2026-10-12（北京时间）。[原始附件](inputs/round21-deepseek-flash-requirements.docx)题名为“第二十轮”；本目录新增单模型专项，历史双模型资料未覆盖。

**结论：pilot_ready=false、formal_ready=false。真实smoke未发送，正式Prompt未冻结，人工语义审核未执行。GPT／双模型比较不作为本轮阻塞。**

## 实际配置与模型标识

请求目标deepseek-flash、provider=deepseek、兼容根地址https://api.deepseek.com/v1，参数沿用0.2/512/10000ms/总预算2；单次smoke预算固定1、无重试。非秘密模型/地址在执行命令的环境中明确设置。机器DEEPSEEK_API_KEY未注入；聊天密钥没有复制进程序或材料。[环境证据](acceptance/step6-round21/environment-check.json)。

[实际smoke报告](acceptance/step6-round21/deepseek-flash-smoke.json)退出2/not_run，Adapter尝试0、外部调用0、request_sent=false；HTTP状态、response_model、latency_ms全null，无成功示例。用户称路由V4.1 Flash，未获得供应商响应证明，程序不据配置作版本推断。[标识对应](acceptance/step6-round21/model-identity.json)。

测量方法与普通generate共用现有HTTP路径，不绕过Adapter；新增可选per-call测量保持并发隔离、请求模型与响应字段分离、错误受控。失败不重试/不自动跑全套实验。未发现真实协议不兼容证据，不盲目新建协议适配器。无streaming开发、没有启用thinking参数，也不声称内部行为已被实测关闭。

## 测试与性能

| 验收                           | 本轮结果                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| 类型/lint/格式/构建及完整check | 通过，退出0                                                                   |
| Vitest                         | 435 passed、0 failed/skipped，新增9项smoke/元数据/性能测试                    |
| Playwright                     | 15 passed、0 failed/skipped，真实Chromium/Vite/Express/PostgreSQL             |
| 总计                           | 450 passed；业务/API67项及7张截图留存                                         |
| 本机HTTP业务                   | 认知/情感18语言回合，状态/变量不因回复变化；非真实DeepSeek                    |
| 干扰/压力/恢复                 | 10类干扰、三路径各30轮/6人各5轮共120回合；API重启、刷新、重放、超时和故障回归 |
| 真实延迟/人工语义              | 样本0，P50/P95/max/超过3s/5s/评分均未测量                                     |

[完整测试](acceptance/step6-round21/test-results.json)、[浏览器](acceptance/step6-round21/browser-results.json)、[性能统计](acceptance/step6-round21/latency-report.json)、[汇总](acceptance/step6-round21/summary.json)。新增注入测试证明不同响应model不会被猜成请求名；缺model仍null，401/400/500只一次请求、不泄露私密错误，超时/空回复/格式错误停止，P50/P95/长尾计算准确。注入传输不属于真实供应商请求。

## 真实路径与研究要求差异

[真实认知结果](acceptance/step6-round21/real-cognitive-result.json)、[真实情感结果](acceptance/step6-round21/real-emotional-result.json)均not_run，无真实对话。现有业务验收明确使用演示图书馆/StagePolicy，不能代替正式美国黑人角色故事或研究者刺激材料。没有凭附件自行签核Prompt。

[逐项差异](acceptance/step6-round21/research-requirements-gap.json)记录缺正式Prompt/prompt_version、四重构规定互动轮数、来源字段/正式量表、行动对象、开场/人物命名/固定场景骨架、气泡最终组装与终止反馈等验收缺口。当前core按明确合法表单推进，并没有研究者尚未给定的最低互动轮数门槛；不能声称短句“是的”一定不会提前推进。评分由后端表单触发是工程已验证能力，正式尺度/构念判别仍待审核。

认知确认观点/两次评分来源和四重构、情感scene_phase/明确场景来源的本机结构检查继续通过，不证明自然语言没有观点替换、错误归类、剧情回流或重复。completed拒绝后续正常对话等既有约束回归不等于正式告别语义批准。

本轮未改core、编排、Validator、Prompt、业务服务、数据库/迁移或前端，无新依赖，锁文件不变。业务model_runs仍只记录请求配置的model_name，response_model测量尚未串联到真实业务归档；比较工具记录原始候选不意味着单模型业务已实现同样保留。上述差异不通过虚构数据解除。

## 语义表与放行结论

[真实审核表](acceptance/step6-round21/real-model-semantic-review.md)记录0条，人工评分/审核者/日期为空；Word同内容。原始候选、最终输出及Validator只有实际存在才能审阅，不能人工补造。本机报告/演示不能当真实语义结果。

先安全绑定新DEEPSEEK_API_KEY，运行一次技术smoke；成功后提供并冻结正式StagePolicy和研究约束，才进行真实业务/历史回归及人工签核。失败停止，具体层级不能确定就明确未确定，不修改实验逻辑规避。操作详见[指南](round21-deepseek-flash-guide.md)。

未达到真实模型Pilot或正式实验条件，依据为真实smoke未通过、正式研究材料与约束未验收、语义签核未完成；进一步还有全量导出complete=false/1000、目标持久库/HTTPS/权限/备份/容量和退出方案。ZIP包含整个源码、历史成果、原始/反馈/报告/审核Word和本轮机器证据、截图，无明文密钥。
