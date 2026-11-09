# 多代理编码编排的 token 节省调研

日期：2026-11-08
范围：Claude Code 主控（Opus 5.5）+ 较便宜的执行型子代理的编排场景。目标是降低主控 token 与费用，不降低任务质量；子代理多花 token 可以接受。

结论先说：主控省 token 的核心不是“让主控少说话”，而是三件事——少让主控读长内容、少让主控重复读旧上下文、少让主控的缓存失效。多代理通常会提高总 token（官方报告多代理研究系统约为聊天的 15 倍），所以这里优化的是“贵模型 token 占比”，不是总 token 最小化 [12]。

## 一、可执行建议（按预计节省 × 质量风险低排序）

价格口径：Opus 5.5 列表价约 $4/MTok 输入、$20/MTok 输出、$0.20/MTok 缓存读；5 分钟缓存写 1.25×、1 小时缓存写 2× 输入价 [1][13]。以下金额为按该口径的估算，不是账单。排序是粗略的：第 6 条节省高但质量风险中等，故放在中段，建议先在低风险任务上试用。

| # | 建议 | 预计主控节省 | 质量风险 | 证据强度 | SKILL.md 覆盖 |
|---|---|---|---|---|---|
| 1 | 先确认主会话缓存 TTL；有 >5 分钟空档就设 1 小时 TTL，并保持 model/effort/工具集稳定，别在任务中途切换 | 高。一次 150K 冷重建约 $0.60 输入；1h 写比 5m 写多约 $0.45，避免一次冷重建即回本 | 低（只影响费用，不影响答案） | 官方；有数据（独立分析 [15][16]） | 没有 |
| 2 | 任务边界用 `/clear` 或新会话；长任务在自然断点 `/compact`，不要用 compact 代替 clear；清理前写 10 行交接笔记 | 高。旧任务 150K 上下文每轮约 $0.03 缓存读，20 轮约 $0.60 | 低（有交接笔记时） | 官方；有数据（成本模型 [13]） | 没有 |
| 3 | 压低主控上下文体积：按任务把 auto-compact 窗口调到 200K–300K，或手动在断点压缩；大文件/日志交给子代理；用 `/context` 审计 | 高。150K→50K，30 轮缓存读约 $0.90→$0.30 | 中（过早压缩可能丢细节；用笔记/CLAUDE.md 兜底） | 官方；有数据（成本模型 [13]） | 部分有（模板要求指定路径，无上下文预算） |
| 4 | 做 Claude Code 配置卫生：主会话用 Concise output style；CLAUDE.md <200 行；技能描述精简、未用技能禁用模型调用；关掉不用的 MCP server | 中。CLAUDE.md、output style、技能描述每次请求都在；示例 49K token 的 CLAUDE.md 每轮约 $0.01 缓存读 | 低到中（规则移入技能后可能不触发） | 官方 [3][7][8][9][10][20] | 没有 |
| 5 | 派发合同自包含，回报设硬预算：状态行、改动路径、命令与关键输出、未决问题；正文 1–2K token，详情写文件只回路径 | 中高。子代理 10K 报告降到 1–2K；详情文件化后主控按需读 | 低到中（过短可能掩盖证据；要求附命令输出） | 官方（结构 [11][12]）；经验（状态行） | 部分有（模板已有，缺字数/文件化预算） |
| 6 | 把“验证执行”下放给便宜 verifier，主控保留最终验收：verifier 跑测试并回报证据，主控只读摘要，疑点再复跑 | 高。50K 测试日志不进主控，约省 $0.25 缓存写 + 后续读 | 中（主控完全不复核会降质量） | 官方；有数据（token 隔离 [3][4][12]） | 部分有（“主控实际执行最小合同测试”需细化） |
| 7 | 裁剪子代理启动上下文；同任务且缓存热才用 SendMessage 续，任务变了/上下文陈旧就新开 | 中。社区样本每个子代理冷启动约 30–37K 静态上下文 | 低到中（omitClaudeMd 可能漏规则；需在合同复述） | 官方 [4]；经验/推断（复用经济性 [15][16]） | 没有 |
| 8 | 失败/返工设硬上限：每次派发最多 2 次尝试、最多 1 次升级；headless 用 `--max-turns`/`--max-budget-usd`；失败交回附证据 | 中。一次 100K 上下文重试 10 轮约 $0.40 | 低（过早停手需定义升级条件） | 官方工具 [10][12]；经验（社区 [18]） | 部分有（“重派一次仍失败”“不无限盲改”） |

