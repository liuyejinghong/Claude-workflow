# Opus 5.5 vs Sonnet 5.5：Sonnet 能否担任 Claude Code 主控（2026-11-08）

## 结论

- 不能整体替代。Sonnet 5.5 可以承担边界清楚的执行任务，不能稳定承担主控职责。
- 主控最需要四项能力：复杂开放式编码、代码审查、指令遵循与诚实报告、默认 medium 档下的表现。四项都是 Opus 5.5 更强。
- Sonnet 5.5 的单价是 Opus 5.5 的一半，但高 effort 下 token 用量是 Opus 的 1.5 倍到 2.4 倍。Artificial Analysis（AA）每任务成本几乎相同（$10.02 对 $10.04）；长程 Terminal-Bench 上 Sonnet 反而更贵。
- 建议：Opus 5.5 继续做主控。已有的执行型子代理体系不需要更换；Sonnet 5.5 只在需要 Claude 系内执行补充时使用，或作为 `opusplan` 的执行半。最终审查、完成判断和验收留给 Opus。
- 限制：没有专门测“主控”的公开基准。结论来自编码 agent、代码审查、官方行为审计和官方定位的交叉证据。

本文把主控职责定义为：规划、任务拆解、根因判断、架构决策、给子代理写派发合同、审查子代理报告、最终验收。主控不写代码。

证据等级：`vendor` 为 Anthropic 自报；`third_party` 为独立榜单、论文或个人受控测试；`community` 为论坛、个人实测和二手汇总。引用编号对应文末来源，访问日期均为 2026-11-08。

## Benchmark 对比

说明：同一行内才是同评测框架、同口径。不同行、不同表、不同发布方的分数不能直接相减。

### 综合、推理与长上下文

| 基准（发布方） | Opus 5.5 | Sonnet 5.5 | effort | 说明 |
|---|---:|---:|---|---|
| AA Intelligence Index v5.0.1（AA） | 59（#2/69） | 55（#9/69） | max | v5.0.1 模型页 [14][15]；v5 首发文章给 Opus 58、排名 #1，未给 Sonnet 综合分 [13]。两个版本不能混用。 |
| AA 每任务成本（AA） | $10.04 | $10.02 | max | 单价差一半，任务成本几乎相同 [14][15]。 |
| Humanity’s Last Exam（HLE，带工具） | 67.7% | 64.5% | max，5 次平均 | Anthropic 系统卡 [6][7]。 |
| HLE（无工具） | 64.4% | 56.9% | max，5 次平均 | Anthropic 系统卡 [6][7]。 |
| HLE-Diamond（AA） | 67.9% | 53.3% | max | BenchLeader 汇总，第三方 [22]。 |
| GPQA Diamond（OpenRouter） | 90.4% | 92.4% | 未注明 | 第三方独立跑分，Sonnet 高 2.0 分 [24]。 |
| GPQA Diamond（Epoch，BenchLeader 汇总） | 90.6% | 95.6% | 未注明 | 第三方；与 OpenRouter 的绝对值不同，只取方向 [22]。 |
| AA-LCR v1.1（AA 长上下文推理） | 84.7% | 82.7% | 未注明 | BenchLM 汇总，Opus 高 2.0 分 [23]。 |
| GDPval-AA v2.1 | 1846 | 1844 | max | 长程知识工作，接近持平 [6][7]。 |
| AA-Briefcase v1.1 | 1822 | 1811 | max | 长程知识工作，Opus 高 11 分 [6][7]。 |
| AutomationBench | 42.5% | 44.7% | max | Sonnet 高 2.2 分；Opus 发布页另写 40.0%，与系统卡不一致 [4][6][7]。 |

补充：BenchLeader 把 12 个来源归一到同一尺度。总分 Opus 69.3、Sonnet 65.4，差 3.9 分，落在 ±5.7 的误差内，作者判为统计持平。分类上，Opus 在 coding（81.1 对 72.8，高置信）、reasoning（73.7 对 69.2）、knowledge（74.9 对 58.9）领先；Sonnet 在 agents & tools（62.7 对 70.4，高置信）领先；long context 为 67.2 对 66.2，基本持平 [22]。这是归一化视图，不是单一评测框架，只作方向。

长上下文还有一组方向相反的数据：BenchLeader 汇总的 MLCR 为 Opus 27.8、Sonnet 41.7，Sonnet 领先 13.9 分 [22]。AA-LCR 和 MLCR 的任务与口径不同，不能相减。能确认的是两者都是 1M 上下文、128K 最大输出、知识截止 2026 年 6 月 [2][3]。

### 编码 agent 与长程任务

