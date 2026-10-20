# Changelog

本文件记录编排仓库的版本变化。版本号指本仓库，不对应模型版本。各 mod 使用独立版本，其详细变化记在对应 mod 的 CHANGELOG 中；此处的 "Mod 发布" 条目只作索引，发布 mod 不改变编排仓库版本。

## Unreleased

- 暂无待发布内容。

## Mod 发布：token-speed 0.4.5 - 2026-10-20

- 补齐 DeepSeek free 档精确尾名 `deepseek-v4.1-flash-free` 的本机窗口 override（1000000）。该数值来自本机网关实测，不是官方公布容量，也未做压力验证；仅作上下文分母后备，官方 24 条记录不变，0.4.4 已收录的 MiniMax override 不重复添加。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)（含 tag `token-speed-v0.4.5` 说明），不改变编排仓库版本。

## 0.6.0 - 2026-10-20

- 岗位从六个角色收敛为五个：worker / engineer / reviewer / researcher / editor。旧 `visual` 岗位不再提供，已存在的 `workflow-visual` 文件不会被删除或改动；含 `visual` 的旧 plan 会被拒绝并提示改用其他岗位配一个已确认原生视觉的 agent，不承诺自动迁移。
- 新增角色卡：`<config>/orchestration.json` 按岗位列出原生 agent 候选与 `priority`（1 最高、10 最低，0 该岗位停用，同值按卡内顺序）。卡只定候选与顺序，不复制 model/effort/description，不改原生 agent 权限与定义；只写 `orchestration` 段时只写这一个 JSON，零 agent、零 settings、零全局 `CLAUDE.md` 改动，新建文件权限 0600。
- 新增 `setup.py cards` 只读命令与 `references/role-cards.md`；每次派发前重新读表，改 priority 无需 reload，缺配置与配置损坏分别显式报告，不静默回退。plan schema 新增可选 `orchestration` 段，字段非法、未知字段、越界 priority 一律拒绝。
- 岗位资产新增 `recommended_models` 建议元数据（模型、理由、effort 档位）；生成的 agent effort 解析规则唯一化：plan 显式 effort 优先，其次精确命中建议模型时沿用其档位（Sol/Astra 为 xhigh），其余默认 `max`，不剥 provider 前缀或后缀去猜模型。
- 安装向导新增第 0 步适用性检查：已确认 Claude 订阅且所需 Claude 模型全部可用时推荐直接使用原生子代理；订阅与可用性只接受用户确认的事实输入，不从模型名或可选列表推断。preview 随附覆盖五个岗位的配置确认表，一次确认后才 apply。
- 示例迁移到 `examples/magpie/`：新增 `README.md`、`orchestration.json`、`context-history.md`，原 `docs/haiku-vs-glm-flash.md` 与 `examples/magpie-routing.md` 迁入该目录并改名为 `model-selection.md` 与 `routing.md`；根目录 `agents/` 迁为 `examples/magpie/agents/`，`install.sh --preset` 与合同测试同步到新位置。历史 CHANGELOG 条目的链接目标同步更新，叙述不改。
- 个人预设扩为 8 个示例 agent（7 核心 + 可选 Gemini），新增 `minimax-m3.1-flash-free` 与 `deepseek-v4.1-flash-free` 两份已实测定义；`deepseek-v4.1-flash`、`glm-5.3`、`glm-5.3-flash` 的 description 同步本机实际代理口径（MiniMax free 优先、DeepSeek 为备），model/effort/body 不变。preset 只安装示例 agent 定义，不自动写角色卡。
- README 先介绍项目用途与协作效果，再用开发分工、增加模型、调整顺序和加入调研分工的案例说明用法；顶部推荐 Magpie 统一管理本地模型接入，建议模型表用官方完整模型名按优先级排列（来源 models.dev，附调研记录），详细配置留在参考文档，首页维护约定同步更新。
- 修复重复安装时旧 skill 备份被 CLI 注册的问题：完整备份改存 `<config>/.workflow-backups/install-<唯一名>/multi-model-orchestration/`，备份根目录与本次目录权限 0700；写入前拒绝异常备份根目录，保留换入失败时的原目录恢复与既有历史备份。

