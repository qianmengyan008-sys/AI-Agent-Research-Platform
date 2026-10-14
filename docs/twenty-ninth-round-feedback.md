# 给GPT的第29次交付反馈：公网多人研究平台部署准备

2026-10-14。执行来源是用户上传的《第27次反馈_推进可公网访问的多人在线研究平台.docx》；仓库已有交付27、28，本次编号29。附件建议按本轮用户请求执行，但未把附件对既有完成度/测试数量的表述当作事实。

本轮已将主要交付形态改为托管网站，选择唯一首选 Render。根 render.yaml 连接一个同域 Docker Web Service 和一个独立托管 PostgreSQL，参与者仅用浏览器。完成仓库侧构建、端口、健康检查、静态文件、幂等迁移、45个匿名测试编号和管理员受保护账号领取页。没有更改状态机、AI编排层、Validator、模型Adapter、Prompt、冻结mentor-test-v1或数据库结构，没有连接WorkBuddy。

实际还没有公网网址：external_url=null。本会话没有可长期发布的Site/Preview/托管数据库工具，也没有Render平台授权/已创建资源。临时Codex环境不能当作稳定托管。研究者尚需GitHub登录/授权指定仓库、在平台填DeepSeek Secret、确认套餐费用和点击Blueprint部署；平台字段及云数据库实际连接还需其控制台验证。没有假装“只剩一个授权步骤”或猜测.onrender.com地址。

## 本轮验收实绩

| 验收                    | 实绩                                                                        | 边界                                                |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| 30人混合路径            | 各10个认知/情感/日常，6波，每人6轮，共180唯一turn/360消息                   | 真实HTTP与PG，模型fixture200ms，非公网/非DeepSeek   |
| 45人余量                | 各15个，270唯一turn/540消息                                                 | 同样是本机fixture；不证明Render套餐容量             |
| 独立首发消息P50/P95/max | 30人264.11/326.59/453.21ms；45人281.28/364.38/472.05ms                      | 将回放/并发重复请求单独记录，避免用缓存拉低首发指标 |
| 成功率/错误率           | 两组正常HTTP请求100%/0%；429/5xx/DB错误/客户端超时均0                       | 预期鉴权401和越权404独立计数，不混入成功指标        |
| 重试/兜底               | 两组各2重试/1兜底，按预设空回复故障注入                                     | 不是供应商真实错误率，HTTP200不等于语言质量通过     |
| 隔离/幂等               | 状态、观点、独立数值评分/变量、对话不串线；跨用户turn拒绝；完成回放不再生成 | 30/45各自独立参与者/session；6轮不等于全路径完成    |
| 写入/完整导出           | 两组数据质量8项异常为0，complete=true；pool上限10实际10                     | 峰值等待49/80，说明排队存在，需线上观察             |
| Docker同域浏览器        | 非root；/operator领取45账号；3路径登录进入聊天；无页面脚本错误              | 实际容器和Chromium，不是外部设备体验                |
| 容器实际重启            | 账号一致，状态/消息/变量/事件/turn/run哈希一致；重登历史保留                | 独立持久PG卷；非托管DB备份恢复证明                  |
| 普通全套回归            | 452 Vitest +18 Playwright通过，typecheck/lint/format/build通过              | 全部普通检查离线，本轮模型外部调用0                 |

实测环境 Node24.19，4可用CPU并行度、约34GB宿主内存；容器Node24.21.0。Render Standard硬件、网络和真实模型延迟不同，不能拿这些数值承诺公网30人SLA。45人登录P95约1548ms，pool队列峰80，主要需关注同步密码校验、DB等待和供应商额度；本轮未改业务服务或扩大pool掩盖瓶颈。

## 文件与复查入口

新增 Dockerfile、.dockerignore、render.yaml；scripts/hosted-platform.mjs、hosted-server.mjs、hosted-concurrency-fixture.mjs/.d.mts、hosted-container-acceptance.mjs；deploy/hosted-operator.html/.js；新增 apps/api/tests/hosted-platform.test.ts；更新 deploy/researcher-preview-build.json 源码追踪。

原应用代码、核心包、Prompt、配置、迁移和依赖锁未变。实际Docker启动发现增量缓存导致缺dist，已通过排除*.tsbuildinfo修复并重新验收，不靠修改实验包。

docs/acceptance/step6-round29/ 保存30/45完整请求指标、Docker浏览器/实际重启报告、全检查与构建日志、机器可读门禁。docs/inputs/round29-hosted-platform-requirements.docx 为原附件。部署步骤见 render-hosted-deployment-guide.md，付费测试预算见 round29-real-concurrency-plan.md；均另提供Word。

## 付费真实并发与后续门禁

30人6轮预计160次正常生成，最大320真实HTTP尝试；max_tokens512，对应正常输出最多81920token/上限163840。若按每请求6000输入token估算，费用上限估算为1.92×每百万输入价＋0.16384×每百万输出价；输入为假定，当前无此账户真实单价，需代入供应商报价后批准金额/限额。未经研究者明确批准不执行，大量付费调用本轮为0。

researcher_online_self_test_ready=false；mentor_test_ready=false；formal_ready=false。部署包/本机fixture工程验收通过不替代上线、研究者本人自由会话、人工六维审核、3–5外部设备和真实30人并发证据。历史认知脚本仍有9重试/8兜底；本轮没有声称已经消除语言问题或给出人工评分。

建议GPT下一轮先指导研究者按Render六步取得真实URL并记录部署事件，随后做三条本人非脚本体验及同批语言审核，修复经审核确认的A/主要B问题，再安排内部设备测试并批准真实并发预算。不要继续扩展功能、改状态机或把本机压测标为公网验收通过。
