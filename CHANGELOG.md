# Changelog

本文件记录编排仓库的版本变化。版本号指本仓库，不对应模型版本。各 mod 使用独立版本，其详细变化记在对应 mod 的 CHANGELOG 中；此处的 "Mod 发布" 条目只作索引，发布 mod 不改变编排仓库版本。

## Unreleased

## 0.5.0 - 2026-10-11

- 默认安装改为模型中立：`./install.sh` 只复制完整便携 skill 目录（含 `references/`、模型中立的角色资产与标准库 setup helper），不安装具名 agent、不改 settings、不写 `CLAUDE.md`、不要求 Magpie；`./install.sh --preset` 才额外安装 7 个示例 agent 并迁移旧档 `haiku-5.5-max`，备份改为不覆盖旧档的唯一备份。
- 新增安装分支 `/multi-model-orchestration install`：scan 已配置候选（provider 中立，多来源只作来源观察）→ 按角色描述与证据匹配 worker / engineer / reviewer / visual / researcher / editor 六个模型中立角色 → 上下文检查（必经，写入可选）→ plan preview → 授权后 apply → 重载与本地 verify；始终提供 `inherit` 回退，没有模型列表也能继续；细节集中在新增 `references/installation.md`。
- 全部具名子代理（7 个：6 个核心 + 可选 Gemini）统一为 max 推理，包含 `gpt-6.1-sol`、`gpt-6-astra`（路由改 `codex/...:max`，无 `[1m]`）与唯一的 `haiku-5.5`（`group/auto-claude-haiku-5-5:max[1m]`）；不按 effort 拆分代理。
- Worker 分工定稿：`deepseek-v4.1-flash` 为常规编码执行默认（主控明确方案的实现、已知根因修复、测试、重构、调查取证、文档、批量与长上下文及多工具流程）；`glm-5.3-flash` 用于质量优先编码与原生多模态，可接受等待时选用；`haiku-5.5` 用于紧凑上下文与速度敏感的范围可控修复、局部审查；`glm-5.3` 保留纯编码/文本推演；`gpt-6-astra` 为深度研究、证明、仿真与独立第二意见，不设 Sol→Astra 升级梯度。
- GLM 路由改用 zcode 限定名（`zcode/glm-5.3`、`zcode/glm-5.3-flash`）：独立日志核证裸名请求曾错落到其他渠道（commandcode claude-sonnet-5-5，status 400），限定名避免已观察到的错选。
- 上下文写入只在安装分支的预览与授权后发生：默认不写窗口/压缩参数，plan 只合并选定的 `modelSettings` 与白名单 env 键；`always_delegate: true` 时把常驻规则那句恰好追加一次到 `CLAUDE.md`；写入前唯一备份，重复 apply 不重复写入。
- `templates/CLAUDE.md.snippet` 精简为一句 skill 引用；README 重排为「通用默认安装 + 可选个人预设」，预设材料（`docs/haiku-vs-glm-flash.md`、`examples/magpie-routing.md`、workflow 冒烟示例）标注为示例环境证据而非普遍 benchmark；skill 增加便携可用性规则（完整 / 部分 / 无自定义代理 / 无 Agent 工具四种分支，高风险不因缺代理降级）与 `references/agents-and-installation.md`、`references/third-party-context.md` 两篇按需参考。
- `scripts/verify.sh` 改为独立本地验证：默认只核对已安装 skill 文件与所选角色定义；`--models` 可选扫描已配置模型；`--smoke` 必须显式设置 `SMOKE_MODEL`（无默认模型）做一次工具往返；列表包含某模型不等于 CLI 兼容或压力测试通过。安全回归修复：冒烟请求的 curl 以 `-q` 为第一参数、禁读用户 `~/.curlrc`；修复合法引号 model 带行尾注释时漏扫的问题，保留精确 ID，仅拒绝非法尾部。
- 验证范围：37 项合同测试（隔离安装、quoted scalar、curl 配置安全回归等）实际通过，Bash 语法与 diff 检查通过；本轮不含真实 provider 能力、1M 压力测试或性能结论，路由验证进展以 `examples/magpie-routing.md` 为准。

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