## 二、主控侧怎么省

### 2.1 上下文管理：clear、compact、新会话

Claude Code 每个 turn 都会重发完整上下文，包括系统提示、CLAUDE.md、历史消息和工具结果；缓存只降低重复前缀的单价，不改变“上下文越大、每轮越贵”这个事实 [2][3][19]。Opus 5.5 的缓存读是输入价的 5%，但 20K 上下文每轮约 $0.004，150K 约 $0.03；30 轮分别是 $0.12 和 $0.90 [13]。所以“把主控上下文压小”通常比“让主控少写几句话”更值钱。

- `/clear` 是免费的新开始，适合切换到不相关任务；旧上下文不会在后续每轮继续计费 [3][10]。
- `/compact` 会发一次摘要请求，本身有成本。150K 上下文、缓存热时约 $0.25；之后每轮缓存读约省 $0.025，约 10 轮回本。任务快结束时才 compact，通常不划算 [13]。缓存冷时 compact 更贵，因为摘要请求要重新处理全部历史 [2]。
- 自动压缩：Opus 5.5 属于原生 1M 上下文模型，默认在约 967K token 才压缩 [6]。这个默认值对“不爆窗”友好，对费用不友好。若任务不需要 1M，`/autocompact 200k` 或 `300k` 可以更早压缩；代价是可能丢细节，需要把持久规则放在 CLAUDE.md、把任务状态写在笔记里 [5][6]。
- 压缩后仍保留：系统提示、output style、项目根 CLAUDE.md、auto memory、技能描述、最近读过的至多 5 个文件；已调用技能正文会重新注入，但每个技能上限 5K、总计 25K token [5]。因此“关键约束放 CLAUDE.md，过程细节放对话”比反过来更稳。
- 新会话 vs 继续：不相关任务用 `/clear` 或新会话；相关长任务用 `/compact` 保留连续性。清理前写一份 10 行交接笔记（目标、已完成、关键路径、未决问题、下一步），这是官方 context engineering 里的 structured note-taking，能把“上下文”换成“可重读的文件” [11]。
- 注意空闲开销：session recap、idle compaction、prompt suggestions、`/loop`、跨会话消息、goal check-in 都可能在你不打字时发请求 [3]。长会话离开前关掉或结束，比回来再 compact 便宜。1 小时 TTL 下长时间空闲还可能触发 idle compaction，可用 `idleCompaction: false` 关闭 [2]。

一个反直觉点：上下文不是越多越好。Anthropic 的 context engineering 文章明确提到 context rot——上下文变长后，模型准确召回的能力会下降；目标是“最小的高信号 token 集合”，不是最短 [11]。所以压缩上下文如果做得好，可能是质量中性甚至正向的；风险在于压得太狠丢掉后文需要的细节。

### 2.2 Prompt 缓存：5 分钟、1 小时、等待子代理

先把事实对齐：Claude Code 的主会话 TTL 取决于计费方式。Claude 订阅且在套餐额度内，主会话默认 1 小时；API key、云厂商、或订阅超出额度改用 usage credits 后，默认 5 分钟。子代理、workflow、fork、compaction 等“主会话之外”的请求，默认 5 分钟，即使你在订阅套餐内 [2]。所以“主控 TTL 约 5 分钟”不是必然，先看 `/usage` 里的 `Prompt cache (main)` 行；如果显示 5m，而你又经常等子代理超过 5 分钟，设置 `promptCacheTtl: "1h"` 或 `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` [2]。

关键机制：