## Mod 发布：token-speed 0.4.4 - 2026-10-19

- 补齐 MiniMax 两个精确尾名的本机窗口 override：`minimax-m3.1-flash-free` 与 alias `minimax-m3.1-flash-preview:free`，窗口 1000000。该数值来自本机 CLI 确认，不是官方公布容量，也未做压力验证；仅作上下文分母后备，官方 24 条记录不变。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)（含 tag `token-speed-v0.4.4` 说明），不改变编排仓库版本。

## 0.5.4 - 2026-10-16

- 并行委托共享当前目录时，每个文件同一时刻只允许一个活跃写入者；写入白名单须包含脚本、格式化器与生成文件等间接产物，白名单外的写入须暂停并交回主控。这是派发与交接约束，未引入强制文件锁。
- 接替或重派前，须确认旧代理已完成或停止，且其后台写入命令已结束；接手者需重新读取最新文件与 diff，保留已确认成果，不按旧快照整文件覆盖。
- 范围重叠时串行执行，或在已授权时用 worktree 隔离，并由指定代理集中集成后再验收；规则与交接模板见[编排手册](skills/multi-model-orchestration/SKILL.md)。

## 0.5.3 - 2026-10-14

- 个人预设（小范围默认值变化）：示例 agent `gpt-6.1-sol` 的默认推理由 `max` 调为 `xhigh`，路由改为 `codex/gpt-6.1-sol:xhigh`、effort 为 `xhigh`；其余示例代理仍为 `max`，安装流程与 token-speed mod 不变。
- README、编排手册、模型分工说明与 [Magpie 路由示例](examples/magpie/routing.md) 已同步为当前预设。路由核验只确认 xhigh 请求被接受并由 `gpt-6.1-sol` 实际服务，不代表 xhigh 相对 max 的质量、速度或成本收益。

## Mod 发布：token-speed 0.4.2 - 2026-10-12

- `gpt-6.1-sol` 官方默认按 Tibo 2026-10-12 公告同步为 500000、max 1000000，读取失败后备 override 同步 500000；详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)。

## 0.5.2 - 2026-10-13

- 个人预设：`haiku-5.5` 与 `deepseek-v4.1-flash` 遇到模型调用报错时，默认改用 `glm-5.3-flash`，覆盖额度不足、限流等调用失败；模型路由 ID 与 max effort 保持不变。

## Mod 发布：token-speed 0.4.3 - 2026-10-12

- 修复启动时 effort 显示：以前漏读环境 effort 覆盖（`CLAUDE_CODE_EFFORT_LEVEL`），需要发送消息后才正确；现在首次显示即读取覆盖值，读取失败时回退原有配置顺序。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)（含 tag `token-speed-v0.4.3` 说明），不改变编排仓库版本。

## 0.5.1 - 2026-10-12

- 个人预设分工调整（示例预设）：`glm-5.3` 优先承担 Claude Code CLI 常规编码；`deepseek-v4.1-flash` 专注调研、定位与自动化，原由其负责的常规编码改由 `glm-5.3` 承担；紧凑、速度敏感的急修仍优先 `haiku-5.5`；`glm-5.3-flash` 保留为可选的视觉与质量编码。依据为用户实际使用体验，非受控排名；模型 ID 与 max effort 未改。

## 0.5.0 - 2026-10-11