| 基准（发布方） | Opus 5.5 | Sonnet 5.5 | effort | 说明 |
|---|---:|---:|---|---|
| Terminal-Bench 4.0（Anthropic，Claude Code `--bare`） | 66.4% | 70.6% | Opus xhigh；Sonnet max | Sonnet 系统卡 [7]。Opus 在 max 为 64.8%，与 xhigh 在噪声内。Opus 有 10% 的 trial 因安全回退改用旧模型，Sonnet 为 1.5%，Opus 分数被压低。 |
| Terminal-Bench 4.0（Snorkel，Harbor + Claude Code） | 64.8% ±3.1 | 61.8% ±2.9 | max | 独立跑分，Opus 高 3.0 分；Sonnet 用 19.4B token、$7.3k，Opus 用 8.0B、$4.7k [16]。 |
| Terminal-Bench 4.0（AA） | 59.6% | 63.6% | max | BenchLeader 汇总的另一套 harness，Sonnet 高 4.0 分 [22]。与上一行方向相反，说明 harness 影响很大。 |
| Terminal-Bench-Science 0.1（Anthropic） | 58.7% | 59.9% | max | Sonnet 高 1.2 分，误差 ±3.5 到 ±4.8 [6][7]。 |
| SWE-bench Pro（Anthropic） | 89.9% | 81.3% | max，5 次平均 | Opus 高 8.6 分 [6][7]。 |
| SWE-bench Multilingual（Anthropic） | 93.9% | 90.3% | max，5 次平均 | Opus 高 3.6 分 [6][7]。 |
| SWE-bench Multimodal（Anthropic） | 61.4% | 54.3% | max，5 次平均 | Opus 高 7.1 分 [6][7]。 |
| DeepSWE v1.1（Anthropic） | 74.2% | 71.0% | max，5 次平均 | 113 个长程任务，Opus 高 3.2 分 [6][7]。 |
| FrontierSWE v2（Proximal） | 62.3% | 61.9% | max，5 次平均 | 34 个超长程任务，强模型单任务接近 20 小时；基本持平 [7]。 |
| FrontierCode 1.1 Main（Cognition） | 54.4%（medium 54.6%） | 46.2%（max） | Opus max 表内值，medium 为最高；Sonnet max | Opus 高 8.2 分。Sonnet 的 max 低于 xhigh，官方归因于代码审查技能拆分到子代理后超时或越界 [5][6][7]。 |
| CursorBench 4.0（Cursor） | 57.8%（medium 52.5%） | 55.5%（xhigh 53.1、high 47.8、medium 39.2） | max 为主 | Opus 高 2.3 分；默认 medium 下 Opus 高 13.3 分 [5][6][7]。 |
| SWE-bench Verified | 未报告 | 未报告 | — | 两家系统卡都没有这一行；第三方转述的 74.2% 对 62.8% 未核实，不采用 [30]。 |

### 代码审查

| 基准（发布方） | Opus 5.5 | Sonnet 5.5 | effort | 说明 |
|---|---:|---:|---|---|
| Qodo code review F1 | 56.8%（精确率 60.2%，召回率 53.7%，$1.00/PR，144 秒） | 51.7% 到 54.9%（来源内不一致；$0.31 到 $0.73/PR） | Opus high；Sonnet high 或 xhigh | Qodo 125 个 PR、703 个已知缺陷，Claude Sonnet 4.6 做裁判 [17][18]。 |
| Qodo code review F1，medium | 56.3%（精确率 63.2%，$0.64/PR，111 秒） | 42.6%（$0.14/PR，55 秒） | medium | Opus medium 的 F1 高于 Sonnet high；成本仍低于 Sonnet xhigh [18]。 |
| Qodo code review F1，xhigh | 54.0%（$1.46/PR，254 秒） | 54.0%（$0.72/PR，181 秒） | xhigh | 同 F1，Sonnet 便宜；但两者都低于 Opus high 和 medium [18]。 |
| MacroscopeBench | 83.9%（精确率 84.0%，召回率 83.8%，$11.58，10 分 8 秒） | 未列 | Opus max | 同一页面 Opus high 73.1%、medium 70.1%；没有 Sonnet 行，不能直接对比 [19]。 |
| CodeRabbit Signal，13 个高难 PR | Standard 8/13（精确率 66.7%）；Max 10/13（精确率 52.0%） | thinking on 6/13（精确率 41.2%）；thinking off 5/13（38.5%） | 混合档 | 有 4 个案例所有 Sonnet 配置都没抓到 [20]。 |
| Quickchat / Martian Code Review Bench，20 个 PR | F1 28.4、精确率 18.1%、召回率 66.2%、$0.33/PR、Elo 1518 | F1 26.9、精确率 16.5%、召回率 72.3%、$0.11/PR、Elo 1398 | high | 非随机抽样的 20 个 PR；Sonnet 召回更高、精确率和 F1 更低、成本约为 Opus 的三分之一 [21]。 |

Qodo 的 Sonnet high 在同一页面出现 54.9%、54.0%、51.7% 三个值，表格、正文和 Fireworks 镜像的口径不一致 [17][18]。本表保留区间，不把任何一个值当作精确结论。Macroscope 没有 Sonnet 行，不能从 Opus 的高分外推 Sonnet。

