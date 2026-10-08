# Changelog

本文件记录编排仓库的版本变化。版本号指本仓库，不对应模型版本。各 mod 使用独立版本，其详细变化记在对应 mod 的 CHANGELOG 中；此处的 "Mod 发布" 条目只作索引，发布 mod 不改变编排仓库版本。

## Mod 发布：token-speed 0.3.1 - 2026-10-09

- 每个代理一行显示模型、effort、上下文与输出速率，主控在前，工作区行在最后；速率数字按终端显示宽度对齐。
- 上下文进度条固定 10 格并跟随原生用量条配色；主控窗口优先使用运行时读数，子代理窗口后备来自[离线模型表](mods/token-speed/data/model-contexts.json)，启动读取一次，不联网。
- 详见 [token-speed 更新记录](mods/token-speed/CHANGELOG.md)、[mod 说明](mods/token-speed/README.md)；tag `token-speed-v0.3.1`。

## 0.2.0 - 2026-10-08

- 5 个模型分工：Haiku 5.5（medium）用于高速低复杂度执行；Flash 用于高频批量与规模 fan-out，额度吞吐优先；GLM-5.3 用于需要更多推演的常规实现；Sol 用于复杂/高风险；Astra 用于最难任务。
- 路由统一为 Magpie：移除旧网关配置示例，新增 `examples/magpie-routing.md` 说明 UI 中的上游与模型路由。
- Agent 模型：GPT 与 Haiku 使用冒号 effort 后缀，GLM 保持兼容裸名与默认 max；窗口与压缩配置见[编排手册](skills/multi-model-orchestration/SKILL.md)。
- 接入与工具往返已验证；性能 A/B、1M 上下文压力测试和真实 Workflow 运行未做。
- 用户本地观察到 Haiku 约 100–200 tok/s、最快约 300 tok/s。这是使用体验观察，不是 benchmark。

## 0.1.0 - 2026-09-28

- 原始未编号版本（追溯记为 0.1.0）：多模型编排 skill、安装脚本、模型定义与模板，包含 4 个原始代理（GPT-6 Sol、GPT-6 Astra、GLM-5.3、GLM-5.3-Flash）。
