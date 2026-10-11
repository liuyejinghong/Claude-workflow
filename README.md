# Claude-workflow

Claude Code 提供成熟的原生 subagent、并行执行与后台通知。本项目把这套 harness 接入多模型委托：**通用默认**安装模型中立的编排 skill，扫描你环境中已配置的模型候选并按角色描述绑定分工；**可选个人预设**另有一套 7 个具名模型的经验分工，需显式安装，不改变默认行为。同时提供独立的实时观察 mod，在终端清晰掌握主控与各子代理的运行状态。

当前版本：[v0.4.0](VERSION) · [更新记录](CHANGELOG.md) · [MIT License](LICENSE)

本项目包含两部分核心能力：

- **多模型原生 Subagent 编排**：沿用 Claude Code 原生任务状态、并行执行与后台通知，把检索、实现、测试、文案和高风险改动分流到最合适的模型；通用安装只装 skill、按你环境实际可用的代理与模型工作，不要求 Magpie。
- **token-speed 观察 Mod**：在输入框上方为每个活跃代理显示模型、effort、上下文占用与实时速率，不增加额外网络请求与模型调用。

---

<a id="安装与验证"></a>

## 快速开始

通用安装分两步：先装文件，再用 `/multi-model-orchestration install` 配置角色与模型。两步都不要求 Magpie，也不安装具名模型。