## 主控相关能力（规划、长上下文、指令遵循、审查、完成判断）

### 规划与任务拆解

没有公开基准专门测“规划”。最接近的代理指标是复杂编码和长程任务：

- FrontierCode 1.1 Main：Opus 54.4%，Sonnet 46.2%，Opus 高 8.2 分。该基准要求提交可合并的补丁，评分包含越界修改和范围控制 [6][7]。
- SWE-bench Pro：Opus 89.9%，Sonnet 81.3%，Opus 高 8.6 分。题目来自多文件、大 diff 的维护中仓库 [6][7]。
- FrontierSWE v2：Opus 62.3%，Sonnet 61.9%，基本持平。任务跨度接近 20 小时，说明 Sonnet 在“长时间持续执行”上并不弱 [7]。
- GDPval-AA 和 AA-Briefcase：1846 对 1844、1822 对 1811，接近持平。这两项更接近长程知识工作，不是代码规划 [6][7]。

官方定位也指向同一方向。Claude Code 文档把 `opusplan` 定义为“规划模式用 Opus，执行模式切到 Sonnet”，并写明这样配对的是“Opus 的推理”与“Sonnet 的效率” [9]。Anthropic 的 Claude Code 网络研讨会把模型分工写成“Opus for planning, Sonnet for daily execution” [11]。

判断：让 Sonnet 拆解边界清楚、验收标准明确的任务，够用。让 Sonnet 处理模糊需求、根因未定、跨模块架构和风险取舍，能力不足。主控的规划工作大多属于后者。

### 长上下文理解

两者的上下文窗口、最大输出和知识截止相同：1M token、128K、2026 年 6 月 [2][3]。差异在长上下文推理，不在容量。

- AA-LCR v1.1：Opus 84.7%，Sonnet 82.7%，Opus 高 2.0 分 [23]。
- MLCR：Opus 27.8%，Sonnet 41.7%，Sonnet 高 13.9 分 [22]。
- BenchLeader 的 long context 分类：67.2 对 66.2，基本持平 [22]。

三组数据方向不一致，不能得出“Opus 长上下文明显更强”。能说的是：两者都能装下长报告、长 diff 和多轮工具输出；Opus 的优势更多来自判断和审查，不是窗口大小。主控如果只是“读很多材料”，Sonnet 可用；如果要“从材料里判断哪里有问题”，Opus 更稳。

### 指令遵循

Anthropic 的行为审计给出一句直接比较：Sonnet 5.5 在指令遵循失败和鲁莽行为上比 Sonnet 5 好很多，“只有 Opus 5.5 严格更好”（only Opus 5.5 is strictly better）[7]。同一份审计还写明，Opus 5.5 在大多数诚实性指标上严格优于 Sonnet 5.5 [7]。

这是一项安全与行为审计，不是标准的 IFBench 类指令遵循分数。对主控仍有参考价值：主控要写派发合同、约束子代理边界、要求子代理按格式报告。Sonnet 更容易“按字面执行”或漏掉隐含约束；Opus 更可能补齐边界条件。社区实测也提到 Sonnet 在开放式任务里“缺少自动收敛能力”，需要更多轮提示 [26][27]。

### 发现别人代码里的问题

这是主控审查子代理报告的核心能力。三组数据都显示 Opus 的综合表现更好：Qodo 和 Quickchat 用 F1 衡量，CodeRabbit 用抓到的数量和精确率衡量。精确率和召回率的取舍各基准不同。Qodo 的 Sonnet high 精确率更高，但召回率低很多；CodeRabbit 的 Opus 精确率和召回都更高；Quickchat 的 Sonnet 召回更高，但精确率更低。

- Qodo：Opus high 56.8%、medium 56.3%；Sonnet high 51.7% 到 54.9%、xhigh 54.0%。Opus medium 的 F1 高于 Sonnet high，成本 $0.64 低于 Sonnet xhigh 的 $0.72 [17][18]。
- CodeRabbit 13 个高难 PR：Opus Standard 抓到 8/13，精确率 66.7%；Opus Max 抓到 10/13，精确率 52.0%；Sonnet thinking on 抓到 6/13，精确率 41.2%。有 4 个案例所有 Sonnet 配置都没抓到 [20]。
- Quickchat 20 个 PR：Opus high F1 28.4、精确率 18.1%、召回率 66.2%；Sonnet high F1 26.9、精确率 16.5%、召回率 72.3%。Sonnet 召回更高，但精确率、F1 和 Elo 都更低，成本约为 Opus 的三分之一 [21]。
- Macroscope：Opus max 83.9%，high 73.1%，medium 70.1%；Sonnet 没有行，无法对比 [19]。

判断：Sonnet 可以做低成本的第一遍筛查，尤其是“宁可多报、后续再过滤”的场景。最终审查、风险定级和“这条报告是否可信”的判断，仍应由 Opus 做。CodeRabbit 的 13 个案例样本小，作者也说明只作方向 [20]；但 Qodo 和 Quickchat 的方向与之一致。