- TTL 从请求开始计时，不从响应结束计时。一个响应流了 4 分钟，5 分钟缓存只剩约 1 分钟给下一次请求 [1]。等待 10 分钟的子代理，主会话 5 分钟缓存必然过期。
- 子代理请求不会读主会话的前缀，因此不会刷新主会话的缓存；只有主会话自己的请求会刷新 [2]（后者为机制推断）。主控等子代理时，缓存时钟照走。
- 1 小时写缓存是 2× 输入价，5 分钟写是 1.25×；缓存读是 0.05×（Opus 5.5）[1][13]。1h 只在“间隙 >5 分钟但 <1 小时”时划算；连续工作、每 5 分钟内都有请求时，5m 更便宜 [1]。
- 子代理 1h TTL 要选择性使用。官方提供 `subagentPromptCacheTtl: "1h"` 和每个子代理 frontmatter 的 `experimental.cacheTtl: "1h"` [2][4]（订阅使用 usage credits 时，frontmatter 的 1h 会被忽略）。独立分析指出，全部子代理 blanket 1h 可能更差：98% 的缓存复用发生在约 34 秒内，而 1h 写贵 60%；更合适的做法是只给“会阻塞超过 5 分钟”的子代理（长构建、长测试）设 1h [15][16]。社区报告里，测试型子代理把 1h TTL 打开后，缓存写从 12.2M 降到 3.0M token（约 -75%），但这是一天的单账号样本，未复现 [17]。
- 缓存失效的常见动作：切模型、改 effort（Opus 5.5 在 API key/订阅下改 effort 仍保留缓存；Bedrock/Vertex/gateway 会失效）、开 fast mode、连接/移除 MCP server（tool search 关闭时）、启用/禁用带 MCP server 的插件、在 tool search 不可用时整工具 deny、compact、图片累积、升级 Claude Code [2]。其中“切模型”最反直觉：官方博客说，已经聊到 100K token 时切到更便宜的 Haiku 问一个小问题，可能因重建缓存而更贵 [14]。所以主控不要为了省 token 在任务中途切模型；需要便宜模型时，派子代理。
- 缓存层级是 tools → system → messages；任何工具定义变化会让整个缓存失效 [1]。Claude Code 的 MCP tool search 默认把工具定义延迟，只保留工具名和服务说明，因此工具集在会话中更稳定 [8][14]。不要在任务中途增删 MCP server 或带 MCP 的插件；需要变更就在任务开始前做完。
- 改 CLAUDE.md 不会让当前缓存失效，但也不会立即生效；新内容在 `/clear`、`/compact` 或重启后加载 [2]。所以“边做边改 CLAUDE.md 让主控遵守”是无效的，应该任务前改好。
- 监控：`/usage` 的 `Prompt cache (main)` 行会给出命中率、miss 次数、最近 miss 原因、当前 TTL 和冷暖状态；status line 也能读 `prompt_cache` 字段 [2][3]。如果 cache creation 一直很高，说明前缀在变，先查工具定义、模型、effort、MCP 变更。

### 2.3 少读大文件

官方给的直接手段：

- 具体 prompt。比如“给 `src/auth/` 的 token refresh 加校验，先写失败测试再修”，比“修一下登录”少很多探索性读取 [3][10]。
- 把大范围搜索交给 Explore/Plan 或子代理；它们的上下文独立，主控只收摘要 [3][4]。Explore/Plan 还不加载 CLAUDE.md 和 git status，启动更轻 [4][5]。
- 用代码 intelligence 插件做“跳转定义/找引用”，替代 grep + 读多个候选文件；官方说一次 go-to-definition 可以替代 grep 加多次文件读取 [3]。
- 用 hook 在工具输出进入主控前过滤。官方示例是 PreToolUse hook 把测试命令改成只输出 FAIL/ERROR 行，把“几万 token 的日志”降到“几百 token” [3]。这是确定性过滤，不依赖模型自觉。
- MCP 输出默认上限 25,000 token，超过 10,000 token 会警告；超限结果会存文件并只给路径 [8]。不要让 MCP 把整页 HTML 或整份日志直接倒进主控。
- 读文件时用范围读取和 `rg` 定位，不要整文件读；Read 默认最多 2000 行，但大文件仍可能很贵。压缩后超过 5,000 token 的文件只会以路径引用形式回来 [5]，说明 Claude Code 自己也在避免把大文件反复注入。

### 2.4 核查与验收：下放执行，保留判断

现有 SKILL.md 要求“主控实际执行最小合同测试与必要检查，不只信代理报告” [SKILL.md]。这条质量原则应保留，但可以拆成两层：

1. **执行层下放**：让便宜 verifier 跑测试、类型检查、lint，处理日志，回报“状态行 + 失败用例 + 关键命令输出 + 涉及路径 + 未决问题”。完整日志写文件，主控只读 1–2K token 的摘要。测试日志经常几万 token，这一步节省明显 [3][4]。
2. **判断层保留**：主控读证据摘要，检查“是否跑了正确的命令、失败是否真的相关、有没有跳过用例”；有疑点再复跑或读日志文件。最终验收、高风险审查不整体外包。

