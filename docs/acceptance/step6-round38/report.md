# 第35次反馈验收报告（第38轮交付）

日期：2026-10-21。实现版本：`3631f8b393df62ccdc5470f3f9681353dc131906`；基线：`ff87369c55a27f8ff91b091d76767b8777cccaba`。反馈原文来自研究者本轮对话，归档摘要见 [需求](../../inputs/round38-chat-account-requirements.md)。

## 结果与验证范围

`npm run check` 已实际完成且退出0：类型检查、ESLint、Prettier、30个测试文件共477项测试、构建、25项Playwright浏览器测试全部通过。完整日志见 [最终检查](round38-final-check.log)，逐项浏览器结果见 [JSON](final-browser-results.json)。

认知与情感使用当前冻结 mentor-test-v1 方案，真实HTTP、临时Postgres和浏览器完成全部阶段；日常两个合成身份组分别完成、刷新并重新登录后身份与历史一致。评分通过原RatingCard显示并提交。用户消息立即出现在右侧、AI在左侧；等待、超时、失败重试、幂等与历史恢复有实际交互断言。手机宽390px检查无水平溢出。没有用静态截图替代交互测试。

模型生成由受控合成适配器提供，本轮未调用外部真实模型，未新增付费资源；因此不能把本轮结果等同真实模型语言质量、人类语义审查或正式研究放行。人工语义审查仍0/40，mentor_test_ready=false，formal_ready=false。截图与测试数据均为本地合成内容。

## 气泡规则

在后端生成和Validator校验、持久化之后，前端读取最终assistant文本调用统一 assistantBubbles。兼容转义换行与CRLF，去除空白段，每个非空换行段默认一个气泡；超过三段时第一、二段独立，第三段及以后原序合并为第三个气泡，不截断内容。评分等结构化卡片不进入文本拆分。数据库仍保存原消息；重载使用同一组装函数，数量、内容、顺序一致。识别到特定内部协议标记时呈现中性错误，不显示原始内部信息；这不是对所有自然语言泄漏的穷尽语义检测，也不替代原Validator。

自动化覆盖 A\nB\nC →3；A\nB\nC\nD →3且第三包含C、D；连续空行无空泡；转义换行、CRLF；内部标记防护；重载一致；评分卡可操作。拆分单元测试10项通过，账号及Excel专项2项通过；浏览器25项全部通过，含原18项与新增7项。

## 参与者界面与实验身份

左右聊天气泡、自动滚动、底部输入、发送即时显示、成功后清空、等待状态、失败超时同请求重试均已接入。原“当前填写/当前回答/表达来源”调试式区块替换为流程必需的内联确认或评分卡；不自动提交评分或跨越实验闸门。本人本阶段回复可预填确认内容，跨阶段不会带入旧文本。后台诊断和现有导出功能保留。

认知/情感不新增头像或身份标签。日常只读取已有参与者分配绑定的 condition → agent_version.configuration，可选显示身份与同源头像；不从模型内容推断。新增身份元数据仅适用于明确配置的新条件；不修改已冻结条件。A/B合成组分别显示各自抽象头像、称呼与身份，刷新/登录不串组。旧B001/B002配置若只有通用称呼，不会自动创造种族、国籍或正式人物信息；正式日常身份需使用研究方案批准的配置。

截图：[认知评分](cognitive-rating-inline.png)、[认知完成](cognitive-complete.png)、[情感故事](emotional-story-inline.png)、[情感完成](emotional-complete.png)、[日常A桌面](daily-identity-a-desktop.png)、[日常B手机](daily-identity-b-mobile.png)、[管理员账号管理](admin-account-management.png)。[全部截图索引](screenshots.md)。

## 批量账号与Excel

管理员在所选实验“编号管理”选择已发布路径与条件，界面只读展示该条件绑定的智能体及模型批次；数量、前缀、起始序号可选。不能在同一条件内任意更换模型/人物导致串组。后台一个事务完成唯一编号、随机密码哈希、原分配初始化与审计；失败整体回滚。用户名包含前缀+完整随机批次UUID+序号。复用既有数据库 UNIQUE(experiment_id, participant_code) 与唯一分配约束，加批次锁和重复请求拒绝；没有新增全局用户名索引。登录仍需实验UUID与账号共同定位。

登录Excel与分析导出分开，共9列：experiment_id、participant_code、initial_password、study_path、condition、agent、model_batch、batch_id、created_at。特别注意实验编号应填写Excel的 experiment_id（UUID），不能填写 cognitive_v1 等路径代号。Excel为标准OOXML、文本单元格、openpyxl实际读取通过，防公式执行；未使用办公软件GUI人工打开，因此不声称已经逐一验证Excel/WPS各版本。

初始密码仅在创建响应的下载文件中提供，数据库只有哈希、不在普通日志或分析导出中；响应禁止缓存，前端仅暂存Blob。文件丢失后新批量账号可重置并下载新Excel；撤销该账号旧会话、保留消息/状态/其他账号。原B001/B002固定种子账号继续从原 /operator 私下领取，本接口禁止重置这些账号，以免破坏原种子完整性校验。

[30个账号示例Excel](synthetic-login-accounts.xlsx) 仅包含已销毁临时数据库的合成账号，不能用于线上登录，不含真实被试数据。30个编号与随机密码各自唯一；从Excel任选两账号实际HTTP登录并同时发消息，消息、状态、turn访问隔离；另有真实浏览器双标签登录与聊天隔离。重置后的新密码可登录，旧密码与旧会话失效，另一个账号和既有消息不受影响。[专项结果](account-acceptance.json)。

## 失败与修正的真实记录

