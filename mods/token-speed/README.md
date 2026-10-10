# token-speed 0.4.1

适用于 Claude Code 2.1.294 的 function-hooks mod。在提示框上方，主控与每个活跃子代理各用一行显示模型、effort、上下文与输出速率，工作区放在最后一行。只观察原有请求，不调用额外模型、不引入 tokenizer 或网络请求；分支通过引擎 process API 调用本机 git。

```text
⚡ main · gpt-6.1-sol · high · Ctx ██████▊    67%/272k · Live ~42.1 · Last 31.2 · Avg 28.6 tok/s · streaming
🌳 abcdefg1 · glm-5.3-flash · max · Ctx █▍         14%/1.0M · Live ~35.2 · Last 29.1 · Avg 30.4 tok/s · streaming
⌂ Claude-workflow on main
```

主控始终第一，子代理按首次观察顺序每个一行，切换 view 不过滤。短 id 自动延长到可区分同会话代理；工具间隙保留行，Live 为 `—`，明确终态后隐藏，历史通过 `/tok-speed` 查询。带 survey 或 `maxRows=0` 时隐藏，其它插件和引擎的内容原样保留。只有主控时为代理行加工作区行，共两行；行数预算不足先丢工作区。

各列按终端显示宽度对齐，包括双宽的 `⚡`、CJK 与常见 emoji。宽屏速率数字右对齐，单位 `tok/s` 每行只显示一次；宽度不足时先省略 status、Last、进度条，再缩短模型。如果原布局会把模型压到不足 4 格（原名称不足 4 格时保留原宽），或最小布局仍超宽，就切换为每代理一行的紧凑格式：

```text
⚡ main gpt-6.1-sol high C42%/272k L—
⚡ main C42%/272k L~42.1
🌳 abc12345 中文🙂长模型 max C—/? L~0.0
```

紧凑格式只保留一个实时速率 `L`（Live），手机端不再显示 Avg；Avg 仍在宽屏布局与 `/tok-speed` 中查看。主控标签为 `⚡ main`，与宽屏一致。`C` 为上下文、`L` 为 Live，Live 的估算标记 `~` 保留。紧凑行不画条形，不显示 Last/status，不给数字加对齐空格；按各行实际 cell 宽度先缩短模型至至少 4 格，再依次省略模型、effort、上下文窗口容量，保留百分比或未知标记，绝不把未知写成 0%。32 列及以上子代理保留原短 id；24–31 列必要时改用可见代理内可区分的最短前缀，主控可缩为 `m`。常规手机宽度优先完整保留上下文读数与 Live 数字及单位；异常长数值或不足 24 列时可再省略 Live，最终截断仅作保护。紧凑模式子代理行以 `🌳` 作前缀（worktree/子代理标识，宽屏与紧凑一致）；工作区行以 `⌂` 开头，紧凑模式只显示分支（无分支时显示仓库名），宽屏为 `⌂ 仓库名 on 分支`。每次渲染重新计算预算，终端变宽后自动恢复完整布局。

宽度采用宿主提供的 `bodyColumns`，可能小于终端总列数。`[-]` 折叠标记、滚动和 `n more` 提示由 Claude Code 的 AbovePrompt 宿主管理；插件不改变其行数预算，有空余行才在代理之后显示工作区。

进度条是固定 10 个终端 cell 的短矩形，轨道使用 theme `rate_limit_empty`，整格填充 `█`，尾部使用 `▏▎▍▌▋▊▉` 表示 1/8 cell。共 80 个视觉档位（10 格 × 8 档），因此 0–100 的整数百分点不是每个都有不同的条形：相邻百分点可落在同一档（例如 67% 与 68% 的条形相同，但数字 `67%`、`68%` 不同）。宽屏也不扩展为长条。窄屏可省略条形，数值始终保持整数 1% 精度。填充固定使用 theme `rate_limit_fill`，不随占用变化，没有横向渐变；Ctx 数值用 `text`，未知占用用 `inactive`。未知占用只画轨道空条，并以 `—%` 或 `?` 明确标为未知，不能解释为 0%。

主控上下文来自 `$.session.usage()`，与状态栏同口径，最近响应的 uncached + cache-read + cache-written 输入 tokens 除以窗口；首次响应或成功压缩后无读数显示 `—%/窗口`。已知读数不会被打回未知：缺少有效 tokens 的部分读数（窗口相同）与主控模型切换都会沿用上一次已知读数，只有成功压缩（主控）或整会话重置才清空，因此进度条不会在两次轮询之间闪回 `—%`。子代理输入量来自自己最近一次响应的 CLI usage，不累计多次请求。子代理分母由启动时读取一次的 `data/model-contexts.json` 提供，无联网刷新。优先顺序为实际运行窗口、明确 CLI override、官方默认、未知；官网仅提供容量时明确标为官方 capacity。输入始终取自己最近一次 CLI response，主控仍以 `$.session.usage()` 为准。数据中的官方来源、核验日期和 registry 版本可通过 `/tok-speed` 查看。读取或严格解析失败时，官方表为空，保留已确认的 Sol 272000、GLM-5.3/Flash 1000000 后备，不中断请求。