### 1. 安装 skill（默认）

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh
```

默认只复制完整便携 skill 目录（含 `references/`、角色资产与 setup helper）到 `~/.claude/skills/multi-model-orchestration/`，不安装具名 agent、不改 CLI/settings、不写 `CLAUDE.md`；目标目录可用 `CLAUDE_HOME`（或 `CLAUDE_CONFIG_DIR`）自定义。覆盖已有 skill 前会创建唯一备份，不删除任何旧 `.bak`。

### 2. 配置角色与模型：`/multi-model-orchestration install`

这是通用安装的主流程。在 Claude Code 中调用该安装分支，按 [安装参考](skills/multi-model-orchestration/references/installation.md) 执行：

扫描已配置与上游公布的模型候选（provider 中立；没有模型列表也能用已有候选或 `inherit`）→ 按角色描述匹配 worker / engineer / reviewer / visual / researcher / editor 并说明依据 → 逐模型检查上下文限制（写入可选）→ 生成 plan 并 preview（不落盘）→ 经你授权后 apply（先备份，只写选定字段）→ 重载并做本地最小验证。

- 安装文件 ≠ 配置完成：provider、凭据与路由仍由你的现有环境负责，skill 不代办登录或网关配置。
- 候选名称或配置不等于工具兼容与能力；能力、视觉与强审查角色需要证据，不用名称猜未知模型。
- 未看过具体 preview 不写入；verify 只做本地文件与定义检查，不发压力测试、不做性能结论。

### 3. 常驻规则（可选）与重载

按需使用时无需修改 `CLAUDE.md`。需要常驻委托约定时，把 [templates/CLAUDE.md.snippet](templates/CLAUDE.md.snippet) 的**一句**规则合并进全局 `~/.claude/CLAUDE.md`（保留其他已有章节）。

新开会话生效；当前已打开的会话可退出后执行 `claude --continue` 重载规则。

### 4. Gemini 专项输出上限说明

以下是个人预设 `gemini-3.8-flash` 的相关说明。Gemini 3.8 Flash 通过 Command Code 上游接入，Magpie 路由为 `commandcode/google/gemini-3.8-flash`。其上游单次输出上限最高为 65536 tokens。若当前环境的 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 设置高于 65536，会导致 API 请求返回 400 错误。

如需在会话中使用 Gemini，可通过传入临时 settings 启动（该会话中全部模型单次输出上限均受覆盖，上下文窗口与 effort 不受影响）：

```bash
claude --settings '{"env":{"CLAUDE_CODE_MAX_OUTPUT_TOKENS":"65536"}}'
# 若继续已有对话，追加 --continue 即可
```

---

## 可选：个人预设（7 个具名模型）

通用默认之外的独立选项：`./install.sh --preset` 在默认 skill 安装之外，追加安装本仓库参考环境的 7 个示例 agent 定义（6 个核心 + 可选 Gemini，全部 max 推理，不按 effort 拆分）与既有 `haiku-5.5-max` 迁移。预设用于展示一套可行分工，定位为强能力经验预设，不构成普遍 benchmark，也不是通用安装要求。

预设的参考环境链路为 **Claude Code → Magpie → 各上游**；通用安装不需要 Magpie。路由、上游与 `[1m]`/effort 细节见 [Magpie 路由配置](examples/magpie-routing.md)（预设示例环境）。

预设按任务合同与风险分为三层：主控（Controller，规划、根因判断、架构决策与最终验收）、力工（Worker，执行已定方案的实现与批量工作）与审查与专项（Review / Specialist，关键审查、研究推理与限定专项）。主会话模型由用户选择；7 个具名 subagent 全部按 max 推理定义：

| Agent | 层级 | 默认推理 | 适用场景 |
|---|---|---|---|
| `gpt-6.1-sol` | 主控 | max | 最难根因、跨模块合同或行为、高风险实现与关键整体审查；多文件本身不强制升级；先由快速 worker 整理证据与测试入口，Sol 集中关键实现或同功能集成后一次审查。 |
| `glm-5.3` | 主控或常规执行 | max | 纯编码与文本代码推演；无原生视觉，依赖图片/截图的任务优先原生视觉模型。 |
| `haiku-5.5` | 力工 | max | 紧凑上下文、速度敏感的范围可控代码修复、测试、局部调查与审查、文档；大上下文与持续批量优先 DeepSeek。 |
| `glm-5.3-flash` | 力工 | max | 质量优先编码与原生多模态（图片/截图）；编码能力强但明显较慢，可接受等待时选用。 |
| `deepseek-v4.1-flash` | 力工 | max | 常规编码执行默认：主控明确方案的实现、已知根因修复、测试、重构、调查取证、文档、批量与长上下文及多工具流程；高风险实施归 Sol。 |
| `gpt-6-astra` | 审查与专项 | max | 深度研究、证明、仿真等专项，或未决难题的独立第二意见；不设 Sol→Astra 升级梯度，不进常规批量链。 |
| `gemini-3.8-flash`（可选） | 审查与专项 | max | 指定纯文字润色与 UI 审美反馈；不改 UI 实现或做技术审批。 |

各 agent 的任务边界以 [agents](agents) 中的 description 为准；分工与选型材料见 [模型分工与选型依据](docs/haiku-vs-glm-flash.md)（预设证据，非通用要求）。预设的路由验证使用 `scripts/verify.sh`：默认只做本地已安装 skill 检查；`--models` 可选扫描已配置模型/列表；`--smoke` 必须显式设置 `SMOKE_MODEL`（已确认的真实模型 ID）做一次 Anthropic Messages 工具往返。包含某模型不等于 CLI 兼容或压力测试通过；本仓库验证记录以 [examples/magpie-routing.md](examples/magpie-routing.md) 为准。

---

## token-speed 0.4.1：会话与代理状态监控

[token-speed](mods/token-speed/README.md) 是适用于 Claude Code 的独立 mod（基于 function-hooks，已在 2.1.294 验证）。它在终端输入框上方为每个活跃代理显示单行状态，最后一行显示当前工作区，不依赖 Magpie 或模型订阅：

```text
⚡ main · gpt-6.1-sol · max · Ctx ██████▊    67%/272k · Live ~42.1 · Last 31.2 · Avg 28.6 tok/s · streaming
🌳 abcdefg1 · glm-5.3-flash · max · Ctx █▍         14%/1.0M · Live ~35.2 · Last 29.1 · Avg 30.4 tok/s · streaming
⌂ Claude-workflow on main
```

**指标口径：**

- **Live**：带 `~` 的字符估算值，按最近 3 秒观察到的字符计算，非 tokenizer 精确计数。
- **Last / Avg**：基于 CLI usage 的全程 API 输出速率（包含网络、TTFT、thinking 与内置工具耗时，非纯解码速率或 benchmark）。其中 Avg 为该代理在当前模型下最近 24 小时滚动窗口的加权平均。
- **上下文占用**：固定 10 格视觉进度条；窗口来源为运行时读数与离线模型表；未核验型号可能显示未知，详见插件说明。

**安装与使用：**

根目录安装脚本不包含 mods，可直接在 Claude Code 中通过 Marketplace 安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

常用命令包括 `/tok-speed`（查看详细列表与口径）与 `/tok-speed reset`（重置本会话统计）。完整细节见 [mods/token-speed/README.md](mods/token-speed/README.md) 与 [mods/README.md](mods/README.md)。

---

## 如何委托

在会话中明确任务目标、修改边界与验收标准，Claude 会拆解任务并按角色分派；通用安装的生成角色名为 `workflow-worker`、`workflow-reviewer` 等，按你实际安装的角色使用：

> 请按多模型编排规则，为当前模块补充测试用例。先由 workflow-worker 按已定方案实现改动并编写测试，再由 workflow-reviewer 在独立上下文核对改动与测试结果；验收标准为新测试通过且覆盖边界条件。

也可以直接指定特定 subagent 执行明确任务（以下为个人预设的具名代理示例）：

> 请用 gemini-3.8-flash 审阅并润色 docs/guide.md 中的用户指引，保持技术事实不变，提升语言流畅度。

更多 prompt 模板、交叉审查流程与 Workflow 编排见 [多模型编排手册](skills/multi-model-orchestration/SKILL.md)。

---

## 核心文档索引

- [安装参考（install 分支）](skills/multi-model-orchestration/references/installation.md)：scan → 角色匹配 → 上下文 → preview → apply → verify 的顺序、命令与 plan schema。
- [代理可用性与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)：默认 / 个人预设 / 部分 agent 安装方式与缺代理时的分支规则。
- [第三方窗口/压缩排查](skills/multi-model-orchestration/references/third-party-context.md)：第三方客户端窗口与压缩问题排查。
- [Magpie 路由配置](examples/magpie-routing.md)：预设示例环境的模型路由 ID、上游要求与接入说明。
- [模型分工与选型依据](docs/haiku-vs-glm-flash.md)：7 模型预设的分工与选型材料。
- [多模型编排手册](skills/multi-model-orchestration/SKILL.md)：模型选择策略、审查流程与委托模板。
- [常驻规则模板](templates/CLAUDE.md.snippet)：一句 skill 引用，可选合并至全局 `CLAUDE.md`。
- [Workflow 冒烟示例](examples/workflow-smoke-test.js)：预设 agentType 的多 agent 流程示例（需在 Workflow 运行时授权执行，不能作为普通 Node.js 脚本运行）。
- [Claude Code Mods 索引](mods/README.md) 与 [token-speed 说明](mods/token-speed/README.md)。
- [更新记录](CHANGELOG.md) · [版本标识](VERSION) · [开源许可](LICENSE)。
