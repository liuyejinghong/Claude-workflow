# Claude-workflow

Claude-workflow 是一套在 Claude Code 里用多个模型协作开发的方式。你照常在同一个对话里提需求；这个对话就是下文说的“当前会话”。当前会话理解目标、决定做法，把写代码、查资料、复核按岗位交给合适的代理。最后，改动和结果都交回给你。

这种方式把实现和复核分开。你看得到改了哪些文件、测试实际跑出什么结果、还有哪些问题没解决；也不用再手动切换模型、逐个重复交代背景。适合想让多个模型在 Claude Code 里分工的人。没有 Claude 订阅也能用，只要能把其他模型接进 Claude Code。

直接安装：见 [快速开始](#快速开始)。

先认识三个词：

- **岗位**：固定的五类工作：常规实现（worker）、困难实现（engineer）、独立复核（reviewer）、资料调研（researcher）、文字与审美（editor）。配置里用的是括号中的英文键名。
- **代理**：Claude Code 的子代理，定义里指定用哪个模型；模型都通过代理调用。
- **角色卡**：记录每类岗位有哪些候选代理、先找谁。可选，默认不创建；文件默认在 `~/.claude/orchestration.json`。

## 用起来是什么样

装好后，Claude Code 会多一个 `/multi-model-orchestration` 命令。假设你想给设置页加一个“导出配置”按钮，像平时一样说清目标和验收，不用指定谁来做：

```text
/multi-model-orchestration 给设置页加一个“导出配置”按钮，把当前设置导出成 JSON；补上对应测试，原有测试也要通过。
```

大致会经历：

```text
澄清必要的问题
  → 适合该任务的代理改代码、补测试并实际运行
  → 独立上下文复核改动、测试结果和边界
  → 当前会话汇总：改了哪些文件、测试输出、还没解决的问题
```

“独立上下文”指没参与实现的代理，复核时只看改动和测试结果。复核到什么程度，由当前会话按任务的复杂度和风险安排；低风险改动可能只做验收检查。最后你会收到一份回执，长这样（示例，数字是虚构的）：

```text
状态：完成
改动：src/settings/export.ts、tests/export.test.ts
测试：npm test，42 个通过，0 个失败
遗留：导出文件名暂时不可配置
```

需要先了解外部资料时，也可以先让负责调研的代理带着来源查清，再开始写代码。

## 几个使用案例

下面几个例子都从“你想做什么”出发，重点是你输入什么。案例 A 装好就能用；案例 B、C、D 会改配置：当前会话先给出预览，你确认后才写入。例子里的代理名是占位符，换成你当前会话能调用的名称。不确定有哪些时，先跑一遍[快速开始](#快速开始)里的配置向导。

### 案例 A：开始一次协作开发

比如你想给已有项目的搜索框加上“最近搜索”。在 Claude Code 里发：

```text
/multi-model-orchestration 给现有项目加“最近搜索”：搜索框获得焦点时显示最近 5 条，选中后填入并触发搜索。
范围只改搜索相关组件和它的测试；验收是功能可用，原有搜索测试仍然通过。
```

“最近搜索”只是例子，换成你自己的功能、范围和验收标准即可。

### 案例 B：增加一个模型

假设你已经在自己的环境里接好了一个新模型，想让这个模型参与常规实现。在 Claude Code 里可以这样说：

```text
/multi-model-orchestration 我已经接好了“新模型的准确名称”。
请为它建一个代理，负责“想承担的工作”，再把它加入常规实现的候选。
如果已经有对应的代理，直接把那个名字加进候选。
```

把引号里的内容换成实际名称和该模型实际擅长的工作。已有对应代理时，不用新建，直接加进候选。

### 案例 C：调整常规实现先找谁

用了一阵子后，你可能想换一下优先顺序。比如：

```text
/multi-model-orchestration 常规实现优先“代理 A”，其次“代理 B”；
困难实现和独立复核不变。
```

把引号里的名字换成你自己的代理。配置好之后，每次委托按顺序选第一个适合且当前可用的候选。排第一的调不动，就用下一个；任务做到一半失败，不会自动换代理重来。

### 案例 D：启用资料调研岗位

资料调研岗位刚装好时没有候选。想启用这个岗位，指定一个代理：

```text
/multi-model-orchestration 启用资料调研岗位，用“某个代理”负责带来源的资料调查；
只做调研、不改代码，查完把结论和出处一起交回来。
```

之后遇到要查资料的任务，当前会话先把调研交给这个代理。带来源的结论再交给写代码或复核的代理。五类岗位是固定的，加不了新岗位；你配置的是每类岗位用哪些代理、谁先谁后。更细的说明见[角色卡参考](skills/multi-model-orchestration/references/role-cards.md)。

## 快速开始

前提：Claude Code 里至少有一个能调用的模型。模型怎么接入由你的环境决定，本项目不代配路由、订阅和凭据。常见三种情况：

- 只有 Claude 订阅：所需 Claude 模型都可用时，向导会建议直接用 Claude Code 原生子代理，通常不用配置角色卡。
- 只有一个模型：不配置也能用；想让各岗位明确沿用当前会话的模型，可在配置向导里选 `inherit`。
- 要接入其他厂商的模型：可以用网关（比如 [Magpie](https://github.com/yetone/magpie)），也可以用你自己的方式。

除模型外，还需要 Claude Code、Bash 和 Python 3。在终端依次运行：

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh
```

脚本把 skill 复制到 `~/.claude/skills/multi-model-orchestration`（配置目录默认 `~/.claude`，可用 `CLAUDE_HOME` 或 `CLAUDE_CONFIG_DIR` 改）。已有同名目录会先备份到配置目录下的 `.workflow-backups`，不删旧备份。脚本不改 settings、代理和 `CLAUDE.md`。五类岗位的职责说明随 skill 一起装；你已有的角色卡、代理和设置都会保留。

装完新开一个会话，或运行 `claude --continue`。新装的 skill 要重开后才会加载，重开后 `/multi-model-orchestration` 命令才可用。

刚装好时，五类岗位只有职责说明，还没有候选。不配置也能用：当前会话按任务从你能调用的代理里挑。配置角色卡是为了固定每类岗位先找谁。需要配置时，在 Claude Code 里运行配置向导：

```text
/multi-model-orchestration install
```

命令里的 install 指配置，不重装 skill。向导会盘点当前会话可见的代理和已配置的模型，再给出候选。候选不代表已接通；向导只在你确认后写文件，预览会列出要写的每个文件。更完整的安装与配置说明见[安装参考](skills/multi-model-orchestration/references/installation.md)。

### 每类岗位适合什么模型

当前会话不占岗位，用你在 Claude Code 里选的模型，负责规划和最终验收。五类岗位看重的能力不同：

- 常规实现：日常改动量大、单次风险低，看重速度、成本和工具调用稳定。
- 困难实现：跨模块或高风险改动，推理和长任务能力优先，再按成本选择。
- 独立复核：只审不改，宜用与实现者不同的模型，看重发现问题的能力。
- 资料调研：带来源的检索和调查，看重长上下文和检索能力。
- 文字与审美：文案润色看重语言质量；界面审美反馈还要能看图，需要多模态。

下面是示例，不是要求，顺序也不代表优先级：

- 常规实现：`deepseek-flash`（DeepSeek，当前指 DeepSeek-V4.1-Flash-1017）、`MiniMax-M3.1-Flash`（MiniMax）
- 困难实现：`gpt-6.1-sol`（OpenAI，均衡档，官方推荐复杂编码）、`claude-opus-5-5`（Anthropic，定位长时 agent 编码）、`gpt-6.1-terra`（OpenAI 快速档，价格约为 Sol 一半）
- 独立复核：`glm-5.3`（智谱，纯文本，适合审查）、`gpt-6.1-sol`、`claude-opus-5-5`
- 资料调研：`deepseek-flash`、`gemini-3.8-flash`（Google）
- 文字与审美：文案润色用 `glm-5.3`（纯文本）；界面审美要能看图，用 `gemini-3.8-flash`

没有这些模型时，按每类岗位看重的能力挑同类模型即可。示例取自三份调研归档：[模型调研](docs/research/popular-models-2026-10-20.md)（2026-10-20）、[评分归档](docs/research/model-benchmarks-2026-11-07.md)（2026-11-07）与[修正版](docs/research/model-benchmarks-2026-11-08.md)（2026-11-08 对 11-07 有修正）。归档都是历史快照，价格和能力会变。安装本身不带任何模型或顺序，用哪些代理、什么顺序，由你在配置向导里确认。

## 查看运行状态

如果想看某次任务里有哪些模型在工作、各自占用了多少上下文、输出速度怎么样，可以加装独立的 [token-speed](mods/token-speed/README.md) 组件。token-speed 在输入框上方按代理显示模型、上下文占用和生成速率，装不装都不影响上面的使用。

## 更多用法

- 想调整每类岗位用哪些代理、谁先谁后：[角色卡参考](skills/multi-model-orchestration/references/role-cards.md)
- 模型接不上，或安装后当前会话看不到新代理：[代理与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)
- 第三方模型的上下文窗口、压缩和输出上限：[第三方上下文](skills/multi-model-orchestration/references/third-party-context.md)
- 委托任务怎么写、并行和复核怎么安排：[编排手册](skills/multi-model-orchestration/SKILL.md)（含角色卡、调用协议、审查与返工等章节）
- 想让每个会话都带上委托约定：[常驻规则模板](templates/CLAUDE.md.snippet)
- 委托策略的改进计划（已评估，未采纳）：[子代理编排收敛方案与验证计划](docs/plans/orchestration-simplification.md)

版本：Claude-workflow 0.7.0，token-speed 0.8.2（tag `token-speed-v0.8.2`），两者独立发版。更新见 [CHANGELOG](CHANGELOG.md) 与 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)，许可证 [MIT](LICENSE)。
