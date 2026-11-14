# examples/magpie：维护者个人示例

本目录保留仓库维护者的个人 Magpie 接线和历史记录，供参考；安装脚本不会自动安装其中的代理或路由。使用前请自行检查本人的环境、已加载代理、凭据和路由是否适用；通用安装见 [README](../../README.md#快速开始)。

- [agents/](agents)：8 个示例 agent 定义（7 个核心 + 可选 Gemini；Sol 与 Astra 默认 xhigh，其余默认 max）。
- [orchestration.json](orchestration.json)：角色卡示例，各岗位的候选与 priority（示例未配置 architect，该岗位按需使用）。
- [routing.md](routing.md)：Magpie 路由 ID 与验证记录。
- [model-selection.md](model-selection.md)：模型分工与选型依据。
- [context-history.md](context-history.md)：本机历史数值记录（窗口/压缩/输出参数时间线；历史存档）。

路由与凭据需按你的环境自行配置；通用安装不要求 Magpie。若已有 Claude 订阅且所需 Claude 模型确实可用，直接用 Claude Code 原生子代理即可，无需本示例与角色编排。

## 示例岗位映射

[orchestration.json](orchestration.json) 是示例配置，岗位与候选如下。实际派发前读取当前环境的角色卡（`cards`），并结合已加载代理的职责选型：

| 岗位 | 候选（按 priority 顺序） |
|---|---|
| worker | `deepseek-v4.1-flash-free`(2) → `deepseek-v4.1-flash`(3) → `glm-5.3`(4) → `gpt-6.1-terra`(5)；`glm-5.3-flash` 停用(0) |
| engineer | `gpt-6.1-sol`(1) |
| reviewer | `gpt-6.1-sol`(1) → `gpt-6-astra`(2) |
| researcher | `deepseek-v4.1-flash-free`(2) → `deepseek-v4.1-flash`(3) |
| editor | `gemini-3.8-flash`(1) |
| architect | 示例未配置（按需） |

`priority` 只定候选顺序；模型、effort 与职责边界以 [agents/](agents) 里的定义为准。
