# Claude-workflow

> 推荐用 [Magpie](https://github.com/yetone/magpie) 作为本地网关，统一管理各模型的接入。

Claude-workflow 是一套在 Claude Code 里使用多个模型协作开发的方式：你照常在同一个对话里提需求，当前会话理解目标、决定做法，把写代码、查资料、独立复核交给合适的模型，最后把改动和结果交给你。

它省去你手动切换模型、逐个重复交代背景的麻烦：实现和复核分开进行，你看得到改了哪些文件、测试实际跑出什么结果、还有哪些问题留着。用哪些模型由你的环境决定，不需要固定型号。

## 用起来是什么样

假设你有一个正在开发的项目，想加一个“导出配置”的功能。你在 Claude Code 里说清目标和验收，不需要指定谁来做：

```text
/multi-model-orchestration 给设置页加一个“导出配置”按钮，把当前设置导出成 JSON；补上对应测试，原有测试也要通过。
```

配置好分工后，大致会经历：

```text
澄清必要的问题
  → 适合该任务的模型改代码、补测试并实际运行
  → 另一个独立上下文复核改动、测试结果和边界
  → 当前会话汇总：改了哪些文件、测试输出、还没解决的问题
```

需要先了解外部资料时，也可以先让负责调研的模型带着来源查清，再进入实现。

## 几个使用案例

下面几个例子都从“你想做什么”出发，重点是你可以在 Claude Code 里怎么说。例子里的模型名和代理名请按自己的环境替换。

### 案例 A：开始一次协作开发

比如你想给已有项目的搜索框加上“最近搜索”。在 Claude Code 里发：

```text
/multi-model-orchestration 给现有项目加“最近搜索”：搜索框获得焦点时显示最近 5 条，选中后填入并触发搜索。
范围只改搜索相关组件和它的测试。验收是功能可用，原有搜索测试仍然通过。
实现完成后让另一个代理独立复核，再告诉我改了什么、测试结果和遗留项。
```

“最近搜索”只是例子，换成你自己的功能、文件和验收标准即可。必要时当前会话会先确认少量会影响做法的问题，再交给适合且可用的模型实现；完成后由另一个独立上下文复核改动、测试结果和边界，最后由当前会话把改动、实际测试结果和遗留问题交回给你。

### 案例 B：增加一个模型

假设你已经在 Magpie 或自己的接入方式里接好了一个新模型，想让它参与日常实现。在 Claude Code 里可以这样说：

```text
/multi-model-orchestration 我已经接好了「新模型的准确名称」。
请为它建一个原生子代理，负责「想承担的工作」，再把它加入日常实现的候选。
如果已经有对应的原生代理，直接把那个名字加进名单。
```

把引号里的内容换成实际名称和它实际擅长的工作。已经接通的模型，建一个原生子代理或复用一个现成的，确认当前会话能调用后，加入日常实现的候选；已有代理只需改名单。模型接入和凭据仍由你的环境负责，Magpie 可以帮你统一管理这一步。

### 案例 C：调整日常实现先找谁

用了一阵子后，你可能想换一下优先顺序。比如：

```text
/multi-model-orchestration 日常实现优先 MiniMax-M3.1-Flash，其次 deepseek-v4.1-flash；
难题保留原来的安排，复核保持独立。
```

改完后，下次委托会按新顺序选第一个适合且当前可用的候选。它只影响“先找谁”，不改变模型本身，也不是执行失败后自动换模型重试的机制。

### 案例 D：把资料调研也加入分工

一开始你可能只安排了“谁写、谁复核”。后来有些任务需要先查清外部资料，可以这样说：

```text
/multi-model-orchestration 把资料调研也加入分工。用现在已经能调用的「某个代理」负责带来源的资料调查，
只做调研、不改代码，查完把结论和出处一起交回来。
```

之后遇到需要查资料的任务，当前会话会先把调研交给这个代理，再把带来源的结论交给实现或复核；前提是它已经接入、当前会话确实能调用。目前提供五类分工：常规实现、困难实现、独立复核、资料调研、文字与审美，每类交给谁、先后顺序都能按需配置，岗位类型本身固定。这里是给现有的调研岗位指定人选，更细的说明见[角色卡参考](skills/multi-model-orchestration/references/role-cards.md)。

## 快速开始

需要 Claude Code、Bash 和 Python 3。安装文件在终端运行：

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git
cd Claude-workflow
./install.sh
```

默认只装编排 skill。装完新开一个会话（或运行 `claude --continue`），然后在 Claude Code 里运行：

```text
/multi-model-orchestration install
```

五类分工（常规实现、困难实现、独立复核、资料调研、文字与审美）已经内置在编排里，不用自己搭建。这一步只是给每类分工定人选：向导会盘点你当前已经接好的模型，为每类分工推荐由谁来做、按什么顺序，先给出预览，确认后才写入。模型要先在你的环境里接通、当前会话能调用；接入这一步可以用 Magpie。更完整的安装与配置说明见[安装参考](skills/multi-model-orchestration/references/installation.md)。

不知道选什么的话，可以参考下面这套按公开信息整理的建议（模型名与价格取自 models.dev 及各厂商官方页，2026-10-20 取样）：

**常规实现**（日常改代码、补测试、重构：量大、单次失败代价低，先比价格和速度）

1. `MiniMax-M3.1-Flash` — 每百万 token $0.15/$0.60、1M 上下文，日常实现性价比最高
2. `deepseek-v4.1-flash` — 同价位，支持视觉输入，并发上限高
3. `glm-5.3` — 贵一档但实现质量稳，适合质量敏感的日常改动
4. `gemini-3.8-flash` — 1M 上下文、多模态，需要看截图或界面时用
5. `qwen3.8-flash` — 成本最低的兜底

**困难实现**（跨模块、难啃或高风险改动：失败代价高，先能力再上下文再价格）

1. `gpt-6.1-sol` — 官方定位就是复杂编码与 agent 流程，能力接近旗舰、价格低一半
2. `claude-opus-5-5` — 官方定位长时间 agent 编码，1M 上下文
3. `kimi-k3` — 1M 上下文，长仓库长文档场景性价比突出
4. `gpt-6-astra` — 官方最强档，留给前面仍不够时
5. `claude-fable-5-1` — 最难推理与长时 agent，与 Astra 同价位、更偏长链推理

**独立复核**（换独立上下文只审不改：能力优先，尽量与实现方不同厂商）

1. `gpt-6.1-sol` — 强度与成本平衡最好，默认复核档
2. `gpt-6-astra` — 最强复核，用于高风险改动
3. `claude-opus-5-5` — 与 OpenAI 系不同家族，复核视角更独立
4. `glm-5.3` — 第三厂商，成本敏感时的复核档
5. `kimi-k2.7-code` — 编码专用型号，适合审代码

**资料调研**（带来源的检索与调查：要快、便宜、上下文大）

1. `MiniMax-M3.1-Flash` — 便宜且 1M 上下文，抓取整理长资料性价比最高
2. `deepseek-v4.1-flash` — 同价位，支持视觉与工具调用
3. `gemini-3.8-flash` — 联网与多模态检索强
4. `glm-5.3-flash` — 多模态输入的低价档
5. `qwen3.7-flash` — 每百万 token $0.03/$0.13，量大时用

**文字与审美**（文案润色、界面审美反馈：要能看图，再比速度和价格）

1. `gemini-3.8-flash` — 当前主力 Flash，多模态输入、速度快
2. `glm-5.3-flash` — 原生视觉输入，价格低
3. `MiniMax-M3.1-Flash` — 支持 image/video 输入
4. `qwen3.8-flash` — 多模态输入，价格低
5. `gpt-6-luna` — 高吞吐纯文本润色

这只是按公开价格和能力标签整理的起点，换成你手里能力相当的模型完全可以；完整调研记录见 [模型调研](docs/research/popular-models-2026-10-20.md)，维护者本地实际搭配见 [Magpie 示例](examples/magpie/README.md)。

## 查看运行状态

如果想看某次任务里有哪些模型在工作、各自占用了多少上下文、输出速度怎么样，可以加装独立的 [token-speed](mods/token-speed/README.md) 组件。它在输入框上方按代理显示模型、上下文占用和生成速率，装不装都不影响上面的使用。

## 更多用法

- 想调整每类分工用哪些模型、谁先谁后：[角色卡参考](skills/multi-model-orchestration/references/role-cards.md)
- 模型接不上，或安装后当前会话看不到新代理：[代理与安装排查](skills/multi-model-orchestration/references/agents-and-installation.md)
- 第三方模型的上下文窗口、压缩和输出上限：[第三方上下文](skills/multi-model-orchestration/references/third-party-context.md)
- 想看看维护者自己怎么分工（个人环境示例，不是通用接入方式）：[Magpie 示例](examples/magpie/README.md)
- 委托任务怎么写、并行和复核怎么安排：[编排手册](skills/multi-model-orchestration/SKILL.md)
- 想让每个会话都带上委托约定：[常驻规则模板](templates/CLAUDE.md.snippet)

版本：Claude-workflow 0.6.0，token-speed 0.4.6，两者独立发版。更新见 [CHANGELOG](CHANGELOG.md) 与 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)，许可证 [MIT](LICENSE)。