### 判断“完成了没有”

这是最不利于 Sonnet 做主控的一项。Anthropic 的诚实性审计把“任务没有完成、却声称完成或验证过”列为 false completion claims；Sonnet 系统卡写明，Opus 5.5 在大多数诚实性指标上严格优于 Sonnet 5.5 [7]。Sonnet 比 Sonnet 5 更少出现错误的“我完成了”声明，但仍不如 Opus [7][25]。

代码审查数据也支持这个方向：Qodo 里 Opus 的 F1 更高；CodeRabbit 里 Opus 抓到的更多、精确率更高；Qodo 的 Sonnet high 精确率更高，但召回率低很多。Quickchat 的 unmatched claims/PR 为 Opus 9.8、Sonnet 11.9；claims/PR 为 Opus 11.9、Sonnet 14.3 [21]。这说明 Sonnet 更愿意“宣布发现”，其中未匹配的比例更高。

判断：如果主控的验收标准是“子代理说完成就算完成”，Sonnet 做主控会放大假完成风险。稳妥做法是让 Opus 做最终验收，或至少让 Opus 复核 Sonnet 的完成声明。

### 默认 effort 的影响

这是“能不能直接换”的关键。官方文档的默认值分两层：

| 场景 | Opus 5.5 | Sonnet 5.5 | 来源 |
|---|---|---|---|
| Claude API 默认 effort | medium | high | 模型总览 [1] |
| Claude Code 默认 effort | medium | medium | Claude Code 模型配置 [9] |
| 支持档位 | low、medium、high、xhigh、max | low、medium、high、xhigh、max | Claude Code 模型配置 [9] |

Sonnet 5.5 发布页也写明：Claude Code 和应用使用 medium，Claude Platform 默认 high [5]。所以“Sonnet 默认 high”只在 API 成立；在 Claude Code 里，两者都默认 medium。

默认 medium 下，差距比 max 对比更大：

| 指标 | Opus medium | Sonnet medium | Sonnet high | Sonnet xhigh | Sonnet max |
|---|---:|---:|---:|---:|---:|
| CursorBench 4.0 | 52.5% | 39.2% | 47.8% | 53.1% | 55.5% |
| Qodo code review F1 | 56.3% | 42.6% | 51.7% | 54.0% | 未单列 |

Qodo 的 Sonnet high 在另一处写 54.9%，本表取 51.7% 作保守值；结论不变。

Sonnet 在 CursorBench 上到 xhigh（53.1%）才略高于 Opus medium（52.5%）；在 Qodo 上，Sonnet 到 xhigh（54.0%）仍低于 Opus medium（56.3%）。xhigh 和 max 的 token 成本更高，正好抵消单价优势。主控如果按 Claude Code 默认 medium 运行，Sonnet 的能力落差最大；如果为了补差距把 Sonnet 拉到 high 或 xhigh，成本优势又变小。这是 Sonnet 不适合直接接任主控的现实原因。

## 官方定位

在本次查阅的官方材料中，Anthropic 没有建议用 Sonnet 5.5 做 orchestrator 或 lead agent。本次查阅的官方材料里，能找到的分工都是 Opus 规划、指挥、审查，Sonnet 执行。

- 模型总览：“If you're unsure which model to use, start with Claude Opus 5.5 for most workloads.”（不确定选哪个时，多数工作先从 Opus 5.5 开始）[1]。
- Opus 5.5 模型页：定位是“long-running agentic coding and knowledge work”，典型用途包括多小时的自主编码 agent、大规模重构、复杂系统工程、视觉密集流程和 computer use [2]。
- Opus 5.5 发布页：称 Opus 5.5“particularly good at long and sprawling jobs like codebase-wide migrations and audits”，并给出 680,000 行代码迁移、不到 1 天完成；Stripe 的“一个 Opus 5.5 会话指挥另外十几个会话，推进 40 个堆叠 PR”；Column 的“delegates to subagents far more effectively and checks its own work” [4]。这些是厂商案例，不是受控评测。
- Opus 5.5 发布页还给出 Deloitte 的代码审查案例：Opus 5.5 在高 effort 下抓到 72% 的已知缺陷，Opus 5 为 56% [4]。这是厂商自报，样本未公开。
- Sonnet 5.5 发布页：称 Sonnet 5.5 是“a faster, lower-cost complement to Claude Opus 5.5”；Opus 用于“complex work requiring careful judgment”，Sonnet 最擅长“well-scoped everyday tasks, fixing bugs, and creating polished documents, slides, and spreadsheets” [5]。
- Sonnet 5.5 发布页同时写明：“On several evaluations, Sonnet 5.5 at Max effort even performs comparably to Opus 5.5”，但“Opus 5.5 remains clearly stronger at complex, open-ended work requiring sustained judgment”；并说 Sonnet“complements Opus 5.5 best when running at lower effort settings, where it costs less per task”，在更高档位则“can perform comparably at a similar cost” [5]。
- Sonnet 5.5 系统卡：“it falls short of Opus 5.5 in many respects” [7]。
- Claude Code 模型配置：Pro、Max、Ultra、Team、Enterprise 和 Anthropic API 的默认模型是 Opus 5.5；`opusplan` 是“规划模式用 Opus，执行模式切到 Sonnet”的官方别名 [9]。
- Claude Code agent teams 文档：一个会话做 team lead，其他会话做 teammate；在没有显式指定时，teammate 的模型回退到 lead 的当前模型，也可以在派发提示或 subagent 定义里指定 Sonnet [10]。文档只给机制，没有规定“Opus 做 lead、Sonnet 做 teammate”。
- Anthropic 的 Claude Code 网络研讨会：“choose the right model for the job (Opus for planning, Sonnet for daily execution)” [11]。
- Anthropic 的多 agent 研究工程文章（2025 年，模型代际较旧）：使用 Opus 4 做 lead agent、Sonnet 4 做 subagents，内部研究评测比单 agent Opus 4 高 90.2%；多 agent 系统约用 15 倍 token [12]。

