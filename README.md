# Claude-workflow

**版本 v0.2.0**（[VERSION](VERSION) · [CHANGELOG](CHANGELOG.md)）。这是编排仓库的版本，不是模型版本。

在 **Claude Code CLI** 里让 Claude 做主控，把执行工作委托给 **GPT-6.1 Sol / GPT-6 Astra / GLM-5.3 / GLM-5.3-Flash / Claude Haiku 5.5**。这 5 个模型使用原生 subagent 的状态、并行执行和后台完成通知。

## 路由与内容

当前本机使用 **Claude Code → Magpie → 各上游**；`ANTHROPIC_BASE_URL` 指向 Magpie。Magpie UI 统一管理已登录的 Codex 订阅上游、现有 GLM 上游和 OpenCode Go，Haiku 通过 OpenCode Go 接入。

| 路径 | 说明 |
|---|---|
| `agents/` | 5 个定义：`gpt-6.1-sol`、`gpt-6-astra`、`glm-5.3`、`glm-5.3-flash`、`haiku-5.5` |
| `skills/multi-model-orchestration/` | 选模型、委托 prompt、规格/质量审查与独立验收、Workflow 编排 |
| `templates/CLAUDE.md.snippet` | 常驻委托规则；基于当前全局规则同步 |
| `docs/haiku-vs-glm-flash.md` | [Haiku 与 Flash 的证据、额度及测量限制](docs/haiku-vs-glm-flash.md) |
| `examples/magpie-routing.md` | [Magpie UI 上游与模型路由说明](examples/magpie-routing.md) |
| `examples/workflow-smoke-test.js` | Workflow 运行时示例，需单独授权执行 |
| `scripts/verify.sh` | 默认只检查模型列表；显式 `--smoke` 才请求 Haiku 工具往返 |

## 分工

| 优先级 | subagent | 默认推理 | 用途 |
|---|---|---|---|
| 复杂/高风险 | `gpt-6.1-sol` | high | 复杂根因、多模块行为、并发/恢复/外部副作用等高风险实现与关键审查 |
| 常规实现 | `glm-5.3` | max | 主控已明确方案与合同、可执行验收且需要更多推演的常规逻辑：业务逻辑、局部修复、测试、重构、批量实现 |
| 高速低复杂度执行 | `haiku-5.5` | medium | 需求清楚、验收直接、低风险、无需复杂推演时优先：检索/证据提取、摘要整理/结构化提取、文档同步、指定测试、主控已明确方案的简单实现/局部修复/测试补充、批量同类修改 |
| 高频批量/规模执行 | `glm-5.3-flash` | max | 持续高频批量、大规模 fan-out 和额度吞吐优先的任务，以及检索、证据提取、文档同步、指定测试和简单明确修改 |
| 最难 | `gpt-6-astra` | high | Sol 不足以处理的研究级难题、最长流程任务和架构第二意见 |

主控决定方案、根因、架构和最终验收。用户本地观察到的高输出速度是优先把低复杂度任务交给 Haiku 的主要原因，详见[分工证据与测量限制](docs/haiku-vs-glm-flash.md)。不按文件个数或输出长短排除 Haiku，长输出或批量本身不自动交给 Flash；任务不复杂且速度优先用 Haiku，持续高频或规模优先用 Flash，需要更多推演的常规逻辑用 GLM-5.3。

Haiku 与 Flash 可以落实明确的低风险执行任务；复杂根因调查仅提供线索，不能独自决定架构、复杂根因、并发/恢复/交易/持久化/外部副作用安全或高风险最终审批。测试回报必须来自实际输出。Haiku 是速度与额度分工，不是笼统认定更强或替代 GLM。Haiku medium 是已验证配置，不贸然降 low；公开证据区分了推理档位与平台测量。

Haiku 与 GLM 都按 **规格符合 → 代码质量 → 独立验收** 执行。低风险机械修改由主控规格检查和独立验证，常规逻辑由主控验收；有具体疑点或高风险才用 Sol。同一功能集成后可派一次 Sol 完整链路审查，不为每个 Haiku/GLM 小改派 Sol。交易安全、持久化、并发、外部副作用仍需 Sol 审查与主控最终验收。

OpenCode Go 有 5 小时/周/月额度。429 或额度耗尽时报告上游及可识别窗口/错误；低风险任务可明确告知用户后转 Flash，高风险不降级，不自动启用 Zen balance 额外付费。Haiku 超过 100K 输入的计价是短输入档的 5 倍，优先限制不必要的长上下文。GLM 的“近乎无限”来自用户订阅经验，不是服务保证；Flash 在 Coding Plan 的官方额度是 GLM-5.3 的 3 倍。

## 前置条件与模型定义

