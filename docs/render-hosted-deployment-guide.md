# Render 托管体验版：从 GitHub 到浏览器网址

交付29，2026-10-14。源附件标题为“第27次反馈”，按仓库历史继续编号，不覆盖既有第27次材料。本轮唯一首选 Render。目标是一个长期开启的 Web Service 加独立托管 PostgreSQL，研究者不管理 Linux／SSH／Caddy，参与者只用浏览器。当前部署包可用，但还没有实际创建 Render 资源，不能给出已上线网址。

## 研究者最短操作

1. 使用 GitHub 登录 Render，授权它读取 qianmengyan008-sys/AI-Agent-Research-Platform 这个仓库。
2. 打开 [部署 Blueprint](https://render.com/deploy?repo=https://github.com/qianmengyan008-sys/AI-Agent-Research-Platform)。选择 main，确认加载根目录 render.yaml。服务和数据库都选 Singapore；若账户不可用，需要一起选择同一可用区域。
3. 确认控制台显示的费用：配置采用 Standard Web Service 与 Basic 1GB PostgreSQL 作为初始付费测试配置。当前没有查询到账户实时报价，不承诺这是最便宜或已经足以通过公网30人验收的套餐。免费休眠服务和限期数据库不作为稳定研究入口。确认费用后再创建资源。
4. 在 Blueprint 的 Secret 输入中填入真实 DEEPSEEK_API_KEY。只在平台密钥界面填写，不发聊天、不写仓库。Codex 内现有代理 Secret 绑定不能自动搬到 Render。管理员凭据和账号种子由平台自动生成，DATABASE_URL 自动连接新数据库，无需自己拼接。
5. 点击部署。平台自动执行 Docker 构建、数据库迁移、初始化45个账号，/api/ready 成功后才健康。复制 Web Service 控制台实际给出的 HTTPS 地址。此文不根据服务名猜测网址；失败时只反馈脱敏错误码，不发 Secret／连接串。
6. 在该网址后加 /operator，私下从 Render 环境设置取 ADMIN_ACCESS_TOKEN，输入管理员密码框，领取实验编号和45个账号。每人只发送“网址＋实验编号＋自己的 B001-Pxxxx 与密码”。不要共享管理员凭据或全体账号表。根页面“管理员入口”用同一管理凭据查看状态、异常、完整导出；普通参与者用“参与者入口”。

账号编号本身不暴露路径；管理领取表显示路径，仅研究管理员可见。B001-P0001／0002／0003 对应认知／情感／日常，其后循环分配。为研究者本人三条体验保留前三个账号；其余可供3–5名内部测试者，每人每条路径使用独立账号。

## 配置已完成什么

| 项目         | 实现                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| 构建与运行   | 根 Dockerfile，Node24固定镜像，npm ci 与 npm run build，非root运行     |
| 同域页面/API | Express 同时提供 React 静态文件、原 API 与 /operator                   |
| 端口/健康    | 0.0.0.0:$PORT，/api/ready 实际查询数据库                               |
| 数据库       | Blueprint 创建新的独立 PostgreSQL，内部连接，ipAllowList为空           |
| 迁移         | 启动执行现有迁移；拒绝非隔离数据库，不增加/更改schema                  |
| 秘密         | 模型密钥、数据库连接、管理员Token、账号生成种子仅服务器环境            |
| 账号         | 启动幂等初始化45个合成账号，DB中保存密码哈希，密码由独立Secret稳定生成 |
| 重启         | PG保存状态/消息/变量/版本；不依赖 Web 磁盘、浏览器存储或研究者电脑     |
| 版本         | 自动部署关闭，部署新代码由管理员显式触发；记录 RENDER_GIT_COMMIT       |
| 安全入口     | /operator 公共HTML不含密码；获取账号需管理员 Bearer；禁止后台写操作    |

默认模型 deepseek-flash、temperature=0.2、max_tokens=512、timeout=10000ms、max_attempts=2；仍使用原可切换 Adapter，没有供应商专有实验逻辑。mentor-test-v1、观点确认和两次0–100评分必答、其他已批准兜底均未更改。ADMIN_DEVELOPMENT_MODE=true 只开放原有受管理员授权的只读诊断，不向参与者提供后台字段。

## 保留记录与新批次

不要删除数据库，或在不同试验复用原参与者记录。Web重启/重新部署保留原DB和Secret，无需重新初始化口令。RESEARCH_BOOTSTRAP_SECRET 必须长期保存；改变它会触发 BOOTSTRAP_SECRET_CHANGED 并停止启动，避免悄悄改密码。ADMIN_ACCESS_TOKEN 是另一个Secret，可单独轮换。

需要新的45个测试账号时，在 Render 环境设置将 RESEARCH_BOOTSTRAP_BATCH 从 B001 改为 B002，重新部署；旧B001数据仍保留，新实验有新UUID。记录原实验UUID后才能下载旧批次导出。不要在已有批次更改模型/冻结参数；初始化会检查配置一致性并拒绝静默覆盖。

数据库备份、恢复点、保留期和区域合规需在平台账号中实际确认；本轮没有替研究者完成备份恢复演练，也未批准正式招募。私人导出保存到研究者受控位置，勿上传 GitHub。

## 取得网址后的验证顺序

1. 从外部设备打开真实 HTTPS 根页面与 /api/ready，确认无需电脑常开，无TLS错误。不要将 Codex 本机回环地址发给参与者。
2. 研究者本人分别完成三条非脚本真实对话；必须亲自填写评分和观点确认。
3. 同批会话完整导出，使用原人工语言审核工具，所有六维评分由人签署；A类问题为0、主要B问题处理完成后再推进。
4. 3–5名内部测试者使用不同设备，验证刷新、短暂断网/重新登录恢复、账号隔离、只读管理员与完整JSON导出。
5. 在托管服务上复核持久化：创建代表性记录，重启Web，重新登录，检查消息/状态/变量/版本和 complete=true 导出一致。云数据库备份恢复另行演练。
6. 执行获批准的30人真实 DeepSeek 并发测试，记录供应商429/5xx、延迟、重试和兜底；本机fixture通过不能替代这一步。预算见 round29-real-concurrency-plan.md。
7. 通过上述证据后才能放行导师；导师验收、版本冻结及正式研究条件满足后再招募。

## 未执行及具体阻塞

当前工具没有长期Site/Preview发布或托管数据库入口；现有临时Codex运行环境不等于公网托管。尚无 Render 授权/账号资源/域名，external_url=null。需要研究者完成上面的 GitHub 授权、Secret填写、费用确认和点击部署；并非仅剩未知的“确认一下”。已经准备全部仓库侧文件，无需购买VM或手写部署命令。

render.yaml 已本地解析，Docker完整启动与隔离PG验证另见验收报告。没有 Render 控制台/API认证，未执行平台Blueprint校验、云资源创建、托管DB TLS连接或外部30人测试。网络策略下官方文档网页访问为403，通过官方 render-examples/express-hello-world 与 render-oss/cli Git源核对配置类别/套餐名称；真正平台校验仍以部署时控制台为准。若平台报告字段/套餐不可用，保留错误并精准修改部署配置，不能凭本地YAML合法宣称平台部署成功。

本仓库旧Windows入口仅供排障，并非最终在线交付形态。整个项目ZIP用于保存/交给GPT审阅，不要求参与者解压或安装它。
