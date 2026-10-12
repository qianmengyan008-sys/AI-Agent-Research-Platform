# 第22次交付：DeepSeek接入后的只读核查与修改范围确认

日期：2026-10-12（北京时间）。[原始附件](inputs/round22-post-deepseek-feedback.docx)题名为“第21次反馈_DeepSeek接入后优化建议”。本次新增目录保留历史交付，未覆盖第21次Flash专项。

**本轮只交付核查、计划和证据；没有执行附件中的优化修改。用户明确要求先确认范围，发布GitHub材料不视为代码修改授权。**

## 给 GPT 的反馈

DeepSeek安全Secret已经接入，前一个独立授权请求完成一次真实smoke：requested_model与response_model均deepseek-flash、HTTP200、首可见token2260.68ms、总响应2277.17ms、请求1/重试0。此次把已保存结果纳入ZIP，没有再调用模型。临时流式测量不等于平台已经实现生产流式输出，也不证明正式实验或语言质量通过。

当前申请研究者先确认下列四项：现有状态机、Prompt位置、计划文件及重跑测试。代码、Prompt、状态定义、数据库、前端均保持原样；批准后再小步执行。阶段数、互动次数、人物/开场和量表属于研究设计，不由LLM或本轮交付擅自定稿。

## 1. 当前状态机结构

定义在 packages/experiment-core/src/definitions.ts，纯迁移在 transition.ts。三条v1路径共享INIT、COMPLETED和确定性迁移框架：

| 路径         | 当前准确节点顺序                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| cognitive_v1 | INIT → STEREOTYPE_CAPTURE → VIEWPOINT_CONFIRMATION → INITIAL_RATING → REFRAME_SOCIAL_STRUCTURE → REFRAME_MEDIA_ALGORITHM → REFRAME_COUNTER_FACT → REFRAME_INDIVIDUAL_DIFFERENCE → SECOND_RATING → ACTION_INTENTION → COMPLETED |
| emotion_v1   | INIT → PERSONA_SETUP → FIRST_CONTACT → MISUNDERSTANDING → RESOLUTION → SHARED_EXPERIENCE → RELATIONSHIP → ENDING_FEEDBACK → COMPLETED                                                                                          |
| daily_v1     | INIT → NATURAL_CHAT → COMPLETED                                                                                                                                                                                                |

后端合法明确提交才能进入紧邻下一节点。纯core检查路径/版本/定义签名、事件允许性、数据类型、事件重放及终止状态；模型没有事件写入接口。聊天只改变对话记录/修订，不推进core。

来源目前是STEREOTYPE_CAPTURE的可选字段，不是独立SOURCE节点。四重构没有“至少两轮”的提交门槛；评分目前由后端number表单提供，不是专用评分卡片。附件说“四条路径”，实际只实现三条；不擅自创建第四条。

## 2. 当前 Prompt 文件位置

| 位置                                               | 职责                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| packages/ai-orchestrator/src/prompt-builder.ts     | 系统边界、当前阶段任务、必要记忆拼接；PROMPT_VERSION=stage-language-v3，模型不接收完整状态机定义 |
| packages/ai-orchestrator/src/stage-policies.ts     | 当前goal/角色/场景/禁用语言/兜底；现有demoPolicy明确是工程演示材料                               |
| packages/ai-orchestrator/src/context-manager.ts    | 固定观点/场景变量和近期对话的受控投影                                                            |
| research.prompt_version数据库表                    | 保存每stage的实际StagePolicy、版本、policy JSON及哈希                                            |
| apps/api/src/repositories/experiment-repository.ts | 生成stage-language-v3-<policy hash>版本，并固定到condition_prompt                                |

固定实验开场目前来自实验配置instructions，不是独立已确认的开场文本文件。正式研究StagePolicy可以通过现有管理员条件配置接口提供；演示库的图书馆场景不自动成为正式故事。已发布条件和既有分配版本不能原地改写。

## 3. 拟修改文件和边界（未执行）

建议按三小步实施，先确认整体范围再逐步审阅结果：

