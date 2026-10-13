# 导师测试版实验参数 PDF：冻结与落实报告

2026-10-13（UTC），第25次交付。PDF由用户作为前一参数询问的答复提供；随后明确确认评分/观点仍必答，其他阶段按批准兜底处理。

本项目独立实现这些参数。PDF中的WorkBuddy经验仅作背景，没有连接、修改或复用WorkBuddy代码、数据库、服务或密钥。

## PDF逐项落实

| PDF要求                             | 配置/实现                                                | 实际验证和边界                                                                                           |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0–100、步长1、两端锚点、固定提示    | research/mentor-test-v1.json rating；RatingCard；API守卫 | 两次复用同组件，0/100接受，小数/越界拒绝；确认对象冻结                                                   |
| State1获取印象与来源，2–5轮         | capture_confirmation组合计数                             | 原STEREOTYPE_CAPTURE和VIEWPOINT_CONFIRMATION顺序保留，共享计数；来源询问在当前语言政策，来源答案显式保存 |
| 第一次/第二次评分1–3轮              | INITIAL_RATING/SECOND_RATING                             | 未填必答评分不能推进；上限后不开放无限聊天；固定提示仅首次，后续为填写提醒                               |
| 四重构依次2–3轮                     | 四个原有REFRAME节点                                      | 少于2拒绝提交；第3个有效回应到上限后后端按顺序完成；没有模型生成迁移指令                                 |
| 行动意愿2–4轮、特定对象             | ACTION_INTENTION，目标美国黑人刻板印象                   | 真实20轮链路包含指定对象；实际语义仍待人工审核                                                           |
| 上限/两次无信息纠偏与中性推进       | 业务规则和backend事件/missing_data                       | 用户确认的评分/观点必答例外保留；不能把缺失数据当正常答复；失败/询问不计算有效轮次                       |
| Marcus/李阳、固定身份，仅个性化补充 | characters/traits配置、当前阶段政策、角色变量            | 身份参数由冻结配置保存，不由模型修改；用户补充与固定身份区分。生成文本是否完全遵守仍需人工压力审核       |
| 固定开场和4场景                     | opening、scenes与当前阶段桥接                            | 图书馆→食堂→自习室→校园散步；MISUNDERSTANDING/RESOLUTION同属食堂；首回复加入时间/地点/动作桥接并再次校验 |
| 人物约2轮、故事11–14轮、结束不提问  | persona2，故事合计范围，固定closing                      | 真实情感14轮、故事11轮；最终告别由本地模板，后端终态拒绝重开                                             |
| research_config不写整个Prompt       | 模板保存research_config；当前阶段政策投影                | 配置决定必须完成什么；模型只获得当前阶段语言任务与必要记忆                                               |

## 与原状态机的映射

| PDF研究节点                     | 保留的程序节点                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| 认知State1                      | STEREOTYPE_CAPTURE→VIEWPOINT_CONFIRMATION                                                           |
| 认知State2                      | INITIAL_RATING                                                                                      |
| 认知State3-1到3-4               | REFRAME_SOCIAL_STRUCTURE→REFRAME_MEDIA_ALGORITHM→REFRAME_COUNTER_FACT→REFRAME_INDIVIDUAL_DIFFERENCE |
| 认知State4 / State5             | SECOND_RATING / ACTION_INTENTION→COMPLETED                                                          |
| 情感人物建立                    | PERSONA_SETUP                                                                                       |
| 图书馆初遇                      | FIRST_CONTACT                                                                                       |
| 食堂误会和解除                  | MISUNDERSTANDING→RESOLUTION                                                                         |
| 自习室共同点 / 校园散步关系形成 | SHARED_EXPERIENCE / RELATIONSHIP                                                                    |
| 情感收尾                        | ENDING_FEEDBACK→COMPLETED                                                                           |

没有增加路径或场景，没有修改核心状态机定义、事件、Validator或Model Adapter。情感每个内部场景未被擅自指定新的研究最少/最多表；整体11–14限制及后续容量保留是业务实现，正常场景节点须有有效用户输入。

认知总有效轮次表为14–27，PDF20–25为预计值；最终验收选择20轮。若以后要求总数严格20–25，应新批准版本，不能暗改现有分配。异步恢复30秒/240秒是工程等待限制，不是研究互动轮次。

## 版本、使用与剩余门禁

在新建实验API的请求中指定research_profile为mentor-test-v1；新建条件指定已有path_version，不再传demo_policies或自定义policies。发布后配置/政策不可原位变更，已有旧实验和分配继续保持旧配置。

配置文件、配置哈希、受测代码SHA、每阶段Prompt版本、模型参数和逐轮来源随验收/导出留存。[发布候选清单](acceptance/step6-round25/release-manifest.json)记录冻结代码5b7a21655074975b2b4705d9ccf4c9df86d94c59。部署时RESEARCH_CODE_COMMIT应使用实际代码提交，真实验收已注入该值。

实现和工程链路已验证；人工自然度、场景语义、非脚本体验与持续速度门禁尚未完成。因此本文件是参数落实成果，不代表导师已放行或正式实验批准。完整证据见 [本轮报告](twenty-fifth-round-delivery-report.md)。