官方多代理研究文章提醒：子代理在失败恢复上并不优雅，模糊委派会造成重复工作、遗漏或找不到关键信息 [12]。所以“把验收完全交出去”没有公开证据表明质量不变；这里标为未核实，不建议作为默认做法。更稳的做法是“委托执行 + 主控读证据 + 疑点复跑”，既省主控 token，又不把质量门禁交掉。

## 三、派发合同与回报格式

### 3.1 结构化、自包含合同

官方多代理文章给的任务简报四要素：目标（objective）、输出格式（output format）、工具与来源指引（tools and sources）、清晰的任务边界（clear task boundaries）[12]。SKILL.md 的 Prompt 模板已经覆盖得更全：工作目录、目标、背景、岗位合同、可读范围、可写范围、约束、交接/集成、验收标准、完成后回报 [SKILL.md]。这是现有规则里做得最好的部分，不建议为了“省 token”把它压短；模糊委派导致的返工通常比多写几百字更贵。

可以补的两点：

- **显式写“不要读什么”**：只给需要的绝对路径和目录，写明“不要全仓搜索/不要读 node_modules/不要改测试来让检查通过”。这比让子代理自己探索便宜。给执行型子代理的合同写明“不得修改测试或脚手架来让检查通过”，也是现有全局规则的要求。
- **验收标准写成可执行命令和预期结果**：例如“`pytest tests/auth -q` 通过；失败时贴出失败用例名和断言”。这能减少来回澄清，也方便 verifier 直接执行 [SKILL.md]。

结构化合同对 token 的影响，公开资料只有定性结论（减少重复工作/遗漏），没有“缩短多少 token”的对照实验；标为经验/官方结构建议，不写成实测数字。

### 3.2 统一回报格式：状态行在前有用，但不直接省 token

建议的回报格式：

```text
状态：完成 / 部分完成 / 受阻
改动：<绝对路径列表>
验证：<执行的命令> → <通过/失败；失败用例>
关键输出：<不超过 20 行>
未决：<阻塞、风险、需要主控决定的事>
详情：<报告文件绝对路径，主控按需读>
```

“状态行在前”对人和模型都更好扫读，但**它本身不减少主控 token**：按 Claude Code 的工具结果/完成通知机制，子代理的最终报告会追加到主会话，主模型会看到整段文本；排序不会让后面的字消失 [2][4]。真正减少主控读取量的是：

- 把总长度压到 1–2K token（官方 context engineering 说子代理通常探索数万 token，只返回 1,000–2,000 token 的摘要 [11]）。
- 详情写文件，回报只给路径和摘要；主控需要时再读文件。官方多代理文章说，结构化输出到文件能减少“把大输出复制进对话历史”的 token 开销，并提高保真度 [12]。
- 在合同里写死“超过 N 行就写文件”，不要靠子代理自觉。

所以“统一回报格式”主要价值是减少歧义和返工；想省 token 必须同时设长度预算和文件化交接。状态行在前的 token 效果没有公开实测，标为未核实/经验。

## 四、子代理侧：上下文裁剪与复用

### 4.1 子代理启动时到底加载什么

非 fork 子代理从独立上下文开始，不继承主会话历史、已调用技能、已读文件、output style、auto memory；它加载自己的系统提示、任务消息、CLAUDE.md 层级、git status、`skills` 字段预加载的完整技能内容、以及可用的兄弟代理名单 [4]。这意味着：

- 子代理不会“天然知道”主会话里说过的约束；关键规则要写进合同，不能只放在主会话口头约定里 [4]。
- 子代理的 CLAUDE.md 是独立加载的。如果合同已经自包含，且你确认不会漏项目规则，可以用 `omitClaudeMd: true` 跳过用户/项目/本地 CLAUDE.md；Explore/Plan 本来就跳过 [4][5]。这是一把双刃剑：省启动 token，但漏规则会导致返工。
- `skills:` 预加载是“完整内容注入”，不是只给描述；不需要的技能不要预加载 [4][7]。
- 子代理 `description` 会占用主会话上下文；合并超过 15,000 token 时 Claude Code 会警告。把详细说明放进子代理的系统提示，而不是 description [4]。这条对当前多代理环境很实际：代理越多、描述越长，主控每轮越贵。
- 简单检索/摘要可以用更便宜的模型（官方例子是 `model: haiku`）；高风险审查仍用能力匹配的模型 [3][4]。现有角色卡已经按风险和 priority 选型，不要为了省 token 把高风险审查降级。

