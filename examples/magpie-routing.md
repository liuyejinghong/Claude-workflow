# Magpie 上游与模型路由

> 本页是 `./install.sh --preset` 个人预设的示例环境说明，不是通用安装要求；通用安装见 [README](../README.md#安装与验证)。

链路为 **Claude Code → Magpie → 各上游**。上游登录与模型 routes 统一在 Magpie UI 管理；这是路由说明，不是可导入的配置 schema。

在 Magpie UI 中配置 Codex、GLM 以及所需上游。若使用 `opencode-go` provider，接口类型为 Anthropic，endpoint 为 `https://opencode.ai/zen/go`，启用模型 `claude-haiku-5-5` 与 `deepseek-flash`；Messages 请求最终地址为 `https://opencode.ai/zen/go/v1/messages`。

| Agent | Magpie 请求 route | Agent `model` | 默认推理 |
|---|---|---|---|
| `gpt-6.1-sol` | `codex/gpt-6.1-sol:max` | `codex/gpt-6.1-sol:max` | max |
| `gpt-6-astra` | `codex/gpt-6-astra:max` | `codex/gpt-6-astra:max` | max |
| `glm-5.3` | `zcode/glm-5.3` | `zcode/glm-5.3[1m]` | max |
| `glm-5.3-flash` | `zcode/glm-5.3-flash` | `zcode/glm-5.3-flash[1m]` | max |
| `deepseek-v4.1-flash` | `group/deepseek-v4.1-flash:max` | `group/deepseek-v4.1-flash:max[1m]` | max |
| `haiku-5.5` | `group/auto-claude-haiku-5-5:max` | `group/auto-claude-haiku-5-5:max[1m]` | max |
| `gemini-3.8-flash`（可选） | `commandcode/google/gemini-3.8-flash` | `commandcode/google/gemini-3.8-flash` | max |

全部具名子代理按 max 推理定义，不按 effort 拆分代理。GPT、Haiku 与 DeepSeek 使用冒号 effort，GLM 使用 zcode 限定名以避免默认/粘滞渠道错选。`[1m]` 是 Claude Code 的窗口声明，由客户端剥离，不属于 Magpie 请求 route；`codex/gpt-6.1-sol:max` 与 `codex/gpt-6-astra:max` 无 `[1m]`。Gemini 路由对外提供多档 effort；agent 默认声明 `max`，该档位已随子代理实际调用验证可用，未核验其在各上游的最终映射细节。窗口、压缩与输出上限参数的区别与排查见 [references/third-party-context.md](../skills/multi-model-orchestration/references/third-party-context.md)。

## 验证记录（2026-10-11）

- 聚合路由与工具往返：Haiku 与 DeepSeek 走 Magpie 聚合路由，由 Magpie 在 OpenCode Go 与 Command Code 之间选择渠道。两个聚合组均已通过 Anthropic Messages 工具往返 `tool_use → tool_result → end_turn`。
- DeepSeek V4.1 Flash：直接 Messages 请求 `group/deepseek-v4.1-flash:max` 的 max 思考与工具往返（两轮通过）；新启动 CLI `--agent deepseek-v4.1-flash` 使用仓库定义完成运行。Command Code 渠道未验收。
- Haiku 5.5：合并后的本机唯一 `haiku-5.5` 已通过原生 CLI 加载冒烟（`--agent haiku-5.5`，未用 `--agents` 覆盖；modelUsage 为 `group/auto-claude-haiku-5-5:max[1m]`，读取 `VERSION` 正常退出）；此前亦以临时定义通过 `:max` 工具往返与 CLI 冒烟。Magpie 转发日志 status 200、served 真实 Haiku、`tries` effort=max / fixed=max。
- GPT 系 `:max`（Sol、Astra）：临时只读定义原生 CLI 验证 max 路由两轮成功（读取 `VERSION` 正常退出；modelUsage 分别为 `codex/gpt-6.1-sol:max` 与 `codex/gpt-6-astra:max`），日志 status 200、served 匹配、`tries` effort=max / fixed=max；最终仓库/本机定义配置已独立核对一致。属受控读取冒烟，不构成能力 A/B。
- 定义与安装一致性：主控 YAML/字节核对显示仓库与本机均为 7 个活跃 agent、全部 effort=max，本轮更新的 6 个定义逐字相同，Sol/Astra model route 与此前独立 max 实测一致，Gemini 定制内容逐字保留；临时 HOME 独立安装与重复安装演练通过：旧档位别名移除并单独备份，重复安装不影响已有 `.bak` 与无关 agent，7 个 max 定义与 skill 一致。
- 日志口径：Magpie 日志的入口 effort 可能与 `tries` 中的实际 effort / fixed 不一致，以 `tries` 为准。
- 未核验：服务商内部实际计算预算、CommandCode 渠道、各 max 档性能 A/B；不宣称所有供应商视觉均已实测。

历史观察：短请求工具往返成功不能证明完整 CLI 兼容；Haiku 聚合子代理实际 CLI 调用曾报 Command Code `Invalid input at messages.1.role`（会话内 `system` 被该渠道拒绝），待 Magpie 提供兼容回退或上游支持。

**Gemini（可选）：** 使用 `commandcode` provider，需在 Magpie UI 中配置凭据与 route；仓库不包含用户凭据。该路由已完成连通与工具调用验证。未配置时 `gemini-3.8-flash` 子代理不可用，不影响其余 6 个核心 agent。Gemini 上游单次输出上限最高 65536，若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置更高会报 400，启动设置见 [README](../README.md#4-gemini-专项输出上限说明)。

安装 agents 与接入检查见 [README](../README.md#安装与验证)。