- 默认安装改为模型中立：`./install.sh` 只复制完整便携 skill 目录（含 `references/`、模型中立的角色资产与标准库 setup helper），不安装具名 agent、不改 settings、不写 `CLAUDE.md`、不要求 Magpie；`./install.sh --preset` 才额外安装 7 个示例 agent 并迁移旧档 `haiku-5.5-max`，备份改为不覆盖旧档的唯一备份。
- 新增安装分支 `/multi-model-orchestration install`：scan 已配置候选（provider 中立，多来源只作来源观察）→ 按角色描述与证据匹配 worker / engineer / reviewer / visual / researcher / editor 六个模型中立角色 → 上下文检查（必经，写入可选）→ plan preview → 授权后 apply → 重载与本地 verify；始终提供 `inherit` 回退，没有模型列表也能继续；细节集中在新增 `references/installation.md`。
- 全部具名子代理（7 个：6 个核心 + 可选 Gemini）统一为 max 推理，包含 `gpt-6.1-sol`、`gpt-6-astra`（路由改 `codex/...:max`，无 `[1m]`）与唯一的 `haiku-5.5`（`group/auto-claude-haiku-5-5:max[1m]`）；不按 effort 拆分代理。
- Worker 分工定稿：`deepseek-v4.1-flash` 为常规编码执行默认（主控明确方案的实现、已知根因修复、测试、重构、调查取证、文档、批量与长上下文及多工具流程）；`glm-5.3-flash` 用于质量优先编码与原生多模态，可接受等待时选用；`haiku-5.5` 用于紧凑上下文与速度敏感的范围可控修复、局部审查；`glm-5.3` 保留纯编码/文本推演；`gpt-6-astra` 为深度研究、证明、仿真与独立第二意见，不设 Sol→Astra 升级梯度。
- GLM 路由改用 zcode 限定名（`zcode/glm-5.3`、`zcode/glm-5.3-flash`）：独立日志核证裸名请求曾错落到其他渠道（commandcode claude-sonnet-5-5，status 400），限定名避免已观察到的错选。
- 上下文写入只在安装分支的预览与授权后发生：默认不写窗口/压缩参数，plan 只合并选定的 `modelSettings` 与白名单 env 键；`always_delegate: true` 时把常驻规则那句恰好追加一次到 `CLAUDE.md`；写入前唯一备份，重复 apply 不重复写入。
- `templates/CLAUDE.md.snippet` 精简为一句 skill 引用；README 重排为「通用默认安装 + 可选个人预设」，预设材料（`examples/magpie/model-selection.md`、`examples/magpie/routing.md`、workflow 冒烟示例）标注为示例环境证据而非普遍 benchmark；skill 增加便携可用性规则（完整 / 部分 / 无自定义代理 / 无 Agent 工具四种分支，高风险不因缺代理降级）与 `references/agents-and-installation.md`、`references/third-party-context.md` 两篇按需参考。
- `scripts/verify.sh` 改为独立本地验证：默认只核对已安装 skill 文件与所选角色定义；`--models` 可选扫描已配置模型；`--smoke` 必须显式设置 `SMOKE_MODEL`（无默认模型）做一次工具往返；列表包含某模型不等于 CLI 兼容或压力测试通过。安全回归修复：冒烟请求的 curl 以 `-q` 为第一参数、禁读用户 `~/.curlrc`；修复合法引号 model 带行尾注释时漏扫的问题，保留精确 ID，仅拒绝非法尾部。
- 验证范围：37 项合同测试（隔离安装、quoted scalar、curl 配置安全回归等）实际通过，Bash 语法与 diff 检查通过；本轮不含真实 provider 能力、1M 压力测试或性能结论，路由验证进展以 `examples/magpie/routing.md` 为准。

## 0.4.0 - 2026-10-09

- 新增 `deepseek-v4.1-flash`，现有 7 个具名代理按明确合同与风险分工：GLM-5.3-Flash 为默认低风险批量 worker，DeepSeek 用于快速批量与长上下文，Haiku 用于快速明确的低复杂度任务；GLM-5.3 承担需更多推演的常规实现，Sol 承担复杂或高风险任务，Astra 承担最难任务，Gemini 保留文案/UI 专项边界。
- `haiku-5.5` 与 `deepseek-v4.1-flash` 使用 Magpie 聚合路由 `group/auto-claude-haiku-5-5:medium`、`group/deepseek-v4.1-flash`。两个组均已通过 Anthropic Messages 工具往返；仅 Haiku 已验证接受 `:medium`，DeepSeek 未测试该后缀。
- 精简 agent descriptions、常驻规则与按需编排手册，保留自包含 prompt、工具自证、两阶段审查和主控独立验收；选型依据集中在 agent description，路由兼容说明集中在示例。
- `scripts/verify.sh` 核心模型列表包含 6 个模型，新增 DeepSeek 检查，缺失返回失败；Gemini 仍为可选。默认仅检查模型列表，不发送生成请求。
- 检查范围：文档 diff 格式、安装与验证脚本语法、默认模型列表验证，以及编排入口的内容与改动范围检查。

