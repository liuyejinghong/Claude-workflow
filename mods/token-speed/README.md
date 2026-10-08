# token-speed 0.2.1

已在 Claude Code CLI 2.1.294 验证的 function-hooks mod。在终端和 desktop 的提示框上方显示主控和每个活跃子代理的输出速率。仅观察原有请求，不调用额外模型，不引入 tokenizer、网络或进程调用。

function-hooks 是早期接口，其它 CLI 版本尚未验证；升级 CLI 后应重新执行开发检查。本 mod 不需要 CPA、ChatGPT 或 GLM 订阅。

```text
⚡ main · codex/gpt-6.1-sol · Live ~42.1 tok/s · Last(API) 31.2 tok/s · Avg(API) 28.6 tok/s · streaming
↳ abcdefg1 · glm-5.3-flash · Live ~35.2 tok/s · Last(API) 29.1 tok/s · Avg(API) 30.4 tok/s · streaming
↳ abcdefg2 · codex/gpt-6.1-sol · Live — · Last(API) 40.2 tok/s · Avg(API) 38.8 tok/s · idle
```

主控始终第一，子代理按首次观察顺序每个一行；切换到子代理 view 仍显示全部。短 id 会延长到可区分同会话中的代理，所以相同模型的两个代理也可辨识。子代理在请求间工具执行期间保留行，Live 为 `—`，不虚构 token；turn.complete 或 roster 的明确终态后立即隐藏，历史仍可通过命令查看。无任意四行上限，滚动由引擎的 AbovePrompt 行数布局负责。

每行 Text 使用 `truncate-end`。可用宽度不足 110 列时省略 Last(API)，保留角色、渠道/模型、Live、Avg(API)。带 survey 或 `maxRows=0` 时隐藏，并保留其它插件和引擎的 AbovePrompt 内容。

显示使用嵌套 Text 和 theme-aware palette，颜色跟随 CLI 主题：身份与模型为 `planMode`（默认呈青色风格，主控身份加粗）；有效 Live 为加粗 `success`，Avg 为 `success`，Last 与缺值为 `inactive`，标签和分隔符为 `subtle`。状态 waiting、aborted、usage unavailable 为 `warning`，error 为 `error`，streaming 为 `planMode`，idle 为 `inactive`；主题可改变这些颜色的具体呈现。

## 安装

Marketplace 默认从仓库 `main` 安装；下述 marketplace 方式需等待本次发布 PR 合并到 `main` 后使用。推荐在 Claude Code 中执行：

```text
/plugin install token-speed --marketplace liuyejinghong/Claude-workflow
```

也可先添加 marketplace，再安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

发布内容仍在 feature 分支期间，可在终端按发布版本 ref 克隆，并直接加载插件目录：

```sh
git clone --branch token-speed-v0.2.1 https://github.com/liuyejinghong/Claude-workflow.git
claude --plugin-dir ./Claude-workflow/mods/token-speed
```

本机已有 `token-speed@ethan-local-mods` 安装；如从该本地版迁移，先卸载旧版，再安装或加载本仓库版本，避免同时加载两个 token-speed。手动迁移时使用 `/plugin uninstall token-speed@ethan-local-mods`；本发布过程不会执行卸载。

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

**Last(API) / Avg(API) 是 CLI usage 的 API 全程输出速率。** 每个 turn.step 从 hook 开始计时至最终结果返回，包含 TTFT、thinking、网络、请求内停顿和内置 API 工具耗时；排除两次请求之间的工具或用户空闲，非纯解码速度。

- Last(API)：当前请求模型最近请求的 `output_tokens / 秒数`。失败、中断、无有效 usage 或耗时不大于 0 为 `—`。
- Avg(API)：该代理、该请求模型的 `有效 output_tokens 总和 / 有效请求耗时总和`，不取速度算术平均。例如 `100/2s + 300/3s = 80 tok/s`。
- usage null、count 缺失/NaN/Infinity/负数、耗时不大于 0 均不入平均；有限非负 0 是有效样本。turn.complete 的汇总 usage 不重复累计。

CPA 上游缺失 token count 可能被 CLI 规范化为 0。mod 无法区分实际 0 和上游遗漏后的 0；API 统计表示 CLI usage 口径，整段 usage null 和仍可观察的无效 count 不计入。

## 生命周期与边界

统计在本 session 的 version 2 host PluginState，每 loop 单独 row，顺序稳定；本地 Map 只保存流累加器。reload 保留统计，丢弃无法接管的 stale active，以 `$.agent.list()` 重建在跑子代理元数据。该 API 不含模型；未观察到请求的代理显示 unknown/Live —。每 1 秒轻量 reconcile 在无流时也运行，渲染不查询或写 roster。失败 list 保留行；生命周期 revision guard 防止旧 list 返回覆盖刚开始/完成的新 turn。只采纳 running；waiting 和工具间隙不判完成；仅 completed/failed/killed 明确终态收尾，不根据 absence 结束新 spawn。

`agent.list()` 只涉及本 session 的子代理/teammate，不扫描其它 CLI 或远程 session。API 不列 workflow agent，也无法观察远程 workflow loop；有本地 turn.step 时可单独统计。无可观察 stream 的行永远不推算速度。重复 session.start 不重复创建 timer；session.end 取消 timer 清空统计，不跨会话持久化。

流 hook 只调用一次 next(e)，原样 yield 所有 chunk/ref，原样返回 HookStream.result；不更改请求、顺序或工具 JSON。仪表自身异常被捕获，真实下游错误继续抛出，不重复请求。每个 loop 仅清理自己的 active/live。

## 开发检查

```sh
claude plugin validate <mod-dir> --strict
tsc -p <mod-dir>
claude plugin test <mod-dir>
```

本目录 tsconfig 开启 strict/noUncheckedIndexedAccess，包含 hooks、tests、自有 types 和生成的 `.claude-plugin/types`。测试使用实际 `claude-code/testing` 和 mock.clock 合成 stream，不联网或调用模型。

测试保留 text/thinking/tool/input/stop chunk 与 ChunkRef、单次 next、最终结果、完成前 Live、窗口/Unicode、加权平均、CPA usage、失败/关闭流、UI 透传与隐藏、reset/clear、reload 与仪表故障合同；新增 main+3 child 并发、同模型独立桶、各 view 主控 first、canonical suffix/prefix、spawn 晚元数据、list 采纳/拒绝/终态/竞态、无四行上限。kit 不允许凭空生成合法 opaque engine.ref，因此其透传由源码检查保证；底层 hook 错误会被 kit 包装成引擎错误，测试验证这个真实下游错误的透传和清理。

Typecheck 前先通过 CLI 加载生成 `.claude-plugin/types`，或使用同版本 CLI 提供的 API 类型声明。生成目录不提交；维护源码后可执行 `/reload-plugins` 读取更新，避免直接修改 plugins/cache 副本。版本与发布规则见 [VERSIONING.md](../VERSIONING.md)，历史见 [CHANGELOG.md](CHANGELOG.md)。
