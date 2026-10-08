# token-speed Changelog

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
