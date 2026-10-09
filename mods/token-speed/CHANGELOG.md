# token-speed Changelog

## 0.3.2

对应 tag `token-speed-v0.3.2`；保留已发布的 0.3.0 与 0.3.1 tag。

- 修复主控上下文进度条闪烁。`$.session.usage()` 偶尔返回只带 `window`、没有有效 `tokens` 的部分读数，过去会把已知的 `21%/1.0M` 覆盖成 `—%`，下一次轮询再恢复。现在同一窗口的部分读数沿用上次已知读数；主控模型切换（`refreshMain` 与 `turn.step` 两处）也不再先把 context 清成未知。主控 context 仍只由成功压缩与整会话重置清空，子代理行的模型切换重建行为不变。
- 离线模型表由 7 条扩到 24 条，补齐 `gemini-3.8-flash`（1,048,576 输入容量，与 65,536 输出上限分开）、`deepseek-v4.1-flash`（官方 id 为 `deepseek-flash`，另收 `deepseek-v4-flash` 与 `deepseek-v4-pro`）、`claude-fable-5-1` 及 Claude 1M/200k 系列、`gpt-6-sol`、`gpt-6-luna` 等，全部带官方来源 URL 与核验日期 2026-10-09。不把未核实的邻近型号（含 `flashx`）映射到已知型号。
- `/tok-speed` 帮助文本补上 `cli-input-official-capacity` 来源。
- 测试 41 → 42：新增「部分读数不覆盖已知主控读数、主控模型切换不清空」回归测试；三处改动分别回退后该测试都会失败，确认各自都有覆盖。

## 0.3.1

对应 tag `token-speed-v0.3.1`；保留已发布的 0.3.0 tag。

- 每个代理同一行显示模型、effort、上下文和速度，删除重复主控会话行，工作区最后。仅 UI 隐藏渠道前缀，统计桶和命令保留完整模型；速率单位每行只标一次。
- 主控 reload 读取模型专属/全局 effort 配置作为后备，请求和 classic applied 读数优先，缺值显示 `—`，状态记录来源，不猜默认 high。
- 上下文 registry 使用静态 data/model-contexts.json，启动读取一次、reload重新加载，不联网。七个精确型号覆盖Claude Haiku/Opus/Sonnet 5.5官方1M，GPT Sol/Astra的Codex272k默认与独立max/API元数据，以及GLM-5.3/Flash官方容量1M。明确用户overrides独立优先；官方default/capacity与CLI配置来源分开，命令显示registry版本、来源URL和核验日期，读取/解析失败保留已确认三个用户窗口。
- 子代理上下文仍用最近响应CLI输入+cache tokens，不累计、不借主控比例。精确alias匹配，不把邻近或未核实型号映射到其它型号，官方max不因[1m]自动选用。成功安装的压缩清输入读数而保留窗口，预计算和跳过不清。
- 进度条改为固定 10 格暗底块状条，整格█+尾部1/8cell，共 80 视觉档位（0–100 映射为 81 种可见状态，相邻整数百分比可同档）；数字仍为整数 1%，不宽屏增长。填充固定 theme `rate_limit_fill`、轨道 theme `rate_limit_empty`（原生 usage meter 语义，依据 https://code.claude.com/docs/en/terminal-config#color-token-reference），Ctx 数值用 text/inactive，不随 severity 变化，无渐变。模型名 text，主控标签 claude，有效速率 text、缺值 inactive，状态与工作区 inactive（aborted/warning、error/error 保留）。按终端显示宽度对齐，动态预算先省略status、再Last、再bar，保留主要数据。
- 清理 README 本机绝对路径，提供可移植安装及0.3.1 tag示例。原速度与24小时Avg计算合同保持。

## 0.3.0

新增会话行、工作区行与多行对齐，Avg 改为 24 小时滚动窗口。对应 tag `token-speed-v0.3.0`。

- 会话行：主控模型 · effort 档位（`turn.step` 事件原样；low/medium/high/xhigh/max 分级配色，数值为 subtle）· 上下文进度条。进度数据来自 `$.session.usage()`（与状态栏同源）：10 格按占用分段变色（前段 success、中段 warning、末段 error，空格 inactive），后接 `百分比/窗口`（272k / 1.0M 风格）；首次响应前显示空条与 `—/窗口`。
- 工作区行：`项目名 on 分支`——仓库根目录名（`$.session.repo()`）+ 当前分支（经引擎 process API 调用 `git branch --show-current`，只读）；非 git 目录显示会话根目录名，detached HEAD 只显示项目名。约 5 秒刷新，值未变化不写状态。
- 多行对齐：标签、模型、Live、Last、Avg 各列按可见行最大宽度对齐（数值右对齐），单行不填充。
- Avg 改口径：由本次会话全程累计改为最近 24 小时滚动窗口内同代理同模型的有效 token 总和 / 有效耗时总和，按请求完成时间戳判窗、出窗即弃；与本地时区无关。迁移自 v0.2 的无时间戳桶在首个新请求前退回全程累计口径。UI 与 `/tok-speed` 的标签由 `Last(API)`/`Avg(API)` 改为 `Last`/`Avg`。
- 行数预算（AbovePrompt maxRows）不足时优先保留速度行，其次会话行，最后工作区行；宽度不足 110 列省略 Last，不足 90 列省略进度条本体（保留百分比）。

## 0.2.1

首次 GitHub 发布，对应 tag `token-speed-v0.2.1`。

- 使用跟随 CLI 主题的配色：区分身份与模型、Live、Avg、Last、缺值和运行状态，主控身份及有效 Live 加粗。
- 将 authored 文件、测试与安装文档纳入本仓库的独立 mods 目录。

## 0.2.0

本地开发历史，未发布 GitHub tag。

- 支持主控与多个活跃 agent，各代理单独显示一行。
- 各代理按请求模型独立累计 API 速率与加权均值，同模型代理不共享统计桶。
- 稳定请求模型名称与渠道前缀，响应的 `usage.model` 不改变请求标签或统计桶。
- 迁移 0.1 的主控统计，保留独立标记的 legacy response-model 桶，不混入新请求模型均值。

## 0.1.0

本地开发历史，未发布 GitHub tag。

- 首个主控版：显示实时估算速率与 API 输出速率统计，提供 `/tok-speed` 查询和 reset。
