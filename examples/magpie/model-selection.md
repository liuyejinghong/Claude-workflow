# 模型分工与选型依据

日期：2026-10-20（更新）。当前分工（见下节）依据用户在实际使用中的偏好调整（用户体感，非受控测试或 benchmark）；下文数值与测量为用户提供的材料，研究截至 2026-10-10，本次未独立核源；本地验证按实际完成日期标注。路由与接入事实以 [routing.md](routing.md) 为准，本文不重复。本文的分工是仓库 `--preset` 个人预设的示例，不是通用安装要求；通用安装见 [README](../../README.md#快速开始)。

## 当前分工

具名子代理中 Sol 与 Astra 默认 xhigh，其余默认 max（9 个定义：8 个核心 + 可选 Gemini），不按 effort 拆分档位；选型顺序为风险与合同优先，其次模态、任务形态、上下文与延迟。

本节是当前口径；下文「用户实际体验与供给约束」「用户提供的基准数据」「验证状态与历史观察」保留 2026-10-12 前后的历史记录与研究材料，不回改。

- `minimax-m3.1-flash-free`（free 档）：日常执行默认——网络与文档调研、并发取证与有来源报告、代码/调用链/日志定位与问题线索、多工具自动化，以及主控已定方案内的常规实现、修复、测试与重构。
- `deepseek-v4.1-flash-free`（free 档）：与 MiniMax free 同范围，作为备选；两者在角色卡里靠 priority 决定先后，不由本节决定。
- `deepseek-v4.1-flash`（付费档）：与上两者同范围，排在两个 free 档之后。
- `glm-5.3`：Claude Code CLI 常规编码候选，适用于主控方案下的业务逻辑、已知根因修复、补测试与跨文件非机械等价重构；纯编码与文本代码推演，无原生视觉。
- `glm-5.3-flash`：仅用户明确指定时选用——质量优先的编码与原生多模态；不进日常选型与自动 fallback。
- `gpt-6.1-terra`：常规编码候选——主控已定方案下的常规实现、已知根因修复、测试、保持行为重构与取证；根因、架构与高风险实施决策及最终验收仍在主控与 Sol。不宣称能力、视觉或速度优势。
- `gpt-6.1-sol`：最难根因、跨模块合同与困难高风险实现（并发、恢复、持久化、外部副作用），以及关键整体审查（集成后一次，不逐文件重复）。
- `gpt-6-astra`：独立审查的第二候选——Sol 之后用新上下文做正确性、合同与边界情况复核及聚焦的第二意见；困难高风险实现仍以 Sol 为主；不设「Sol 不足再升级 Astra」的梯度。
- `gemini-3.8-flash`（可选）：仅指定纯文字润色与 UI 审美反馈。

## 历史分工（2026-10-12 口径）

以下是 2026-10-12 当时的分工快照，含已停用的 `haiku-5.5`，只作历史记录，不回改。

- `deepseek-v4.1-flash`：调研与自动化主力——网络与文档调研、并发取证与有来源报告、代码/调用链/日志定位与问题线索、多工具自动化、批量与长上下文检索；速度快、覆盖广；常规编码优先 `glm-5.3`，紧凑急修用 `haiku-5.5`；高风险实施归 Sol。
- `glm-5.3-flash`：质量优先的编码与原生多模态（图片/截图等）；编码能力强但明显较慢，能接受等待时选用；紧凑、速度敏感的编码优先 `haiku-5.5`，调研与自动化优先 DS，常规 CLI 编码优先 `glm-5.3`；不是只做机械任务，上游视觉未全部实测、不宣称已全部验证。
- `haiku-5.5`（max，唯一档位）：Claude Code 原生协同，紧凑上下文、速度敏感的范围可控代码修复、测试、局部调查与审查、文档；大上下文与持续的检索、自动化批量优先 DS，常规编码优先 `glm-5.3`。
- `glm-5.3`：Claude Code CLI 常规编码主力，适用于主控方案下的业务逻辑、已知根因修复、补测试与跨文件非机械等价重构；纯编码与文本代码推演，无原生视觉（厂商外挂解析 ≠ 原生），依赖图片/截图的任务优先原生视觉模型（GLM-Flash、Haiku、Sol）；已提取文字可供其编码，不保证比 Flash 强。
- `gpt-6.1-sol`：最难根因、跨模块、高风险实现与关键整体审查；快速 worker 先整理证据与测试入口，Sol 集中关键实现或在同功能集成后一次审查，减少重复全仓读取与细碎 fanout；主控保留根因、架构与独立验收，速度不得把应由 Sol 承担的任务降级。
- `gpt-6-astra`：深度研究、证明、仿真等专项，或未决难题的独立第二意见；不设「Sol 不足再升级 Astra」的梯度，普通困难工程优先 Sol，不进常规批量链。
- `gemini-3.8-flash`：指定纯文字润色与 UI 审美反馈，边界不变。

## 用户实际体验与供给约束（2026-10-12；用户观察，非受控测试或 SLA）

- 速度与成本：DeepSeek V4.1 Flash 便宜快；GLM-5.3 本体是用户 CLI 编码更稳的首选，但慢且相对贵；Haiku 5.5 与 Claude Code 原生协同好；Sol 慢（约 20 tok/s，用户观察，非 benchmark/SLA），额度大。
- 任务适配：大量网络调研、并发取证成报告、代码定位与工具自动化优先 DeepSeek V4.1 Flash；CLI 常规编码首选 GLM-5.3 本体；GLM-5.3-Flash 的原有编码/视觉体验来自明确不同的模型。
- 能力：用户认为 Sol 能力最高、与 Astra 接近（用户判断，非受控评测）。
- 供给：Haiku 额度少，且超过 100K 上下文按五倍计费（用户约束）：更适合紧凑上下文、速度敏感的范围可控任务，大上下文与持续批量的检索、自动化优先 DS，常规编码优先 GLM-5.3。本节仅记录选型理由，不构成常驻配额/记账规则。

## 用户提供的基准数据（选型假设；研究截至 2026-10-10，本次未独立核源）

| 测量（Artificial Analysis v4.3.2；Haiku/Luna/DeepSeek 为 Max 档，GLM-5.3-Flash 按 AA 测试配置） | Haiku 5.5 | GLM-5.3-Flash | DeepSeek V4.1 Flash | Luna |
|---|---|---|---|---|
| 综合 Intelligence Index | 43 | 42 | 39 | 38 |
| Terminal-Bench 4 | 33% | 33% | 27% | 13% |
| AutomationBench | 35% | 60% | 69% | 53% |

适用边界：token/s 是吞吐，不代表任务完成时长；不同 harness 的官方数字不能直接排序；本地订阅网关未做 A/B。上表用于选型假设，不构成本地已验证结论。Haiku 列为 Max 档测量，与当前唯一 `haiku-5.5`（max）配置一致。

Luna 目前仅为候选（轻量、成本敏感场景可考虑）：未接入、无工具往返证据，不添加 agent 或 route；单次低成本不足以断言复杂工程更省钱。

## 验证状态与历史观察

路由验证事实单源在 [routing.md](routing.md)：DeepSeek V4.1 Flash 的 max 路由已通过工具往返与 CLI 运行；GPT 系 `:max`（Sol、Astra）经临时只读定义的原生 CLI 验证 max 路由（2026-10-11 历史记录；Sol 现默认 `:xhigh`，已于 2026-10-14 通过原生 CLI 最小回复冒烟，详见路由示例），最终仓库/本机定义配置已独立核对一致；合并后的本机唯一 `haiku-5.5` 已通过 `--agent haiku-5.5` 原生 CLI 加载冒烟（未用 `--agents` 覆盖），Magpie 日志 served 真实 Haiku、status 200、`tries` effort=max / fixed=max；仓库与本机定义一致性、安装迁移与重复安装演练均通过。受控读取冒烟不构成能力 A/B。未核验：服务商内部计算预算、CommandCode 渠道、各 max 档性能 A/B，不宣称所有供应商视觉均已实测。

历史观察：

- 2026-10-08 用户本地观察到 Haiku 约 100–200 tok/s、最快约 300 tok/s：使用体验观察，不是基准或 SLA。
- Haiku 聚合子代理实际 CLI 调用曾报 Command Code `Invalid input at messages.1.role`（会话内 `system` 被该渠道拒绝），保留为历史观察，待 Magpie 兼容回退或上游支持。

## 实测建议

需要对比时，对同仓库、同 harness 的任务做一次，记录成功率、最终测试结果、返工次数、token 消耗与耗时；不新增基准框架，不做笼统的能力排名。用户速度观察不替代受控对比。

## 来源

- [Artificial Analysis Haiku 与 GLM-5.3-Flash](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-glm-5-3-flash)
- [Artificial Analysis GPT-6 Luna 与 DeepSeek V4.1 Flash](https://artificialanalysis.ai/models/comparisons/gpt-6-luna-vs-deepseek-v4-1-flash)
- [Artificial Analysis Haiku 与 DeepSeek V4.1 Flash](https://artificialanalysis.ai/models/comparisons/claude-haiku-5-5-vs-deepseek-v4-1-flash)
