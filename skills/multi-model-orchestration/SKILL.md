---
name: multi-model-orchestration
description: >-
  Claude 主控 + 外部模型 subagent（GPT-6 Astra / GPT-6.1 Sol / GLM-5.3 / GLM-5.3-Flash / Claude Haiku 5.5）的委托与编排手册。在以下场景使用：需要把写/改代码的任务委托出去、决定用哪个模型、写委托 prompt、审查 subagent 产出、或在 Workflow / ultracode 模式下编排多 agent。
---

# 多模型委托与编排

Claude（主控）负责规划、根因判断、架构决策与最终验收；执行工作委托给外部模型 subagent。当前本机通过 Magpie 路由，CPA 保留为可选路径。**委托是为了省 Claude 额度和并行**；关键结论与最终验收仍由 Claude 做。

## 1. 选哪个模型

| 优先级 | subagent_type | 模型 / 推理 | 额度 | 用途 |
|---|---|---|---|---|
| 复杂/高风险 | `gpt-6.1-sol` | GPT-6.1 Sol / high | ChatGPT Pro（与 Astra 共享） | 编程与 computer use 接近 Astra，成本约其 1/5，质量明显强于 GLM-5.3。复杂根因、多模块行为变更、跨语言合同、状态所有权、订单幂等/成交归因/恢复链路等高风险实现与关键审查 |
| 常规实现 | `glm-5.3` | GLM-5.3 / max | GLM Coding Plan（用户体验近乎无限） | 质量明显低于 Sol。方案与合同已由主控明确、可执行验收的常规实现：局部业务逻辑、已定位根因的局部 bug 修复、测试补充、行为不变重构、多处同类修改，不只是样板；大规模并行 fan-out。不让它独自决定架构或复杂并发/恢复/副作用语义 |
| 快速小任务 | `haiku-5.5` | Claude Haiku 5.5 / medium | OpenCode Go（有 5 小时/周/月额度） | 优先速度敏感且范围小的文件/调用方/测试入口定位、证据提取、简洁整理、文档同步、按指定命令跑测试及简单明确的低风险修改。只提供证据/线索，不决定架构、交易安全、复杂根因或高风险最终审批；测试结果据实际输出报告，不能编造 |
| 定位/批量杂活 | `glm-5.3-flash` | GLM-5.3-Flash / max | GLM Coding Plan | 文件/调用方/测试入口定位、日志证据提取、按指定命令跑测试并回报原始结果、文档同步、明确重命名和简单低风险修改；保留高频批量、大输出及大规模 fan-out。只提供证据/线索，不决定架构、交易安全、复杂根因或高风险最终审批；测试结果据实际输出报告，不能编造 |
| 最难 | `gpt-6-astra` | GPT-6 Astra / high | ChatGPT Pro（与 Sol 共享，约 Sol 的 5 倍） | 只在最难的研究级任务（数据分析/模拟/证明）、最长流程 agent 任务、架构第二意见上仍明显领先，不承担常规执行和审查。慢（大任务 15 分钟以上），大项目里易超范围——卡紧范围和验收标准 |

**选择顺序：** 没有"凡有逻辑先派 Sol"的全局默认，按需求明确程度、风险、验收能力分流。典型流程：速度敏感的小范围定位交 Haiku，高频批量或大输出交 Flash → 主控定方案/范围/验收 → 方案已明确的常规实现交 GLM-5.3，复杂/高风险交 6.1 Sol → 独立验收。关键证据由主控/审查者复核，不盲信 Haiku 或 Flash 报告；6.1 Sol 仍不够再用 Astra。新增 Haiku 是速度与额度分工，不是笼统认定它更强或替代 GLM。

**Sol 额度护栏：** 6.1 Sol 同时最多约 3 个并行。遇到 ChatGPT 限额/速率错误时不自动降级：高风险任务排队或主控接管；普通低风险任务可显式告知用户后改派 GLM-5.3，不静默降级。