| 小步              | 拟修改/新增文件                                                                                                              | 修改原因/范围                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 当前stage语言草稿 | 新增docs/research-prompts/round22-stage-policies.json；研究语料测试                                                          | 支持口语/省略主语/多观点和更多刻板表达，区分社会处境/元认知，不替用户造负面观点；减少机械重复、明确行动对象。先待研究者审核，不自动发布 |
| 后端互动门槛      | apps/api/src/services/participant-service.ts、repositories/conversation-repository.ts                                        | 当前四重构至少2完整回合才允许明确提交，聊天仍不推进状态；失败/超时/重复不计数                                                           |
| 固定门槛配置      | services/experiment-service.ts、repositories/experiment-repository.ts、repositories/state-repository.ts（均在apps/api/src/） | 使用已有版本化配置保存/读取门槛，仅应用到批准的新配置，不静默覆盖旧分配                                                                 |
| 评分卡片          | packages/contracts/src/index.ts、apps/web/src/Participant.tsx、styles.css；新增评分卡片组件                                  | 后端仍控制初次/二次评分表单，明确展示专用卡片；数字必须合法提交，不能靠LLM普通文字替代                                                  |
| 气泡呈现          | Participant.tsx、contracts；新增气泡组件/组装辅助；必要时services/conversation-service.ts                                    | 单回合最终显示不超过3气泡，不追加未校验控制话术或probe，保留原始完整文本                                                                |
| 管理员诊断        | apps/api/src/services/admin-service.ts、repositories/conversation-repository.ts、apps/web/src/Admin.tsx                      | 只读显示当前scene/state、完成节点、下一目标、触发原因；管理员认证/默认关闭/参与者隔离保持                                               |
| 配套测试与文档    | API业务、Prompt/语料、浏览器测试及本轮说明                                                                                   | 每步记录原因、案例和影响；不把人工语义评分自动标通过                                                                                    |

以上是提案，不代表文件已经改动。现有core的阶段名/顺序/迁移算法、Model Adapter和编排主流程不计划修改；不整体重构。暂不计划数据库迁移；如果核实已有结构不足，将先提出必要增量范围。

计数建议：当前stage、当前固定session/core版本中的已持久化完整user–assistant成功回合；重复请求只计一次、失败和超时不计。兜底是否计有效回合需研究者明确。固定开场、角色姓名规则、正式量表未提供前不编造。还需澄清第四条路径。

## 4. 批准后将重跑哪些测试

| 测试                                                                                                | 重点                                                                                           |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| experiment-core/tests/definition.test.ts、transition.test.ts                                        | 同一版本节点不跳过/回退、错误事件/重放/终止、已有变量不被语言替换                              |
| ai-orchestrator/tests/context-and-prompt.test.ts、response-and-orchestration.test.ts及历史round用例 | 当前stage投影、口语/省略/多观点、范围外表达、流程质疑、短句、结束请求、无意义输入、重复/控制语 |
| apps/api/tests/business.test.ts及数据库测试                                                         | 两轮门槛、计数范围/重放/失败/并发/恢复、评分与来源、条件版本固定、诊断授权                     |
| apps/web/tests/browser.spec.ts及新增组件验证                                                        | 专用评分卡片、不得文字跳过、气泡数量、刷新恢复、诊断隔离、completed终止                        |
| npm run check                                                                                       | 类型、lint、格式、全部Vitest、工作区构建、真实PostgreSQL和浏览器                               |
| 明确授权的DeepSeek真实采样/人工审核                                                                 | 固定批准Prompt、预算/条件，记录语言、逻辑、指代、重复和实验忠实度；真实调用不放进常规check     |

本轮没有运行这些计划中的回归测试，没有新的真实模型采样。历史第21次450项测试通过保留为历史证据，不能说成此轮已重跑。

## 本次已交付和待确认

已交付：只读核查、精确源码索引、拟改范围、测试计划、原始附件、既有真实smoke结果、文档/Word/ZIP完整性验证。详见[交付验收报告](twenty-second-round-delivery-report.md)、[状态汇总](acceptance/step6-round22/summary.json)。

待确认：修改范围、第四条路径、固定开场/角色命名、正式量表、有效互动/兜底计数及是否只对新条件启用。程序优化、正式Prompt冻结、完整真实两路径和人工语义仍未完成。pilot_ready=false、formal_ready=false；smoke成功不替代这些条件。

下载整个项目ZIP后，可将此反馈和源码整体上传GPT。本轮Word与Markdown同内容，材料中不含明文密钥。
