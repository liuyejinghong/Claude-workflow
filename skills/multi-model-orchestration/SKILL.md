---
name: multi-model-orchestration
description: >-
  Claude 主控 + 外部模型 subagent（GPT-6 Astra / GPT-6.1 Sol / GLM-5.3 / GLM-5.3-Flash / DeepSeek V4.1 Flash / Claude Haiku 5.5 / 可选 Gemini 3.8 Flash 专项）的委托与编排手册。在以下场景使用：需要把写/改代码的任务委托出去、决定用哪个模型、写委托 prompt、审查 subagent 产出、或在 Workflow / ultracode 模式下编排多 agent。
---

# 多模型委托与编排

Claude（主控）负责规划、根因判断、架构决策与最终验收；执行工作委托给外部模型 subagent。当前本机通过 Claude Code → Magpie → 各上游路由，上游与模型 routes 统一在 Magpie UI 管理。**委托是为了省 Claude 额度和并行**；关键结论与最终验收仍由 Claude 做。

## 1. 选哪个模型

| 优先级 | subagent_type | 模型 / 推理 | 额度 | 用途 |
|---|---|---|---|---|
| 复杂/高风险 | `gpt-6.1-sol` | GPT-6.1 Sol / high | ChatGPT Pro（与 Astra 共享） | 编程与 computer use 接近 Astra，成本约其 1/5，质量明显强于 GLM-5.3。复杂根因、多模块行为变更、跨语言合同、状态所有权、订单幂等/成交归因/恢复链路等高风险实现与关键审查 |
| 常规实现 | `glm-5.3` | GLM-5.3 / max | GLM Coding Plan（用户体验近乎无限） | 质量明显低于 Sol。方案与合同已由主控明确、可执行验收且需要更多推演的常规逻辑：局部业务逻辑、已定位根因的局部 bug 修复、测试补充、行为不变重构、多处同类修改，不只是样板；大规模并行 fan-out。不让它独自决定架构或复杂并发/恢复/副作用语义 |
| 高速低复杂度执行 | `haiku-5.5` | Claude Haiku 5.5 / medium | OpenCode Go（有 5 小时/周/月额度） | 需求清楚、验收直接、低风险、无需复杂推演时优先：文件/调用方/测试入口检索、证据提取、摘要整理/结构化提取、文档同步、指定测试、主控已明确方案的简单实现/局部修复/测试补充、批量同类修改。可落实明确执行任务；复杂根因调查仅供线索，不独自决定架构、复杂根因、并发/恢复/交易/持久化/外部副作用安全或高风险最终审批；测试结果据实际输出报告，不能编造 |
| 高频批量/规模执行 | `glm-5.3-flash` | GLM-5.3-Flash / max | GLM Coding Plan | 优先持续高频批量、大规模 fan-out 和额度吞吐；也可做文件/调用方/测试入口定位、日志证据提取、摘要整理/结构化提取、按指定命令跑测试并回报原始结果、文档同步、明确重命名和简单低风险修改。复杂根因调查仅供线索，不独自决定架构、复杂根因、并发/恢复/交易/持久化/外部副作用安全或高风险最终审批；测试结果据实际输出报告，不能编造 |
| 墙钟/长缓存批量 | `deepseek-v4.1-flash` | DeepSeek V4.1 Flash（Magpie 聚合路由 `group/deepseek-v4.1-flash`，已实测工具往返通过） | Magpie 聚合组（OpenCode Go 与 Command Code 自动选渠道）；额度随渠道不同：OpenCode Go 侧独立 $60/月（5 小时窗口 20%），Command Code 侧为 $70 共享池内的 $60 上限 | 需要总时长或缓存成本决定结果时用：大规模并行 fan-out 需尽快收齐、超大缓存上下文的长会话、高频短条目批量；缓存读 $0.003/M 为栈内最低且无长 prompt 加价，输出吞吐实测最高。agentic 编码低于 GLM-5.3-Flash，不做多步工具链推演、复杂根因或高风险；工作日北京时间 09:00–12:00 与 14:00–18:00 为高峰约 2 倍价，批量尽量错峰。不独自决定架构、复杂根因、并发/恢复/交易/持久化/外部副作用安全或最终高风险审批；测试结果据实际输出报告，不能编造 |
| 最难 | `gpt-6-astra` | GPT-6 Astra / high | ChatGPT Pro（与 Sol 共享，约 Sol 的 5 倍） | 只在最难的研究级任务（数据分析/模拟/证明）、最长流程 agent 任务、架构第二意见上仍明显领先，不承担常规执行和审查。慢（大任务 15 分钟以上），大项目里易超范围——卡紧范围和验收标准 |
| 专项文案/UI | `gemini-3.8-flash` | Gemini 3.8 Flash（Magpie 路由 `commandcode/google/gemini-3.8-flash`，已实际验证） | 未单独核验（commandcode provider，额度未确认） | 仅限文案优化/润色（可按主控指定直接保存纯文字修改）与 UI 审美反馈（基于主控提供的图片或页面描述，只反馈）。不参与工程实现、根因、架构、并发/恢复/交易/持久化审查，不做最终质量审批，不取代上表任何模型 |