首次类型检查发现新账号条件未收窄，已修正；首次Lint发现XML控制字符清洗规则，已以字符过滤实现修正。原浏览器旧状态测试因即时气泡提前满足旧等待条件而过早读数据库，改为等待HTTP成功及持久化后断言，没有放宽结果要求。扩展回归中合成情感模型重复回复，11次尝试只有8次有效，原评分闸门正确拒绝推进；替换为不重复的合成回复后完整情感流程通过。管理员下拉可访问名称混入选项文字，增加明确aria-label后通过。首次完整检查还发现生成的证据JSON未格式化，已统一格式。初次失败日志保留，不标记为通过；最终全部回归通过。这些属于本轮实现/测试夹具与证据整理问题，无未解决的原有或外部配额失败。真实外部模型回归未执行，明确列为未执行。

## 保护范围

**实验状态机、Prompt、Validator、研究参数和数据库结构：未修改。** experiment-core、ai-orchestrator、model-adapter、research、packages/database、render.yaml相对基线均零差异。[范围及文件哈希](protected-scope.json)。没有新增迁移或重置任何线上数据库。原分配初始化提取为共享事务函数，调用同一初始状态与原事件，未改顺序、评分或变量；新增可选agent_version JSON显示属性并非数据库结构变更。Render Free配置与禁止自动部署保持不变。

## 文件与交付

每个源码/配置文件的目的如下；测试日志、截图、合成导出及报告位于本目录，不含真实线上密码。需求归档位于 docs/inputs/round38-chat-account-requirements.md；新增本报告、Word版、delivery-status.json、changed-files.json、protected-scope.json、screenshots.md、final-browser-results.json及各日志均用于复核。本轮全部成果包含在GitHub work分支与round38-delivery完整源码ZIP中。

- `.github/workflows/ci.yml`：安装固定版本Python测试依赖，使CI可以独立读取生成的Excel。
- `requirements-test.txt`：固定openpyxl与et-xmlfile版本，仅供验收测试。
- `apps/api/src/controllers/routes.ts`：增加受管理员认证保护的账号选项、批量Excel和重置Excel接口，禁止缓存。
- `apps/api/src/repositories/experiment-repository.ts`：可选日常身份显示元数据写入现有agent_version JSON，不改变数据库结构。
- `apps/api/src/repositories/participant-repository.ts`：读取冻结分配、批次锁、账号查询和密码哈希重置及会话撤销。
- `apps/api/src/repositories/state-repository.ts`：扩展现有配置对象的TypeScript类型，SQL与状态推进不变。
- `apps/api/src/services/experiment-service.ts`：验证可选日常显示信息；提取原分配初始化供事务内批量复用，事件顺序不变。
- `apps/api/src/services/index.ts`：注册账号管理服务。
- `apps/api/src/services/participant-service.ts`：只对日常路径输出数据库绑定的可选头像和身份。
- `apps/api/src/services/account-service.ts`：原子创建随机密码账号与既有分配，导出一次性凭据，重置新批量账号密码。
- `apps/api/src/services/login-workbook.ts`：纯Node生成标准OOXML Excel，所有单元格为文本，防止公式执行。
- `apps/api/tests/account-management.test.ts`：真实临时Postgres与HTTP验证30账号、Excel、登录隔离、重置及公式安全。
- `apps/api/tests/message-bubbles.test.ts`：验证拆分、空行、合并、转义换行、内部输出防护。
- `apps/web/src/AccountManager.tsx`：编号管理中的批量创建、冻结选项核对、独立Excel下载和新账号重置。
- `apps/web/src/Admin.tsx`：接入账号管理，保留已有监控、会话、配置、导出与测试功能。
- `apps/web/src/Participant.tsx`：聊天流、左右气泡、即时发送、滚动、内联卡片、数据库历史恢复。
- `apps/web/src/api.ts`：增加账号管理可读错误提示。
- `apps/web/src/message-bubbles.ts`：统一呈现层，最终持久化文本按换行组装最多三个气泡。
- `apps/web/src/styles.css`：桌面及手机聊天布局、底部输入、气泡和账号表单样式。
- `apps/web/tests/browser.spec.ts`：更新正式卡片标签，增加完整冻结路径、双身份、Excel及登录隔离浏览器测试。
- `apps/web/public/agent-avatars/synthetic-a.svg`：仅供合成验收组A的抽象头像。
- `apps/web/public/agent-avatars/synthetic-b.svg`：仅供合成验收组B的抽象头像。
- `packages/contracts/src/index.ts`：现有agent响应增加可选avatar/identity显示字段。
- `scripts/hosted-platform.mjs`：托管入口仅放行新增的两个受保护账号写接口，其余管理写限制保留。
- `deploy/researcher-preview-build.json`：更新无.git源码ZIP的实现版本标识，不修改Render资源或部署计划。

## 线上状态与研究者验收

真实既有地址：https://ai-agent-research-staging.onrender.com/ 。研究者此前截图确认上一版 ff87369 为Free/Live，ready/database均正常；本轮没有重新进行线上带凭据或真实模型验收，也尚未部署本轮界面。不能将本地截图说成线上新版本。

需要更新时，在现有 ai-agent-research-staging 服务使用 Manual Deploy → Deploy latest commit，保持work分支与Free方案；无需新建服务、付款、重填API Key或重新初始化数据库。部署后先核对服务Live版本，再由研究者完整体验认知、情感、两个日常身份组，批量创建独立合成账号并下载登录Excel，随机两账号登录核对分组。旧账号与数据不删除。全部人工验收通过后才向导师私下发放独立账号，不公开管理员令牌或登录文件。本报告不宣称Production已完成。