社区样本给了一个量级：子代理冷启动约 30–37K token，其中只有约 950 token 是真正的任务内容，其余是静态上下文；如果前缀里混入日期、工作目录、git branch 等易变字段，还会破坏跨子代理的缓存共享 [16]。这解释了为什么“裁剪子代理启动上下文”和“稳定前缀”能省不少。

### 4.2 什么时候复用，什么时候新开

官方机制：

- `SendMessage` 可以继续一个已完成的子代理；它会保留完整对话历史（包括工具调用、结果、推理），并在后台恢复，可能复用原运行预热的缓存 [4]。
- 被 `maxTurns` 停掉的子代理可以恢复；Explore/Plan 是一次性的，不能恢复 [4]。
- fork 会继承父会话的系统提示、工具和完整对话，第一次请求可以读父缓存；非 fork 子代理第一次请求不读父缓存，因为前缀不同 [2][4]。

决策规则（基于机制的经济性推断，不是实测）：

| 情况 | 建议 | 理由 |
|---|---|---|
| 同一任务继续，原缓存还热（5m/1h 内），历史大部分仍相关 | 用 SendMessage 续 | 省掉重新简报和重新探索；首次请求可能读原缓存 [4][2] |
| 任务换了、旧假设已错、或 resume 的历史远大于新简报 + 需要读的文件 | 新开子代理 | 旧历史会作为输入重复计费，还可能带偏；新上下文更干净 [4][12] |
| 上下文接近上限，但任务还要继续 | 新开 + 交接文件 | 官方多代理文章在长任务里就是“接近上限时 spawn fresh subagents with clean contexts”，靠外部记忆保持连续性 [12] |
| 需要完整主会话上下文才能判断 | fork | 继承父上下文和缓存，但会把主控的噪声一起带进去，慎用 [2][4] |
| 独立并行研究 | 新开多个 | 互不依赖，并行；但要求短摘要，避免多个长报告灌回主控 [4] |

一个容易忽略的点：resume 不是“免费继续”。如果缓存已经冷了，恢复时要把完整历史重新处理一遍；一个很长的子代理历史可能比“新开 + 一份 1K 简报 + 读 3 个文件”更贵。判断标准不是“能不能续”，而是“续的历史里有多少仍然相关”。

## 五、失败与返工：上限与停手

官方多代理文章没有给出硬性重试次数；它给的是：

- 代理是有状态的，错误会累积（“Agents are stateful and errors compound”）；恢复应尽量从出错点继续，而不是全部重来 [12]。
- 用确定性的重试逻辑和 checkpoint 兜底；让代理知道工具在失败并自行适配，效果不错 [12]。
- 按复杂度配资源：简单事实查找 1 个代理、3–10 次工具调用；直接比较 2–4 个子代理、每个 10–15 次；复杂研究 >10 个子代理 [12]。这不是硬上限，是“别对简单任务过度投资”。
- 常见停手失败：已经有足够结果还继续、无限搜索不存在的来源 [12]。

Claude Code 侧有确定性的预算/轮次控制：headless/`-p` 可用 `--max-turns` 和 `--max-budget-usd`；Stop hook 有 block limit；长任务可以用 `/goal` 让独立模型检查条件 [10]。这些比“让模型自己数次数”可靠。

现有 SKILL.md 已有“重派一次仍失败，按可用代理规则处理”“不无限盲改”“任务过大拆小，仍卡住再报告用户” [SKILL.md]，方向是对的，但缺显式预算。建议在合同里加：

- 每个派发最多 2 次尝试（首次 + 1 次补合同重派）；仍不达标，最多升级 1 次模型/代理；再失败就交回主控，附“已尝试什么、证据、卡点、建议的下一步”。
- 同一条 prompt 原样重试通常浪费；重试必须带新信息（更窄的范围、失败日志、补充约束、换验收命令）。
- 给 headless/批处理加 `--max-turns`/`--max-budget-usd`；给长任务设 token/时间预算，超限就停。
- 停手不是失败：主控拿到“受阻 + 证据 + 建议”比拿到一个假装完成的报告更有用。

