# Changelog

本文件记录编排仓库的版本变化。版本号指本仓库，不对应模型版本。各 mod 使用独立版本，其详细变化记在对应 mod 的 CHANGELOG 中；此处的 "Mod 发布" 条目只作索引，发布 mod 不改变编排仓库版本。

## 0.4.0 - 2026-10-09

- 新增 `deepseek-v4.1-flash`，现有 7 个具名代理按明确合同与风险分工：GLM-5.3-Flash 为默认低风险批量 worker，DeepSeek 用于快速批量与长上下文，Haiku 用于快速明确的低复杂度任务；GLM-5.3 承担需更多推演的常规实现，Sol 承担复杂或高风险任务，Astra 承担最难任务，Gemini 保留文案/UI 专项边界。
- `haiku-5.5` 与 `deepseek-v4.1-flash` 使用 Magpie 聚合路由 `group/auto-claude-haiku-5-5:medium`、`group/deepseek-v4.1-flash`。两个组均已通过 Anthropic Messages 工具往返；仅 Haiku 已验证接受 `:medium`，DeepSeek 未测试该后缀。
- 精简 agent descriptions、常驻规则与按需编排手册，保留自包含 prompt、工具自证、两阶段审查和主控独立验收；选型依据集中在 agent description，路由兼容说明集中在示例。
- `scripts/verify.sh` 核心模型列表包含 6 个模型，新增 DeepSeek 检查，缺失返回失败；Gemini 仍为可选。默认仅检查模型列表，不发送生成请求。
- 检查范围：文档 diff 格式、安装与验证脚本语法、默认模型列表验证，以及编排入口的内容与改动范围检查。

## 0.3.1 - 2026-10-09

- README 开头改述定位：Claude Code 作为 harness，供无法订阅 Claude 官方模型的用户使用；默认主控为 GPT-6.1 Sol，没有 GPT 订阅时以 GLM-5.3 替代。
- subagent 分工改为按**模型能力与成本**分三层——主控（Controller）、力工（Worker）、审查与专项（Review / Specialist），明细表新增「层级」列并说明同一模型可随订阅条件换层。
- `gemini-3.8-flash` 默认推理改为 `max`；路由对外提供 low/medium/high，该档位已随子代理实际调用验证，`examples/magpie-routing.md` 同步。

## Mod 发布：token-speed 0.3.2 - 2026-10-09

- 修复主控上下文进度条闪烁：部分读数与主控模型切换不再把已知读数打回未知；详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)。
- 离线模型表扩充到 24 条前沿型号（补上 Gemini 3.8 Flash、DeepSeek V4.1 Flash、Claude Fable 5.1、GPT-6 Sol/Luna 等），每条带官方来源与核验日期。
- tag `token-speed-v0.3.2`，不改变编排仓库版本。

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
