# 第十六轮反馈：Step 6 真实业务验收与正式部署前准备

日期：2026-10-11（北京时间）。按[本轮原始要求](inputs/sixteenth-round-requirements.docx)完成真实模型业务／数据库验收入口、正式清单和专项回归。**真实模型实际状态仍为 not_run，不能宣称正式验收通过。**

## 给 GPT 的反馈

新增 npm run live:business:e2e -- /tmp/round16-real-business.json。它使用实际 Adapter 经编排、真实业务 HTTP、合法 core 提交和临时 PostgreSQL 跑两条完整路径，报告固定模型参数、延迟／重试／Validator／兜底、状态事件变量、调试与导出。缺密钥或模型名时退出 2，在任何数据库／模型访问前记录 not_run；默认 mock 会改选 OpenAI 兼容真实接口。

| 修改原因                           | 文件                                                                                                                       | 是否影响实验设计                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 旧真实入口未覆盖完整业务数据库链路 | apps/api/src/acceptance/business-acceptance.ts、apps/api/acceptance/live-business-e2e.ts、package.json、API tests tsconfig | 新增手动合成验收，不启动正式实验，不改状态机／编排／Adapter／migration |
| 导出明确要求 model_run_log 名称    | AdminService                                                                                                               | analysis_rows 增加与 model_runs 相同的兼容别名，无新表或调用           |
| 真实入口和异常门禁必须能失败       | business.test.ts、browser.spec.ts                                                                                          | 新增 6 项 API／服务、1 项连续刷新浏览器用例，全部合成数据              |
| 环境与正式语义审核必须分开         | experiment-acceptance-checklist.md、本轮完整报告／机器结果                                                                 | 区分 passed、not_run、blocked、pending_researcher_review               |

Participant／Admin 页面交互、纯状态机、编排、Adapter、既有 migration 和依赖未改。测试发现 JSON 回执字段排序会被原型验收误判，已改内容深比较；原服务幂等回执语义未改变。

## 八项交付

[完整报告](step6-round16-acceptance.md)依次提供真实模型报告、acceptance checklist、认知结果、情感结果、导出示例、压力结果、阻塞问题与正式就绪判断。[验收目录](acceptance/step6-round16/)保存实际 not_run 报告、本机 HTTP 完整业务报告、拦截／失败／取消超时／延迟门槛、专项数据、恢复、压力及六张真实截图。Word、原始要求和历史成果纳入整个项目 ZIP。

| 验收               | 实际结果                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| 真实模型命令       | 实际执行，退出 2／not_run，缺 MODEL_API_KEY 和 MODEL_NAME；外部调用 0，数据库未启动                    |
| 本机完整 HTTP 业务 | 18 次 Adapter 调用，两路径完成；认知 9 明确阶段／20 消息，情感 7 明确阶段／16 消息，含两类中断额外回合 |
| 异常与门槛         | 违规拦截进入 guarded；失败／取消超时不推进 state；刻意极小延迟门槛正确判失败                           |
| Vitest             | 407 passed、0 failed、0 skipped、15 文件；API／业务 65 项                                              |
| Playwright         | 14 passed、0 failed、0 skipped；新增 3 次刷新一致性                                                    |
| 合计               | 421 passed；本轮新增 6 项业务、1 项浏览器测试                                                          |
| 压力／恢复         | 3 路径各 30 轮、6 人并发，120 合成压力回合；真实 SIGKILL／新连接／刷新恢复通过                         |
| 完整性／调试       | 8 类计数正常为 0，故障必须报错；管理员只读日志继续与参与者隔离                                         |
| 工程检查           | npm run check 全部通过：类型、lint、格式、测试、构建、浏览器；结果在 summary                           |

本机固定回复只能证明接口和后端控制链路，不能证明真实模型不生成新观点、剧情回溯或提前结局。评分对象的固定赋值可结构验证，语义仍需研究者逐条审核。latency_ms／p50／p95 是本机合成测量，不是正式真实模型体验数据。

## 当前正式结论与下一步

**formal_ready=false。** 模型密钥需求已有但未绑定，模型名未配置；正式持久数据库／管理凭据／部署未配置。导出仍 complete=false／每类 1000，新增别名不解除全量归档阻塞。正式量表／必填字段／结构化场景／拒答退出方案、真实语义与持续容量、备份／权限验证仍待完成。

建议 GPT 先审核[验收清单](experiment-acceptance-checklist.md)，指导在安全环境设置中完成模型配置并手动执行新命令，审核真实结果，再安排全量导出、正式研究 schema 和目标环境验收。配置草稿保存不等于发布或绑定凭据。