社区里有一个可参考的单任务样本：四代理流水线（Kimi → Claude → Codex → DeepSeek）用 `handoff.yaml` 交接，评审循环最多 3 次，报告约 980K token、比单代理少约 22%、42 分钟、$7.20 [18]。这是单任务、未复现的经验，作者也自述部分数值为估算、页面标注含 AI 生成内容，不能当成普遍规律；但“有界评审循环 + 文件交接”这两个做法与官方建议一致。

## 六、Claude Code 特有设置与功能

### 6.1 Output style

内置 `Concise` 风格让回复第一句先说结果，去掉开场白、逐步叙述和收尾总结；简单问题 1–3 句；但错误报告、失败测试输出、安全警告、破坏性操作确认仍保留完整内容 [9]。Opus 5.5 的输出 token 是 $20/MTok，等于 100 个缓存读 token 的价格 [13]；主控每次少写几百 token，长期很可观。Default 风格不加额外指令；切换风格不会让缓存失效，新指令作为消息追加 [2][9]。注意：`Concise` 只约束表达，不减少必要的证据；如果为了短而省略失败日志，反而会增加返工。

### 6.2 MCP 工具定义

Claude Code 默认开启 tool search：会话开始时只加载 MCP 工具名和服务说明，完整 JSON schema 在 Claude 需要某个工具时才加载 [8][3]。服务说明和“提前加载的工具描述”上限 4,096 字符；通过 tool search 加载的工具描述上限 16,384 字符 [8]。因此：

- 不用的 MCP server 在 `/mcp` 里关掉；连接中的 server 即使不用也会贡献工具名和说明 [3][10]。
- 能用 CLI（`gh`、`aws`、`gcloud`、`sentry-cli`）就别用 MCP；CLI 不增加每工具列表，官方明确说更省上下文 [3]。
- `ENABLE_TOOL_SEARCH=auto` 会在工具定义总大小低于上下文 10% 时提前加载，超过 10% 才延迟；默认的“全部延迟”通常更省 [8]。
- 工具定义变化会让整个缓存失效；tool search 的 stub 保持稳定，正是为了避免这个问题 [1][14]。所以不要在任务中途增删 MCP。

### 6.3 Skills

技能是两段式加载：默认所有技能的名字和描述在每次请求里；完整正文只在被调用时加载，并留在后续上下文里 [7][20]。关键数字和规则：

- 技能列表里 `description` + `when_to_use` 合计截断在 1,536 字符 [7]。
- 每个列出的技能都在每轮占上下文，不管用不用；`disable-model-invocation: true` 可以让它完全不进上下文，只保留手动 `/name` 调用 [7]。
- 已调用技能的正文会一直留在上下文；压缩后每个技能保留前 5,000 token，总预算 25,000 token，旧的先丢 [5][7]。
- `SKILL.md` 建议 <500 行，详细资料放 `reference.md` 等按需读的文件 [7]。放开头的是压缩时保留的部分，重要指令写前面 [5]。
- 子代理预加载技能是完整内容注入，不是按需；不需要就别放 `skills:` [4][7]。

对当前环境的直接含义：技能列表越长，主控每轮越贵；把“只在特定流程用”的技能设为手动调用，或精简描述，是低成本优化。可以用 `/skill-doctor` 看每个技能的上下文成本 [7]。

### 6.4 CLAUDE.md

CLAUDE.md 在会话开始时全文加载，并且每个请求都在 [5][10][20]。官方建议控制在 200 行以内；详细流程/参考资料放技能，路径相关规则放 `.claude/rules/`（带 `paths:` 的规则只在匹配文件时加载）[3][10]。费用文档里甚至有一个示例建议行：“Trim ~/code/api/CLAUDE.md · 49k tokens per request” [3]——49K token 的 CLAUDE.md 每轮都是 49K 输入（缓存读约 $0.01/轮），20 轮约 $0.20，而且会挤占注意力和上下文空间。改 CLAUDE.md 不会立即影响当前会话；要 `/clear`、`/compact` 或重启才加载 [2]，所以任务前改。

### 6.5 Auto-compact 阈值

Opus 5.5 是原生 1M 上下文模型，默认在约 967K token 压缩 [6]。`/autocompact 200k`、`/autocompact 300k` 可以把窗口调低；`/autocompact auto` 回到模型默认；也支持 `autoCompactWindow` 设置和 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 环境变量 [6]。调低窗口的收益是每轮少读很多 token，代价是更早压缩、可能丢细节。建议按任务类型选：日常修 bug/小功能 200K–300K 足够（经验判断，按任务实际跨度调整）；需要跨大量文件的长任务再放宽。不要为了“省一次压缩”把窗口设到 1M；967K 上下文的每轮缓存读约 $0.19，30 轮约 $5.80，远高于压缩成本。

