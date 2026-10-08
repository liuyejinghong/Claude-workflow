# Claude-workflow

在 Claude Code 中，由 Claude 负责规划和验收，把任务交给合适的模型执行。

这套配置提供 GPT-6.1 Sol、GPT-6 Astra、GLM-5.3、GLM-5.3-Flash 和 Claude Haiku 5.5 五个具名 subagent，沿用 Claude Code 原生的任务状态、并行执行和后台完成通知。你可以把检索、文档、测试和实现分配给不同模型，兼顾任务复杂度、响应速度与持续执行的额度。

当前版本：[v0.2.0](VERSION) · [更新记录](CHANGELOG.md)

<a id="安装与验证"></a>

## 快速开始

先准备 Claude Code CLI 和已配置模型路由的 Magpie 网关。当前链路为 **Claude Code → Magpie → 各模型上游**：GPT 使用已登录的 ChatGPT/Codex 订阅，GLM 使用智谱 Coding Plan；Haiku 可按需接入，需要 OpenCode Go 或 Go Plus 订阅。具体接入方式见 [Magpie 路由配置](examples/magpie-routing.md)。

**1. 安装 agents 与 skill**

从已发布的 v0.2.0 标签安装：

```bash
git clone --branch v0.2.0 https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh
```

脚本把五个 agent 定义和编排 skill 安装到 `~/.claude/`，已有同名内容备份为 `.bak`。它不自动修改 settings、provider 或全局 `CLAUDE.md`。

**2. 启用委托规则**

把 [常驻规则模板](templates/CLAUDE.md.snippet) 中的 Agent Delegation Rules 章节合并到 `~/.claude/CLAUDE.md`，保留其他已有章节。

新开一个 Claude Code 会话加载规则；已有会话可退出后运行 `claude --continue`，继续之前的对话。

**3. 检查模型路由**

在已设置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_AUTH_TOKEN`（或 `ANTHROPIC_API_KEY`）的环境中运行：

```bash
./scripts/verify.sh
```

默认只 GET 模型列表，不发送生成请求。检查会核对全部五个模型；如果没有接入可选的 Haiku，也会报告缺失并返回非零状态。

如需验证 Haiku 的工具往返，显式运行 `./scripts/verify.sh --smoke`。这会消耗 Haiku 生成额度，检查 `tool_use → tool_result → end_turn` 协议是否正常。

## 如何委托

在 Claude Code 对话中说明目标、允许修改的范围和验收标准，Claude 会按规则拆解任务、选择执行者并检查结果。例如：

> 请按当前多模型规则，为当前项目补充开发者上手文档。先根据现有配置确认依赖安装和测试命令，再拆解任务交给合适的子代理；只改文档，验收标准是命令与项目配置一致、本地链接全部可用。

也可以直接指定具名 agent：

> 请用 haiku-5.5 查找这个项目的测试入口，给出可执行的命令和对应配置文件，不修改文件。

Agent tool 参数、委托 prompt 和 Workflow 编排方式见 [完整编排手册](skills/multi-model-orchestration/SKILL.md)。

## 模型选择

| Agent | 默认推理 | 何时使用 |
|---|---|---|
| `haiku-5.5` | medium | 速度优先的低复杂度任务：检索、文档、指定测试，以及方案明确的简单实现、修复、测试补充和批量同类修改。 |
| `glm-5.3-flash` | max | 持续高频批量、大规模并行和额度吞吐优先的明确任务。 |
| `glm-5.3` | max | 方案与验收标准已明确、需要更多推演的常规实现、局部修复、测试补充和重构。 |
| `gpt-6.1-sol` | high | 复杂根因、多模块行为和高风险实现，以及关键审查。 |
| `gpt-6-astra` | high | Sol 不足时的最难研究问题、长流程任务和架构第二意见。 |

优先使用 Haiku 的速度依据来自用户本地观察；文件多或输出长本身不排除 Haiku，持续吞吐和规模优先时用 Flash。具体依据与额度说明见 [Haiku 与 Flash 的分工证据](docs/haiku-vs-glm-flash.md)。

Claude 保持方案与最终验收的责任，并为复杂或高风险改动安排关键审查。

## 详细文档

- [Magpie 路由配置](examples/magpie-routing.md)：上游接入、完整模型 ID 与默认推理配置。
- [多模型编排手册](skills/multi-model-orchestration/SKILL.md)：如何选模型、写委托 prompt、审查与验收，以及 Workflow 编排。
- [Haiku 与 Flash 的分工证据](docs/haiku-vs-glm-flash.md)：速度观察、额度、测量结果及适用范围。
- [常驻规则模板](templates/CLAUDE.md.snippet)：合并到全局 `CLAUDE.md` 的委托规则。
- [Workflow 示例](examples/workflow-smoke-test.js)：在 Workflow 运行时使用，需单独授权执行，不能直接作为普通 Node.js 脚本运行。
- [Mods](mods/README.md)：可独立安装的 Claude Code mods，不依赖 Magpie 或模型上游订阅。当前为 [token-speed 0.3.1](mods/token-speed/README.md)，更新记录见 [token-speed CHANGELOG](mods/token-speed/CHANGELOG.md)。
- [更新记录](CHANGELOG.md)与[版本文件](VERSION)。
- [Claude Code 官方 subagent 文档](https://code.claude.com/docs/en/sub-agents)。

最新开发版本见 [main 分支](https://github.com/liuyejinghong/Claude-workflow/tree/main)。

## License

[MIT](LICENSE)
