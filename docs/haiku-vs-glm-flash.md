# Haiku 5.5 与 GLM-5.3-Flash：分工证据

日期：2026-10-08。

Haiku 用于速度敏感且范围小的定位、证据整理和明确低风险修改；Flash 保留高频批量、大输出和大规模 fan-out。常规业务逻辑仍由 GLM-5.3 承担，复杂/高风险仍由 Sol 承担。现有证据不足以笼统认定 Haiku 更强或替代 GLM。

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

OpenCode Go 为 $10/月，Go Plus 为 $40/月；Haiku 对应的月额度按 API 价格计值分别是 $15 / $60，5 小时窗口为月额度的 20%，周窗口为 50%，月窗口为 100%。它不是无限额度，也不是固定请求数；不能自动启用 Zen 余额补充额度。

智谱 Coding Plan 官方给 Flash 的额度是 GLM-5.3 的 3 倍，这不是无限服务承诺。

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

建议新增具名 `haiku-5.5` agent，默认 medium；模型设为 `opencode-go/claude-haiku-5-5:medium[1m]`，经 Magpie → OpenCode Go 路由。
Haiku 承担小范围、速度敏感的定位、证据提取、短总结和简单明确改动；Flash 承担批量、大输出 fan-out。
常规实现用 GLM-5.3，复杂高风险任务用 Sol，Astra 仅用于最难任务。主控决定方案并验收，高风险最终审批不交给 Haiku 或 Flash。

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
