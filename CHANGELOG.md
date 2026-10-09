# Changelog

本文件记录编排仓库的版本变化。版本号指本仓库，不对应模型版本。各 mod 使用独立版本，其详细变化记在对应 mod 的 CHANGELOG 中；此处的 "Mod 发布" 条目只作索引，发布 mod 不改变编排仓库版本。

## 0.4.0 - 2026-10-09

- 新增力工代理 `deepseek-v4.1-flash`（Magpie 聚合智能路由 `group/deepseek-v4.1-flash`，在 OpenCode Go 与 Command Code 间自动选渠道；已实测 Anthropic Messages 工具往返 `tool_use → tool_result → end_turn` 通过）：用于总时长或缓存成本决定结果的任务——大规模并行 fan-out、超大缓存上下文的长会话、高频短条目批量；agentic 编码能力低于 GLM-5.3-Flash，不做多步工具链推演、复杂根因与高风险实现。
- 力工档明确排序为 GLM-5.3-Flash（默认）> DeepSeek V4.1 Flash（墙钟/长缓存）> Haiku 5.5（短上下文插队），依据为供给可持续 > 单位能力 > 速度。`haiku-5.5` 与 `glm-5.3-flash` 的描述同步补充额度与速度约束：Haiku 额度最紧且 >100K 输入 5 倍计价，GLM-5.3-Flash 为栈内最慢。
- DeepSeek V4.1 Flash 的额度随聚合路由选中的渠道而不同：OpenCode Go 侧为按模型独立额度（$60/月，5 小时窗口 20%），Command Code 侧为 $70 共享池内的 $60 上限，因此不假设额度独立于其他模型；工作日北京时间 09:00–12:00、14:00–18:00 为高峰约 2 倍价。新增证据文档 `docs/deepseek-v4.1-flash.md`。
- `scripts/verify.sh` 核心模型列表新增 DeepSeek V4.1 Flash（候选 `group/deepseek-v4.1-flash`、`opencode-go/deepseek-flash`、`commandcode/deepseek/deepseek-v4.1-flash`），缺失将返回失败；Gemini 仍为可选。默认仍不发送生成请求。
- Magpie 同时新增了 `group/auto-claude-haiku-5-5` 聚合路由；本次仅 `deepseek-v4.1-flash` 采用聚合路由，`haiku-5.5` 仍显式指定 `opencode-go/claude-haiku-5-5:medium`，以保留已验证的 effort 档位。
- 未核验：DeepSeek V4.1 Flash 的推理档位与 TTFT 口径，以及 OpenCode Go 的 $60 是否为长期额度（有 4x 促销传闻，官方文档未标注期限）。未做本机性能 A/B 与 1M 压力测试。

## 0.3.0 - 2026-10-09

- 新增可选专项代理 `gemini-3.8-flash`（Magpie 路由 `commandcode/google/gemini-3.8-flash`）：仅用于文案优化/润色（可直接编辑指定的纯文字）与 UI 审美反馈（只反馈）；开放 Read/Glob/Grep/Edit/Write，仅限指定纯文字编辑；不参与工程实现、根因、架构或并发/恢复/交易/持久化审查。未接入时不影响其他五个 agent。
- 编排手册、CLAUDE.md 模板与 `examples/magpie-routing.md` 同步 Gemini 角色与路由说明；上游为 Command Code，凭据与 route 需自行在 Magpie 配置，配额未核验。
- Gemini 上游单次输出上限最高 65536。若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 高于该值会报 400，需在使用会话中自行调至不超过 65536；安装脚本不会修改该设置。
- README 重写，突出 token-speed mod；mod 详细变化见其 CHANGELOG，不改变 mod 版本。
- `scripts/verify.sh` 模型列表新增可选 Gemini 检查：存在则输出 OK，缺失仅提示未接入，不影响退出码；默认仍不发送生成请求。

## Mod 发布：token-speed 0.3.1 - 2026-10-09

- 每个代理一行显示模型、effort、上下文与输出速率，主控在前，工作区行在最后；速率数字按终端显示宽度对齐。
- 上下文进度条固定 10 格并跟随原生用量条配色；主控窗口优先使用运行时读数，子代理窗口后备来自[离线模型表](mods/token-speed/data/model-contexts.json)，启动读取一次，不联网。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)、[mod 说明](mods/token-speed/README.md)；tag `token-speed-v0.3.1`。

## 0.2.0 - 2026-10-08

- 5 个模型分工：Haiku 5.5（medium）用于高速低复杂度执行；Flash 用于高频批量与规模 fan-out，额度吞吐优先；GLM-5.3 用于需要更多推演的常规实现；Sol 用于复杂/高风险；Astra 用于最难任务。
- 路由统一为 Magpie：移除旧网关配置示例，新增 `examples/magpie-routing.md` 说明 UI 中的上游与模型路由。
- Agent 模型：GPT 与 Haiku 使用冒号 effort 后缀，GLM 保持兼容裸名与默认 max；窗口与压缩配置见[编排手册](skills/multi-model-orchestration/SKILL.md)。
- 接入与工具往返已验证；性能 A/B、1M 上下文压力测试和真实 Workflow 运行未做。
- 用户本地观察到 Haiku 约 100–200 tok/s、最快约 300 tok/s。这是使用体验观察，不是 benchmark。

## 0.1.0 - 2026-09-28

- 原始未编号版本（追溯记为 0.1.0）：多模型编排 skill、安装脚本、模型定义与模板，包含 4 个原始代理（GPT-6 Sol、GPT-6 Astra、GLM-5.3、GLM-5.3-Flash）。
