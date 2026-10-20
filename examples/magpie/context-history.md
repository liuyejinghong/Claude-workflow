# 参考环境历史数值记录（个人示例）

本页容纳从公共文档迁出的本机历史数值与时间线，属于 `examples/magpie` 个人示例环境（维护者本机）的记录，不是通用配置建议；参数机理与优先级见 [../../skills/multi-model-orchestration/references/third-party-context.md](../../skills/multi-model-orchestration/references/third-party-context.md)。

## 本仓库历史数值 scope

- 本经验 1b9c164 引入、v0.3.1 最后包含，8f2db94（remove subscription policies）去除；现恢复为按需参考。
- 本机 2026-10-11 settings 仍为 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000`、`CLAUDE_CODE_MAX_OUTPUT_TOKENS=65536`；前两个针对当时 Sol/Astra 通道窗口，不是今日模型 API 默认或通用配置；默认文件安装不会写入，只有 install 分支在 plan 明确选定该配置时才写。
- 2026-10-12：Tibo（@thsottiaux）公告把 Codex/Work 的 `gpt-6.1-sol` 默认上下文由 272k 提升到 500k，仍可覆盖至 1M（原帖 https://x.com/thsottiaux/status/2109430343346581527）。公告称的默认值不是通用 API 默认（API 页仍为 total 1050000 / max output 128000）。同期 GitHub 静态 models.json（272k/872k）与本机 `~/.codex/models_cache.json`（373k/872k，2026-10-12 抓取）尚未显示 500k，尚未与公告一致，原因未知；不要据此断言 Codex 本机已自动变为 500k。Astra 与其它 OpenAI 行仍为 272k/872k。
- 同日（2026-10-12）本机 settings 的两个窗口 env 更新为 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=500000`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000`，`CLAUDE_CODE_MAX_OUTPUT_TOKENS` 仍 65536；它们对整个进程（含子代理）生效，是本机显式设置而非通用默认，仍是客户端假定、未做全量压力测试；安装流程仍不自动写入，只有 install 分支在 plan 明确选定该配置时才写。
- Gemini 本 route 输出上限 65536 是本机观察，不是所有 provider 的通用上限。
- 未做 1M 压力测试；`[1m]` 声明不等于实际长上下文体验。
