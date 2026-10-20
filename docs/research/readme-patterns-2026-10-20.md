# 热门项目 README 写法调研（2026-10-20）

## 取样与方法

- 通过 `gh api repos/<repo>` 读取元数据，`gh api repos/<repo>/readme -H 'Accept: application/vnd.github.raw+json'` 读取公开 README；只做内存/临时目录读取，未运行仓库内任何脚本。
- 星数为 2026-10-20 取样时点事实，只证明样本活跃，不证明 README 写得好。
- gemini-cli 的一次 readme 元数据请求返回 EOF，随后 raw 读取成功；下方行数来自实际文件。

| 仓库 | 类型 | Stars | 默认分支 | README |
|---|---|---:|---|---|
| anthropics/claude-code | AI 编程工具 | 152,677 | main | 72 行 / 2,873 B |
| google-gemini/gemini-cli | AI 终端 agent | 107,459 | main | 377 行 / 12,107 B |
| anomalyco/opencode | AI 编程 agent | 217,881 | dev | 125 行 / 5,123 B |
| astral-sh/uv | Python 包/项目管理 CLI | 90,913 | main | 326 行 / 9,859 B |
| junegunn/fzf | 通用终端模糊查找器 | 83,682 | master | 1,160 行 / 42,289 B |

样本中 3 个与 AI 编程/agent 邻近，2 个是成熟 CLI 工具，满足调研范围。

## 逐个观察

### anthropics/claude-code

来源：https://github.com/anthropics/claude-code/blob/main/README.md

- 前屏：版本徽章、一句产品定义、官方文档链接、一张 `demo.gif`，随后立刻进入 `Get started`。没有功能长列表，也没有架构图。
- 标题顺序：`# Claude Code` → `## Get started` → `## Plugins` → `## Reporting Bugs` → `## Connect on Discord` → `## Data collection, usage, and retention`（下含两个 H3）。
- 首次成功：`Get started` 内先给多平台安装命令，第 2 步只有一句「进入项目目录运行 `claude`」；不展开参数。
- 配置分离：安装选项、卸载、排障全部外链到 setup 文档；仓库只额外指向 plugins 子目录。数据收集与隐私留在 README 末尾。
- 原文：「Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster by executing routine tasks...」
- 适合借鉴：一句定义 + 一个可看的结果 + 最短安装路径；功能细节不堆在入口。
- 不照搬：徽章、Discord、数据合规章节；我们没有对应的商业/社区事实。

### google-gemini/gemini-cli

来源：https://github.com/google-gemini/gemini-cli/blob/main/README.md

- 前屏：两条 NOTE 横幅先说产品被 Antigravity CLI 取代、且未针对最新模型优化；然后才是标题、CI/版本/许可证徽章、一句定义和文档链接。这是「先告知重大变化」的写法。
- 标题顺序：`# Gemini CLI` → `## 📦 Installation`（Quick Install 下按 npx/npm/Homebrew/MacPorts/Anaconda 分 H4）→ `## Release Channels` → `## 📋 Key Features` → `## 🔐 Authentication Options` → `## 🚀 Getting Started`（Basic Usage、Quick Examples）→ `## 📚 Documentation`（按 Getting Started/Core Features/Tools/Advanced 分组的链接 hub）。
- 首次成功：`npx @google/gemini-cli` 放在 Quick Install 首位，标为「no installation required」；后面 Basic Usage 才给 `gemini`、多目录、指定模型和非交互模式。
- 配置分离：认证方式（Google 登录 / API Key / Vertex AI）留在入口，但配置、快捷键、命令参考全部外链到文档站；`Documentation` 一节本质是分类索引。
- 原文：「Gemini CLI is an open-source AI agent that brings the power of Gemini directly into your terminal.」
- 适合借鉴：先放「即时可跑」的一条命令；安装方式多时用折叠式并列，不写成长教程；文档索引按用户任务分组。
- 不照搬：emoji 标题、徽章、每周发布通道细节、认证环境变量长清单。

### anomalyco/opencode

来源：https://github.com/anomalyco/opencode/blob/dev/README.md

