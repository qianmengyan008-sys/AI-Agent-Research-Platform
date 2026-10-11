# Step 6.2 API 设计（尚未实现）

本轮只设计，不新增业务路由。所有接口放在 /api 前缀下，当前只有 /api/health 实际存在。以下设计与用户建议路径对应，未实现接口不伪装可调用。

后端调用链：已发布 Experiment Configuration → 固定 Participant Assignment → ExperimentService 调用 core 状态机 → ConversationService / AI Orchestrator → LanguageGenerator / Model Adapter → LLM。普通聊天不触发迁移；显式阶段表单提交经 core 校验。网络生成在数据库事务外，写回前重查状态／聊天版本和会话运营状态。

| 方法与路径                                 | 输入／返回及权限                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| POST /api/auth/login                       | experiment_code、participant_code、password；统一失败信息；成功设置安全 HttpOnly 会话 cookie，不回传 hash 或管理员数据  |
| POST /api/auth/logout                      | 结束自己的登录会话                                                                                                      |
| GET /api/experiment/current                | 自己的实验说明、已分配 Agent 展示名／头像、可操作界面；不返回条件代码、阶段名称、变量或未来流程                         |
| GET /api/experiment/state                  | 自己的 opaque state_token、界面状态 awaiting_input/generating/finished、当前可填表单；不是 core 快照                    |
| POST /api/conversation/message             | text、client_request_id、state_token；幂等接收消息，202 返回 turn_id；不接受 stage、variables、condition 或 Prompt 参数 |
| GET /api/conversation/messages             | 自己的分页已就绪消息，只包含 id、role、text、时间与必要投影                                                             |
| GET /api/conversation/turns/:id            | 自己的生成任务状态和已校验 text；错误用安全消息，不含 Validator 详情                                                    |
| POST /api/experiment/submissions           | state_token、当前 form_id、明确填写的数据、client_request_id；服务端映射合法事件，不能让客户端提交任意 core event       |
| POST /api/experiment/withdraw              | 按研究协议退出；独立后端处理与审计，不让 LLM 决定                                                                       |
| POST /api/admin/experiments                | 管理员在授权研究项目中创建实验和配置草稿                                                                                |
| POST /api/admin/experiments/:id/conditions | 草稿条件、已注册路径版本、Agent 版本及 Prompt 映射                                                                      |
| POST /api/admin/experiments/:id/publish    | 校验全部阶段、归属、定义、hash 和配置，发布后冻结                                                                       |
| POST /api/admin/participants               | 创建编号及初始化账号，不导出 hash                                                                                       |
| POST /api/admin/assignments                | 固定发布模板／条件／Agent；启动后不可改                                                                                 |
| GET /api/admin/participants                | 按授权 experiment_id 查询状态和分配；分页                                                                               |
| GET /api/admin/conversations               | 按研究权限查询完整对话；后台诊断与参与者投影分开                                                                        |
| GET /api/admin/export                      | 查看本人授权导出任务和下载已生成结果；GET 不创建任务或修改状态                                                          |
| POST /api/admin/export                     | 创建受审计的一致性导出任务；202 返回任务号                                                                              |
| POST /api/admin/sessions/:id/events        | 未来允许的 Admin Event，必须操作者、原因、原状态和合法事件类型；本轮无任意强制推进或 PATCH state 接口                   |

state_token 为服务端签名／查表的 opaque 并发标记，不暴露 stage 名称；数据库仍核对 core_version。表单可以显示当前必要评分说明和参与者明确确认内容，但不能发出所有变量对象、内部变量名、校验规则或未来实验任务。正式知情说明按研究协议呈现，不靠隐藏信息替代知情同意。

GET /experiment/state 的安全返回示例：

```json
{
  "status": "awaiting_input",
  "state_token": "opaque-example",
  "form": { "id": "opaque-form", "kind": "text", "label": "请填写你的回答" }
}
```

认证、Cookie、CSRF、登录限流、参与者归属与管理员实验范围授权均需 Step 6.2 实施及测试。本轮数据库投影视图没有用户行级授权，不能直接对外暴露。错误统一为 400 输入、401 未登录、403 无权限、409 版本／幂等冲突、429 限流；生产错误不返回 SQL、模型原文错误、内部 state 或配置。

事务计划：显式提交锁定状态，验证版本和幂等，再原子写快照／迁移／变量／回执；聊天事务只写消息和任务，不加 core_version。迟到回复、退出或版本不符的结果标 stale/cancelled。后续迁移补任务租约、auth_session、逐尝试日志和 export_job，然后才实现相关 API，不先用内存对象冒充持久化。