### 6.6 其他

- 子代理 description 超过 15K token 会警告；描述越短，主控每轮越省 [4]。
- Agent teams 约为标准会话的 7× token；每个 teammate 都有自己的上下文，任务完成就关掉 [3]。Workflow 的 fan-out 同理，不是免费并行。
- Hook 默认零上下文成本，只有返回输出才进入上下文；用 hook 过滤日志/测试输出是官方推荐的低成本手段 [3][5]。
- 后台 token 消耗：session recap、idle compaction、prompt suggestions、`/loop`、跨会话消息、goal check-in 都可能在空闲时发请求 [3]。不用就关，离开就结束会话。
- 状态栏可以显示 context window 使用量和 `prompt_cache` 字段；把“上下文百分比”和“缓存命中率”放在眼前，比事后看账单便宜 [2][3]。

## 七、与现有 SKILL.md 的对照

**已经做得好的：**

- Prompt 模板自包含，覆盖目标、背景、绝对路径、可读/可写范围、约束、交接、验收、回报；这正是官方建议的“完整简报”，不需要为了省 token 压短 [SKILL.md][12]。
- “审查 prompt 写明直接审，不要调用 `/code-review` 等 skill”——避免额外加载审查技能，省上下文 [SKILL.md]。
- “同一功能集成后做一次独立审查，不逐文件/逐结果重复审”——减少重复审查 token [SKILL.md]。
- “重派一次仍失败按可用代理规则处理”“不无限盲改”“任务过大拆小”——已有初步重试上限 [SKILL.md]。
- “主控实际执行最小合同测试与必要检查，不只信代理报告”——质量门禁正确；建议改为“委托执行、主控读证据、疑点复跑”，保留门禁但省主控日志 token [SKILL.md]。
- 并发写入分工、接替前等旧代理结束、接手必须读最新文件——避免重复劳动和覆盖返工，间接省 token [SKILL.md]。

**没有或只有部分的：**

- 缓存 TTL、前缀稳定性、模型/effort/MCP 中途切换的代价：没有。
- `/clear` vs `/compact`、任务边界、交接笔记：没有。
- 上下文预算、auto-compact 窗口、`/context` 审计：没有（模板只要求指定读取路径，不是预算）。
- 子代理启动裁剪（`omitClaudeMd`、预加载技能、description 长度）：没有。
- 子代理复用 vs 新开的经济性：没有（现有“接替/重派”规则关注写入安全，不关注 token）。
- 角色卡按能力和风险选型，没有把 token 单价作为显式维度；可以补充“同能力候选里优先便宜模型”，但不建议为省 token 降高风险审查。
- 回报长度预算、详情文件化、状态行格式：部分有（模板要求回报路径/命令/未决问题，但没有字数和文件化要求）。
- `--max-turns`/`--max-budget-usd` 等确定性预算：没有。
- Output style、CLAUDE.md 体积、技能描述、MCP 延迟加载：没有。

**建议加到 SKILL.md 的最小改动（本次未改文件）：**

1. 在 Prompt 模板的“完成后回报”里加一行：“正文不超过 1–2K token；超过 20 行的输出写文件，只回路径 + 摘要；第一行写状态。”
2. 在“审查与返工”里把“主控实际执行最小合同测试”细化为“主控可委托 verifier 执行，但必须读证据摘要并在疑点复跑；最终验收不外包”。
3. 加一条“派发前检查”：主会话缓存 TTL、模型/effort/MCP 是否会在任务中变化；任务边界是否该 `/clear`。
4. 加一条“子代理启动裁剪”：能自包含就 `omitClaudeMd`；不预加载不需要的技能；description 保持短。
5. 加一条“失败预算”：每次派发最多 2 次尝试、1 次升级；headless 加 `--max-turns`/`--max-budget-usd`。

## 八、未核实项