**Go 额度护栏：** OpenCode Go 有 5 小时、周、月额度；遇到 429 或额度耗尽，报告出错的上游及可识别窗口/错误，低风险任务可明确告知用户后转 Flash，高风险不降级。不自动启用 Zen balance 的额外付费。Haiku 超过 100K 输入的计价是较短输入档的 5 倍，优先限制不必要的长上下文。GLM 的"近乎无限"是用户订阅经验，不是服务保证；官方 Flash 在 Coding Plan 的额度是 GLM-5.3 的 3 倍。详见仓库 `docs/haiku-vs-glm-flash.md`（[在线证据文档](https://github.com/liuyejinghong/Claude-workflow/blob/main/docs/haiku-vs-glm-flash.md)）。

**分工调整（2026-10-01，用户决定）：** 为提高完成速度，取消"凡有逻辑先派 Sol"的全局默认，按需求明确程度、风险与验收能力分流；2026-10-08 增加 Haiku 处理速度敏感的小任务，Flash 继续负责高频批量。

**推理默认：** 2026-09-30 用户指定 6.1 Sol 的主会话与 subagent 默认均为 high，Astra 保持 high，GLM 保持 max；2026-10-08 Haiku 使用已验证的 medium 配置，不贸然降到 low。这是配置选择，不是不同档位的性能比较结论；不设置 effort 上限，用户仍可手选其他档位。

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
- 执行 stage 按同样风险路由：方案已明确的常规实现可 `glm-5.3` fan-out（无重叠修改或已授权隔离），速度敏感的小任务用 `haiku-5.5`，高频批量/大输出杂活用 `glm-5.3-flash`；复杂/高风险用 `gpt-6.1-sol`（遵守并行上限）。
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

- 当前本机链路为 Claude Code → Magpie（`ANTHROPIC_BASE_URL`，本机 `http://127.0.0.1:3425`）→ 各上游；Haiku 上游是 OpenCode Go。CPA（CLIProxyAPI）保留为可选路径，其示例不等于本次已验证配置。
- 当前 Magpie 请求模型：`codex/gpt-6.1-sol:high`、`codex/gpt-6-astra:high`、`opencode-go/claude-haiku-5-5:medium`。这些具名路由已实际冒烟；原 CPA 的 `gpt-6.1-sol(high)` / `gpt-6-astra(high)` 在当前 Magpie 返回 404，不能混用。可选 CPA 使用括号 effort 后缀，具体支持随版本/配置而异，须验证实际路由。
- GLM 的裸名 `glm-5.3` / `glm-5.3-flash` 在当前 Magpie 已验证兼容，保持现有定义与 max 默认。CPA 的 Claude 协议没有 max 档，不给 GLM 加 `(max)`，避免被映射成智谱不认的 xhigh。
- Claude Code 对外部模型报 `unrecognized_model` 属正常警告。GLM 与 Haiku 原生 1M，agent 的 `[1m]` 声明 1M 模型窗口，客户端剥离窗口后缀；Haiku 定义为 `opencode-go/claude-haiku-5-5:medium[1m]`。实际压缩阈值仍受现有全局配置影响，包括当前 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000`；没有做 1M 请求压力测试。GPT 不加 `[1m]`，保留现有 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`（Sol/Astra 订阅通道窗口 272k）。窗口/压缩配置不拦截过长请求；给 Sol/Astra 派审查时要求分段读大 diff。不把 Magpie 的 `:medium` 语法视为所有 CPA 版本都支持。
- [Claude Code 官方 subagents 文档](https://code.claude.com/docs/en/sub-agents)说明：已存在的 `~/.claude/agents/` 目录变化会在几秒后用于后续委托；首次创建目录、add-dir 或禁用 slash commands 等情况需重启。CLAUDE.md 规则修改需重载；若当前会话工具清单尚未识别新 agent，使用 `claude --continue` 重启并保留对话。
