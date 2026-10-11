# 第二十轮用户要求（聊天正文留档）

当前平台已经完成 Model Adapter 架构，请不要将模型绑定到具体供应商。请增加可切换模型配置能力，通过环境变量选择 GPT 或 DeepSeek。保持 experiment-core、AI Orchestrator、Validator 不变，仅替换 Model Adapter。随后使用同一组认知路径和情感路径测试集，对 GPT 与 DeepSeek 进行对比测试，输出延迟、流程错误率、状态违规次数、语言质量人工评分结果。重点验证模型差异，而不是继续修改实验逻辑。

请你继续完成任务，把反馈通过github链接发给我。整个项目的zip里应当包括发给gpt的反馈和本轮验收成果.
