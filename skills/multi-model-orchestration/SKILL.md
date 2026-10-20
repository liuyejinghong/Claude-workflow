---
name: multi-model-orchestration
description: 多模型委托与安装配置：检查可用代理、写任务合同与验收；需要时安装、配置多角色代理与上下文；第三方窗口压缩按需排查；仅在用户选择时编排 Workflow。
---

# 多模型委托与编排

主控保留规划、根因判断、架构决策与最终验收；方案明确的实施任务委托执行。
选型以当前会话工具目录中实际可用的 agent 及其 description 为准：只有目录中已显示、可直接调用的类型才可派发，文件存在不代表已加载；无需为选型再读定义文件。用户指定模型优先；风险与合同先于速度。

## 选型与失败诊断

- 按角色描述、能力与风险约束选型，以当前会话工具目录中实际可用的 agent 定义为准：风险与合同先于速度，其次模态、任务形态、上下文与延迟；用户指定模型优先。不按固定模型名或档位预设分工，不按 effort 拆分重复代理；用户环境已有的 agent 按其实际定义与 config，不自动等同任何固定档位。
- 派发失败或产出不达验收时，由主控先诊断，再决定补合同或升级模型，不按固定模型链逐级尝试。

仓库 `--preset` 附带一套个人示例分工（维护者的 Magpie 接线，仅作参考，非通用约定）：<https://github.com/liuyejinghong/Claude-workflow/tree/main/examples/magpie>。

## 角色卡（候选与优先级）

配置在 `<config>/orchestration.json`（`CLAUDE_HOME` > `CLAUDE_CONFIG_DIR` > `~/.claude`），五个岗位 worker / engineer / reviewer / researcher / editor；每个岗位列原生 agent 候选与 priority（1 最高、10 最低，0 该岗位停用，同值按卡内顺序）。卡只定候选与顺序，不复制 model/effort/description，不改原生 agent 权限或定义。

```text
python3 -I <installed-skill>/scripts/setup.py cards [--config-dir DIR] [--role ROLE]
```

- 主控每次派发前运行 `cards`（可用 `--role` 只读所选岗位），按当前表选候选；每次调用都重新读表，改 priority 不需 reload。
- 未配置（整个文件缺失）：明确报告未配置，沿用原 description 选型。配置损坏：直接报告如何修复，不静默回退。
- 配置文件存在但某岗位被省略、`candidates` 为空或全为 priority 0：该岗位没有可派发候选，报告缺口，不回退推荐模型，也不绕过 priority 0 去默认派发。
- 选型：结合岗位定义与工具目录里 agent 的 description 判断适用性、模态与限定条件，在适用、已启用（priority ≥ 1）且已加载的候选里按 priority 选。本次用户指定模型优先，但不能默默启用 priority 0；要用停用项就改卡。
- 派发时把所选岗位的 body（职责与交付合同）并入本次 prompt；岗位带 tools（如 editor 的 Read/Glob/Grep/Edit/Write）时在合同里显式写出工具范围。卡里的 tools 是合同说明，不是权限控制。
- 卡维护的偏好排序优先于 description 或全局规则里「相对默认/备用」的措辞；职责范围、「仅用户指定才用」这类硬边界仍然有效。
- 找不到能力匹配的候选就报告缺口并继续无依赖工作；执行中断或产出不达验收按「审查与返工」处理，不自动重跑。

配置格式、写卡方式与迁移说明见 [references/role-cards.md](references/role-cards.md)。

## 可用代理

目录里没有的代理不可派发（规则见首段），按以下方式处理：

- 推荐代理缺失时，按现有代理的 description、能力与权限挑最接近的替代（Explore 只读，可做检索；低风险可用内置 general-purpose）；同模型在独立上下文执行也算职责委托，不停全部工作。该替代只在卡未配置（无 `orchestration.json`）时适用；卡已配置时按卡选，替代不越过 priority 0。
- 用户按名指定或必须使用的模型不可用、或现有代理能力不足时，说明缺口并继续无依赖工作，不静默替换、不降级硬做。
- 无 Agent 工具时：规则不强制委托才由主控串行执行并显式切换独立验证视角；强制委托则报告缺口。
- 普通使用不改 settings/provider/代理；需要安装或配置多角色时走 install 分支：先具体 preview，经授权才写入选定字段（见 [references/installation.md](references/installation.md)）；不代配路由与凭据。

## 安装分支（/multi-model-orchestration install）

用户调用该分支，或你需要按当前环境已配置的模型安装多角色代理时，按 [references/installation.md](references/installation.md) 执行：

先做适用性检查（已确认 Claude 订阅且所需 Claude 模型全部可用时，推荐 Claude Code 原生子代理并结束角色配置；状态未知只查可验证信息或询问，不读凭据、不靠模型名断言）→ scan 已配置候选（provider 中立；无列表可用已有候选或 `inherit`，不虚构）→ 按角色描述与建议元数据拟定 worker / engineer / reviewer / researcher / editor 的匹配草表 → 上下文检查（必经，写入可选）→ plan 与 preview → 随 preview 呈现配置确认表（含真实文件动作与解析后的 effort 档位），用户一次确认授权后 apply → 重载与本地最小验证。