官方记录覆盖当前前沿型号，共 24 条（核验日期 2026-10-09）。Anthropic：`claude-haiku-5-5`、`claude-sonnet-5-5`、`claude-opus-5-5`、`claude-fable-5-1`、`claude-fable-5`、`claude-mythos-5-1`、`claude-mythos-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8`、`claude-opus-4-7`、`claude-opus-4-6`、`claude-sonnet-4-6` 为共享输入输出上下文 1M，`claude-haiku-4-5`、`claude-sonnet-4-5` 为 200k。OpenAI：`gpt-6.1-sol`、`gpt-6-astra`、`gpt-6-sol`、`gpt-6-luna` 为 Codex 官方默认 272000 / max 872000，其中前两者另带 API 总上下文 1050000 与 max input 922000 元数据。`glm-5.3`、`glm-5.3-flash`、`deepseek-v4.1-flash`（aliases `deepseek-flash`、`deepseek-v4-flash`）、`deepseek-v4-pro`、`gemini-3.8-flash` 官网只给出容量且未声明默认/最大，按官方 capacity 记录；Gemini 的 1,048,576 是输入上限，输出上限 65,536 单独存在，不是共享窗口。用户 override 独立存放，不混作官方事实。匹配只用去渠道的 canonical 尾名及精确 aliases，不匹配子串，不把未知邻近型号映射到已知型号；不使用动态 `haiku`/`opus`/`sonnet` 别名，不因 `[1m]` 选择官方最大值。来源分别记录为 `cli-input-window-config`、`cli-input-official-default`、`cli-input-official-capacity`。

新增 provider/model 时，只添加具有官方 URL、核验日期和精确型号的记录；未核实的型号保持 unknown，或单独添加有理由的 local override。模型最大上下文不保证路由实际 cap，registry 不把最大值当默认。不复制主控百分比，数值超过窗口可显示超过 100%，只限制条形填充。成功安装的压缩清对应行输入读数，保留已知窗口；precompute 和 skip 不清。

Effort 来源保存在状态并可由命令查看：`request` 为 `turn.step.effort`，`applied` 为 classic PostToolUse/Stop 的 `effort.level`，`configured` 为主控当前模型的 `modelSettings[model].effortLevel`、全局 `effortLevel` 或明确模型后缀。reload 后主控立即读取配置后备，无数据为 `—`；不硬编码 high，不扫描 agent 定义。配置档位不保证外部 provider 已应用。只选取 settings 的这些 effort 字段，不保存或打印其它 settings。

工作区为仓库根目录名（非 git 使用会话根目录名），附当前分支；detached HEAD 不显示分支，约每 5 秒刷新。显示使用 theme tokens：主控标签为 `claude`、子代理标签与行次要信息为 `inactive`；模型名为 `text`（普通文本，不着色）；有效 Live/Avg/Last 数字为 `text`，缺值为 `inactive`，速率不以 `success` 表示；effort 按档位着色（数值为 `subtle`）；状态 idle/waiting/streaming 为 `inactive`，aborted 为 `warning`，error 为 `error`，usage unavailable 为 `warning`。工作区行为 `inactive`。颜色跟随 CLI 主题。

## 安装

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

也可用固定 tag `token-speed-v0.4.1` 获取源文件，并从 checkout 加载：

```sh
git clone --branch token-speed-v0.4.1 https://github.com/liuyejinghong/Claude-workflow.git
claude --plugin-dir ./Claude-workflow/mods/token-speed
```

安装后的插件由 Claude Code 加载。开发时修改自己的 checkout；请勿直接修改 plugins/cache 副本。

## 命令

- `/tok-speed`：列出各代理的短 id 角色、任务描述、当前模型、实时估算和各模型历史累计，以及统计口径。
- `/tok-speed reset`：清空本会话统计。任意代理请求仍 active 时拒绝；工具间隙可 reset，保留活跃代理元数据和行。
- `/clear`：清空统计、代理行与实时请求；晚返回的旧流或 spawn 元数据不复活统计，新 turn.step 重启计时器。

状态包括 `waiting`、`streaming`、`idle`、`aborted`、`error`、`usage unavailable`。新采纳的代理没有可观察 stream 时 Live 为 `—`，模型为 `unknown`，直到 step 或有明确 resolved model 的 spawn。流内停顿仍为 streaming，Live 随窗口衰减。

## 模型名称与独立统计

每个代理独立按 **请求 `turn.step.model`** 累计；两个相同模型代理不共享统计桶。`usage.model` 仅是响应事实，不改变标签或桶。真实请求模型切换建立新桶。

统计桶与命令保留已有完整渠道模型名，UI 仅隐藏最后 `/` 之前的渠道前缀；其它合法冒号部分不会删除。

