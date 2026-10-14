# 第29次交付验收报告：托管公网准备与30/45人并发

2026-10-14；输入附件标题“第27次反馈”，归档在 docs/inputs/round29-hosted-platform-requirements.docx。本报告评估完成的具体行为与未验证条件，不以测试数量代替研究放行。

## 结论与门禁

| 门禁                              | 当前  | 缺少的证据                                                           |
| --------------------------------- | ----- | -------------------------------------------------------------------- |
| hosted_deployment_package_ready   | true  | 仓库包已构建/启动，仍需平台接受配置                                  |
| engineering_fixture_30_ready      | true  | 仅本机工程fixture范围                                                |
| engineering_fixture_45_ready      | true  | 同上；45是30目标的工程余量                                           |
| researcher_online_self_test_ready | false | 实际HTTPS地址、托管DB、外部设备与真实模型可用                        |
| mentor_test_ready                 | false | 本人3条非脚本体验、同批六维语言审核、A/主要B整改、内部设备、真实并发 |
| formal_ready                      | false | 导师验收、版本/研究招募/数据管理条件与正式签署                       |

external_url=null。没有调用真实模型、创建/收费云资源、部署WorkBuddy或把本机URL当可分享Preview。需要研究者授权Render指定GitHub仓库、平台Secret填写、确认账单套餐与创建资源；部署后才取得真实地址。部署入口与最短步骤见 render-hosted-deployment-guide.md。

## 部署可行性与能力边界

检查本会话可调用工具：Git代理/本地执行/云环境草稿工具可用，没有长期Site/Preview发布、托管PostgreSQL或Render部署工具。该判断只限当前暴露能力，不推断所有Codex账户都不支持Site。临时运行进程/磁盘/端口不满足长期URL及持久DB要求。

唯一选择Render，理由是现有React静态文件和Express可同域由一个Web服务供给，与托管PG通过内部连接，不增加独立前端域名、跨域会话或VM运维。配置Standard Web与Basic1GB数据库作为待确认的付费初始配置；价格、账户区域/可用套餐和实际30人容量均未由平台验证。不同时提供Railway/CloudRun等复杂备选，不要求研究者购买VM。

Docker固定Node镜像校验值，npm冻结锁安装，非root运行；READY依赖PG查询而非仅有PID。首次Docker启动暴露本地tsbuildinfo缓存问题，已排除缓存，重建后容器启动、管理员领取和三条浏览器入口验收通过。初始失败没有隐藏为成功；最终证据来自修复后实际运行。

render.yaml YAML解析通过，参考官方Git示例和CLI套餐枚举；官方文档网页访问受当前网络策略403影响。没有平台API/控制台凭据，Blueprint平台验证、实际托管服务/DB创建及云TLS/内部网络连通 not_run。Docker使用本地私网独立PG作代表性运行验收，不据此推断托管DB连接或TLS已成功。

## 对原最低功能逐项验收

| 要求                        | 完成情况                   | 验证/仍需事项                                                            |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| 公网HTTPS及独立于研究者电脑 | 部署配置完成，未上线       | Render授权/收费确认/Secret/资源创建后外部验证                            |
| 参与者账号、隔离            | 包内通过                   | 45个不带路径标签编号，登录/鉴权/跨用户turn/变量隔离；外部体验待做        |
| 三条真实模型路径            | 保持原实现/冻结参数        | 3入口Docker浏览器登录通过；本轮不重新跑真实完整路径                      |
| 认知两次统一0–100评分       | 原实现保留                 | 普通浏览器回归验证两卡/固定观点；不允许跳评分或确认                      |
| 刷新/断线/重登恢复          | 原回归及本机重登通过       | 真公网弱网/不同设备待测；不保证未提交的输入草稿保留                      |
| PG完整写入/版本             | 30/45fixture通过           | 独立PG、真实SQL，八项完整性检查零异常                                    |
| 管理员查看/完整导出         | 原API/UI保留；包内读取通过 | complete=true，管理员受保护；online export待测                           |
| 安全不漏诊断/Secret         | 自动检查通过既定范围       | participant管理员401、他人turn404；日志/导出无运行Secret；非完整渗透审计 |
| 长期持久化/备份             | 包内Web重启保持            | 托管DB保留期/备份/恢复演练、长期运行未做                                 |

## 30与45并发方法和证据

scripts/hosted-concurrency-fixture.mjs 只使用显式MockAdapter覆盖，真实HTTP与独立PG17容器；每次自建/清理自己的DB，未接触原Preview库或生产库。并发参与者各有独立账号、assignment、session和state；三路径各占1/3；六个同步消息波次，每人同一轮两个并发相同request_id，完成后第三次回放。不同用户也使用相同request_id，检查幂等范围限定到本人会话。完成回放的内容和turn_id一致且生成次数不增。

认知路径6轮经历观点获取→明确确认→首次评分→重构初段；情感6轮推进设定/接触/误解/解除/共同经历；日常保持自然控制聊天。因此这是多轮并发测试，不声称完成完整实验。每用户标记不同，认知数值评分也不同，检查本人观点/评分/消息/状态/变量不会被其他用户替换。

fixture每次生成等待200ms，两次受控空回复故障：一个一次失败后成功，一个持续失败走兜底。所有真实生成调用为0。重试2/兜底1是预设压力场景，不是Flash质量指标。