- 前屏：没有 H1，以 logo 图片充当标题；下一行是 tagline「The open source AI coding agent.」，再是 Discord/npm/CI 徽章、25 种语言切换、产品截图。视觉元素占了前屏大部分高度。
- 标题顺序：`### Installation` → `### Desktop App (BETA)` → `#### Installation Directory` → `### Agents` → `### Documentation` → `### Contributing` → `### Building on OpenCode`。因为缺少 H1，全部从 H3 起。
- 首次成功：只给多包管理器安装命令；没有「装完运行什么、看到什么」的完整示例，靠 `Agents` 简介和文档站补足。
- 配置分离：配置完全外链；README 只解释 build/plan 两个内置 agent 和安装目录优先级。
- 原文：「The open source AI coding agent.」
- 适合借鉴：安装命令按平台并列、每行带注释；用一小段解释「内置角色各做什么」。
- 不照搬：logo 当标题、语言选择器、Discord/商业徽章；也避免像它一样缺少首次运行示例。

### astral-sh/uv

来源：https://github.com/astral-sh/uv/blob/main/README.md

- 前屏：三枚徽章、一句定义、一张 benchmark 图，然后紧接 Highlights（10 条短句），再是 Installation。
- 标题顺序：`# uv` → `## Highlights` → `## Installation` → `## Documentation` → `## Features`（Projects/Scripts/Tools/Python versions/pip interface）→ `## Contributing` → `## FAQ` → `## Acknowledgements` → `## License`。
- 首次成功：Installation 只给最短安装；真正的首次成功在 Features：`uv init example`、`uv add ruff`，并附真实终端输出（`Resolved 2 packages in 170ms`）。
- 配置分离：详细安装方式与平台支持外链文档站；README 保留短特性演示和 4 条 FAQ（发音、写法、平台、生产可用性）。
- 原文：「An extremely fast Python package and project manager, written in Rust.」
- 适合借鉴：Highlights 用「用户得到什么」而非模块名；特性示例带可核对的输出；FAQ 只留最常见四问。
- 不照搬：benchmark 图与性能数字（我们没有同类可比数据）。

### junegunn/fzf

来源：https://github.com/junegunn/fzf/blob/master/README.md

- 前屏：logo、CI/版本/许可证/贡献者/赞助徽章、周边商品横幅，然后一句定义、截图和 4 条 Highlights。
- 标题顺序：无 H1；`Highlights`、`Table of Contents`、`Installation`、`Upgrading`、`Building`、`Usage`、`Examples`、`Key bindings`、`Fuzzy completion`、`Vim plugin`、`Advanced topics`、`Tips`、`Related projects`、`License`、`Goods`、`Sponsors`。使用手写 TOC。
- 首次成功：Homebrew 安装后立即讲 shell integration（键绑定与补全），再给 finder 的操作键；Demo 在 Usage 中段。
- 配置分离：几乎不分离，1,160 行全放在 README，用 TOC 导航；适合极客工具，不适合作为我们的入口模板。
- 原文：「fzf is a general-purpose command-line fuzzy finder and an interactive terminal toolkit.」
- 适合借鉴：Highlights 每条先给形容词再给结果；TOC 可读；操作说明用「按键 → 行为」短句。
- 不照搬：商品/赞助/贡献者徽章、单文件超长文档、手写 TOC 的维护成本。

## 共通结构

1. 标题下先给一句人话定义，再说价值或差异；没有项目从目录结构、函数名或 schema 开始。
2. 前屏必有「安装或立即运行」的入口；多数在前 50 行内给出第一条命令。
3. 首次成功尽量短：装完运行什么、看到什么；uv 甚至只保留一个 3 行命令输出。
4. 入口 README 通常 70–380 行；详细配置、平台差异、排障外链到 docs 或 references。
5. 功能用用户任务命名（Projects、Scripts、Agents），不用内部模块名。
6. 安装方式多时并列列出，不写成逐步教程；只有推荐路径展开。
7. 文档索引按「开始 / 核心功能 / 进阶」分组，而不是按代码目录。
8. 视觉元素（logo、徽章、周边、赞助）不是可读性的必要条件；claude-code 仅一张 demo，uv 仅一张 benchmark。

## 给本项目的固定 README 草案

建议 7 节，全部按读者问题排序，不按代码架构：

1. **标题 + 一句话 + 适合谁 / 不适合谁**
   说明：把第三方模型接进 Claude Code 原生子代理，主控保留识别、决策与验收；已有 Claude 模型够用时不必用。控制在 3 行内。
