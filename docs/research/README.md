# 调研归档

按日期保存的调研快照。每份文件带取样日期、来源和证据等级；内容不代表现行默认配置，重新决策前先复查官方来源和当前角色卡。

| 日期 | 文件 | 范围 |
|---|---|---|
| 2026-10-20 | [热门编码 / agent 编排模型调研](popular-models-2026-10-20.md) | 主要厂商模型目录、定价、上下文与能力标签 |
| 2026-10-20 | [热门项目 README 写法调研](readme-patterns-2026-10-20.md) | 5 个高星项目的 README 结构与写法 |
| 2026-11-07 | [子代理模型评分与岗位适配归档](model-benchmarks-2026-11-07.md) | Terra / DeepSeek V4.1 Flash / GLM-5.3 / GLM-5.3-Flash 的评分、社区反馈、本地实测与岗位判断 |
| 2026-11-08 | [六模型评分核查与修正](model-benchmarks-2026-11-08.md) | 角色卡当日快照、AA v5.0.1、OpenAI API/Codex 口径、审查证据及对 2026-11-07 归档的修正 |
| 2026-11-08 | [编码订阅套餐对比](coding-subscriptions-2026-11-08.md) | Kimi、MiniMax、Devin、国内 coding plan 与海外订阅的价格、额度、接入条件和条款风险 |
| 2026-11-08 | [编排省 token 方法](token-saving-orchestration-2026-11-08.md) | 主控上下文与缓存、派发合同、子代理复用、失败重试及 Claude Code 设置对 token 的影响 |
| 2026-11-08 | [Opus 5.5 与 Sonnet 5.5 主控对比](opus-vs-sonnet-controller-2026-11-08.md) | 两者的 benchmark、代码审查、默认档位表现、价格与每任务成本，判断 Sonnet 能否替代 Opus 当主控 |

## 约定

- 文件名用 `topic-YYYY-MM-DD.md`，新调研新建文件，不覆盖历史快照。
- 每条结论标证据类型（vendor / third_party / community / local）和日期。
- 价格、上下文、榜单分数写清模型版本与 harness；不同 harness 的数字不直接相减。
- 只保存公开来源和脱敏后的本机实测，不写入 API key、令牌或账号信息。
- 角色卡与运行配置以当前环境和 `setup.py cards` 输出为准，归档不代替实时配置。
