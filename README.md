# Claude-workflow

Claude Code 提供成熟的原生 subagent、并行执行与后台通知，但 Claude 官方模型并非人人都能订阅。本项目把这套 harness 接到你已有额度的外部模型上，默认用 GPT-6.1 Sol 做主控，没有 GPT 订阅就用 GLM-5.3 替代。同时提供独立的实时观察 mod，在终端清晰掌握主控与各子代理的运行状态。

当前版本：[v0.3.1](VERSION) · [更新记录](CHANGELOG.md) · [MIT License](LICENSE)

本项目包含两部分核心能力：

- **多模型原生 Subagent 编排**：沿用 Claude Code 原生任务状态、并行执行与后台通知，将检索、实现、测试、文案和高风险改动分流至最合适的模型。
- **token-speed 观察 Mod**：在输入框上方为每个活跃代理显示模型、effort、上下文占用与实时速率，不增加额外网络请求与模型调用。

---

## 具名 Subagent 分工

按**模型能力与成本**划分为三层框架：

- **主控模型（Controller）**：能力与智能最高、成本也最高。负责规划、任务拆解、根因判断、架构决策与最终验收，也承担最难、最高风险的实现与关键审查。代表：Opus 5.5、GPT-6.1 Sol、GLM-5.3。
- **力工模型（Worker）**：速度、额度与能力的平衡，承担大部分常规实现、检索、测试补全与批量执行。代表：DeepSeek V4.1 Flash、GLM-5.3-Flash、Claude Haiku 5.5。
- **审查与专项模型（Review / Specialist）**：不追求通用吞吐，而是在特定维度上明显更可靠。代表：GPT-6 Astra（研究级推理与建模）、Fable 5.1、Gemini 3.8 Flash（文案与 UI 审美）。

本仓库将预配置的 6 个 subagent 按上述三层组织。同一个模型在不同订阅条件下可以落在不同层——例如 GLM-5.3 在同时有 GPT 订阅时承担高质量常规执行，在没有 GPT 订阅时升为主控替代：

| Agent | 层级 | 默认推理 | 适用场景 |
|---|---|---|---|
| `gpt-6.1-sol` | 主控（默认主控） | high | 复杂根因、多模块行为变更与高风险实现审查。 |
| `glm-5.3` | 主控（无 GPT 订阅时的主控替代；有 GPT 订阅时为高质量常规执行） | max | 方案与验收标准已明确、需要更多推演的常规逻辑实现、局部修复与重构。 |
| `haiku-5.5` | 力工 | medium | 速度优先、低复杂度任务：检索、文档同步、指定测试，以及方案明确的简单实现/修复与批量同类修改。 |
| `glm-5.3-flash` | 力工 | max | 持续高频批量、大规模并行 fan-out 与吞吐优先的任务。 |
| `gpt-6-astra` | 审查与专项 | high | Sol 不足时的最难研究、长流程任务与架构第二意见。 |
| `gemini-3.8-flash`（可选） | 审查与专项 | max | 专项文案润色与 UI 审美反馈：直接编辑指定文档/UI 纯文字（含 placeholder/title/aria-label），保留事实约束；UI 仅提审美建议，不改工程实现与技术逻辑。 |

关于 Haiku 与 Flash 的分工依据见 [Haiku 与 Flash 的分工证据](docs/haiku-vs-glm-flash.md)；编排协议与详细规则见 [多模型编排手册](skills/multi-model-orchestration/SKILL.md)。

---

## token-speed 0.3.2：会话与代理状态监控

[token-speed](mods/token-speed/README.md) 是适用于 Claude Code 的独立 mod（基于 function-hooks，已在 2.1.294 验证）。它在终端输入框上方为每个活跃代理显示单行状态，最后一行显示当前工作区，不依赖 Magpie 或模型订阅：

```text
⚡ main · gpt-6.1-sol · high · Ctx ██████▊    67%/272k · Live ~42.1 · Last 31.2 · Avg 28.6 tok/s · streaming
↳ abcdefg1 · glm-5.3-flash · max · Ctx █▍         14%/1.0M · Live ~35.2 · Last 29.1 · Avg 30.4 tok/s · streaming
⌂ Claude-workflow on main
```

**指标口径：**

- **Live**：带 `~` 的字符估算值，按最近 3 秒观察到的字符计算，非 tokenizer 精确计数。
- **Last / Avg**：基于 CLI usage 的全程 API 输出速率（包含网络、TTFT、thinking 与内置工具耗时，非纯解码速率或 benchmark）。其中 Avg 为该代理在当前模型下最近 24 小时滚动窗口的加权平均。
- **上下文占用**：固定 10 格视觉进度条；窗口来源为运行时读数与离线模型表；未核验型号可能显示未知，详见插件说明。

