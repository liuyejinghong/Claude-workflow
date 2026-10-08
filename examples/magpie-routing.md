# Magpie 上游与模型路由

链路为 **Claude Code → Magpie → 各上游**。上游登录与模型 routes 统一在 Magpie UI 管理；这是路由说明，不是可导入的配置 schema。

在 Magpie UI 中确认已登录的 Codex 订阅上游与现有 GLM 上游。Haiku 使用 `opencode-go` provider，接口类型为 Anthropic，endpoint 为 `https://opencode.ai/zen/go`，启用模型 `claude-haiku-5-5`；Messages 请求最终地址为 `https://opencode.ai/zen/go/v1/messages`。OpenCode Go 需要有效订阅，不自动启用 Zen balance 额外付费。

| Agent | Magpie 请求 route | Agent `model` | 默认推理 |
|---|---|---|---|
| `gpt-6.1-sol` | `codex/gpt-6.1-sol:high` | `codex/gpt-6.1-sol:high` | high |
| `gpt-6-astra` | `codex/gpt-6-astra:high` | `codex/gpt-6-astra:high` | high |
| `glm-5.3` | `glm-5.3` | `glm-5.3[1m]` | max |
| `glm-5.3-flash` | `glm-5.3-flash` | `glm-5.3-flash[1m]` | max |
| `haiku-5.5` | `opencode-go/claude-haiku-5-5:medium` | `opencode-go/claude-haiku-5-5:medium[1m]` | medium |

GPT 与 Haiku 使用冒号 effort，GLM 保持兼容裸名。`[1m]` 是 Claude Code 的窗口声明，由客户端剥离，不属于 Magpie 请求 route。

接入后的检查方式见 [README](../README.md#安装与验证)。
