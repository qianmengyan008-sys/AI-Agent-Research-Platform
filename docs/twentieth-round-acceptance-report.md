# 第二十轮 Acceptance Report：模型切换和配对对比

日期：2026-10-11（北京时间）。依据[用户要求](inputs/twentieth-round-requirements.md)。**工程验收通过；真实 GPT／DeepSeek 对比 not_run，人工评分未验收，pilot_ready=false、formal_ready=false。**

## 环境与范围

Node24.19.0、npm11.9.0、Docker28.4.0、Chromium154.0.8037.57；业务回归使用隔离 PostgreSQL17.7。依赖按既有锁文件，npm ls --depth=0成功，无新依赖／迁移。两家 scoped 密钥和模型名及旧通用模型变量均未注入，不能用配置草稿声明代替实际绑定。[环境](acceptance/step6-round20/environment-check.json)、[依赖树](acceptance/step6-round20/dependency-tree.json)。

应用变更只在 Model Adapter 配置与独立对比验收工具；experiment-core、AI Orchestrator、Validator、Prompt、业务服务、数据库、前端未修改。[文件与实验设计影响](twentieth-round-feedback.md)逐项说明。

## 真实模型对比结果

实际执行对比入口返回2／not_run，缺 GPT_API_KEY、GPT_MODEL_NAME、DEEPSEEK_API_KEY、DEEPSEEK_MODEL_NAME，外部调用0、记录0。两家均无已执行的具体模型或成功示例。

| 模型     | 真实延迟     | 真实流程错误率 | 实际状态违规 | 人工语言评分 |
| -------- | ------------ | -------------- | ------------ | ------------ |
| GPT      | null／未测量 | null／未测量   | null／未测量 | null／未审核 |
| DeepSeek | null／未测量 | null／未测量   | null／未测量 | null／未审核 |

[实际真实报告](acceptance/step6-round20/real-model-comparison.json)、[实际对比表](acceptance/step6-round20/real-model-comparison.md)。缺失项不是0分、0%或0次违规，不提供虚构优劣结论。

## 同组案例与工程验证

两条路径全部16个当前阶段，加既有16个回归输入，每家32个案例、共64条。每组初始Prompt哈希一致；合法前置状态、输入、策略和参数一致，独立快照、交替顺序。当前阶段生成不推进模型控制状态；无需修改实验流程。[套件与本机完整记录](acceptance/step6-round20/fixture-model-comparison.json)。

本机演示两家标签各32次Mock调用，共64次，外部调用0，状态违规0、规则流程错误0、兜底0；不同合成措辞和本机耗时仅验证工具，不能视为供应商对比。人工评分全部null。每条保留原始候选与最终输出（包括兜底），区分模型原始质量与系统保护；失败不保留供应商私密异常正文。每条保留输入／输出、Prompt哈希、日志参数、耗时、重试、Validator与fallback以及人工待填写字段。

新增9项测试确认：scoped密钥／地址／模型选择正确且不泄露；通用配置兼容；选定密钥缺失不会拿另一家密钥；参数不一致或模拟伪装真实被拒绝；两家注入HTTP传输共享初始输入；违规候选被统计但状态不变；生成失败不漏案例；配置缺失即使有通用密钥也不运行比较。[测试](acceptance/step6-round20/test-results.json)。这些传输是注入测试，不是外部HTTP调用。

## 完整回归和冻结边界

426 Vitest＋15 Playwright＝441 passed、0 failed／skipped。类型、lint、格式、所有工作区构建与完整 npm run check通过。业务／API67项、8类SQL正常完整性、15个错误导出副本、10类干扰与恢复回归重新执行。三路径各30回合加6人各5回合并发，共120本机压力回合；这些证据不衡量供应商性能。[汇总](acceptance/step6-round20/summary.json)、[浏览器](acceptance/step6-round20/browser-results.json)、[压力](acceptance/step6-round20/stress-results.json)。七张截图包含默认关闭、认证显式开启的管理员Pilot诊断；参与者无诊断。

导出字段、变量明确来源与状态事件链仍通过本机检查，但complete=false／每类1000，不是全量正式归档。状态违规计数与模型自然语言错误分开；后端无写入不证明模型不换观点、不暗示评分、剧情不回退或不重复。

## 人工语义与正式结论

认知需逐条审阅确认观点、同一评分对象、四重构、行动意愿和清晰指代；情感需审阅场景、阶段、不回退／预告、回应输入与重复引导。五维人工评分字段初始null，暂无真实记录、审核者或签核，不能补造分数。

优先在安全设置配置两家，再使用[操作指南](round20-model-comparison-guide.md)执行同组采样、人工盲评与批准的重复测试。模型名／参数必须账户支持且研究者批准。真实测试、人工签核、研究schema／退出、全量归档、目标库／HTTPS／备份／容量仍阻塞，未达到真实模型Pilot或正式实验条件。保持实验逻辑冻结，不通过改状态机“改善”模型比较结果。

整个项目ZIP包含此报告Word、反馈Word、真实对比表Word、输入要求、本轮JSON／Markdown及真实浏览器截图和全部历史成果。
