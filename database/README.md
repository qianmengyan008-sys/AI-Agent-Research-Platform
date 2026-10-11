# PostgreSQL migration（Step 6.1）

本轮仅实现数据库 schema、迁移执行器和真实 PostgreSQL 集成测试；API／账号／页面尚未连接数据库。禁止对 WorkBuddy 或其他既有数据库运行这些迁移。

## 文件结构

```text
database/migrations/
  001_configuration.up.sql     配置、版本、条件、当前阶段 Prompt 绑定
  001_configuration.down.sql   删除 research schema（破坏性）
  002_runtime.up.sql           参与者、固定分配、状态、消息、变量、日志、Admin Event
  002_runtime.down.sql         删除运行数据表（破坏性）
packages/database/src/
  migrations.ts                事务、校验和、迁移账本、并发锁
  cli.ts                       显式 DATABASE_URL 的命令行入口
packages/database/tests/
  migrations.test.ts           隔离 Docker PostgreSQL 17.7 集成测试
```

业务表全部位于 research schema；迁移账本位于 research_meta.schema_migration。每次迁移的 up 和 down 文件共同生成 SHA-256，已执行文件不可改写；新变化追加新迁移。advisory lock 串行化迁移进程，每个文件与账本写入处于同一事务。失败回滚当前文件，不回滚此前已成功版本。

## 安装与验证

要求 Node 24、npm 11、Docker daemon 和容器网络；不依赖模型密钥。固定 PostgreSQL 镜像为 postgres:17.7-alpine，摘要 sha256:bb377b7239d2774ac8cc76f481596ce96c5a6b5e9d141f6d0a0ee371a6e7c0f2。

```bash
npm ci
npm run test:database
npm run check
```

测试创建随机命名的临时容器，端口仅绑定本机随机端口，数据在 tmpfs。仅使用合成实验／参与者，测试结束删除自己创建的容器和数据库。Docker 不可用会失败，不静默跳过；GitHub CI 预拉取同一摘要。它是真实 PostgreSQL 网络连接，不是 SQL 字符串检查或内存数据库。

## 显式迁移目标

仅当安全设置已提供独立开发／研究数据库 DATABASE_URL 后，从根目录运行：

```bash
npm run db:migrate -- up
```

本轮没有绑定外部或生产数据库。命令不自动启动数据库、不读取 .env，不进入 API 启动过程；目标必须由调用者明确配置，连接凭据不打印。连接与 SQL 错误只返回安全失败消息。up 幂等，校验和／历史不一致退出失败。

`npm run db:migrate -- down` 每次撤销最后一个迁移，删除相关数据，仅用于已备份的独立开发库或空库演练。不能将 down 当作生产恢复方案；正式迁移前应测试 pg_dump／恢复和向前修复策略。本轮未验证生产备份恢复或升级旧生产库。

## 数据边界

已发布模板／条件／Prompt 映射冻结；Agent／状态机／Prompt 版本追加保存。参与者只能分配给已发布且归属同实验的条件。分配不可重写，会话不能换分配。状态快照与 core_version 一致，聊天计数独立。事件和变量追加保存，确认观点和两次评分不能覆盖或另写新 revision。

数据库不能独立证明所有 JSON 中的正式实验语义。后续发布服务必须验证 core 定义、当前阶段策略覆盖、配置 hash、量表和权限；后续 ExperimentService 才是唯一合法迁移写入口。当前 schema 没有生产角色／RLS／认证系统；participant_message 只是字段最小化视图，绝不是按用户过滤后的授权接口。

model_run_log 预留 token_usage，可空；当前 Adapter 尚未采集供应商 token 用量，不估算、不填假值。Admin Event 是追加审计记录，不自动执行状态干预。业务日志及后台权限需 Step 6.2 实现。