0.1 的 host state 会迁移到主控行，其 response-model 均值保留为 `[legacy v0.1 response model]` 桶，在 `/tok-speed` 可查。由于旧桶缺乏请求渠道证据，它们不会随意合并或混入 0.2 的请求模型均值；UI Avg 只取新请求桶。

## 统计含义

**Live 是估算值，始终带 `~`。** 收集最近 3 秒实际观察到的 text、thinking 和工具调用 JSON 参数字符；tool、engine、stop chunk 不增加计数。按 Unicode code point 计数：CJK Unified Ideographs（U+3400–4DBF、U+4E00–9FFF）、兼容汉字（U+F900–FAFF）及补充汉字（U+20000–323AF）每 code point 估为 1 token，其余为 0.25。不是 tokenizer 精确计数。

分母为 `min(3000ms, 当前时间 - 请求开始时间)`。不足 250ms 为 `—`；请求开始至首个 chunk 的等待也计时。仅计近 3 秒字符，停流超过 3 秒变为 `~0.0 tok/s`。每 250ms 共用一次 host clock 时间和一次原子 snapshot update，批量发布所有活跃 loop；每个字符 chunk 调用一次 clock.now，不按 chunk 写 host state。

**Last / Avg 是 CLI usage 的 API 全程输出速率。** 每个 turn.step 从 hook 开始计时至最终结果返回，包含 TTFT、thinking、网络、请求内停顿和内置 API 工具耗时；排除两次请求之间的工具或用户空闲，非纯解码速度。

- Last：当前请求模型最近请求的 `output_tokens / 秒数`。失败、中断、无有效 usage 或耗时不大于 0 为 `—`。
- Avg：该代理、该请求模型**最近 24 小时滚动窗口**内的 `有效 output_tokens 总和 / 有效请求耗时总和`，不取速度算术平均，按请求完成时间戳（clock epoch ms）判窗，出窗样本即弃——窗口是相对时间，与本地时区（含 UTC+8）无关。例如窗口内 `100/2s + 300/3s = 80 tok/s`。迁移自 v0.2 的无时间戳桶在首个新请求前退回全程累计口径。
- usage null、count 缺失/NaN/Infinity/负数、耗时不大于 0 均不入平均；有限非负 0 是有效样本。turn.complete 的汇总 usage 不重复累计。

CPA 上游缺失 token count 可能被 CLI 规范化为 0。mod 无法区分实际 0 和上游遗漏后的 0；API 统计表示 CLI usage 口径，整段 usage null 和仍可观察的无效 count 不计入。

## 生命周期与边界

统计在本 session 的 version 2 host PluginState，每 loop 单独 row，顺序稳定；本地 Map 只保存流累加器。reload 保留统计，丢弃无法接管的 stale active，以 `$.agent.list()` 重建在跑子代理元数据。该 API 不含模型；未观察到请求的代理显示 unknown/Live —。每 1 秒轻量 reconcile 与上下文用量轮询、每 5 秒工作区刷新在无流时也运行，值未变化不写状态；渲染不查询或写这些来源，只读 host state。每请求的完成样本保留 24 小时滚动日志支撑 Avg。失败 list 保留行；生命周期 revision guard 防止旧 list 返回覆盖刚开始/完成的新 turn。只采纳 running；waiting 和工具间隙不判完成；仅 completed/failed/killed 明确终态收尾，不根据 absence 结束新 spawn。

`agent.list()` 只涉及本 session 的子代理/teammate，不扫描其它 CLI 或远程 session。API 不列 workflow agent，也无法观察远程 workflow loop；有本地 turn.step 时可单独统计。无可观察 stream 的行永远不推算速度。重复 session.start 不重复创建 timer；session.end 取消 timer 清空统计，不跨会话持久化。

流 hook 只调用一次 next(e)，原样 yield 所有 chunk/ref，原样返回 HookStream.result；不更改请求、顺序或工具 JSON。仪表自身异常被捕获，真实下游错误继续抛出，不重复请求。每个 loop 仅清理自己的 active/live。

## 开发检查

```sh
claude plugin validate <mod-dir> --strict
tsc -p <mod-dir>
claude plugin test <mod-dir>
```

本目录 tsconfig 开启 strict/noUncheckedIndexedAccess，包含 hooks、tests、自有 types 和生成的 `.claude-plugin/types`。测试使用实际 `claude-code/testing` 和 mock.clock 合成 stream，不联网或调用模型。

测试保留流透传、单次 next、测量/Unicode/加权平均、失败清理、reset/clear/reload、并发独立桶与生命周期竞态合同，并核验统一代理行、配置 effort 后备、主控/子代理上下文隔离、成功压缩、10 格块状条 80 档视觉映射（0–100 为 81 种可见状态，67/68 同形但数字不同）、配置子代理窗口、24/32/40/49/54/60/80/120/240 列预算、同 mount 缩窄后恢复、窄屏标识区分与未知语义、显示宽对齐、UI 隐藏渠道和命令完整渠道。kit 只验证引擎 tree 与合同，不代替终端字体的实际截图验收。
