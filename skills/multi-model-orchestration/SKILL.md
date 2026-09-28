---
name: multi-model-orchestration
description: Claude 主控 + 外部模型 subagent（GPT-6 Astra / GPT-6 Sol / GLM-5.3 / GLM-5.3-Flash）的委托与编排手册。在以下场景使用：需要把写/改代码的任务委托出去、决定用哪个模型、写委托 prompt、审查 subagent 产出、或在 Workflow / ultracode 模式下编排多 agent。
---

# 多模型委托与编排

Claude（主控）负责规划、根因判断、架构决策与最终验收；执行工作委托给经 CPA 路由的外部模型 subagent。按公开跑分这四个模型编程都不强于 Claude 旗舰，**委托是为了省额度和并行，不是换更强的模型**。

## 1. 选哪个模型

| 优先级 | subagent_type | 模型 / 推理 | 额度 | 用途 |
|---|---|---|---|---|
| 默认 | `glm-5.3` | GLM-5.3 / max | GLM Coding Plan（近乎无限） | 需求明确的实现、重构、写测试、批量修改、并行拆分子任务。日常工程接近 Opus 档，极难的长程问题偏弱；慢而稳 |
| 杂活 | `glm-5.3-flash` | GLM-5.3-Flash / max | GLM Coding Plan | 简单修改、样板代码、查找、日志/文件排查、大量并行小任务 |
| 升级 | `gpt-6-sol` | GPT-6 Sol / xhigh | ChatGPT Pro | GLM-5.3 做不好的复杂实现；GLM 所写代码的默认跨家族审查者 |
| 最难 | `gpt-6-astra` | GPT-6 Astra / medium | ChatGPT Pro（与 Sol 共享，更贵） | 长流程多步骤 agent 任务、疑难排障/根因追查、架构第二意见。慢（大任务 15 分钟以上），大项目里易超范围——卡紧范围和验收标准 |

**选择顺序：** GLM-5.3（杂活用 flash）→ 不行升级 Sol → 仍不行或属长程 agent 难题再用 Astra。

用户明确指定模型时，以用户为准。

## 2. 调用规则（Agent tool）

- 用 `subagent_type` 选模型，**不要传 `model` 参数**——调用时的 `model` 优先级高于 subagent 定义，会把外部模型覆盖成 Claude。
- 可以 `run_in_background: true` 并行派发；多个 subagent 同时改代码时，确保文件不重叠，或用 `isolation: "worktree"`。
- 交叉审查：GLM 写的代码默认交 `gpt-6-sol` 审；关键代码最终由 Claude 审。

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

每个委托任务两阶段审查，顺序不可跳过或调换：

1. **规格符合**：是否恰好做了要求的事，不多不少？
2. **代码质量**：实现是否可靠、可维护？

- 自己重新跑一遍验收命令，不要只信 subagent 的回报。
- 规格不符 = 打回重做 + 重新审查，不接受"差不多"。
- 产出有误时先诊断：缺上下文 → 补充后重派；能力不够 → 升级模型；任务太大 → 拆小；仍卡住 → 上报用户。

## 5. Workflow / ultracode 编排

`agent()` 通过 `agentType` 指定外部模型 subagent（与 Agent tool 同一注册表）：

- 不写 `agentType` 会默认用主会话模型（Claude）——执行类 stage 必须显式指定。
- 执行 / fan-out stage：`glm-5.3`（杂活 `glm-5.3-flash`），可大规模并行。
- 跨家族验证 / 对抗式审查 stage：`gpt-6-sol`，控制数量。
- `gpt-6-astra` 不进 fan-out，只用于单个最难的 stage。
- 裁决、综合、最终验收 stage：不写 `agentType`，由 Claude 执行。
- 用 `agentType` 时不要同时传 `model` / `effort`，推理强度以 subagent 定义为准。

最小示例（执行 → 跨家族验证，pipeline 无屏障）：

```js
const results = await pipeline(
  TASKS,
  t => agent(t.prompt, { label: `exec:${t.id}`, phase: 'Execute', agentType: 'glm-5.3', schema: RESULT }),
  (r, t) => r && agent(`独立复核（不要相信原结论，自己重跑验收命令）：${JSON.stringify(r)}`,
    { label: `verify:${t.id}`, phase: 'Verify', agentType: 'gpt-6-sol', schema: VERDICT }),
)
```

完整可运行示例见仓库 `examples/workflow-smoke-test.js`。

## 6. 基础设施备注

- 所有模型经 CPA（CLIProxyAPI）路由，Claude Code 的 `ANTHROPIC_BASE_URL` 指向 CPA。
- GPT 推理强度通过模型名后缀指定：`gpt-6-sol(xhigh)`、`gpt-6-astra(medium)`。
- GLM-5.3 默认即 max，不加后缀（CPA 的 Claude 协议没有 max 档，加后缀可能被映射成智谱不认的 xhigh）。
- Claude Code 对外部模型报 `unrecognized_model` / 按 200k 上下文处理，属正常警告。
- subagent 定义与 CLAUDE.md 只在会话启动时加载，修改后需重启（`claude --continue` 可保留对话）。