| 指标                     | 30人                 | 45人                 |
| ------------------------ | -------------------- | -------------------- |
| 三路径人数               | 10/10/10             | 15/15/15             |
| 唯一turn/消息            | 180/360              | 270/540              |
| 正常HTTP请求             | 1081                 | 1621                 |
| 成功率/错误率            | 100%/0%              | 100%/0%              |
| 首发消息P50/P95/max ms   | 264.11/326.59/453.21 | 281.28/364.38/472.05 |
| 登录P95/max ms           | 1129.78/1130.81      | 1547.61/1551.90      |
| HTTP429/5xx              | 0/0                  | 0/0                  |
| DB错误/客户端超时        | 0/0                  | 0/0                  |
| fixture尝试/峰值同时生成 | 162/30               | 242/45               |
| 模型层重试/兜底          | 2/1                  | 2/1                  |
| PGpool限制/峰值          | 10/10                | 10/10                |
| 峰值排队连接请求         | 49                   | 80                   |
| 宿主进程峰值RSS MB       | 281                  | 344                  |
| 数据质量8项异常          | 均0                  | 均0                  |

数据文件 concurrency-30.json 与 concurrency-45.json 包含每个HTTP操作、详细请求/延迟与重启前后实验记录SHA256。首发指标只取primary_message，缓存回放/并发重复独立分组，正常成功率排除预期鉴权/越权探测。pool等待有排队但本次未报错；不等于线上无限扩容。宿主4CPU并行、34GB内存与Render实际资源不同，真实DeepSeek时延/429/账单未知，不能拿fixture P95承诺最终响应。

## Docker启动、浏览器和实际进程重启

scripts/hosted-container-acceptance.mjs <全新输出目录> 可在已构建 research-hosted-round29 镜像后复现。它自行创建隔离Docker网络、持久PG卷和Web容器，用显式离线Secret，不读取真实模型密钥；容器将供应商域名映射回环地址以防误连。仅发送情感首阶段固定template一轮，没有供应商调用。验证非root、45账号、无授权401/参与者401、完整导出、无Secret写入公共HTML/导出/日志、镜像无.git/.env/私人运行目录。

Chromium从同域实际静态文件加载/执行账号领取页，验证45行、清除管理输入、无浏览器持久存储；登录认知/情感/日常进入聊天，页面无脚本错误。随后docker restart实际Web进程，PG卷保持：账号UUID/口令一致；states/messages/variables/transitions/turns/runs哈希一致；重登历史2条保留。只在情感账户留下此模板轮，另外两账号不调用模型。

这是本机实际进程重启测试，范围大于仅重建服务对象，但仍不是Render线上持久化或托管PG整机重启/备份恢复验证。镜像构建与初始化幂等通过不代表外部URL已存在。

## 变更范围与自动化结果

运行封装：Dockerfile、.dockerignore、render.yaml；scripts/hosted-platform.mjs、hosted-server.mjs。管理员领取：deploy/hosted-operator.html/.js。工程验证：hosted-concurrency-fixture.mjs/.d.mts、hosted-container-acceptance.mjs、apps/api/tests/hosted-platform.test.ts。元数据：deploy/researcher-preview-build.json。材料：本报告/给GPT反馈/Render指南/真实预算及其Word、原附件、step6-round29证据。

与上一交付87df798比较，apps/api/src、apps/web/src、packages/experiment-core、ai-orchestrator/Validator、model-adapter、contracts/database、研究配置、Prompt、database/migrations、package manifests/lock均未改。实现源提交bb1bfec；修复打包缓存提交4ee8ba1。实际托管构建会用平台RENDER_GIT_COMMIT追踪部署版本。

npm run check成功退出：typecheck、lint、format、452 Vitest（22文件）、build、18 Playwright均通过。新增两项压力回归分别30/45人。附件提到448+18为旧基线；上一交付实际450+18，本轮452+18，不沿用过时数量。额外Docker行为检查结果见 docker-hosted-acceptance.json。新复现脚本另做格式/lint及运行验证。

## 风险、付费计划和下一步

1. 平台授权/资源未建：尚无外部参与者入口；需要Render控制台接受Blueprint并提供真实URL，首次部署报错按脱敏错误码修复。
2. 真模型并发与费用：30人6轮预计160正常生成、最多320请求；按6000输入/512输出估算上限1.92×Pin＋0.16384×Pout（每百万价）。真实报价/明确预算未获批准，not_run。详见 round29-real-concurrency-plan.md。
3. 数据与云运行：本机证明保留，但托管PG持久化、备份恢复、区域/保留策略需平台及研究者确认。不要删除DB或重生成账号种子。
4. 语言与人为门禁：历史认知9重试/8兜底及人工审核缺口仍在。研究者本人自由体验尚未完成，不能用脚本或HTTP200填写六维评分。
5. 容量：30/45工程fixture通过，云机器/供应商配额/弱网尚未证明；先3–5设备，再批准真实并发，必要调部署资源而非实验逻辑。

下一步按Render指南完成授权/Secret/套餐/部署，取得网址后本人三条自由体验→同批人评/A主要B整改→3–5设备→获批真实30并发→导师→正式。旧本地Windows入口留作排障，最终研究形态已改为无需参与者安装的托管网站。