**选择顺序：** 没有"凡有逻辑先派 Sol"的全局默认，按需求明确程度、风险、验收能力分流。主控明确方案/范围/验收后，需求清楚、验收直接、低风险、无需复杂推演且速度优先的任务交 Haiku；不按文件个数或输出长短排除，长输出或批量本身不自动交 Flash。持续高频或规模/额度吞吐优先交 Flash，方案已明确且需要更多推演的常规逻辑交 GLM-5.3，复杂/高风险交 6.1 Sol，随后独立验收。关键证据由主控/审查者复核，不盲信 Haiku 或 Flash 报告；6.1 Sol 仍不够再用 Astra。Haiku 是速度与额度分工，不是笼统认定它更强或替代 GLM。力工档内部按“供给可持续 > 单位能力 > 速度”排序：默认 GLM-5.3-Flash（额度最宽、同档能力最高，代价是慢）；需要总时长或缓存成本决定结果时用 DeepSeek V4.1 Flash；Haiku 只承担短上下文、急着要结果的插队任务。

**Sol 额度护栏：** 6.1 Sol 同时最多约 3 个并行。遇到 ChatGPT 限额/速率错误时不自动降级：高风险任务排队或主控接管；普通低风险任务可显式告知用户后改派 GLM-5.3，不静默降级。