- Claude Code CLI，以及已配置的 Magpie 本地网关；上游与路由统一在 Magpie UI 管理。
- GPT 需要已登录的 ChatGPT/Codex 订阅上游，GLM 需要智谱 Coding Plan。
- **Haiku 可选**：需要 OpenCode Go 或 Go Plus 订阅及其 API key。没有该上游时暂不调用 `haiku-5.5`；默认检查会报告缺失模型。

在 Magpie UI 中添加/确认 provider `opencode-go`，接口类型 Anthropic，base URL `https://opencode.ai/zen/go`，填入自己的 Go key，并启用模型 `claude-haiku-5-5`。当前路由 ID 是 `opencode-go/claude-haiku-5-5`，Messages 请求最终地址为 `/v1/messages`。本仓库不提供凭据、不改 live 配置或 settings。

| Agent | 当前 `model` | 上下文管理与路由证据 |
|---|---|---|
| `gpt-6.1-sol` | `codex/gpt-6.1-sol:high` | 当前 Magpie 已实测；272k，不加 `[1m]` |
| `gpt-6-astra` | `codex/gpt-6-astra:high` | 当前 Magpie 已实测；272k，不加 `[1m]` |
| `glm-5.3` | `glm-5.3[1m]` | 当前 Magpie 兼容裸名已实测；原生 1M、默认 max |
| `glm-5.3-flash` | `glm-5.3-flash[1m]` | 当前 Magpie 兼容裸名已实测；原生 1M、默认 max |
| `haiku-5.5` | `opencode-go/claude-haiku-5-5:medium[1m]` | 当前 Magpie medium 路由与工具往返已实测；原生 1M |

`[1m]` 声明 1M 模型窗口，客户端剥离后发出请求；实际压缩阈值仍受现有全局配置影响，包括当前 `CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000`，没有做 1M 请求压力测试。GPT 保留现有 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`。窗口/压缩配置不拦截过长请求，GPT 审查应分段读 diff。当前 Magpie 的 GPT 与 Haiku 路由使用冒号 effort；GLM 保持兼容裸名和默认 max。

## 安装与验证

v0.2.0 当前在 `feat/haiku-orchestration` 分支，尚未合并到 `main`，也不是正式 release。合并前请从该分支取最新版本。

```bash
git clone --branch feat/haiku-orchestration https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh                  # 5 个 agents 与 skill；同名内容备份为 .bak
```

安装脚本只复制 agents 和 skill，不改 settings、不配置上游、不自动合并 CLAUDE.md。也可用 `CLAUDE_HOME=/path/to/isolated-dir ./install.sh` 验证独立安装。

1. 按 [Magpie 路由说明](examples/magpie-routing.md) 在 UI 中确认已登录的 Codex 订阅上游、现有 GLM 上游及模型 routes；Haiku 需要 OpenCode Go。
2. 将 `templates/CLAUDE.md.snippet` 的 Agent Delegation Rules 合并到 `~/.claude/CLAUDE.md`，保留其他无关章节。升级时可移除旧版本的 Sol agent 文件，避免被旧规则选中。
3. 在已设置 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）的环境中运行 `scripts/verify.sh`。默认只 GET 模型列表，不消耗生成额度；缺模型或 HTTP/API 错误返回非 0。
4. 需要验证工具协议时显式运行 `scripts/verify.sh --smoke`。仅请求 Haiku 的小型 `tool_use → tool_result → end_turn`，检查内容和 stop reason；默认使用已验证的 `opencode-go/claude-haiku-5-5:medium`，其他环境可显式设置 `SMOKE_MODEL`。这是路由与协议冒烟，不是性能比较。

[Claude Code 官方文档](https://code.claude.com/docs/en/sub-agents)说明，现有 `~/.claude/agents/` 目录的变化几秒后会用于后续委托；首次创建目录、add-dir 或禁用 slash commands 等情况需重启。CLAUDE.md 规则修改需重载；若当前会话工具清单未识别新 agent，使用 `claude --continue` 重启保留对话。

## 调用注意

- Agent tool 用 `subagent_type: "haiku-5.5"`；Workflow 用 `agentType: "haiku-5.5"`。其他模型同理，调用时不要传 `model` / `effort`，使用定义中的配置。
- Workflow 执行 stage 明确 `agentType`；综合与最终验收由主控执行。先处理缺失/失败结果，不能过滤掉失败结果继续；只在有必要时做一次整体 Sol 审查。示例是 Workflow 运行时脚本，顶层 `return` 与注入的 `agent` / `pipeline` 不适合直接在 Node 中运行。
- 外部模型的 `unrecognized_model` 警告不代表路由失败，实际结果以模型列表与请求为准。公开跑分和第三方测量的 harness 不等于当前 Go 路由的表现。

## License

MIT
