# DeepSeek V4.1 Flash 的力工定位与证据

日期：2026-10-09。

本文件记录把 DeepSeek V4.1 Flash 编入力工档的依据。它是力工档第二名：默认力工仍是 GLM-5.3-Flash（额度最宽、同档能力最高），DeepSeek V4.1 Flash 在"总时长或缓存成本决定结果"时替换它，Haiku 5.5 只承担短上下文、急着要结果的插队任务。档内排序依据是**供给可持续 > 单位能力 > 速度**，速度排在最后，因为力工任务通常不在关键路径上。

## 订阅额度与计费

| 项目 | OpenCode Go | Command Code GOAT |
|---|---|---|
| 月费 | $10（Go Plus $40） | $10 |
| 月度额度 | 独立额度 $60（Go Plus $120） | $60，但属于 $70 共享池 |
| 窗口 | 5 小时 = 月额度 20%（$12）、周 50%（$30）、月 100%；按模型独立记账 | 5 小时 $14、周 $35（池级），月 $70 |

- 两边官方文档均把 DeepSeek V4.1 Flash 列为**加成额度**；Command Code 价格页写明"permanently boosted monthly credits, with no end date"。
- OpenCode Go 的额度**按模型独立计算**，Haiku 的 $15 与 DeepSeek 的 $60 互不挤占（控制台文档原文："Each model's monthly limit below determines how its usage counts toward those allowances"）。GOAT 是共享池，两个模型会互相消耗。
- 超限行为：OpenCode Go 需开启控制台 "Use balance" 才回落到 Zen 余额，否则请求被拦；GOAT 可买额外 credits（不过期、可结转），没有则付费模型不可用、免费模型继续。

**峰谷计费（只有 DeepSeek V4 Pro/V4.1 Flash/V4 Flash 系列有）：**

| 时段 | 输入 | 输出 | 缓存读 |
|---|---|---|---|
| 非高峰 | $0.15 | $0.60 | $0.003 |
| 高峰 | $0.30 | $1.20 | $0.006 |

高峰为周一至周五 01:00–04:00 与 06:00–10:00 UTC，**即北京时间工作日 09:00–12:00 与 14:00–18:00**，正好覆盖常规工作时间。批量任务尽量错峰，否则等效额度减半。

对比：Haiku 5.5 ≤100K 为 $0.10 / $0.50 / 缓存读 $0.01，>100K 为 $0.50 / $2.50 / $0.05（5 倍档）；GLM-5.3-Flash 为 $0.15 / $0.50 / $0.03 的平价档。DeepSeek 的输出单价高于 GLM-5.3-Flash，但**缓存读为栈内最低**（GLM 的 1/10、Haiku 的 1/3.3），且无长 prompt 加价。

上下文 1M、最大输出 384K，支持 tool use，thinking 默认开启。官方按参考请求形态（410 未缓存输入 + 71,300 缓存读 + 310 输出）估算 $60 额度约合每月 13 万次请求（5 小时窗口 $12 约 2.6 万次）。

## 第三方能力对比

Artificial Analysis 智能指数 **v4.3.2**（与仓库存档的 Haiku/GLM 数据同版本，可直接比）：

| 测量 | DeepSeek V4.1 Flash | GLM-5.3-Flash | Claude Haiku 5.5 |
|---|---|---|---|
| 智能指数 v4.3.2 | Max 39（非推理 25） | 42 | Max 43 / High 38 / Medium 34 |
| Terminal-Bench 4.0 | 27%（Max） | 33% | Max 33% / High 22% |
| 输出吞吐 | 217.4 tok/s | 51 tok/s | 173 tok/s（High） |
| 月额度（OpenCode Go / GOAT） | $60 / $60 | $60 / $60 | $15 / $20 |

- **维度**：能力上 DeepSeek V4.1 Flash 位于 Haiku High（38）与 Haiku Max（43）之间，低于 GLM-5.3-Flash（42）；Terminal-Bench 4.0 是三者最低，因此**多步工具链推演、复杂根因、高风险实现不交给它**。
- **速度**：217.4 tok/s 为栈内最高，但这是 Artificial Analysis 对各家一方 API 的测量，不是经 Magpie 的本机实测；档位口径不完全一致，只作量级参考。
- **成本**：AA 给出其每次智能指数任务成本 $0.27；Haiku 与 GLM-5.3-Flash 无同口径数字，不能据此做成本效率比较。

## 未核验

- **TTFT**：AA 模型页的 1.16 秒与发布页的非推理档 1.15 秒基本一致，**很可能是非推理档数字**；AA 未公布 Max 档 TTFT，不能与 Haiku High 26.15 秒、GLM-5.3-Flash 42.13 秒直接比较。早期的"延迟低一个数量级"说法不成立。
- **推理档位**：模型卡称 reasoning effort 为 1–100 的连续整数，另有 changelog 称支持 low/high/max，两者表述不一致，V4.1 Flash 的实际可选档位未核实。因此 agent 定义**不加 effort 后缀、不写 effort 字段**，由上游默认（thinking 开启）决定。
- **OpenCode Go 的 $60 是否为长期额度**：2026-09-13 的仓库 issue 称 $60 是 4x 促销、常规额度 $15、标称 09-20 结束；当前官方文档（2026-10-08 更新）仍写 $60 且无促销标注，无法证实或推翻。若回落，DeepSeek 相对 GOAT 的优势消失。
- 未做本机性能 A/B、未做 1M 上下文压力测试。

## 来源

- [OpenCode Go 文档](https://opencode.ai/docs/go/) · [控制台文档](https://opencode.ai/v2/docs/console/go)
- [Command Code GOAT 计划](https://commandcode.ai/docs/plans/goat) · [价格与额度](https://commandcode.ai/docs/resources/pricing-limits) · [用量限制](https://commandcode.ai/docs/resources/usage-limits)
- [DeepSeek 官方 API 价格](https://api-docs.deepseek.com/quick_start/pricing) · [V4.1 Flash 发布公告](https://www.deepseek.com/en/news/deepseek-v4-1-flash/)
- [Artificial Analysis：DeepSeek V4.1 Flash](https://artificialanalysis.ai/models/deepseek-v4-1-flash) · [与 V4 Flash 对比页（Terminal-Bench 4.0）](https://artificialanalysis.ai/models/comparisons/deepseek-v4-1-flash-vs-deepseek-v4-flash)
- Haiku 与 GLM-5.3-Flash 的数据与限制见 [Haiku 与 Flash 的分工证据](haiku-vs-glm-flash.md)。
