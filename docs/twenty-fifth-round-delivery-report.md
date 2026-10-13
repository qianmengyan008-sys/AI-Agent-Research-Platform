# 第25次交付验收报告：导师整改与 PDF 参数落实

2026-10-13（UTC）。受测最终代码提交：5b7a21655074975b2b4705d9ccf4c9df86d94c59。最终GitHub交付会在该代码上追加本报告与验收档案；代码内容保持一致。

本轮完成必要整改及用户PDF参数落实，未扩展模型、美化、流式或额外场景。导师候选工程链路已准备；人工语义和非脚本体验尚未验收，导师测试未放行。

## 1. 实际修改范围

| 文件                                                                                     | 修改理由与影响                                                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| research/mentor-test-v1.json                                                             | 用户量表/轮次/角色/场景/结束与兜底边界，作为版本化配置                                   |
| apps/api/src/services/research-profile.ts                                                | 当前阶段语言政策、有效输入分类、评分/轮次规则；不向模型传完整流程                        |
| apps/api/src/services/experiment-service.ts、repositories/experiment-repository.ts       | 新模板显式选择导师配置，冻结条件政策，旧分配不变                                         |
| apps/api/src/services/participant-service.ts                                             | 统一评分投影和范围验证、最少轮次、已识别流程询问不作为剧情填写                           |
| apps/api/src/services/conversation-service.ts                                            | 最多轮次、固定开场/告别、桥接、元询问回应、后端合法上限/中性转场、来源记录               |
| apps/api/src/services/research-variables.ts                                              | 导师角色/场景变量来自固定配置与参与者补充，旧版本保持原语义                              |
| apps/api/src/repositories/conversation-repository.ts、services/admin-service.ts          | 有效轮次查询、回复来源、完整快照导出/数量/配置/定义/回合，诊断显示仍限量                 |
| apps/api/src/acceptance/business-acceptance.ts                                           | 旧验收工具也要求complete=true，不再硬编码限量导出                                        |
| apps/api/acceptance/mentor-profile-e2e.ts                                                | 冻结配置的隔离真实/本地链路，逐轮重放检查与失败留档                                      |
| apps/web/src/RatingCard.tsx、Participant.tsx、packages/contracts/src/index.ts            | 两次同评分卡及最小契约变更、整数范围、生成等待清理                                       |
| apps/web/src/api.ts、Admin.tsx                                                           | 截止/取消/恢复提示，完整导出说明                                                         |
| apps/api/tests/business.test.ts、client-deadline.test.ts、apps/web/tests/browser.spec.ts | 配置隔离、评分、轮次、元询问、合法自动转场、三轮不同兜底、完整导出、超时及评分卡行为验证 |

共19个代码/配置文件变更，另有README/docs。本轮未改experiment-core、AI Orchestrator、基础Prompt装配器、Validator、Model Adapter、数据库迁移、依赖或锁文件；没有接触WorkBuddy。共享服务覆盖三路径回归，日常控制条件未加干预。

## 2. 逐项验收判定

| 标准                    | 实际结果                                                                                | 判定                                               |
| ----------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 参数/版本可复现         | research_config入库并绑定新分配；配置/政策哈希和代码SHA留存；旧分配不变                 | 工程通过，导师发布审批仍待人工                     |
| 两次统一量表且必答      | 0–100整数、步长1、固定提示/锚点；同确认对象；越界/小数/缺失不能推进                     | 通过                                               |
| 程序轮次守卫            | 未达最少拒绝；最大开放次数有限；无信息中性转场记录backend/missing_data；评分/确认不补造 | 通过；语义有效信息由有限规则识别，仍需自然输入审核 |
| 认知重构顺序            | 真实20轮走全部四重构；合法状态事件10，观测非法迁移0                                     | 流程通过；语言效果待人工                           |
| 情感固定流程            | 固定人物、四场景、当前桥接、收尾；真实14轮，其中故事11轮；8合法事件                     | 工程通过；任意输入的场景/身份语义待人工            |
| 无无限等待/恢复         | 请求/响应体截止、取消、总轮询停止、同ID恢复、租约/进程/重载回归                         | 工程通过；连续真实服务稳定性待采样                 |
| 状态可追踪              | 管理员鉴权、只读状态/事件/耗时/异常/来源；不暴露参与者内部状态                          | 通过基础追踪，未美化                               |
| 完整对话导出            | 1010源库消息=1010导出，逐条id/内容/顺序相同；快照包含配置/状态/变量/模型日志/回合       | 工程通过；同步JSON大规模容量未验收                 |
| 人工语言评分/非脚本体验 | 尚未执行，评分值为空                                                                    | 未通过放行门禁                                     |

