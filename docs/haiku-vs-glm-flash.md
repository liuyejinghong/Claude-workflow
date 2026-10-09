# Haiku 5.5 与 GLM-5.3-Flash：分工证据

日期：2026-10-08。

Haiku 用于高速低复杂度执行：需求清楚、验收直接、低风险、无需复杂推演时优先。不按文件个数或输出长短排除，长输出或批量本身不自动交 Flash；速度优先用 Haiku，持续高频、规模或额度吞吐优先用 Flash。主控已明确方案与合同、可执行验收且需要更多推演的常规逻辑由 GLM-5.3 承担，复杂/高风险由 Sol 承担，Astra 仅用于最难任务。用户本地速度观察是选择 Haiku 的主要依据，现有证据不足以笼统认定 Haiku 更强或替代 GLM。

## 官方能力与计价

| 项目 | Claude Haiku 5.5 | GLM-5.3-Flash |
|---|---|---|
| 官方 model | `claude-haiku-5-5` | `glm-5.3-flash` |
| 发布与窗口 | Anthropic 于 2026-10-07 发布；1M context / 128K output | 1M context / 128K output |
| 输入/能力 | text / image / tool | text / image / video / file / tool |
| 推理 | adaptive thinking，默认 medium；支持 low / medium / high / xhigh / max | thinking 始终启用，推荐 max |
| 每 MTok 输入/输出价格 | prompt ≤100K：$0.10 / $0.50；prompt >100K：$0.50 / $2.50 | $0.15 / $0.50 |
| 每 MTok 缓存读取/缓存输入价格 | prompt ≤100K：$0.01；prompt >100K：$0.05 | $0.03 |

API 标价不能直接当成用户订阅的实际账单。

OpenCode Go 为 $10/月，Go Plus 为 $40/月；Haiku 对应的月额度按 API 价格计值分别是 $15 / $60，5 小时窗口为月额度的 20%，周窗口为 50%，月窗口为 100%。注意 agent 现在走聚合组，请求也可能落到 Command Code（$10/月，Haiku 月额度 $20，$70 共享池），因此该额度不是唯一的计费口径。它不是无限额度，也不是固定请求数；不能自动启用 Zen 余额补充额度。

智谱 Coding Plan 官方给 Flash 的额度是 GLM-5.3 的 3 倍，这不是无限服务承诺。

## 本地速度观察

2026-10-08，用户报告本地使用 Haiku 时通常约 100–200 tok/s，最快约 300 tok/s。这一速度体验是选择 Haiku 承担高速低复杂度执行任务的主要依据。

本次没有复测，也不知道这些观察的统计口径或任务样本；不能把它当成统一基准或 SLA。峰值和通常速度没有在 medium 的受控测量下验证，也不能与下面的第三方 High 数据混用。

## 第三方测量的适用范围

以下来自 Artificial Analysis 的对应模型比较页面，智能指数版本为 v4.3.2：

| 测量 | Haiku 档位 | Haiku | Flash |
|---|---|---|---|
| Intelligence Index v4.3.2 | Max | 43 | 42 |
| Intelligence Index v4.3.2 | High | 38 | 42 |
| Intelligence Index v4.3.2 | Medium | 34 | 42 |
| Terminal-Bench 4 | Max | 33% | 33% |
| Terminal-Bench 4 | High | 22% | 33% |

Max 的智力分数略高、Terminal-Bench 4 持平，High 与 Medium 的智力分数低于 Flash；不能声称 Haiku 全面更强，也不能把 Max 的成绩用于当前 medium agent。不能混用厂商不同版本的 benchmark 作比较。

该平台测得 Haiku High 输出吞吐 173 tokens/s，Flash 为 51 tokens/s；首答案时间分别为 26.15 秒与 42.13 秒。这些仅是第三方对 first-party API 的测量，不是 OpenCode Go 实测，也不是订阅 SLA。

## 编排与本机验证

已配置具名 `haiku-5.5` agent，默认 medium；模型为 `group/auto-claude-haiku-5-5:medium[1m]`，经 Claude Code → Magpie 聚合智能路由（在 OpenCode Go 与 Command Code 之间自动选渠道）；`:medium` 后缀已实测被接受。

Haiku 可执行检索/证据提取、摘要整理/结构化提取、文档同步、指定测试、主控已明确方案的简单实现/局部修复/测试补充和批量同类修改。不按文件个数或输出长短排除；低复杂度且速度优先用 Haiku，持续高频、规模或额度吞吐优先用 Flash。

GLM-5.3 承担主控已明确方案与合同、可执行验收且需要更多推演的常规逻辑；Sol 承担复杂高风险任务，Astra 仅用于最难任务。Haiku 与 Flash 可以落实明确低风险任务，复杂根因调查仅供线索；不能独自决定架构、复杂根因、并发/恢复/交易/持久化/外部副作用安全或高风险最终审批。主控决定方案并验收，测试结果必须来自实际输出。

本机当前 Magpie route 的 `/v1/models` 报告 1M，已有三项冒烟实证：

- Haiku medium 短响应成功。
- `tool_use` → `tool_result` 两轮调用成功。
- 原生 `claude -p --agent haiku-5.5` 通过临时 JSON 定义调用 `Read` 读取 marker 成功，`num_turns=2`，模型记录为 `opencode-go/claude-haiku-5-5:medium[1m]`。

以上属于接入冒烟验证，未做性能 A/B，不能据此确认本地任务中的相对速度或质量优势。

## 来源

- [Anthropic Haiku 5.5](https://www.anthropic.com/claude-haiku-5-5)
- [Anthropic 模型概览](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [智谱 Flash 官方指南](https://docs.z.ai/guides/llm/glm-5.3-flash)
- [智谱官方价格](https://docs.z.ai/guides/overview/pricing)
- [OpenCode Go 官方说明](https://opencode.ai/docs/go/)
- [Artificial Analysis Haiku 与 Flash](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-glm-5-3-flash)
- [Artificial Analysis Haiku High 与 Flash](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-high-vs-glm-5-3-flash)
- [Artificial Analysis Haiku Medium 与 Flash](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-medium-vs-glm-5-3-flash)