2. **它能帮你做什么**
   用 3–4 个用户场景说明五岗位：常规实现、困难实现、独立复核、检索取证、文字/审美。这里只回答「什么时候用哪个岗位」，不写匹配算法。
3. **开始前：你属于哪种情况**
   一张两行表：已有可复用原生 agent → 加角色卡；缺 agent → 先接入再委托。把 `--preset` 标为可选示例，不写成默认路径。
4. **走一遍：从安装到第一次委托**
   只保留一条推荐安装命令、一个最小角色卡、一条真实委托示例（任务、范围、验收标准）。让读者在这一节完成首次成功。
5. **角色卡只做一件事：记住先找谁**
   用三句话解释 `priority`（1 最高、10 最低、0 停用、同值按卡内顺序），强调卡只定候选，不复制或修改模型定义。JSON 放这里，不放到开头。
6. **出问题时先看这里**
   保留 `cards` / `verify` 两条命令；用短句覆盖未配置、配置损坏、岗位无候选三种状态；其余排障链接到 references。
7. **更多组件与文档**
   token-speed 用一段说明「独立安装、不是主流程必需」，加一张文档索引（角色卡、安装、第三方上下文、示例），末尾放版本与许可证。

不建议在入口放：目录树、完整 plan schema、配置目录优先级、备份权限、effort 两层语法、旧岗位迁移细节。

## 现有内容该挪到哪里

| 现有内容 | 建议位置 |
|---|---|
| `CLAUDE_HOME` > `CLAUDE_CONFIG_DIR` > `~/.claude` 优先级、备份目录与 0700 权限 | `references/role-cards.md` 或 `references/installation.md` |
| plan 包装、`card-plan.json` heredoc、preview/apply 完整流程 | `references/role-cards.md`；入口只留一句「写卡可用 preview/apply」 |
| `setup.py` 的完整命令路径与多组示例 | 入口只留安装、`cards`、`verify` 各一条；其余进 references |
| effort 的「原生 agent 字段」与「Magpie route 冒号后缀」两层说明 | `examples/magpie/routing.md` 或 `model-selection.md` |
| `visual` 岗位移除、旧 plan 拒绝、迁移说明 | `CHANGELOG.md` 或 `role-cards.md` 的迁移段落 |
| `--preset` 的扫描/匹配/上下文检查细节 | `examples/magpie/README.md` 与 `references/installation.md` |
| token-speed 的指标口径、生命周期与边界 | 保留在 `mods/token-speed/README.md`；入口只留一段和链接 |
| 五岗位的完整匹配规则、并发写入与交接协议 | `SKILL.md`；入口只留职责一句话表 |

## 事实风险

- 不能说「后台自动分配」或「自动 fallback」：主控读卡后按 description 与 priority 选择，没有常驻调度器。
- 角色卡的 `priority` 只影响同岗位候选顺序；不覆盖模型、effort、description，也不改权限。
- `install.sh` 默认只复制 skill，不装具名 agent、不改 settings、不写全局 `CLAUDE.md`；根安装不装 token-speed。
- token-speed 是独立组件（0.4.5），版本节奏与 skill 不同，不能写成一个版本号。
- `--preset` 是可选示例接线，不自动写卡、不代配路由，也不是通用要求。
- 原生 agent 层 effort 与 Magpie route 后缀不是同一套语法，入口不要合并成「统一配置」。
- 不要复用第三方 logo、徽章、商品、赞助、Discord 或语言选择器；也不要虚构截图、GIF、star 增长或性能数字。
- gemini-cli README 自述已被 Antigravity CLI 取代，不能拿它当「当前推荐」证据；star 数也不证明 README 质量。
- `opencode` 默认分支是 `dev`，链接与示例需按实际分支核对。

## 结论

入口的问题不是 185 行太长，而是前 100 行以配置结构和命令为主，读者先看到 JSON、`priority`、helper 路径和备份权限，最后才看到「这东西到底怎么帮我」。固定结构应把「是什么、适合谁、第一次委托」放前面，把 schema、优先级、effort、迁移和指标全部后移或外链。写作时以 uv 的 Highlights 和 gemini 的文档索引为参照，以 claude-code 的短入口为上限，不复制 fzf 的单文件长文档和 opencode 的视觉堆叠。
