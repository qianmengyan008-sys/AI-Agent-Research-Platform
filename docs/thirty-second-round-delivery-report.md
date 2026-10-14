# 第32次交付验收报告：真实GPT / DeepSeek对比

2026-10-14。完成实际模型发现、流式smoke和164条真实诊断采样。实验核心、编排层、Validator、Adapter、Prompt、冻结参数、数据库和部署配置不变。

## 自动模型发现与smoke

初始GPT-4.1不在实际账户列表，请求403/model_not_found。用户明确授权自动选择后，从实际列表gpt-4/text-embedding-ada-002选gpt-4，保持原GPT_API_BASE_URL。返回gpt-4-0613，HTTP200，首个可见SSE文本2801.00ms，总3090.69ms。此smoke是一次中性问候，未改变实验状态。

GPT模型名已在本轮对比执行进程替换；云环境草稿保存gpt-4建议，已有平台绑定不会被草稿直接覆盖，未来持久沿用需保存/发布并核对。密钥无需重新绑定，未输出密钥。

## 真实比较结果

| 范围       | 请求/返回模型                   | 样本 | P50/P95/max ms           | 流程标签错误率 | 状态违规 | 重试 | 兜底 | 生成异常标记轮数 |
| ---------- | ------------------------------- | ---- | ------------------------ | -------------- | -------- | ---- | ---- | ---------------- |
| 32配对     | gpt-4 / gpt-4-0613              | 32   | 3932.30/6559.22/13955.22 | 6.25%          | 0        | 4    | 3    | 0                |
| 32配对     | deepseek-flash / deepseek-flash | 32   | 3406.96/9149.12/9472.64  | 3.12%          | 0        | 7    | 2    | 0                |
| 25轮×2路径 | gpt-4 / gpt-4-0613              | 50   | 4543.84/8197.75/9474.04  | 0.00%          | 0        | 0    | 0    | 0                |
| 25轮×2路径 | deepseek-flash / deepseek-flash | 50   | 3933.27/9237.89/9801.39  | 0.00%          | 0        | 16   | 6    | 1                |

两部分均收齐样本：32配对64条、连续100条；实际191次模型HTTP尝试（164正常＋27重试）。GPT86次HTTP200；DeepSeek105次，其中104次200、1次502。无429，无传输层network_failed；这不把HTTP200视为语言质量通过。

长诊断status=completed_with_errors，命令exit1是如实标记一轮出现生成异常，不是自动化回归失败。保留502、空回复、校验拒绝与兜底记录，没有重跑或扩大重试改变结果。

配对数据里DeepSeek中位时延较低，GPT的P95较低；连续数据里GPT本次无重试/兜底，DeepSeek有16重试/6兜底。单次合成诊断、不同输出长度和后台负载限制结果推广，不能据此宣布任何模型整体最佳。

## 校验问题与人评

| 范围/模型     | 原Validator标记（同轮可多个）                                                      |
| ------------- | ---------------------------------------------------------------------------------- |
| 配对/gpt      | BACKEND_DISCLOSURE:1, BELIEF_ANCHOR_MISSING:1, BELIEF_REPLACEMENT:2, WRONG_SCENE:1 |
| 配对/deepseek | BACKEND_DISCLOSURE:1, BELIEF_ANCHOR_MISSING:1, EMPTY_REPLY:5                       |
| 连续/gpt      | 无                                                                                 |
| 连续/deepseek | BELIEF_ANCHOR_MISSING:6, BELIEF_REPLACEMENT:1, EMPTY_REPLY:11, GENERATOR_FAILURE:1 |

流程错误率是已有Validator流程标签跨尝试代理；EMPTY_REPLY、观点锚点/对象问题不必全部包含在该流程分类中，所以流程错误率0不表示无回复问题。状态违规是生成前后精确快照变化；模型输出自然文本，阶段仍由后端控制。实际状态事件推进未在本诊断测试，不能说所有状态转换已通过。

164项六维真实样本人评模板保留原候选、最终呈现、兜底来源和来源SHA，所有分数/签署null，平均值null。自然度、指代、非标准表达和实验体验必须由研究者评审；这些样本不是研究者本人自由会话。历史人工决定未覆盖。

## 请求数与实际usage

| 模型     | 比较HTTP次数 | 输入tokens | 输出tokens | 提供usage的请求 |
| -------- | ------------ | ---------- | ---------- | --------------- |
| gpt      | 86           | 69097      | 12305      | 86              |
| deepseek | 105          | 57768      | 37912      | 104             |

上述tokens来自比较请求的API usage；DeepSeek502未提供usage。另有两次初始失败生成请求、一成功流式smoke和四次只读/models，共198个HTTP请求。smoke未请求流末usage，失败未提供usage；不把记录tokens0解释为供应商账单必然零费用。货币单价/实际账单未核验。实际比较191尝试小于328预算上限，没有30人真实并发调用。

## 方法边界

双方参数相同：temperature0.2、max_tokens512、timeout10000ms、max_attempts2。32案例完整初始Prompt相同、AB/BA交替，但使用demoPolicy而非正式研究Prompt。25轮每模型每路径使用mentorPolicy的当前固定阶段；不增加正式情感轮数，不完成完整路径。共同基础政策/阶段/输入匹配，自己的模型回复历史不同后完整Prompt不同；实测full_prompts_identical=false。Context只投影有限近期历史，25轮全记录不等于全历史读入。

报告时延为完整Orchestrator elapsed，含重试/校验/兜底，不是首token时延；首token只在独立smoke测量。回归在同宿主部分并行运行，另有网络和供应商波动，样本小，无多次独立重复/统计显著性结论。

## 自动化与源码范围

npm run check退出0：459 Vitest/24文件、18 Playwright、typecheck/lint/format/build通过。四个新专项覆盖访问失败不能算64模型案例、成功数据保留、可用模型选择拒绝embedding/不存在名称、保留实际可访问的已选模型。smoke以真实流式功能验证。

仅新增scripts/real-model-comparison.mjs、gpt-model-access-smoke.mjs、comparison-run-evidence.mjs/.d.mts及专项测试/文档。平台apps/*/src、核心/Adapter/Validator、研究配置、Prompt、迁移、现有部署与依赖保持f491e1a基线。初始错误证据单独initial-access-failure，模型发现和成功采样均保留，不用未执行控制器条目制造失败率。

## 线上与导师门禁

external_url=null。仍需Render授权/资源/服务器Secret与费用确认，未部署公网、未验证托管DB/外部设备/30真实模型并发。researcher_online_self_test_ready=false、mentor_test_ready=false、formal_ready=false。

真实初步比较采样已完成，但人工质量审核尚未完成。下一步审阅同批164条样本，判断A/主要B问题后精准整改复验；继续托管上线、本人的完整认知/情感及日常体验、导出、外部设备/并发/持久化验证，再邀请导师。不得用本次状态快照0或测试通过数自动放行。