## 0.3.1 - 2026-10-09

- README 开头改述定位：Claude Code 作为 harness，供无法订阅 Claude 官方模型的用户使用；默认主控为 GPT-6.1 Sol，没有 GPT 订阅时以 GLM-5.3 替代。
- subagent 分工改为按**模型能力与成本**分三层——主控（Controller）、力工（Worker）、审查与专项（Review / Specialist），明细表新增「层级」列并说明同一模型可随订阅条件换层。
- `gemini-3.8-flash` 默认推理改为 `max`；路由对外提供 low/medium/high，该档位已随子代理实际调用验证，`examples/magpie/routing.md` 同步。

## Mod 发布：token-speed 0.3.2 - 2026-10-09

- 修复主控上下文进度条闪烁：部分读数与主控模型切换不再把已知读数打回未知；详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)。
- 离线模型表扩充到 24 条前沿型号（补上 Gemini 3.8 Flash、DeepSeek V4.1 Flash、Claude Fable 5.1、GPT-6 Sol/Luna 等），每条带官方来源与核验日期。
- tag `token-speed-v0.3.2`，不改变编排仓库版本。

## 0.3.0 - 2026-10-09

- 新增可选专项代理 `gemini-3.8-flash`（Magpie 路由 `commandcode/google/gemini-3.8-flash`）：仅用于文案优化/润色（可直接编辑指定的纯文字）与 UI 审美反馈（只反馈）；开放 Read/Glob/Grep/Edit/Write，仅限指定纯文字编辑；不参与工程实现、根因、架构或并发/恢复/交易/持久化审查。未接入时不影响其他五个 agent。
- 编排手册、CLAUDE.md 模板与 `examples/magpie/routing.md` 同步 Gemini 角色与路由说明；上游为 Command Code，凭据与 route 需自行在 Magpie 配置，配额未核验。
- Gemini 上游单次输出上限最高 65536。若 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 高于该值会报 400，需在使用会话中自行调至不超过 65536；安装脚本不会修改该设置。
- README 重写，突出 token-speed mod；mod 详细变化见其 CHANGELOG，不改变 mod 版本。
- `scripts/verify.sh` 模型列表新增可选 Gemini 检查：存在则输出 OK，缺失仅提示未接入，不影响退出码；默认仍不发送生成请求。

## Mod 发布：token-speed 0.3.1 - 2026-10-09

- 每个代理一行显示模型、effort、上下文与输出速率，主控在前，工作区行在最后；速率数字按终端显示宽度对齐。
- 上下文进度条固定 10 格并跟随原生用量条配色；主控窗口优先使用运行时读数，子代理窗口后备来自[离线模型表](mods/token-speed/data/model-contexts.json)，启动读取一次，不联网。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)、[mod 说明](mods/token-speed/README.md)；tag `token-speed-v0.3.1`。

## 0.2.0 - 2026-10-08

- 5 个模型分工：Haiku 5.5（medium）用于高速低复杂度执行；Flash 用于高频批量与规模 fan-out，额度吞吐优先；GLM-5.3 用于需要更多推演的常规实现；Sol 用于复杂/高风险；Astra 用于最难任务。
- 路由统一为 Magpie：移除旧网关配置示例，新增 `examples/magpie/routing.md` 说明 UI 中的上游与模型路由。
- Agent 模型：GPT 与 Haiku 使用冒号 effort 后缀，GLM 保持兼容裸名与默认 max；窗口与压缩配置见[编排手册](skills/multi-model-orchestration/SKILL.md)。
- 接入与工具往返已验证；性能 A/B、1M 上下文压力测试和真实 Workflow 运行未做。
- 用户本地观察到 Haiku 约 100–200 tok/s、最快约 300 tok/s。这是使用体验观察，不是 benchmark。

## 0.1.0 - 2026-09-28

- 原始未编号版本（追溯记为 0.1.0）：多模型编排 skill、安装脚本、模型定义与模板，包含 4 个原始代理（GPT-6 Sol、GPT-6 Astra、GLM-5.3、GLM-5.3-Flash）。
