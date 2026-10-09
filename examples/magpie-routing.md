# Magpie 上游与模型路由

链路为 **Claude Code → Magpie → 各上游**。上游登录与模型 routes 统一在 Magpie UI 管理；这是路由说明，不是可导入的配置 schema。

在 Magpie UI 中确认已登录的 Codex 订阅上游与现有 GLM 上游。Haiku 使用 `opencode-go` provider，接口类型为 Anthropic，endpoint 为 `https://opencode.ai/zen/go`，启用模型 `claude-haiku-5-5` 与 `deepseek-flash`；Messages 请求最终地址为 `https://opencode.ai/zen/go/v1/messages`。OpenCode Go 需要有效订阅，不自动启用 Zen balance 额外付费。

| Agent | Magpie 请求 route | Agent `model` | 默认推理 |
|---|---|---|---|
| `gpt-6.1-sol` | `codex/gpt-6.1-sol:high` | `codex/gpt-6.1-sol:high` | high |
| `gpt-6-astra` | `codex/gpt-6-astra:high` | `codex/gpt-6-astra:high` | high |
| `glm-5.3` | `glm-5.3` | `glm-5.3[1m]` | max |
| `glm-5.3-flash` | `glm-5.3-flash` | `glm-5.3-flash[1m]` | max |
| `deepseek-v4.1-flash` | `group/deepseek-v4.1-flash` | `group/deepseek-v4.1-flash[1m]` | 未指定（上游 thinking 默认开启；effort 后缀未核验） |
| `haiku-5.5` | `group/auto-claude-haiku-5-5:medium` | `group/auto-claude-haiku-5-5:medium[1m]` | medium |
| `gemini-3.8-flash`（可选） | `commandcode/google/gemini-3.8-flash` | `commandcode/google/gemini-3.8-flash` | 未指定，未核验 |

GPT 与 Haiku 使用冒号 effort，GLM 保持兼容裸名。`[1m]` 是 Claude Code 的窗口声明，由客户端剥离，不属于 Magpie 请求 route。

`group/deepseek-v4.1-flash` 是 Magpie 的**聚合智能路由**，在 OpenCode Go 与 Command Code 之间自动选渠道，因此主控不需要按渠道路由；`[1m]` 同样由客户端剥离。该组已实测 Anthropic Messages 工具往返 `tool_use → tool_result → end_turn` 通过。`haiku-5.5` 同样走聚合路由 `group/auto-claude-haiku-5-5:medium`——两个聚合组都已实测接受 `:medium` 后缀并通过工具往返。

**Gemini（可选）：** 上游为 Command Code（`commandcode` provider），需要你自己在 Magpie UI 中配置凭据与 route；仓库不包含也不应写入任何用户凭据。该路由已完成连通与工具调用验证，配额未核验；实际可用性取决于各自上游配置与额度。未配置该路由时 `gemini-3.8-flash` 子代理不可用，不影响其他六个 agent。Gemini 上游单次输出上限最高 65536，若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置更高会报 400，见[编排手册](../skills/multi-model-orchestration/SKILL.md)中的说明。

接入后的检查方式见 [README](../README.md#安装与验证)。
