# Claude-workflow

在 **Claude Code CLI** 里，让 Claude 做主控，把执行工作委托给 **GPT-6 Astra / GPT-6 Sol / GLM-5.3 / GLM-5.3-Flash**——并且它们就是**原生 subagent**：和 Claude 自带的 subagent 一样显示状态、并行运行、后台完成自动通知，不需要轮询外部进程。

## 原理

```
Claude Code (Opus 主控)
   │  ANTHROPIC_BASE_URL
   ▼
CPA (CLIProxyAPI) ── 按模型名分流 ──┬─ claude-*          → Claude
                                   ├─ gpt-6-*(effort)   → ChatGPT 订阅（Codex OAuth）
                                   └─ glm-5.3*          → 智谱 Coding Plan（Anthropic 兼容接口）
```

- Claude Code 的 subagent 定义可以写任意模型 ID（`model: "gpt-6-sol(xhigh)"`），请求原样发给 CPA，由 CPA 路由到对应上游。
- GPT 推理强度用 CPA 的模型名后缀指定；GLM-5.3 默认即 max 推理。
- Workflow / ultracode 模式下，`agent()` 用 `agentType` 同样能调这些 subagent。

## 内容

| 路径 | 说明 |
|---|---|
| `agents/` | 4 个 subagent 定义：`gpt-6-astra`、`gpt-6-sol`、`glm-5.3`、`glm-5.3-flash` |
| `skills/multi-model-orchestration/` | 委托与编排手册：选模型、prompt 模板、审查返工、Workflow 编排规则 |
| `templates/CLAUDE.md.snippet` | 放进 `~/.claude/CLAUDE.md` 的常驻委托规则 |
| `examples/cpa-config.example.yaml` | CPA 的 GLM 上游配置示例 |
| `examples/workflow-smoke-test.js` | Workflow 路由到外部模型的最小可运行示例 |
| `scripts/verify.sh` | 检查 CPA 模型列表与推理强度后缀是否生效 |

## 分工

| 优先级 | subagent | 推理 | 用途 |
|---|---|---|---|
| 默认 | `glm-5.3` | max | 常规实现、重构、测试、批量修改、并行 fan-out（额度近乎无限） |
| 杂活 | `glm-5.3-flash` | max | 简单修改、样板代码、查找、日志排查 |
| 升级 | `gpt-6-sol` | xhigh | GLM 做不好的复杂实现；审查 GLM 写的代码 |
| 最难 | `gpt-6-astra` | medium | 长流程 agent 任务、疑难排障、架构第二意见（额度最贵） |

分工依据是公开跑分、社区口碑和各自的订阅额度，可按自己的订阅调整 `agents/*.md` 的 description 与 `templates/CLAUDE.md.snippet`。

## 前置条件

- Claude Code CLI
- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)，Claude Code 的 `ANTHROPIC_BASE_URL` 指向它（可配合 cc-switch 管理）
- ChatGPT 订阅（在 CPA 中完成 Codex 登录）
- 智谱 GLM Coding Plan

## 安装

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh              # 安装 agents 与 skill 到 ~/.claude（同名文件自动备份为 .bak）
```

然后：

1. 按 `examples/cpa-config.example.yaml` 在 CPA 中加入 GLM 上游，重启 CPA。
2. 把 `templates/CLAUDE.md.snippet` 合并进 `~/.claude/CLAUDE.md`。
3. 在 Claude Code 的环境下运行 `scripts/verify.sh`，确认 4 个模型都在、`gpt-6-sol(low)` 的思考 token 明显少于 `(xhigh)`。
4. 重启 Claude Code。

## 注意事项

- **调用时不要传 `model` 参数**：Agent tool / `agent()` 调用时的 `model` 优先级高于 subagent 定义，会把外部模型覆盖成 Claude。cc-switch 设置的 `CLAUDE_CODE_SUBAGENT_MODEL` 优先级更低，不影响这 4 个 subagent。
- Claude Code 会对外部模型报 `unrecognized_model`、按 200k 上下文处理，属正常警告。
- 不要给 GLM 加 `(max)` 后缀：CPA 的 Claude 协议没有 max 档，可能映射成智谱不支持的 xhigh。
- subagent 定义和 CLAUDE.md 只在会话启动时加载，修改后需重启（`claude --continue` 保留对话）。
- GPT 的公开跑分多在 Codex harness 下测得，在 Claude Code harness 里的表现可能有差异。

## License

MIT
