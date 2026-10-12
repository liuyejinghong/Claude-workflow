# 第三方模型窗口与压缩（按需参考）

Claude Code 经网关或第三方 provider 路由时，先区分客户端假定窗口、自动压缩触发窗口、单次输出上限三个概念；下面参数分别影响它们，不能互相替代。本页是按需排查参考，不要求每轮加载；普通使用不会修改任何配置，写入只发生在 install 分支的具体 preview 与授权之后。安装分支如何为多角色选择这些参数、canonical `modelSettings` 键的限制与配置的全进程影响，见 [installation.md](installation.md)；本页不重复。

## 三个参数

| 参数 | 控制什么 | 关键规则 |
|---|---|---|
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | CLI 假定的模型窗口（proactive compaction 依据） | 按 ID 解析生效，条件见下表；CLI 无法探测网关实际更低上限 |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | 自动压缩触发窗口 | 纯整数 `100000`–`1000000`，受模型窗口封顶；优先级最高 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 每次请求最大输出 | 未知 ID 默认 32000、cap 128000，仍受 provider 更低 cap；调大会减少压缩前有效输入空间 |

另外：tools/system/memory/skill 描述占输入 token；`context_limit` 报错受网关 route 真实限制，CLI 不能仅凭注册表推断。GET `/v1/models`、状态栏显示、短 Read 冒烟都不等于压力测试。

## ID 解析与窗口纠正

| ID 情况 | 变量行为 |
|---|---|
| 无法解析为已知模型的 provider/custom ID，无 `[1m]` | 直接适用，按声明窗口压缩 |
| 无法解析 + 带 `[1m]` | 假定 1M 窗口，变量单独无效；要纠正需同时 `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` |
| 能解析为已知 Claude 模型（含 `[1m]`），或没有可剥离后缀的裸 `claude-` 名（型号未知也算） | 变量仅在同时 `DISABLE_COMPACT` 时生效——不推荐为塞长文关闭压缩 |

- provider/custom ID 的判定：不以 `claude-` 开头（不分大小写），或带 CLI 会剥离的后缀（如日期 `@YYYYMMDD`）；provider 前缀内含已知 Claude 型号仍可能被识别，不能靠前缀判断；未知的裸 `claude-` 名不要误以为变量直接适用。
- `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` 影响整个启动环境，不适合混模型通用设置。
- `[1m]` 是客户端窗口声明，不是上游扩容：只在已确认下层支持 1M 时使用；客户端剥离后缀不等于模型识别。
- 非 `[1m]` 自定义模型更适合按实际窗口配置；不要宣称 Sol/Astra 等永远 272k。

## 压缩优先级与调早

优先级：`CLAUDE_CODE_AUTO_COMPACT_WINDOW`（env）最高，覆盖命令、flag 与设置；`--autocompact` 是一次启动 flag，不被更高优先级 settings scope（如 managed）抢占，但 env 存在时被覆盖；`/autocompact` 保存的 `modelSettings.<model>.autoCompactWindow`（2.1.288+）按模型只在相同 settings scope 内高于全局 `autoCompactWindow`，更高 scope（如 managed）为某模型或全模型设定的窗口会覆盖保存值。

- env 只接受纯整数（`--autocompact` 则接受 `500k`/`1M` 等写法）；`500k` 在 env 会被误读为 500 并钳到 100K，不要这样写。窗口最低 100000，无法用它匹配更小的上游窗口。
- `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`（1–100）只把触发调早、不能调晚，对主会话和子代理都生效，但仅对会在模型窗口满前压缩的会话生效——是提前压缩，不是窗口扩容。
- 若全局 `CLAUDE_CODE_AUTO_COMPACT_WINDOW`（例：历史配置 272000）低于声明或实际的 1M 窗口，声明 `[1m]` 的 agent 会提前压缩；不要写未证实的精确阈值或 reserve 公式。

## 子代理上下文

- 子代理 fresh isolated context：主会话已读文件、完整对话、已调用 skill 不自动继承（fork 例外）。
- 给出任务合同、绝对路径与必要小证据，由 agent 按需 Read；大 diff 分块读，保留完整覆盖、不静默丢内容，只回结论与定位。
- 子代理窗口按其自身模型定义，不是自动继承主会话；但进程级 env 与压缩机制仍可能作用于子代理，一个全局 env 不保证匹配每个模型的 token limit。

## 排查步骤

1. 查 `claude --version`/`--help`、实际 agent 的 model、路由实际输入/输出上限（凭据不输出）。
2. 区分 ID：resolved Claude / unknown / 裸 `claude-` / `[1m]`，以及 env override 是否已设。
3. 只声明真实 limit；按路由选压缩与输出设置。settings 改动需既有授权，读本页不会自动改。
4. `prompt too long` → 手动 `/compact` 或分块；网关若把 too-long 错误改写成 CLI 不识别的措辞，CLI 可能无法识别并自动 compact/retry；agent 缺失 → 读 [agents-and-installation.md](agents-and-installation.md)。
5. 没做压力测试前，不宣称 1M 可用已全面证实。

## 本仓库历史数值 scope

- 本经验 1b9c164 引入、v0.3.1 最后包含，8f2db94（remove subscription policies）去除；现恢复为按需参考。
- 本机 2026-10-11 settings 仍为 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000`、`CLAUDE_CODE_MAX_OUTPUT_TOKENS=65536`；前两个针对当时 Sol/Astra 通道窗口，不是今日模型 API 默认或通用配置；默认文件安装不会写入，只有 install 分支在 plan 明确选定该配置时才写。
- 2026-10-12：Tibo（@thsottiaux）公告把 Codex/Work 的 `gpt-6.1-sol` 默认上下文由 272k 提升到 500k，仍可覆盖至 1M（原帖 https://x.com/thsottiaux/status/2109430343346581527）。公告称的默认值不是通用 API 默认（API 页仍为 total 1050000 / max output 128000）。同期 GitHub 静态 models.json（272k/872k）与本机 `~/.codex/models_cache.json`（373k/872k，2026-10-12 抓取）尚未显示 500k，尚未与公告一致，原因未知；不要据此断言 Codex 本机已自动变为 500k。Astra 与其它 OpenAI 行仍为 272k/872k。
- 同日（2026-10-12）本机 settings 的两个窗口 env 更新为 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=500000`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000`，`CLAUDE_CODE_MAX_OUTPUT_TOKENS` 仍 65536；它们对整个进程（含子代理）生效，是本机显式设置而非通用默认，仍是客户端假定、未做全量压力测试；安装流程仍不自动写入，只有 install 分支在 plan 明确选定该配置时才写。
- Gemini 本 route 输出上限 65536 是本机观察，不是所有 provider 的通用上限。
- 未做 1M 压力测试；`[1m]` 声明不等于实际长上下文体验。

## 官方来源（核验 2026-10-11）

- https://code.claude.com/docs/en/model-config#correct-the-window-for-a-gateway-or-custom-model-id
- https://code.claude.com/docs/en/model-config#set-the-auto-compact-window
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/llm-gateway-connect#troubleshoot-gateway-errors