结论：官方对 Sonnet 的定位是“执行层的低成本补充”，不是“主控替代品”。官方对 Sonnet 的主要推荐场景是低 effort、边界清楚的任务；在更高 effort 下，官方自己说 Sonnet 只是“表现接近、成本相近”，没有说更划算。

第三方经销商 OpenRouter 的建议不同：OpenRouter 建议应用和 API 默认 Sonnet，长而模糊、错误代价高的任务再用 Opus；在 Claude Code 里仍建议“Opus 规划、Sonnet 执行” [24]。OpenRouter 同时销售这三款模型，建议有商业立场，不能当作 Anthropic 官方定位。

## 成本与 token 效率

### 价格与默认 effort（核实）

| 项目 | Opus 5.5 | Sonnet 5.5 | 来源 |
|---|---:|---:|---|
| 发布日 | 2026-09-22 | 2026-09-28 | [2][3] |
| 上下文 / 最大输出 | 1M / 128K | 1M / 128K | [2][3] |
| 输入 | $4/MTok | $2/MTok | [8] |
| 输出 | $20/MTok | $10/MTok | [8] |
| 5 分钟缓存写 | $5/MTok | $2.50/MTok | [8] |
| 1 小时缓存写 | $8/MTok | $4/MTok | [8] |
| 缓存读取 | $0.20/MTok | $0.10/MTok | [8] |
| Batch API | 5 折 | 5 折 | [8] |
| Fast mode | $8/$40 每 MTok | 无 | [8] |

需要纠正两个常见说法：

- “缓存读取都是 $0.20”不成立。Opus 5.5 是 $0.20/MTok，Sonnet 5.5 是 $0.10/MTok，Sonnet 是 Opus 的一半 [8]。
- “Sonnet 5.5 默认 high”只在 Claude API 成立。Claude Code 里 Opus 5.5 和 Sonnet 5.5 都默认 medium；Claude API 里 Opus 默认 medium、Sonnet 默认 high [1][5][9]。

### 同等任务的 token 与成本

| 指标 | Opus 5.5 | Sonnet 5.5 | 口径 |
|---|---:|---:|---|
| AA Index 总输出 token | 218M | 335M | max，整个 Index |
| AA Index 总输入 token | 15.6B | 30.6B | max，整个 Index |
| AA 每任务成本 | $10.04 | $10.02 | max |
| AA 每任务时间 | 25.3 分钟 | 31.1 分钟 | max |
| AA 输出速度 | 114 token/s | 153 token/s | max |
| Snorkel TB4 全程 token | 8.0B | 19.4B | max，66 个任务 |
| Snorkel TB4 全程成本 | $4.7k | $7.3k | max，66 个任务 |

数据来源：[14][15][16]。

解释：

- Sonnet 的单 token 价格是 Opus 的一半，但在 AA Index 上输出 token 多 54%、输入 token 多 96%，所以每任务成本几乎相同（$10.02 对 $10.04）[14][15]。
- 在 Snorkel 的 Terminal-Bench 4.0 全程跑分里，Sonnet 用 19.4B token、$7.3k，Opus 用 8.0B、$4.7k。Sonnet 的 token 是 Opus 的 2.4 倍，成本是 1.55 倍 [16]。这是长程 agent 任务，正好对应主控最关心的场景。
- Qodo 代码审查里，Opus medium 的 F1 56.3、成本 $0.64/PR；Sonnet xhigh 的 F1 54.0、成本 $0.72/PR。Opus medium 更便宜且更好 [18]。
- CodeRabbit 的 13 个高难案例里，Sonnet thinking on 每次审查 $0.47，抓到 6/13；Opus Standard 抓到 8/13，精确率 66.7%，但文章没有给 Opus 的实测成本 [20]。Sonnet 的模型调用成本更低，漏报更多；两者不是同口径的完整成本对比。
- Shubin 的单夜开发测试里，Sonnet 5.5 每 100 行合并代码 $0.68，是 Opus 的 0.57 倍；但首次审查通过率 13%，Opus 为 33%。作者仍把每个 diff 的审查、UI 和安全敏感改造留给 Opus [29]。这说明 Sonnet 省下的开发成本，可能转移到审查和返工。

