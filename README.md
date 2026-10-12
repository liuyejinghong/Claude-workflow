# Claude-workflow

Claude Code 自带成熟的原生子代理、并行执行与后台通知。本项目在这套 harness 上接入多模型委托：主控保留规划、根因判断、架构决策与最终验收，把方案明确的实现、测试、检索、专项与独立审查交给合适的子代理；分工按你环境中实际可用的模型确定，不要求特定型号，也不要求 Magpie。

仓库包含两个可独立安装的组件：

| 组件 | 当前版本 | 入口 |
|---|---|---|
| multi-model-orchestration（skill） | 0.5.0 | [安装与配置](#安装与验证)：安装编排 skill，再把环境里的模型绑定到角色 |
| token-speed（mod） | 0.4.2 | [会话与代理状态监控](mods/token-speed/README.md)：独立的实时代理面板 |

当前版本：[v0.5.0](VERSION) · [更新记录](CHANGELOG.md) · [MIT License](LICENSE)；token-speed 使用独立版本，其历史见 [mod 更新记录](mods/token-speed/CHANGELOG.md)。

<a id="安装与验证"></a>

## 快速开始

前置条件：Claude Code 可用；安装脚本需要 Bash，安装向导与验证需要 Python 3（只用标准库）。流程共四步：终端安装文件 → Claude Code 里运行向导 → 跟着向导确认方案 → 重载并本地验证。

1. **安装 skill 文件**

   ```bash
   git clone https://github.com/liuyejinghong/Claude-workflow.git
   cd Claude-workflow
   ./install.sh
   ```

   默认只把完整 skill 目录（含 `references/` 与角色资产 `assets/roles.json`）复制到 `~/.claude/skills/multi-model-orchestration/`：不安装具名 agent、不改 settings、不写 `CLAUDE.md`。配置目录按 `CLAUDE_HOME` > `CLAUDE_CONFIG_DIR` > `~/.claude` 取值；覆盖已有文件前会创建唯一备份，且不覆盖更早的备份。

2. **打开或重载 Claude Code，运行向导**：新开一个会话，或在当前会话退出后运行 `claude --continue` 重载；然后在会话中输入 `/multi-model-orchestration install`。

3. **跟着向导确认方案**：向导会依次扫描已配置的候选模型 → 按角色描述与证据匹配角色 → 检查各模型的上下文 → 给出不落盘的修改预览。不要求先配置 Magpie 或先能列出模型：没有模型列表时，用已有候选、你手工确认的精确模型 ID，或 `inherit` 沿用当前主模型。

   上下文检查必做，但写入 context 参数是可选项（默认不写）；追加常驻单句同样可选。确认预览后才写入，且只写选定的字段，写入前先备份。

4. **重载角色并本地验证**：按提示重载会话，确认角色出现在可用工具目录后运行

   ```bash
   ./scripts/verify.sh
   ```

   默认只核对已安装文件与所选角色定义，不发模型请求。

<details>
<summary>verify.sh 的可选模式与口径</summary>

- `--models`：可选扫描已配置的模型/列表。
- `SMOKE_MODEL=<已确认的精确 ID> ./scripts/verify.sh --smoke`：额外发起一次最小模型调用，做 Messages 工具往返。

这些检查只说明本地文件与一次调用的情况，不是线路性能或能力评估；完整说明见 [代理可用性与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)。

</details>

## 安装后怎么用

需要委托时，直接以 `/multi-model-orchestration <任务>` 开头按需调用；例如：

```text
/multi-model-orchestration 修复 src/config.ts 读取空配置时抛错的问题。已定方案：空文件返回默认配置，并补一个对应测试。
范围：只改 src/config.ts 与 tests/config.test.ts；不升级依赖。
实现：由合适的代理按该方案完成并实际运行测试；复核：由独立上下文核对改动、测试结果与边界条件。
验收标准：新增测试实际通过，覆盖空配置文件与 EOF 边界。
```

- 只装 skill、只绑定部分角色也能用：按实际工具目录里可用的代理与任务风险选择；普通任务可以由同一模型的新上下文承担，高风险或强审查缺能力匹配代理时报告缺口、不由弱代理顶替，没有 Agent 工具时不强行派发；完整分支规则见 [代理可用性与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)。
- 同一模型可以在多个相互独立的新上下文里承担不同角色，实现与复核必须分开；普通子代理在独立的新上下文运行、不继承主会话的对话（fork 等继承模式除外），任务合同、路径与验收标准仍要写清楚，保持自包含 prompt。
- 向导生成的 agent 定义使用 `effort: max` 并保留你确认的精确模型 ID 与原有后缀；不会自动添加 provider 前缀、`:max` 或 `[1m]`。
- 默认按需使用，不需要修改 `CLAUDE.md`。希望每个会话都自动带上委托约定时，把 [templates/CLAUDE.md.snippet](templates/CLAUDE.md.snippet) 中的这一句合并进全局 `~/.claude/CLAUDE.md`（保留其他已有内容）：

> 处理需要委托、独立审查或多代理协作的任务时，先调用 `multi-model-orchestration` skill，按其规则执行。

## 六个角色与匹配规则

通用安装把候选模型绑定到六个模型中立角色（定义全文随 skill 安装，见 [assets/roles.json](skills/multi-model-orchestration/assets/roles.json)）；主控始终保留决策与最终验收。

| 角色 | 生成名 | 职责 |
|---|---|---|
| worker | `workflow-worker` | 按已定方案完成常规编码、修复、测试、重构与取证，回报证据 |
| engineer | `workflow-engineer` | 困难跨模块或高风险实现；仅在有能力证据时指派 |
| reviewer | `workflow-reviewer` | 独立复核整体正确性与合同边界；只审不改（除非授权） |
| visual | `workflow-visual` | 原生图像/截图证据分析；需要确认的原生视觉证据 |
| researcher | `workflow-researcher` | 研究、证明、仿真或限定范围的独立第二意见 |
| editor | `workflow-editor` | 指定纯文字润色与 UI 审美反馈（仅 Read/Glob/Grep/Edit/Write） |

匹配规则：

- 按角色描述与证据匹配：候选名称或配置不等于工具兼容或能力，未知模型不按名字猜能力。
- engineer、reviewer、visual 需要能力、视觉或强审查证据；没有证据就跳过该角色，不硬绑。
- 已有合适的 agent 直接复用，不必为每个角色新建模板。
- 上下文相互独立的角色可以由同一模型承担（各自单独的新上下文调用），不按 effort 拆出重复代理。

## 可选：个人预设（7 个示例 agent）

`./install.sh --preset` 在默认 skill 之外，追加安装本仓库参考环境的 7 个示例 agent（6 个核心 + 可选 Gemini，全部按 max 推理定义），并迁移旧档 `haiku-5.5-max`。这是一套可行的经验分工示例，不是通用安装要求；路由与凭据仍需按你的环境配置（参考链路为 Claude Code → Magpie → 各上游，通用安装不需要 Magpie）。

示例中 `deepseek-v4.1-flash` 是常规编码执行主力，`gpt-6.1-sol` 负责困难、高风险实现与关键整体审查；完整分工与选型依据见 [模型分工与选型依据](docs/haiku-vs-glm-flash.md)，示例路由 ID 与验证记录见 [Magpie 路由示例](examples/magpie-routing.md)，各 agent 的任务边界以 [agents/](agents) 中的定义为准。

<a id="4-gemini-专项输出上限说明"></a>

<details>
<summary>使用示例中的 Gemini 3.8 Flash 时注意单次输出上限</summary>

示例路由 `commandcode/google/gemini-3.8-flash` 的上游单次输出上限最高 65536 tokens；若当前环境的 `CLAUDE_CODE_MAX_OUTPUT_TOKENS` 高于该值，请求会返回 400。可在使用该模型的会话里临时覆盖（该覆盖对整个会话中的所有模型生效，只影响单次输出上限，不影响上下文窗口与 effort）：

```bash
claude --settings '{"env":{"CLAUDE_CODE_MAX_OUTPUT_TOKENS":"65536"}}'
# 继续已有对话时追加 --continue
```

这是该示例路由上已核实的限制，不代表其他 provider 或路由的通用上限。

</details>

## token-speed 0.4.2：会话与代理状态监控

[token-speed](mods/token-speed/README.md) 是独立的 Claude Code function-hooks mod（本版本在 CLI 2.1.296 上验证），不依赖 Magpie 或模型订阅；两个组件可独立安装，根目录 `./install.sh` 不安装 mod。它在输入框上方为每个活跃代理显示一行：

```text
⚡ main · gpt-6.1-sol · max · Ctx ██████▊    67%/500k · Live ~42.1 · Last 31.2 · Avg 28.6 tok/s · streaming
🌳 abcdefg1 · glm-5.3-flash · max · Ctx █▍         14%/1.0M · Live ~35.2 · Last 29.1 · Avg 30.4 tok/s · streaming
⌂ Claude-workflow on main
```

Live 是带 `~` 的字符估算值；Last 与 Avg 是 CLI usage 的 API 全程输出速率（含网络、TTFT 与 thinking），不是纯解码速度或 benchmark。通过 Marketplace 安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

常用命令：`/tok-speed`（详细列表与口径）、`/tok-speed reset`（重置本会话统计）。其余指标口径与兼容性细节见 [token-speed 说明](mods/token-speed/README.md)。

## 深入文档

- [安装参考](skills/multi-model-orchestration/references/installation.md)：scan → 角色匹配 → 上下文检查 → preview/apply → verify 的完整顺序、命令与 plan schema。
- [代理可用性与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)：默认 / 预设 / 部分角色安装，以及缺代理时的四种可用性分支。
- [第三方窗口与压缩排查](skills/multi-model-orchestration/references/third-party-context.md)：第三方模型的窗口、压缩与输出上限参数。
- [多模型编排手册](skills/multi-model-orchestration/SKILL.md)：选型规则、调用协议、审查与返工、Workflow 编排。
- [模型分工与选型依据](docs/haiku-vs-glm-flash.md) 与 [Magpie 路由示例](examples/magpie-routing.md)：个人预设的分工、路由与验证记录。
- [常驻规则模板](templates/CLAUDE.md.snippet)：上面引用的那一句。
- [Workflow 冒烟示例](examples/workflow-smoke-test.js)：依赖 Workflow 运行时注入的 API，需要在运行时显式选择并授权执行，不能作为普通 Node.js 脚本运行。
- [Mods 索引](mods/README.md) 与 [token-speed 说明](mods/token-speed/README.md)：mod 的安装方式、指标口径与 CLI 兼容版本。