1. **“状态行在前能减少主控读取量”**：没有公开实测。按 Claude Code 的工具结果/完成通知机制，子代理完整报告会进入主会话上下文，排序本身不减少 token；只有总长度、文件化交接或 harness 截断才减少 [2][4]。标为经验/机制推断。
2. **Opus 5.5 的单独 auto-compact 默认值**：官方文档按“原生 1M 模型”给约 967K，没有在已读页面单独列出 Opus 5.5 一行；按类别推断适用 [6]。
3. **社区缓存数字**：12.2M→3.0M 缓存写（约 -75%）、子代理缓存导致约 8% 超额、1h TTL 的 6%/7.6%/8.6% 情景，均来自单账号/本地日志建模，方法未审计、未复现 [15][16][17]。方向可参考，不要当账单承诺。
4. **“1 小时 TTL 总是更省”**：不成立。连续工作、5 分钟内总有请求时，1h 写更贵；只在有 >5 分钟空档时划算 [1][15]。
5. **“把最终验收完全交给子代理不降质量”**：没有证据。官方多代理文章明确说子代理失败恢复不优雅、模糊委派会造成遗漏 [12]。不建议默认这样做。
6. **结构化合同/统一回报的 token 节省百分比**：没有公开对照实验；只有官方定性建议和单任务社区经验 [12][18]。
7. **“复用子代理总是更便宜”**：不成立。取决于缓存是否还热、历史里有多少仍相关；冷缓存下 resume 可能比新开更贵 [2][4]。决策规则是推断。
8. **Concise output style 的具体节省**：官方只说会减少输出 token，没有给百分比 [9]；按 Opus 5.5 输出价可自行估算。
9. **MCP tool search 的具体节省**：官方只说只加载工具名和服务说明、完整 schema 按需 [8]；没有公开的 token 数字。
10. **你当前主会话实际是 5 分钟还是 1 小时 TTL**：取决于计费方式，必须以 `/usage` 的 `Prompt cache (main)` 行为准 [2]；本文不假设。

## 来源

访问日期均为 2026-11-08。

1. Anthropic, Prompt caching（API 文档）：https://platform.claude.com/docs/en/build-with-claude/prompt-caching
2. Claude Code, How Claude Code uses prompt caching：https://code.claude.com/docs/en/prompt-caching
3. Claude Code, Manage costs effectively：https://code.claude.com/docs/en/costs
4. Claude Code, Subagents：https://code.claude.com/docs/en/sub-agents
5. Claude Code, Explore the context window：https://code.claude.com/docs/en/context-window
6. Claude Code, Model configuration（auto-compact、effort、1M context）：https://code.claude.com/docs/en/model-config
7. Claude Code, Skills：https://code.claude.com/docs/en/skills
8. Claude Code, MCP（tool search、输出限制）：https://code.claude.com/docs/en/mcp
9. Claude Code, Output styles：https://code.claude.com/docs/en/output-styles
10. Claude Code, Best practices：https://code.claude.com/docs/en/best-practices
11. Anthropic Engineering, Effective context engineering for AI agents：https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
12. Anthropic Engineering, How we built our multi-agent research system：https://www.anthropic.com/engineering/multi-agent-research-system
13. Anthropic blog, What a task costs on Opus 5.5（2026-09-25）：https://claude.dev/blog/what-a-task-costs-on-opus-5-5/
14. Anthropic blog, Lessons from building Claude Code: prompt caching is everything（2026-04-30）：https://claude.dev/blog/lessons-from-building-claude-code-prompt-caching-is-everything/
15. Max Nardit, Claude Code background subagents and your usage limit（2026-11-05，独立分析）：https://max.nardit.com/articles/claude-code-background-subagents-usage-limit
16. AI Primer, Claude Code subagent prompt caching cost analysis（2026-07-04，独立分析）：https://www.ai-primer.com/engineer/stories/claude-code-cache-context-costs
17. SJarmak digest, Reddit r/ClaudeCode 子代理 1h TTL 讨论摘要（2026-09-20，社区）：https://sjarmak.ai/digest/daily-2026-09-20
18. 搜狐，多 Agent 协作实战：从一个人硬扛到四条 AI 员工（社区单任务经验）：https://roll.sohu.com/a/1080211336_122893087
19. Claude Code, How Claude Code works：https://code.claude.com/docs/en/how-claude-code-works
20. Claude Code, Extend Claude Code（features overview / context costs）：https://code.claude.com/docs/en/features-overview

补充说明：`claude.dev` 是 `claude.com/blog` 的重定向域名；本文把它视为 Anthropic 官方博客。独立分析和社区来源在正文中已单独标注，不与官方文档混用。