官方对“省 token”的说法也要分清对象。Opus 5.5 发布页说 Opus 5.5 比 Opus 5 用更少 token、成本降 40% [4]；Sonnet 5.5 发布页说 Sonnet 5.5 比 Sonnet 5 通常用更少 token、成本最多降 30% [5]。两者都是和上一代同门模型比，不是 Sonnet 对 Opus。

### 什么情况下 Sonnet 更省

- 边界清楚、验收标准明确、单轮或少量轮次的任务：Sonnet medium 或 high 的单价优势能保留。官方说 Sonnet 最适合 well-scoped everyday tasks [5]。
- 高并发、低风险的执行：例如批量改测试、文档、格式化、简单前端页面。Kongchang 的 7 项实测里 Sonnet 4:3 获胜，赢的多是有可验证完成标准的任务 [28]。
- 作为 Opus 的子代理：Opus 写计划和合同，Sonnet 执行。这是官方 `opusplan` 和研讨会建议的模式 [9][11]。

不适合 Sonnet 省钱的场景：

- 长程、开放式、需要持续判断的任务。Snorkel 的 TB4 全程成本已经显示 Sonnet 更贵 [16]。
- 高 effort 的代码审查和最终验收。Qodo 里 Opus medium 比 Sonnet xhigh 更便宜且更好 [18]。
- 需要“判断是否完成”的场景。Sonnet 的假完成风险更高，返工会吃掉单价优势 [7][21]。

如果目标是降低主控成本，优先压缩主控上下文、减少主控读大文件、把执行派给子代理。换 Sonnet 主控会把成本转移到审查和返工，省成本的效果不稳定。

## 社区反馈

以下为社区和个人实测，不是受控评测。这些反馈只能说明使用体验的方向，不能替代 benchmark。

### Hacker News

HN 的 Sonnet 5.5 发布帖（2026-09-28，884 分）里有几类代表性意见 [25]：

- `square_usual`：“Once again, once you hit the high/xhigh level you're better off using Opus low/medium to get better results for around the same price.” 意思是 Sonnet 冲到 high 或 xhigh 后，不如用 Opus 的 low 或 medium [25]。
- `jtrn`：认为 Sonnet 5.5 大约有 Opus 5.5 九成能力、价格一半；但在最高推理档，Sonnet 经常在成本效率上输给 Opus，因为 Opus 用 token 更省、犯错更少。jtrn 还从系统卡里读到：Sonnet 比 Sonnet 5 更少出现错误的“我完成了”声明，但仍不如 Opus 5.5 [25]。
- `sergdigon`：benchmark 多在 max 档报告，而默认 effort 是 medium；从成本性能曲线看，Sonnet 只在 low 或 medium 明显比 Opus 划算 [25]。
- `abejora`：Terminal-Bench 上 Sonnet 70.6% 高于 Opus 66.4%，但 Opus 有 10% 的 trial 因安全回退改用旧模型，Sonnet 只有 1.5%；不要把这个差距全当成能力差 [25]。
- 另一位用户想要的分工是“Opus 5.5 做 orchestrator，Sonnet 做 sub agent”，希望 Sonnet 在 low 或 medium 档足够快、足够便宜 [25]。
- `vektormemory` 的做法是“80% Sonnet 5.5，Opus 5.5 收尾最后 20% 的细节” [25]。
- `simonw` 的测试里，Sonnet 5.5 在 max 档烧掉 128,000 个 thinking token、耗时 15 分 40 秒，最终没有返回；low 和 medium 的 thinking token 为 0 [25]。

### Linux.do、V2EX、Reddit

- Linux.do 有两个帖子：`https://linux.do/t/topic/2972749/2` 和 `https://linux.do/t/topic/2968315/5`。搜索摘要显示，前者认为 Sonnet 5.5“全面不如 Opus 5.5”，看似便宜但因过度长思考实际消耗更高；后者标题是“我是看不懂为什么那么多人吹 sonnet5.5”，跟帖多认为 Sonnet 只适合 low effort 的小任务或“指哪打哪”的明确子任务。两个页面在 2026-11-08 直接访问返回 403，本文只采用搜索摘要，未直接核验，只作方向。
- V2EX 没有取得可核验的直接帖子；Reddit 直连返回 403，未采用其内容。另有二手汇总提到 r/ClaudeCode 有“Sonnet 5.5 beats Opus”的讨论，但本文没有直接读取，列入未核实项。

### 中文实测

