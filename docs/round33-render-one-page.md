# 双模型研究者体验版：Render 一页操作清单

> 2026-10-17第34次交付更新：当前内部体验使用免费Web和免费PostgreSQL，请改读[免费部署操作清单](round34-render-free-one-page.md)。原付费配置另存deploy/render-paid.yaml；下文仅保留历史记录，不作为本轮付费要求。

2026-10-17（UTC+8）。本轮交付在 GitHub 的 work 分支，固定归档标签为 round33-delivery。公网地址尚未创建；不要把 GitHub 项目页当实验入口。

## 你现在需要做什么

1. 用自己的账户登录 [Render](https://dashboard.render.com/)，授权读取 qianmengyan008-sys/AI-Agent-Research-Platform。此授权必须由账户本人完成，Codex 不能代授。
2. 新建 Blueprint，选择该仓库的 **work 分支**，确认加载根目录 render.yaml；不要选尚未包含本轮交付的旧 main。服务与 PostgreSQL 使用同一区域。平台若提示字段或套餐错误，先复制脱敏错误给 Codex，不要自行改代码或数据库。
3. 确认 Standard Web + Basic 1GB PostgreSQL 的账户实时报价，再批准创建付费资源。这里没有替你购买或确认账单。
4. 在 Render Secret 界面分别填 DEEPSEEK_API_KEY、GPT_API_KEY。Codex Environment 的绑定不会自动搬到 Render；不要复制代理占位值，不要发到聊天或 GitHub。核对非秘密参数 GPT_MODEL_NAME=gpt-4、DEEPSEEK_MODEL_NAME=deepseek-flash。GPT_API_BASE_URL 必须与已经验证成功的实际接口地址一致；如果使用兼容接口，请在 Render 覆盖仓库中的官方地址默认值。保持当前 Codex 的 GPT_API_BASE_URL 不变。
5. 点击部署。迁移和测试账号初始化自动执行，无需 SQL 或服务器命令。成功应看到 Web Service 为健康状态，且实际 HTTPS 地址的 /api/ready 返回数据库就绪。复制 **控制台实际显示的 HTTPS URL** 给 Codex；不发 Secret、连接串、管理员 Token 或全体账号表。
6. 部署完成后，在真实地址的 /operator 输入 Render 自动生成的 ADMIN_ACCESS_TOKEN，仅私下查看账号。默认 B001 为 DeepSeek 45 个账号；B002 为 GPT 6 个账号，各自独立实验编号。界面显示批次、模型和实验编号，参与者不能切换模型。每人只收到本人对应账号、密码、实验编号和网址。

## 哪些事由 Codex 接着做

收到真实 URL 后，先检查 /api/ready、HTTPS、权限隔离、完整导出和重启后的数据库持久化，再配合外部设备验证。当前不能声称这些线上验收已经通过。

你本人使用独立账号完成认知、情感、日常三条非脚本体验，并填写 docs/acceptance/step6-round33/human-review/review.md（也提供 Word 版）。人工体验与签署必须由人完成。之后依次开展 3–5 台设备测试，再按已批准预算执行 30 人真实模型并发；不在此次部署时自动发起付费压力测试。

## 批次与版本注意事项

已经开始的批次禁止中途换模型、接口地址或冻结研究参数。原 B001/B002 和数据库必须保留；新一轮 A/B 使用尚未占用的两个编号，如 B003/B004，并先由 Codex 核对。不要改变账号种子 RESEARCH_BOOTSTRAP_SECRET，不要删除数据库或重建环境。

当前唯一取得公网入口的人工阻塞是：Render 账户授权、费用确认、Secret 录入及点击部署。这些步骤尚未执行；人工语言审核与后续线上验收也尚未完成。mentor_test_ready=false，formal_ready=false。
