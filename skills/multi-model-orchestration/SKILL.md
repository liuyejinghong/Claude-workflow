---
name: multi-model-orchestration
description: 多模型委托与安装配置：检查可用代理、写任务合同与验收；需要时安装、配置多角色代理与上下文；第三方窗口压缩按需排查；仅在用户选择时编排 Workflow。
---

# 多模型委托与编排

主控保留规划、根因判断、架构决策与最终验收；方案明确的实施任务委托执行。
选型以当前会话工具目录中实际可用的 agent 及其 description 为准：只有目录中已显示、可直接调用的类型才可派发，文件存在不代表已加载；无需为选型再读定义文件。用户指定模型优先；风险与合同先于速度。

## 选型与失败诊断

- 仓库预设（`./install.sh --preset`）提供 7 个具名子代理（6 个核心 + 可选 Gemini），Sol 默认 xhigh，其余默认 max（包含 Astra）；不按 effort 拆分代理。用户环境已有的其他 agent 按其实际定义与 config，不自动等同 max。
- 选型顺序：风险与合同优先，其次模态、任务形态、上下文与延迟；用户指定模型优先。
- 派发失败或产出不达验收时，由主控先诊断，再决定补合同或升级模型，不按固定模型链逐级尝试。

按需证据：[模型分工与选型依据](https://github.com/liuyejinghong/Claude-workflow/blob/main/docs/haiku-vs-glm-flash.md) · [Magpie 路由示例（本仓库示例环境，非通用路由）](https://github.com/liuyejinghong/Claude-workflow/blob/main/examples/magpie-routing.md)。

## 可用代理

目录里没有的代理不可派发（规则见首段），按以下方式处理：

- 推荐代理缺失时，按现有代理的 description、能力与权限挑最接近的替代（Explore 只读，可做检索；低风险可用内置 general-purpose）；同模型在独立上下文执行也算职责委托，不停全部工作。
- 用户按名指定或必须使用的模型不可用、或现有代理能力不足时，说明缺口并继续无依赖工作，不静默替换、不降级硬做。
- 无 Agent 工具时：规则不强制委托才由主控串行执行并显式切换独立验证视角；强制委托则报告缺口。
- 普通使用不改 settings/provider/代理；需要安装或配置多角色时走 install 分支：先具体 preview，经授权才写入选定字段（见 [references/installation.md](references/installation.md)）；不代配路由与凭据。

## 安装分支（/multi-model-orchestration install）

用户调用该分支，或你需要按当前环境已配置的模型安装多角色代理时，按 [references/installation.md](references/installation.md) 执行：

scan 已配置候选（provider 中立；无列表可用已有候选或 `inherit`，不虚构）→ 按角色描述匹配 worker / engineer / reviewer / visual / researcher / editor 并说明依据 → 上下文检查（必经，写入可选）→ plan 与 preview → 授权后 apply → 重载与本地最小验证。

- 这是 skill 分支，不是 Workflow 编排；普通任务不进入。
- 安装文件（默认 `./install.sh` 只装 skill）与配置角色是两件事。
- 未看过具体 preview 不写入；verify 只做本地检查，不夸大为性能或压力结论。

排查入口：缺代理与安装方式读 [references/agents-and-installation.md](references/agents-and-installation.md)；需要安装/配置角色读 [references/installation.md](references/installation.md)；第三方窗口/压缩问题读 [references/third-party-context.md](references/third-party-context.md)。

## 调用协议

- Agent tool 用 `subagent_type` 选代理，不同时传 `model` / `effort`，以 agent 定义为准。
- Prompt 必须自包含，写全目标、背景、绝对路径、约束与可执行验收标准。
- 派发前只询问会实质改变目标或授权的真歧义；可调查的事实先查清，常规实施选择自行决定。
- 第一步指定 Read 一个文件确认工具可用；缺工具立即报告退出，不用 web 工具绕路。重派一次仍失败，按可用代理规则处理。
- 可并行派发；修改文件不得重叠，或使用已获授权的 worktree 隔离。
- 审查 prompt 写明“直接审，不要调用 `/code-review` 等 skill”；需用审查 skill 时由主会话调用。

## Prompt 模板

```text
第一步 Read <指定绝对路径> 确认工具可用；缺工具立即报告退出，不用 web 工具绕路。
工作目录：<绝对路径>
目标：<完整任务与期望结果>
背景：<相关架构、已知根因、已确定的方案或合同>
涉及文件：<绝对路径列表>
约束：<范围边界、不可改的接口、依赖与风格要求>
验收标准：<最小合同测试或必要检查及其预期结果>
若为审查：直接审，不要调用 /code-review 等 skill。
完成后回报：改了哪些文件、实际命令输出、未解决的问题。
```

## 审查与返工

每个任务按以下顺序处理，不能跳过或调换：

1. 规格符合：是否恰好完成要求，未遗漏或超范围。
2. 代码质量：实现是否可靠、可维护。
3. 独立验收：主控实际执行最小合同测试与必要检查，不只信代理报告，不编造测试结果。

- 低风险机械修改由主控完成上述检查；常规逻辑有具体疑点或重要边界再派能力适当的独立审查。
- 同一功能的多个子任务集成后，确需完整链路审查时做一次独立审查（同一模型的新上下文或现有能力匹配的代理，强代理优先），不逐文件或逐结果重复审。
- 交易、持久化、并发、恢复、外部副作用安全审查保留给能力匹配者与主控最终验收；不因高能力代理缺失降给低能力 worker；没有合适 reviewer 时说明缺口，继续无依赖工作。
- 编码者不做自己产出的独立审查；高能力代理的实现由主控独立验收，不用更弱模型作最终质量审批。
- 规格不符须返工并重新审查；产出有误先诊断，理解错则补 prompt 重派，仍不达标升级到当前可用且能力足够的代理，不硬凑不存在的代理。
- 任务过大则拆小，仍卡住再报告用户；不无限盲改。
- 必要检查通过后，仅在新改动、失败或具体疑点出现时扩大或重复验证。

## Workflow / ultracode

- 只有用户已选择 Workflow 且运行时实际提供 Workflow 工具时才编排或运行，不擅自启用工作流。
- `agent()` 的执行 stage 必须显式指定 `agentType`，且只用当前已加载的代理（见「可用代理」）；省略会使用主会话模型。
- 选型依据仍是 agents 的 description；传 `agentType` 时不同时传 `model` / `effort`。
- 审查 stage 不逐结果强制派固定代理；需要完整链路审查时，同一功能集成后做一次。
- 若有可用的研究/专项代理（如 `gpt-6-astra`），只让它承担单个最难 stage，不进 fan-out。
- 裁决、综合、最终验收 stage 不写 `agentType`，由主控执行。

流程：并行执行 → 确认所有结果 → 集成与最小合同检查 → 必要的独立审查 → 主控验收。失败或缺失结果须处理，不能过滤后继续。

运行示例见 [examples/workflow-smoke-test.js](https://github.com/liuyejinghong/Claude-workflow/blob/main/examples/workflow-smoke-test.js)（安装副本不含仓库文件，用仓库 URL）；它使用预设 agentType 名，依赖 Workflow 运行时注入的 API，不能作为普通 Node.js 脚本运行。
