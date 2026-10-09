# Magpie 上游与模型路由

链路为 **Claude Code → Magpie → 各上游**。上游登录与模型 routes 统一在 Magpie UI 管理；这是路由说明，不是可导入的配置 schema。

在 Magpie UI 中配置 Codex、GLM 以及所需上游。若使用 `opencode-go` provider，接口类型为 Anthropic，endpoint 为 `https://opencode.ai/zen/go`，启用模型 `claude-haiku-5-5` 与 `deepseek-flash`；Messages 请求最终地址为 `https://opencode.ai/zen/go/v1/messages`。

| Agent | Magpie 请求 route | Agent `model` | 默认推理 |
|---|---|---|---|
| `gpt-6.1-sol` | `codex/gpt-6.1-sol:high` | `codex/gpt-6.1-sol:high` | high |
| `gpt-6-astra` | `codex/gpt-6-astra:high` | `codex/gpt-6-astra:high` | high |
| `glm-5.3` | `glm-5.3` | `glm-5.3[1m]` | max |
| `glm-5.3-flash` | `glm-5.3-flash` | `glm-5.3-flash[1m]` | max |
| `deepseek-v4.1-flash` | `group/deepseek-v4.1-flash` | `group/deepseek-v4.1-flash[1m]` | 未指定（上游 thinking 默认开启；effort 后缀未核验） |
| `haiku-5.5` | `group/auto-claude-haiku-5-5:medium` | `group/auto-claude-haiku-5-5:medium[1m]` | medium |
| `gemini-3.8-flash`（可选） | `commandcode/google/gemini-3.8-flash` | `commandcode/google/gemini-3.8-flash` | max |

GPT 与 Haiku 使用冒号 effort，GLM 保持兼容裸名。`[1m]` 是 Claude Code 的窗口声明，由客户端剥离，不属于 Magpie 请求 route。Gemini 路由对外提供 low/medium/high 三档；agent 默认声明 `max`，该档位已随子代理实际调用验证可用，未核验其在各上游的最终映射细节。

Haiku 与 DeepSeek 使用 Magpie 聚合路由，由 Magpie 在 OpenCode Go 与 Command Code 之间选择渠道。两个聚合组均已通过 Anthropic Messages 工具往返 `tool_use → tool_result → end_turn`。已验证接受 `:medium` 的仅为 Haiku；DeepSeek 使用无 effort 后缀的 route，未测试 `:medium`。

短请求工具往返成功不能证明完整 CLI 兼容；本次 Haiku 聚合子代理实际调用报 Command Code `Invalid input at messages.1.role`，CLI 会话内的 `system` 被该渠道拒绝，待 Magpie 提供兼容回退或上游支持。

**Gemini（可选）：** 使用 `commandcode` provider，需在 Magpie UI 中配置凭据与 route；仓库不包含用户凭据。该路由已完成连通与工具调用验证。未配置时 `gemini-3.8-flash` 子代理不可用，不影响其他六个 agent。Gemini 上游单次输出上限最高 65536，若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置更高会报 400，启动设置见 [README](../README.md#4-gemini-专项输出上限说明)。

安装 agents 与接入检查见 [README](../README.md#安装与验证)。