总体mentor_test_ready=false、pilot_ready=false、formal_ready=false。没有发放导师账号、邀请测试、部署正式实验或采集真实参与者。真实测试账号仅在临时隔离数据库中创建并清理。

## 3. 最终真实调用结果

| 项目           | 结果                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| API/model身份  | 最终37次外部请求均HTTP200、响应deepseek-flash；内部供应商revision仍未知                                         |
| HTTP请求耗时   | P50 4636.70ms，P95 5193.83ms，最大5231.06ms；含读完响应体，不是首token                                          |
| 认知数据       | 20有效互动轮，40消息，10事件，终态COMPLETED；7重试、4兜底；原因含BELIEF_ANCHOR_MISSING、EMPTY_REPLY             |
| 情感数据       | 14轮，28消息，8事件，终态COMPLETED；其中人物2/故事11/收尾1，重试0、兜底0                                        |
| 所有消息重放   | 响应相同，无额外外部调用；含上限自动转场后的重放                                                                |
| 状态/导出/代码 | 观测非法迁移0；两路径complete=true、数据质量通过；所有run.code_commit为5b7a21655074975b2b4705d9ccf4c9df86d94c59 |

这是一批合成中文口语输入，既非真实参与者，也不是研究者非脚本自由体验。认知4次兜底需审核是否充分完成该阶段任务；不将“被校验保护”当作“原模型输出正常”。没有填入人工语言分数。

## 4. 已保留的中间问题

本轮真实调用共90次：早期两路径完成29次；中间一次受阻24次；最终冻结版本完成37次。中间失败为GENERATION_NOT_READY，HTTP200不等于可用回复。旧脚本没保留该失败路径完整快照，无法确认单一根因，本轮已修补后续失败留档。

发现并修复确定的容量不足：三轮重构只有两候选，可能因重复全部耗尽。补足当前阶段内容不同的候选并用连续无效输出证明三轮都可恢复；没有降低Validator断言。另有初次新增测试类型错误、评分提示重复回归及归档JSON格式问题，均修复后最终检查通过，历史尝试保留。

## 5. 自动化与实物证据

448项Vitest、18项Playwright最终通过，失败/跳过0、flaky0；typecheck、lint、format、build退出0。隔离PostgreSQL17.7、Chromium和Mock/本地HTTP验证与真正外部调用分别留档，不混同。

| 成果                 | 链接                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本轮反馈             | [Markdown](twenty-fifth-round-feedback.md) / [Word](twenty-fifth-round-feedback.docx)                                                                                                                                      |
| PDF落实反馈          | [Markdown](mentor-parameters-freeze-feedback.md) / [Word](mentor-parameters-freeze-feedback.docx)                                                                                                                          |
| 本验收报告           | [Markdown](twenty-fifth-round-delivery-report.md) / [Word](twenty-fifth-round-delivery-report.docx)                                                                                                                        |
| 两份原始输入         | [DOCX](inputs/round25-mentor-remediation-requirements.docx) / [PDF](inputs/round25-mentor-parameters.pdf)                                                                                                                  |
| 真实原始记录与指标   | [最终完整记录](acceptance/step6-round25/mentor-profile-real-e2e.json) / [指标与历史尝试](acceptance/step6-round25/real-acceptance-metrics.json)                                                                            |
| 程序/浏览器证据      | [Vitest](acceptance/step6-round25/test-results.json)、[Playwright](acceptance/step6-round25/browser-results.json)、[命令](acceptance/step6-round25/engineering-checks.json)                                                |
| 针对性实物           | [1010消息源库对比](acceptance/step6-round25/complete-export-acceptance.json)、[三不同兜底](acceptance/step6-round25/mentor-distinct-fallbacks.json)、[评分卡截图](acceptance/step6-round25/mentor-unified-rating-card.png) |
| 版本/门禁/文件完整性 | [发布候选清单](acceptance/step6-round25/release-manifest.json)、[门禁](acceptance/step6-round25/mentor-gates.json)、[校验](acceptance/step6-round25/delivery-validation.json)                                              |
| 下一步人工工作       | [审核清单](mentor-human-review-checklist.md)                                                                                                                                                                               |

本轮9张浏览器截图均为合成Mock账号的真实页面渲染，不能说成真实模型或导师体验截图。完整导出不截断；后台查询与诊断仍是每类1000条、complete=false的显示视图。

## 6. 下载与后续

最终GitHub固定提交ZIP包括受版本控制的整个项目、本轮三份反馈/报告Word、原始DOCX/PDF、JSON/截图和历史成果。解压后先读docs/twenty-fifth-round-delivery-report.docx与docs/mentor-parameters-freeze-feedback.docx；网页可直接读Markdown。

后续先由研究者审阅真实记录及认知兜底，再做非脚本体验和速度标准确认，满足门禁才提供导师账号。无需再扩大功能或重构架构。