- 这是 skill 分支，不是 Workflow 编排；普通任务不进入。
- 已有可复用的原生 agent 时优先走角色卡轻量路径（见「角色卡」），不重跑安装扫描，也不为角色卡重配 provider、订阅或上下文参数；只有缺 agent 或要显式配置单模型入口才走本页。
- 安装文件（默认 `./install.sh` 只装 skill）与配置角色是两件事。
- 未看过具体 preview 不写入；verify 只做本地检查，不夸大为性能或压力结论。

排查入口：缺代理与安装方式读 [references/agents-and-installation.md](references/agents-and-installation.md)；需要安装/配置角色读 [references/installation.md](references/installation.md)；岗位候选与优先级读 [references/role-cards.md](references/role-cards.md)；第三方窗口/压缩问题读 [references/third-party-context.md](references/third-party-context.md)。

## 调用协议

- Agent tool 用 `subagent_type` 选代理，不同时传 `model` / `effort`，以 agent 定义为准。
- Prompt 必须自包含，写全目标、背景、绝对路径、约束与可执行验收标准。
- 派发前只询问会实质改变目标或授权的真歧义；可调查的事实先查清，常规实施选择自行决定。
- 第一步指定 Read 一个文件确认工具可用；缺工具立即报告退出，不用 web 工具绕路。重派一次仍失败，按可用代理规则处理。
- 并行与写入分工遵守「并发写入与交接」。
- 审查 prompt 写明“直接审，不要调用 `/code-review` 等 skill”；需用审查 skill 时由主会话调用。

## 并发写入与交接

适用于普通 Agent 派发与用户已授权的 Workflow，不改变 Workflow 的启用授权。

- 只读检索、分析、审查可并行。共享 checkout 的写入任务，派发前由主控列明“任务→代理→工作目录→可写文件/路径”；每个文件同一时刻只有一个活跃写入者，主控与嵌套委托同样遵守。分工记录写进任务说明即可，不新增常驻 registry 文件。
- 边界以所有实际写入路径为准，含 Edit/Write、Bash 脚本、格式化器、生成文件与依赖锁文件；公共入口、配置与锁文件指定一个集成代理集中处理。无法确定互不重叠就串行，不按功能名称假设隔离。
- 代理需要写白名单外路径时，暂停相关写入并回报，由主控重分配或串行交接，保留已有成果。
- 接替或失败重派同范围前，先等旧代理完成或停止，并确认其后台写入命令已结束；超时、无回复、要求停止但未确认都不等于可接替。接手代理必须重新 Read 最新文件并检查现有 diff，保留已确认成果，不能按旧快照整文件覆盖。
- 确需重叠又并行时，在已有 worktree 授权内显式使用 `isolation:"worktree"`（仅工具实际支持时），否则串行。执行前核对真实工作目录与 `git worktree list`，确认基线提交与需要带入的未提交成果，不假设脏工作区自动继承；不默认开启 worktree。各代理只写自己的副本，由指定集成代理集中合并，主控独立验收；隔离不等于自动合并或语义正确。
- 集成后核对实际 diff 在分配范围内、成果未丢失、跨任务接口一致，并运行最小必要检查。

## Prompt 模板

```text
第一步 Read <指定绝对路径> 确认工具可用；缺工具立即报告退出，不用 web 工具绕路。
工作目录：<绝对路径>
目标：<完整任务与期望结果>
背景：<相关架构、已知根因、已确定的方案或合同>
岗位合同：<所选岗位 body 的职责与交付要求；岗位带 tools 时列出工具范围>
可读范围：<需要读的绝对路径或目录>
可写范围：<写入白名单：绝对路径或边界清晰的目录；只读任务填“无”>
约束：<范围边界、不可改的接口、依赖与风格要求>；白名单外的写入暂停并交回主控
交接/集成：<前置任务、同范围前任及其已确认终态、公共文件由谁处理；无则写无>
验收标准：<最小合同测试或必要检查及其预期结果>
若为审查：直接审，不要调用 /code-review 等 skill。
完成后回报：实际改动的所有路径（含脚本间接产生）、实际命令输出、未解决的问题。
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
- 若有可用的研究/专项代理，只让它承担单个最难 stage，不进 fan-out。
- 裁决、综合、最终验收 stage 不写 `agentType`，由主控执行。

流程：并行执行 → 确认所有结果 → 集成与最小合同检查 → 必要的独立审查 → 主控验收。失败或缺失结果须处理，不能过滤后继续。写入 stage 的并行分工与交接同样遵守「并发写入与交接」。

运行示例见 [examples/workflow-smoke-test.js](https://github.com/liuyejinghong/Claude-workflow/blob/main/examples/workflow-smoke-test.js)（安装副本不含仓库文件，用仓库 URL）；它使用预设 agentType 名，依赖 Workflow 运行时注入的 API，不能作为普通 Node.js 脚本运行。
