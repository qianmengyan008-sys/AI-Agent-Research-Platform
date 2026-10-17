# 免费研究者体验版：Render 最短操作

2026-10-17（UTC+8）。使用仓库 qianmengyan008-sys/AI-Agent-Research-Platform 的 **work 分支**，根目录 **render.yaml**。当前配置为 Free Web + Free PostgreSQL，不以绑定银行卡或购买付费套餐为体验前置条件。本轮固定交付标签为 round34-delivery。

## 在 Render 重新做哪几步

1. 若上一次只是预览付费 Blueprint、还未创建资源：退出旧预览，在 Render 新建 Blueprint，重新选择该仓库及 **work**，读取最新 render.yaml。若页面显示旧提交，刷新后重新加载，不继续提交旧的付费预览。无需修改或重建 Codex Environment。
2. 确认 Web 和 PostgreSQL 的计划均显示 **Free**，区域均为 **Singapore**，Dockerfile 为 ./Dockerfile，健康检查为 /api/ready，自动部署关闭。若仍显示 Standard/Basic、费用或银行卡要求，先停止并发回脱敏提示；不确认扣费。免费资源也可能受到平台账号资格/区域配额/身份验证限制，本文件不承诺绕过 Render 的账户要求。
3. 在 Render 的 Secret 界面输入 DEEPSEEK_API_KEY 和 GPT_API_KEY。保持 GPT_MODEL_NAME=gpt-4、DEEPSEEK_MODEL_NAME=deepseek-flash；GPT_API_BASE_URL 必须与此前成功调用的实际服务一致，若使用兼容接口，应在 Render 设置对应地址。不要修改 Codex 中已验证的配置，不要把密钥发到聊天或 GitHub。DATABASE_URL 自动绑定新建免费数据库；管理员 Token 和账号种子自动生成。
4. 点击部署，等待 Web 健康。复制控制台实际显示的 HTTPS URL 发给 Codex；不要猜 onrender.com 地址，也不要发送连接串、管理员 Token 或全体账号密码。成功标志是实际网址可打开，/api/ready 返回数据库就绪。
5. 私下从 Render 环境页面查看 ADMIN_ACCESS_TOKEN，在实际网址的 /operator 领取账号。B001 对应 DeepSeek 45个账号，B002 对应 GPT 6个账号，两批各有实验编号。本人分别使用两模型的认知、情感、日常账号完成 **6次非脚本会话**；每次使用独立账号，不在原会话中切换模型。

若已存在运行中且有数据的服务或数据库，**不要删除、重建或尝试直接把付费数据库降为免费**。先反馈资源是否已创建及非敏感状态，由 Codex 核对可行步骤；保留已有数据库、账号种子、B001/B002和会话。此清单的新建流程适用于此前付费要求阻挡、尚未创建资源的情况。

## 免费版的使用边界

- **Free PostgreSQL 创建30天后到期，无备份**。到期前在受控位置下载完整研究者测试导出，不能依赖它长期保存数据，私密导出不得上传 GitHub。
- **Free Web Service 会休眠**，首次唤醒可能等待较久，不能保证连续在线或作为延迟比较基准。唤醒/平台不可用与供应商生成错误分别记录。
- 免费版只供研究者及导师小范围内部体验，**不用于正式数据收集，也不执行30人真实并发验收**。模型 API 仍按供应商规则计费，免费托管不等于免费模型调用。
- 原 Standard Web + Basic 1GB PostgreSQL 配置完整保存在 **deploy/render-paid.yaml**，供未来付费部署评估。它不是当前体验前置条件，也不代表正式实验已经放行；正式研究还需稳定性、备份恢复及人工验收。

## 部署后由 Codex 接着验收

收到真实 URL 后，检查 /api/ready、HTTPS、静态资源、登录/恢复、权限隔离、批次模型冻结、完整导出和Web重启后数据保留；记录两模型真实返回身份与延迟。随后由研究者本人完成6次自由体验及原40条人工语言评分。当前公网验证、真实部署调用及人工评分均未执行，不把本地测试当作线上结果；导师尚未放行，formal_ready=false。
