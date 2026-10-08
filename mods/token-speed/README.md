# token-speed 0.3.0

适用于 Claude Code 2.1.294 的自用 function-hooks mod。在终端和 desktop 的提示框上方显示主控和每个活跃子代理的输出速率，附会话行（模型、effort、上下文进度）与工作区行（git 分支）。仅观察原有请求，不调用额外模型，不引入 tokenizer 或网络请求；工作区分支通过引擎 process API 调用本机 git（只读分支查询）。

```text
codex/gpt-6.1-sol · max · █████░░░░░ 45%/272k
⌂ Claude-workflow on main
⚡ main · codex/gpt-6.1-sol · Live ~42.1 tok/s · Last 31.2 tok/s · Avg 28.6 tok/s · streaming
↳ abcdefg1 · glm-5.3-flash · Live ~35.2 tok/s · Last 29.1 tok/s · Avg 30.4 tok/s · streaming
↳ abcdefg2 · codex/gpt-6.1-sol · Live — · Last 40.2 tok/s · Avg 38.8 tok/s · idle
```

主控始终第一，子代理按首次观察顺序每个一行；切换到子代理 view 仍显示全部。短 id 会延长到可区分同会话中的代理，所以相同模型的两个代理也可辨识。子代理在请求间工具执行期间保留行，Live 为 `—`，不虚构 token；turn.complete 或 roster 的明确终态后立即隐藏，历史仍可通过命令查看。无任意四行上限，滚动由引擎的 AbovePrompt 行数布局负责。

会话行显示主控模型（与主控行同源）、推理档位与上下文进度。effort 取 turn.step 事件的 `effort` 字段原样，配色 low `success`、medium `planMode`、high `warning`、xhigh/max `error`、数值 `subtle`；上下文进度用 `$.session.usage()`（与状态栏同源）：10 格进度条按占用分段变色（前 4 格 `success`、中 3 格 `warning`、后 3 格 `error`，空格 `inactive`），后接 `百分比/窗口`（272000 → `272k`，1000000 → `1.0M`）；首次响应前无 tokens/percent，显示空条与 `—/窗口`。工作区行显示项目名（git 仓库根目录名，否则会话根目录名）与当前分支（`git branch --show-current`，detached HEAD 只显示项目名），约 5 秒刷新。

多行时标签、模型、Live、Last、Avg 各列按可见行最大宽度对齐（数值右对齐）；单行不填充。行数预算（AbovePrompt maxRows）不足时优先保留速度行，其次会话行，最后工作区行。每行 Text 使用 `truncate-end`；可用宽度不足 110 列时省略 Last，不足 90 列省略进度条本体（保留百分比），保留角色、渠道/模型、Live、Avg。带 survey 或 `maxRows=0` 时隐藏，并保留其它插件和引擎的 AbovePrompt 内容。

显示使用嵌套 Text 和 theme-aware palette，颜色跟随 CLI 主题：身份与模型为 `planMode`（默认呈青色风格，主控身份加粗）；有效 Live 为加粗 `success`，Avg 为 `success`，Last 与缺值为 `inactive`，标签和分隔符为 `subtle`。状态 waiting、aborted、usage unavailable 为 `warning`，error 为 `error`，streaming 为 `planMode`，idle 为 `inactive`；主题可改变这些颜色的具体呈现。

## 命令

- `/tok-speed`：列出各代理的短 id 角色、任务描述、当前模型、实时估算和各模型历史累计，以及统计口径。
- `/tok-speed reset`：清空本会话统计。任意代理请求仍 active 时拒绝；工具间隙可 reset，保留活跃代理元数据和行。
- `/clear`：清空统计、代理行与实时请求；晚返回的旧流或 spawn 元数据不复活统计，新 turn.step 重启计时器。

状态包括 `waiting`、`streaming`、`idle`、`aborted`、`error`、`usage unavailable`。新采纳的代理没有可观察 stream 时 Live 为 `—`，模型为 `unknown`，直到 step 或有明确 resolved model 的 spawn。流内停顿仍为 streaming，Live 随窗口衰减。

## 模型名称与独立统计

每个代理独立按 **请求 `turn.step.model`** 累计；两个相同模型代理不共享统计桶。`usage.model` 仅是响应事实，不改变标签或桶。真实请求模型切换建立新桶。

名称 trim 后反复去除末尾 `[1m]`、`(low|medium|high|xhigh|max)` 和 `:low|medium|high|xhigh|max` 配置后缀。例如 `codex/gpt-6.1-sol:high` 和 `codex/gpt-6.1-sol(high)[1m]` 均显示 `codex/gpt-6.1-sol`。只保留已有渠道前缀，不推断渠道；`glm-5.3-flash[1m]` 显示 `glm-5.3-flash`。同一代理后续请求若是 bare 名且与该代理已知渠道模型尾名一致，沿用已有前缀；不同 bare 模型保留其 bare 形态。其它合法冒号部分不会删除。

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

测试保留 text/thinking/tool/input/stop chunk 与 ChunkRef、单次 next、最终结果、完成前 Live、窗口/Unicode、加权平均、CPA usage、失败/关闭流、UI 透传与隐藏、reset/clear、reload 与仪表故障合同；新增 main+3 child 并发、同模型独立桶、各 view 主控 first、canonical suffix/prefix、spawn 晚元数据、list 采纳/拒绝/终态/竞态、无四行上限，以及会话行/工作区行/进度条配色、effort 记录、多行对齐与 Avg 24h 滚动窗口。kit 不允许凭空生成合法 opaque engine.ref，因此其透传由源码检查保证；底层 hook 错误会被 kit 包装成引擎错误，测试验证这个真实下游错误的透传和清理。

本地持久源目录为 `/Users/ethan/.claude/local-mods/mods/token-speed`。当前会话执行 `/reload-plugins` 读取更新；后续维护修改持久源，避免直接改 plugins/cache 副本。