**Go 额度护栏：** OpenCode Go 有 5 小时、周、月额度；遇到 429 或额度耗尽，报告出错的上游及可识别窗口/错误，低风险任务可明确告知用户后转 Flash，高风险不降级。不自动启用 Zen balance 的额外付费。Haiku 超过 100K 输入的计价是较短输入档的 5 倍，优先限制不必要的长上下文。OpenCode Go 的额度按模型独立计算（落在该渠道时 Haiku 的 $15 与 DeepSeek 的 $60 互不挤占）；DeepSeek V4.1 Flash 走聚合组、可能落到 Command Code 的共享池，因此不假设额度独立。DeepSeek 在工作日北京时间 09:00–12:00 与 14:00–18:00 为高峰价（约 2 倍），批量任务尽量错峰。GLM 的"近乎无限"是用户订阅经验，不是服务保证；官方 Flash 在 Coding Plan 的额度是 GLM-5.3 的 3 倍。详见仓库 `docs/haiku-vs-glm-flash.md`（[在线证据文档](https://github.com/liuyejinghong/Claude-workflow/blob/feat/haiku-orchestration/docs/haiku-vs-glm-flash.md)）。

**分工调整（2026-10-01，用户决定）：** 为提高完成速度，取消"凡有逻辑先派 Sol"的全局默认，按需求明确程度、风险与验收能力分流；2026-10-08 已配置 Haiku，优先高速低复杂度执行，Flash 保留持续高频批量、大规模 fan-out 与额度吞吐优势。

**推理默认：** 2026-09-30 用户指定 6.1 Sol 的主会话与 subagent 默认均为 high，Astra 保持 high，GLM 保持 max；2026-10-08 Haiku 使用已验证的 medium 配置，不贸然降到 low。这是配置选择，不是不同档位的性能比较结论；不设置 effort 上限，用户仍可手选其他档位。

**专项角色（`gemini-3.8-flash`）：** 只用于文案优化/润色（主控指定文件或 UI 源文件中的纯文字内容可直接 Edit/Write，不改布局、样式、组件结构或逻辑）与 UI 审美反馈（只反馈，不改 UI 实现），不参与工程执行、架构、根因、并发/恢复/交易/持久化审查，也不取代上表模型。调用只用 `subagent_type`，不传 `model` / `effort`。

**输出上限兼容：** 当前上游单次输出最高 65536。若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置高于 65536，调用会 400，需将实际使用的会话值调至 <=65536，可用 `--settings '{"env":{"CLAUDE_CODE_MAX_OUTPUT_TOKENS":"65536"}}'`。该设置影响该会话的全部模型，不改变 context 与 effort；安装脚本不会修改该设置。

用户明确指定模型时，以用户为准。

## 2. 调用规则（Agent tool）

- 用 `subagent_type` 选模型，例如 `subagent_type: "haiku-5.5"`；**不要同时传 `model` / `effort` 参数**，以 agent 定义为准。调用时的 `model` 优先级高于定义，会覆盖外部模型。
- 可以并行派发；多个 subagent 同时改代码时，确保文件不重叠，或用 `isolation: "worktree"`。
- 交叉审查分级适用于 Haiku 与 GLM：低风险机械修改由主控规格检查 + 独立验证；常规逻辑由主控验收，有具体疑点/重要边界再派 `gpt-6.1-sol`；同一功能的多个子任务集成后由 Sol 做一次完整链路审查，不逐文件重复审，不为每个 Haiku 小改另派 Sol。交易安全/持久化/并发/外部副作用仍保留 Sol 审查与主控最终验收。Sol 写的代码由主控独立验收；不用更弱的模型对 Sol 实现作最终质量审批。
- 审查类委托 prompt 必须写明"直接审，不要调用 `/code-review` 等 skill"：skill 会再起一层 subagent（第二层没有 Agent 工具，且跑在默认 subagent 模型上），跨家族审查会悄悄变成同家族审查（2026-09-28 实例：Sol 审查经 `/code-review` 实际由 GLM 完成）。需要 `/code-review` 由主会话自己跑。

## 3. 委托 prompt 模板

subagent 不继承会话上下文，prompt 必须自包含：

```
工作目录：<绝对路径>
目标：<一句话说明要达成什么>
背景：<相关架构 / 为什么要改 / 已知根因>
涉及文件：<路径列表>
约束：<不能改的接口、风格、依赖限制、范围边界>
验收标准：<可执行的检查，如 "pytest tests/foo 全绿"、"命令 X 输出 Y">
完成后回报：改了哪些文件、如何验证（附实际命令输出）、未解决的问题。
```

需求不清先问用户，不让 subagent 猜。

## 4. 审查与返工

每个委托任务（包括 Haiku 与 GLM）两阶段审查，顺序不可跳过或调换：

1. **规格符合**：是否恰好做了要求的事，不多不少？
2. **代码质量**：实现是否可靠、可维护？

- 随后独立验收，实际执行最小合同测试/必要检查（以实际输出为准），不取消验证，也不扩大重复检查。
- 自己重新跑一遍验收命令，不要只信 subagent 的回报。
- 规格不符 = 打回重做 + 重新审查，不接受"差不多"。
- 审查分级：低风险机械修改主控规格检查 + 独立验证即可；常规逻辑主控验收，有具体疑点/重要边界再派 Sol；同一功能的多个子任务集成后一次 Sol 完整链路审查，不逐文件重复审；交易安全/持久化/并发/外部副作用仍保留 Sol 审查与主控最终验收；不用更弱的模型对 Sol 实现作最终质量审批。
- 产出有误时先诊断：Haiku/GLM 理解错先补 prompt 重派，仍不达标升级 `gpt-6.1-sol`，不无限盲改；任务太大 → 拆小；仍卡住 → 上报用户。

## 5. Workflow / ultracode 编排

`agent()` 通过 `agentType` 指定外部模型 subagent（与 Agent tool 同一注册表）：

- 不写 `agentType` 会默认用主会话模型（Claude）——执行类 stage 必须显式指定。
- 执行 stage 按同样风险路由：需求清楚、验收直接、低风险、无需复杂推演且速度优先用 `haiku-5.5`，不按文件个数或输出长短排除，长输出或批量本身不自动交 Flash；持续高频或规模/额度吞吐优先用 `glm-5.3-flash`；方案已明确且需要更多推演的常规逻辑可 `glm-5.3` fan-out（无重叠修改或已授权隔离）；复杂/高风险用 `gpt-6.1-sol`（遵守并行上限）。
- 审查 stage 不逐结果强制 Sol fan-out：低风险由主控验收；需要完整链路审查的功能，多个子任务集成后做一次 Sol 关键审查。
- `gpt-6-astra` 不进 fan-out，只用于单个最难的 stage。
- 裁决、综合、最终验收 stage：不写 `agentType`，由 Claude 执行。
- 用 `agentType: "haiku-5.5"` 或其他 `agentType` 时，不要同时传 `model` / `effort`，推理强度以 subagent 定义为准。

编排示例（同一功能需要完整链路审查时）：

1. 将方案已明确、修改不重叠的子任务交给合适模型并行执行；需要隔离时按现有授权执行。
2. 检查所有子任务是否成功，缺失、失败或验收不符先处理，不能过滤掉失败结果继续。
3. 主控确认改动已集成到同一目标，并执行最小集成检查；仅收齐报告不等于已集成。
4. 派一次 Sol 完整链路审查，prompt 自包含目标路径、实际 diff/提交范围、合同、风险边界与验收命令，明确"直接审，不要调用 /code-review 等 skill"；最后由主控验收。

低风险任务由主控验收即可，不必派 Sol；以上步骤不代替 Workflow 的显式使用授权。

Workflow 运行时示例见仓库 `examples/workflow-smoke-test.js`；它使用运行时注入的 API 与顶层返回，不是普通 Node 模块。

## 6. 基础设施备注

- 当前本机链路为 Claude Code → Magpie（`ANTHROPIC_BASE_URL`，本机 `http://127.0.0.1:3425`）→ 各上游；Magpie UI 统一管理已登录的 Codex 订阅上游、现有 GLM 上游和 OpenCode Go。Haiku 的 `opencode-go` provider 使用 Anthropic endpoint `https://opencode.ai/zen/go`。
- 当前 Magpie 请求模型：`codex/gpt-6.1-sol:high`、`codex/gpt-6-astra:high`、`opencode-go/claude-haiku-5-5:medium`。这些具名路由已实际冒烟，GPT 与 Haiku 使用冒号 effort。
- GLM 的裸名 `glm-5.3` / `glm-5.3-flash` 在当前 Magpie 已验证兼容，保持现有定义与 max 默认。
- Claude Code 对外部模型报 `unrecognized_model` 属正常警告。GLM 与 Haiku 原生 1M，agent 的 `[1m]` 声明 1M 模型窗口，客户端剥离窗口后缀；Haiku 定义为 `opencode-go/claude-haiku-5-5:medium[1m]`。实际压缩阈值仍受现有全局配置影响，包括当前 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000`；没有做 1M 请求压力测试。GPT 不加 `[1m]`，保留现有 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`（Sol/Astra 订阅通道窗口 272k）。窗口/压缩配置不拦截过长请求；给 Sol/Astra 派审查时要求分段读大 diff。
- [Claude Code 官方 subagents 文档](https://code.claude.com/docs/en/sub-agents)说明：已存在的 `~/.claude/agents/` 目录变化会在几秒后用于后续委托；首次创建目录、add-dir 或禁用 slash commands 等情况需重启。CLAUDE.md 规则修改需重载；若当前会话工具清单尚未识别新 agent，使用 `claude --continue` 重启并保留对话。