**安装与使用：**

根目录安装脚本不包含 mods，可直接在 Claude Code 中通过 Marketplace 安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

常用命令包括 `/tok-speed`（查看详细列表与口径）与 `/tok-speed reset`（重置本会话统计）。完整细节见 [mods/token-speed/README.md](mods/token-speed/README.md) 与 [mods/README.md](mods/README.md)。

---

<a id="安装与验证"></a>

## 快速开始

编排链路为 **Claude Code → Magpie 网关 → 各模型上游**。请先确保 Claude Code 与已配置对应模型 routes 的 Magpie 就绪，详见 [Magpie 路由配置](examples/magpie-routing.md)。

### 1. 安装 Agents 与 Skill

从当前 `main` 分支克隆仓库并运行安装脚本：

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh
```

脚本会将 6 个 subagent 定义与编排 skill 安装到 `~/.claude/`（支持通过 `CLAUDE_HOME` 环境变量自定义目录），已有同名文件会自动备份为 `.bak`。脚本不修改 CLI 配置、provider 设置或全局 `CLAUDE.md`，也不安装 mods。

### 2. 启用常驻委托规则

将 [templates/CLAUDE.md.snippet](templates/CLAUDE.md.snippet) 中的委托规则合并至全局 `~/.claude/CLAUDE.md`，保留其他已有章节。

新开会话生效；当前已打开的会话可退出后执行 `claude --continue` 重载规则。

### 3. 验证模型路由

在已设置 `ANTHROPIC_BASE_URL` 与 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）的环境中检查路由：

```bash
./scripts/verify.sh
```

- **默认检查**：仅 GET 模型列表，不产生生成请求。必须包含 5 个核心模型（包含 Haiku，缺失将返回失败）；Gemini 为可选（缺失仅提示未接入，不影响脚本通过）。
- **冒烟验证**：执行 `./scripts/verify.sh --smoke` 会实际消耗 Haiku 额度，验证 `tool_use → tool_result → end_turn` 往返调用协议。

### 4. Gemini 专项输出上限说明

Gemini 3.8 Flash 通过 Command Code 上游接入（Magpie 路由为 `commandcode/google/gemini-3.8-flash`，配额未核验）。其上游单次输出上限最高为 65536 tokens。若当前环境的 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置高于 65536，会导致 API 请求返回 400 错误。

如需在会话中使用 Gemini，可通过传入临时 settings 启动（该会话中全部模型单次输出上限均受覆盖，上下文窗口与 effort 不受影响）：

```bash
claude --settings '{"env":{"CLAUDE_CODE_MAX_OUTPUT_TOKENS":"65536"}}'
# 若继续已有对话，追加 --continue 即可
```

---

## 如何委托

在会话中明确任务目标、修改边界与验收标准，Claude 会拆解任务并分派给对应子代理：

> 请按多模型编排规则，为当前模块补充测试用例。先由 haiku-5.5 检索现有测试入口与断言风格，再由 glm-5.3 编写测试代码；验收标准为新测试通过且覆盖边界条件。

也可以直接指定特定 subagent 执行明确任务：

> 请用 gemini-3.8-flash 审阅并润色 docs/guide.md 中的用户指引，保持技术事实不变，提升语言流畅度。

更多 prompt 模板、交叉审查流程与 Workflow 编排见 [多模型编排手册](skills/multi-model-orchestration/SKILL.md)。

---

## 核心文档索引

- [Magpie 路由配置](examples/magpie-routing.md)：各模型路由 ID、上游要求与接入说明。
- [多模型编排手册](skills/multi-model-orchestration/SKILL.md)：模型选择策略、两阶段审查流程与委托模板。
- [Haiku 与 Flash 分工证据](docs/haiku-vs-glm-flash.md)：真实观察、额度限制与吞吐权衡。
- [常驻规则模板](templates/CLAUDE.md.snippet)：合并至全局 `CLAUDE.md` 的委托规则片段。
- [Workflow 冒烟示例](examples/workflow-smoke-test.js)：多 agent 流程示例（需在 Workflow 运行时授权执行，不能作为普通 Node.js 脚本运行）。
- [Claude Code Mods 索引](mods/README.md) 与 [token-speed 说明](mods/token-speed/README.md)。
- [更新记录](CHANGELOG.md) · [版本标识](VERSION) · [开源许可](LICENSE)。