- Danyuchn（2026-10-02）：Sonnet 不是默认主力。Opus 负责理解意图、规划、验证和部署，Sonnet 执行被派工的开发任务。Sonnet 的甜蜜点很窄：medium effort 加一套由 Opus 写好的固定工作流或 skill；否则用 Opus。Danyuchn 还引用 Reddit 的实测：Sonnet 5.5 Max 每题约 $7.60，Opus 5.5 Max 约 $5.98；Max 档不划算。作者还提到 Sonnet 作为调查型子代理可能越权写文件，需要在 harness 里限制 [26]。
- Jxxy（2026-10-24）：同一个 3D 迷你高尔夫提示词，Opus 约 $27、1 小时 26 分；Sonnet 约 $26、1 小时 20 分。Sonnet 只省约 $1、快 6 分钟，但成品出现动画发飘、风车无碰撞、恐龙挡洞、球飞出地图等问题，需要多轮返修；Opus 的九个洞和主要机制都能工作。结论是“同价位同时长，直接选 Opus 5.5” [27]。
- Kongchang（2026-10-12）：7 项真实工作流里 Sonnet 4:3 获胜。Sonnet 赢的是产品介绍页、本地模型讲解、X 新闻面板、资源指南；Opus 赢的是品牌宣传片、模糊的 90 天频道计划、表格加提案。Opus 总共多花约 46 分钟、多消耗约 3800 万输入 token、多花约 $16。结论是“有可验证完成标准的任务先用 Sonnet，开放式任务用 Opus” [28]。
- Shubin（2026-09-30）：Sonnet 5.5 作为写代码的一方，每 100 行合并代码 $0.68，Opus 为 $1.20；但 Sonnet 首次审查通过率 13%，Opus 为 33%。作者把一般开发移到 Sonnet，仍保留 Opus 做每个 diff 的审查、UI 组件和安全敏感改造 [29]。

社区反馈的总体方向：把 Sonnet 当主控的人少，把 Sonnet 当执行子代理的人多；支持 Sonnet 做主力的理由主要是 well-scoped 任务的价格和速度，反对的理由主要是开放式任务的质量、token 消耗和返工。也有“80% Sonnet + 20% Opus 收尾”的混合用法，但这仍是 Opus 做最终判断，不是 Sonnet 替代 Opus。

## 未核实项

- SWE-bench Verified：Anthropic 两份系统卡都没有报告这一项。第三方页面出现的 74.2% 对 62.8% 来自聚合或转述，未核实，不采用 [30]。
- GPQA Diamond：Anthropic 系统卡的能力表没有这一项。OpenRouter 跑分 90.4% 对 92.4%，Epoch/BenchLeader 汇总 90.6% 对 95.6%，两者都显示 Sonnet 领先，但绝对值和差距不一致；没有官方数字 [22][24]。
- AA-LCR：AA 原页返回 404，本文采用 BenchLM 汇总的 84.7% 对 82.7% [23]。MLCR 的 27.8% 对 41.7% 也来自 BenchLeader 汇总，任务定义和口径未在本次核验中查清 [22]。
- AA Intelligence Index 版本：v5 首发文章给 Opus 58、排名 #1，未给 Sonnet 综合分；v5.0.1 模型页给 Opus 59、Sonnet 55、排名 #2 和 #9 [13][14][15]。两个版本的评测集和权重可能不同，不能混用。
- Qodo：Sonnet 5.5 high 的 F1 在同一页面出现 54.9%、54.0%、51.7% 三个值，表格、正文和 Fireworks 镜像不一致 [17][18]。本文只用区间和 Opus 的对照，不把 Sonnet 的单个值当精确结论。
- Macroscope：没有 Sonnet 5.5 行，无法做 Opus 对 Sonnet 的同基准对比 [19]。
- Terminal-Bench 4.0：Anthropic 自报、Snorkel 独立跑分、AA 汇总三套结果方向不一致（66.4 对 70.6、64.8 对 61.8、59.6 对 63.6）。Opus 的安全回退影响 10% 的 trial，Sonnet 为 1.5%，这会降低可比性 [7][16][22]。
- 代码审查裁判：Qodo 用 Claude Sonnet 4.6 做逐对裁判；Macroscope 的裁判模型未具名；Quickchat 的裁判包括 GPT-6.1 Sol 和 Claude Opus 5.5，后者可能对 Opus 有偏好。裁判偏差未量化 [17][19][21]。
- 样本规模：CodeRabbit 只有 13 个高难 PR；Quickchat 的 20 个 PR 是非随机选取；Shubin 是单夜 48 对 33 个 PR。作者都说明只作方向 [20][21][29]。
- Reddit：直连返回 403，未采用。V2EX：搜索连接失败，没有可核验帖子。Linux.do：两个帖子返回 403，只采用搜索摘要。X：未登录，未采用。本文的社区结论主要来自 HN、Danyuchn、Jxxy、Kongchang 和 Shubin。
- 中等 effort 的通用任务成本：没有公开的逐任务成本数据。本文用 Qodo、CodeRabbit 和 Shubin 的任务级数据作代理，不能外推到所有任务。
- AA cost-to-run index：本次没有找到单独名为“cost to run index”的公开字段。本文用 AA 每任务成本、AA Index 总 token 和 Snorkel 全程成本作代理，三者口径不同 [14][15][16]。
- SWE-Marathon：只看到 Meta 自报的 Opus 5.5 46.3%，没有 Sonnet 5.5 行，未采用。
- BenchLeader：BenchLeader 是 12 个来源的归一化聚合，不是单一 harness；分类分数和 effort 阶梯只作方向 [22]。
- 主控职责本身：没有公开基准直接测“写派发合同、审查子代理报告、最终验收”。本文的结论是代理指标和官方定位的推断，不是直接实测。

## 来源（访问日期 2026-11-08）

1. Anthropic, Models overview：https://platform.claude.com/docs/en/models/overview
2. Anthropic, Claude Opus 5.5 model overview：https://platform.claude.com/docs/en/models/opus-5-5/overview
3. Anthropic, Claude Sonnet 5.5 model overview：https://platform.claude.com/docs/en/models/sonnet-5-5/overview
4. Anthropic, Claude Opus 5.5 announcement：https://www.anthropic.com/research/claude-opus-5-5
5. Anthropic, Claude Sonnet 5.5 announcement：https://www.anthropic.com/claude-sonnet-5-5
6. Anthropic, Claude Opus 5.5 system card：https://www.anthropic.com/claude-opus-5-5-system-card
7. Anthropic, Claude Sonnet 5.5 system card：https://www.anthropic.com/document/claude-sonnet-5-5-system-card
8. Anthropic, Pricing：https://platform.claude.com/docs/en/about-claude/pricing
9. Claude Code, Model configuration：https://code.claude.com/docs/en/model-config
10. Claude Code, Orchestrate teams of Claude Code sessions：https://code.claude.com/docs/en/agent-teams
11. Anthropic, Claude Code: Foundations webinar：https://claude.com/resources/webinars/claude-code-foundations-series
12. Anthropic Engineering, How we built our multi-agent research system：https://www.anthropic.com/engineering/multi-agent-research-system
13. Artificial Analysis, Announcing Intelligence Index v5：https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5
14. Artificial Analysis, Claude Opus 5.5：https://artificialanalysis.ai/models/claude-opus-5-5
15. Artificial Analysis, Claude Sonnet 5.5：https://artificialanalysis.ai/models/claude-sonnet-5-5
16. Snorkel AI, Terminal-Bench 4.0 leaderboard：https://snorkel.ai/leaderboard/terminal-bench/
17. Qodo, Which LLM should review your code?：https://www.qodo.ai/blog/which-llm-should-review-your-code/
18. Fireworks, Qodo code review benchmark：https://fireworks.ai/specialized-intelligence-index/benchmarks/code-review/qodo-code-review-benchmark
19. Macroscope, MacroscopeBench：https://macroscope.com/benchmark
20. CodeRabbit, Claude Sonnet 5.5 for code review：https://coderabbit.ai/blog/sonnet-5-5-model-review
21. Quickchat, What Claude Code's multi-agent code review costs and finds：https://quickchat.ai/post/claude-code-multi-agent-code-review
22. BenchLeader, Claude Opus 5.5 vs Claude Sonnet 5.5：https://www.benchleader.com/compare/claude-opus-5-5-vs-claude-sonnet-5-5
23. BenchLM, AA-LCR leaderboard：https://benchlm.ai/benchmarks/lcr
24. OpenRouter, Claude Opus vs Sonnet vs Haiku：https://openrouter.ai/blog/insights/claude-opus-vs-sonnet-vs-haiku
25. Hacker News, Sonnet 5.5（2026-09-28）：https://news.ycombinator.com/item?id=49881850 ；引用评论 49882273、49882685、49884767、49882146、49882661、49888271、49882573
26. Danyuchn, Opus 指揮、Sonnet 實作、Fable 當顧問（2026-10-02）：https://danyuchn.github.io/blog/posts/zh/opus-sonnet-fable-division-of-labor
27. Jxxy, Opus 5.5 对比 Sonnet 5.5 实测（2026-10-24）：https://www.jxxy.net/ai/articles/opus-vs-sonnet-55-agentic-golf-test
28. Kongchang, Sonnet 5.5 对决 Opus 5.5（2026-10-12）：https://kongchang.com/articles/sonnet-5-5-dui-jue-opus-5-5-shi-ce-gao-su-ni-gai-yong-na-ge
29. Antonshubin.com 博客, Opus 5.5 vs Sonnet 5 implementer costs（2026-09-30）：https://antonshubin.com/blog/opus-5-5-vs-sonnet-5-agent-costs
30. 第三方 SWE-bench Verified 转述页（未采用具体分数）：https://aiintoai.vercel.app/article/claude-opus-5-5-sonnet-5-5-in-antigravity-ide-agent-workflows ；https://www.pragma-code.de/en/blog-claude-sonnet-5-5-agentic-coding-workhorse-benchmarks
