# 2026-11 AI 编码订阅与套餐调研

调研日期：2026-11-08。价格、额度和条款都以当日公开页面为准；页面会变，购买前应复查。质量基线取自 `docs/research/model-benchmarks-2026-11-08.md` 的 AA Intelligence Index v5.0.1：GPT-6.1 Terra 51、GLM-5.3 32、DeepSeek V4.1 Flash 32（旧档另有 33，差异未定因）。本文件只写公开信息，不写密钥、账号或私有配置。

证据标注：`官方` 指厂商定价页、文档或条款；`第三方` 指独立榜单、评测或聚合页；`社区` 指 V2EX、论坛、个人实测。第三方和社区数字只作方向，不写成实测结论。

## 结论摘要（推荐名单）

1. **首选补充：Kimi Code Plus/Pro。** Plus $19/月（年付 $15/月），可用 Kimi K3.1 Pro，Plus 为 256K 上下文，Pro 起为 1M 并带 HighSpeed；官方提供 Anthropic 兼容端点，明确支持 Claude Code。K3.1 Pro 的 AA v5 为 46，高于 GLM-5.3 和 DeepSeek V4.1 Flash 的 32，低于 Terra 的 51；官方自报 Terminal-Bench 4.0 为 65.7。适合做第二 worker，先 Plus 试用，额度不够再升 Pro。风险是额度不透明、thinking-only，以及经 Magpie 转发属于代理灰区。
2. **低成本备胎：MiniMax M Plan Go。** $22/月（年付 $220），M3.1 Flash，官方支持 Claude Code，5 小时 + 周双窗口，Go 为 1x 额度。AA v4.1 为 42，低于同版本 DeepSeek V4.1 Flash 的 45；Terminal-Bench 4.0 独立成绩 25.8，明显低于 DeepSeek 的 42.3。只适合低风险批量任务，不建议替换主力。
3. **已订阅 GLM Coding Plan 的可继续用作审查主力，搭配 DeepSeek V4.1 Flash。** GLM-5.3 的审查证据仍强（Macroscope 77.4、Qodo F1 52.1），DeepSeek 便宜、快、额度大。没有候选在“质量不低于该组合 + 可接入 Claude Code + 价格更低”三项上同时明显胜出。Max 与 Pro 按实际 credits 用量选。
4. **免费试用但不接入：Devin SWE-2 Flash。** 官方说免费到 2026-12-04 18:00 UTC，但只在 Devin Desktop/CLI 内，不提供公开模型推理 API 或模型 ID；Terminal-Bench 4.0 为 20.0，低于典型组合。适合零成本试玩，不适合做 Claude Code 后端。
5. **质量兜底（可选，非性价比）：Anthropic Claude Max。** $100/月，Claude Code 原生，Opus 5.5 的 AA v5 为 58，高于 Terra 的 51；5x Pro 额度，另含 $100/月 API credits。预算优先质量而非额度时，这是最稳的替换或兜底。

不推荐用于替换的组合：GitHub Copilot、Cursor/X Subscription、Google Gemini、Mistral、Qwen/百炼、火山方舟、腾讯云 Coding Plan。原因分别是不满足“API/第三方客户端”硬条件、模型代际低于典型组合、或限流/封号风险高。详见下表。

## 候选对比表

### 国内 Coding Plan

| 候选（档位） | 价格 | 额度口径与公开限额 | 主力模型 | 质量对照 | Claude Code / 网关 | 条款要点 | 结论 |
|---|---|---|---|---|---|---|---|
| **Kimi Code Plus** | $19/月；年付 $15/月（$180/年） | 5 小时约 300–1,200 次请求，最高 30 并发；周额度按官方页刷新；新套餐文档又称取消周限额、保留 5 小时滚动 + 月度总配额。未公布按档位的具体数字 | Kimi K3.1 Pro（Plus 256K）、K2.7 Code | K3.1 Pro AA v5 46；官方 TB4 65.7；K2.7 Code AA v4.1 42，SWE-bench Verified 78.2 | 官方 Anthropic 兼容端点，官方 Claude Code 教程；第三方工具共用额度。经 Magpie 转发未明确允许 | 仅限交互式使用；禁止转售；禁止伪造/篡改客户端身份。直连 Claude Code 允许 | **补充；可替换部分 worker** |
| **Kimi Code Pro** | $39/月；年付 $31/月（$372/年） | 同上，额度高于 Plus；K3.1 Pro 1M 上下文 + HighSpeed | Kimi K3.1 Pro / K3 / K2.7 Code | 同上 | 同上 | 同上 | **补充；重额度时优先** |
| **MiniMax M Plan Go** | $22/月；年付 $220（标价 $264） | Go 1x；5 小时 + 周双窗口；未公布绝对 token/请求数；RPM/TPM 动态限流，约 1 分钟恢复 | MiniMax M3.1 Flash | AA v4.1 42；TB4 独立 25.8 / 官方 38.1；DeepSWE 73.7 | 官方 M Plan Key 支持 Anthropic/OpenAI 兼容协议，官方支持 Claude Code；Key 与按量 API Key 不通用 | 个人交互式使用；生产环境建议按量付费；未发现明确反代理条款 | **低成本备胎；不替换主力** |
| **GLM Coding Plan Max** | $168/月；年付 $117.60/月（7 折） | 28,000 credits/5 小时，140,000 credits/周；5 小时 + 周双限额；闲时 50% 计费；高峰为工作日 14:00–18:00 UTC+8；不滚存 | GLM-5.3 / GLM-5.3-Flash | AA v5 32；TB4 41.8；Macroscope 77.4；Qodo F1 52.1 | 官方支持 Claude Code、Codex、Cursor 等 20+ 工具；条款禁止代理/聚合/转售 | 仅限官方支持工具；禁止账号共享；禁止 SDK/第三方集成或代理转发；3 次以上违规可封号 | **审查主力候选** |
| **阿里云百炼 Qwen Coding Plan Pro** | $50/月（国内 ¥200/月） | 6,000 次/5 小时、45,000 次/周、90,000 次/月；三层同时生效；按模型调用次数计，简单任务约 5–10 次、复杂任务 10–30+ 次 | qwen3.7-plus、qwen3.6-plus、kimi-k2.5、glm-5、MiniMax-M2.5、qwen3.5-plus | Qwen3.7 Plus AA v5 无分数；AA v4.1 约 23–26（聚合页）；SWE-bench Verified 77.7；TB2.0 70.3。GLM-5/Kimi K2.5 低于典型组合的代际 | 官方支持 Claude Code、Cursor、Cline、Codex 等；仅限交互式工具，禁止脚本/后端/非交互 | 禁止自动化脚本、后端、非交互；禁止共享；不可退款；动态限流未披露 | **不推荐替换；仅可打杂** |
| **火山方舟 Coding Plan Lite** | ¥40/月；首月 ¥9.9；季付 ¥120 | 约 1,200 次/5 小时、9,000 次/周、18,000 次/月；按模型调用估算，一次提问可能触发 5–30 次调用 | Doubao-Seed-2.0-Code、Doubao-Seed-Code、GLM-4.7、DeepSeek-V3.2、Kimi-K2.5 | Doubao-Seed-2.0-Code 约 SWE-bench 76.5 / TB2.0 55.8（聚合页，数字有冲突）；模型代际整体低于典型组合 | 支持 Claude Code、Cursor、Cline、OpenCode、OpenClaw；额度跨工具共享 | 仅在 AI 编程工具中生效，不可 API 直调；个人场景；额度耗尽只等刷新 | **不推荐替换；可低成本打杂** |
| **火山方舟 Coding Plan Pro** | ¥200/月；首月 ¥49.9；季付 ¥600 | Lite 的 5 倍：约 6,000 次/5 小时、45,000 次/周、90,000 次/月 | 同上；宣传页另称最新支持 DeepSeek-V4、GLM-5.3 系列（未核实） | 同上 | 同上 | 同上 | **不推荐替换** |
| **腾讯云 Coding Plan Lite** | ¥40/月（另有首购活动价） | 约 1,200 次/5 小时、9,000 次/周、18,000 次/月；按模型调用计，简单提示 5–15 次、复杂 15–30+ 次 | Auto（`tc-code-latest`），动态模型目录；搜索页称含混元 HY 2.0、GLM-5、Kimi-K2.5、MiniMax-M2.5；不支持多模态 | 代际低于典型组合；具体模型不固定，无法做稳定质量对照 | 支持 Claude Code、CodeBuddy、OpenCode、Cline、Cursor、Codex 等 | 禁止 API 式访问、脚本、后端、非交互批量；严禁账号共享 | **不推荐** |
| **腾讯云 Coding Plan Pro** | ¥200/月 | 约 6,000 次/5 小时、45,000 次/周、90,000 次/月 | 同上 | 同上 | 同上 | 同上 | **不推荐** |

### 海外订阅与免费入口

| 候选（档位） | 价格 | 额度口径与公开限额 | 主力模型 | 质量对照 | 接入 Claude Code | 条款要点 | 结论 |
|---|---|---|---|---|---|---|---|
| **Devin Free / Pro** | Free $0；Pro $20/月；Max $200/月；Teams $80/月 + $40/席位 | 无数值额度；Free 为轻量 agent 配额；SWE-2 Flash 免费至 2026-12-04 18:00 UTC；SWE-2 免费至 2026-11-30；Flash Medium 在 Free 可用，High/Max 需付费；仅 Devin Desktop/CLI，不含 cloud | SWE-2、SWE-2 Flash、SWE-1.x 及第三方模型 | SWE-2 Flash TB4 20.0；SWE-2 TB4 27.3（厂商自报） | 无公开模型推理 API/模型 ID；不能接入 Claude Code 或 Magpie | 仅官方客户端；第三方 API 未提供；条款未核 | **免费试用；不接入** |
| **Cursor / X Subscription Plus** | $8/月 | 共享 Cursor + Grok 用量池，标称 “Basic”；周刷新；API 另按标准价计费，不占套餐池 | Grok 模型（Plus 仅 Grok） | Grok 4.6 AA Coding 76.8（第三方镜像）；无同口径 Claude Code 对照 | 不能作为 Claude Code 额度；Cursor 应用内使用 | API 单独计费；第三方模型 Premium 起按 list price | **不推荐作后端；可作 IDE 补充** |
| **Cursor / X Subscription Premium** | $30/月 | 4x Plus；Grok + Cursor Pro；第三方模型可用但另计费 | 最新 Grok + 第三方 | 同上 | 同上 | 同上 | **不推荐作后端** |
| **GitHub Copilot Pro** | $10/月 | 1,500 AI credits/月（1,000 基础 + 500 flex）；补全免费，chat/agent/CLI/审查消耗 credits；约 1 credit = $0.01 | GPT-6.1 Terra、GPT-6 Astra（Pro+/Max）、Claude Opus 5.5（Pro+/Max）、Kimi K3 等 | 可低成本接触 Terra/Astra；但无独立 benchmark 对照 | 无第三方 API；仅 Copilot CLI/IDE/app | 订阅绑定 Copilot 客户端；API 不含 | **不满足硬条件；不推荐替换** |
| **GitHub Copilot Pro+ / Max** | $39/月；$100/月 | 7,000 / 20,000 credits/月 | 同上，含 Opus 5.5、Astra | 同上 | 同上 | 同上 | **不满足硬条件** |
| **Google AI Pro** | $19.99/月；年付 $199.99 | Antigravity 配额标称 “Expanded”，无数字；Gemini CLI / Code Assist 消费者入口自 2026-06-18 起停止服务 | Gemini 4 Argon 等 | Gemini 4 Argon AA v5 50，接近 Terra 51 | 仅 Antigravity，无 API 额度 | 消费者订阅不含 API；需另行使用 Gemini API | **不满足硬条件** |
| **Google AI Ultra 5x** | $99.99/月 | Antigravity “Higher”；无数字 | Gemini 4 Argon / 更高配额 | 同上 | 同上 | 同上 | **不满足硬条件** |
| **Mistral Pro** | $14.99/月；Team $24.99/用户/月 | Vibe 全 day coding；fair use；Pro 含 $15/月 API credits；无公开 coding 请求数 | Devstral 2 / Devstral Small 2 | AA 8.6；TB4 0.0；Vals SWE-bench 62.8（厂商自报 72.2） | 可通过 Mistral API/BYOK 接入，但质量远低于典型组合 | fair use；API credits 另计 | **不推荐** |
| **Anthropic Claude Pro** | $20/月；年付 $17/月 | 1x Pro，5 小时 + 周窗口 | Claude Sonnet/Opus 系列 | Opus 5.5 AA v5 58（最高档） | 原生 Claude Code | 订阅仅限 Claude 客户端；API 另计 | **质量兜底；非性价比** |
| **Anthropic Claude Max / Ultra** | Max $100/月；Ultra $200/月 | Max 5x Pro；Ultra 10x 周额度，验证账户无 5 小时限制；含 $100/$200 API credits | 同上 | 同上 | 原生 Claude Code | 同上 | **质量优先时可替换** |
| **OpenAI ChatGPT Plus / Pro（Codex）** | Plus $20/月；Pro 从 $100/月起 | Codex 含在订阅内；Plus 各模型 15–160 次等区间，Pro 更高；API 另按量 | GPT-6.1 Sol、GPT-6 Astra、GPT-6 Luna 等 | Sol/Astra AA v5 55/57，高于 Terra 51 | Codex CLI/IDE；不是通用 API 额度 | API 另计；订阅仅限 Codex 客户端 | **质量高；不解决第三方额度** |
| **OpenRouter 免费模型** | $0；一次性 $10 充值后提高上限 | 免费模型 20 请求/分钟、50 请求/天；充值 $10 后 1,000 请求/天 | Nemotron 3 Ultra 等 | AA 约 22.9，低于典型组合 | 可用 OpenAI 兼容 API；需自接 Claude Code 代理 | 多数免费端点会拿提示训练；仅 Xing4.0 例外 | **不推荐生产** |
| **Kilo 免费 MiniMax M3.1 Flash** | 限时免费 | 未公布结束日期；1M 上下文；Kilo 代码 agent 榜约 #73 | MiniMax M3.1 Flash | 同上 MiniMax 行 | Kilo 自有客户端，不是 Claude Code | 限时活动，随时结束 | **免费试玩；不依赖** |

说明：Windsurf 的定价页在 2026-11-08 返回 308，重定向到 `devin.ai/pricing`，未再提供独立套餐；本表按 Devin 处理。Cursor 的定价页现在显示 Cursor + Grok 共享用量池，并写明“仅通过 X Subscription Corp 销售”；xAI 是否收购 Cursor 未在页面声明，不能写成已收购。

## 候选详情

### 0. 质量基线：对照组合

| 模型 | AA v5.0.1 | Terminal-Bench 4.0 | 价格/备注 |
|---|---:|---:|---|
| GPT-6.1 Terra | 51 | 49.5–50.3（口径不一） | >272K 输入按 2× 计费 |
| GLM-5.3 | 32 | 41.8 | GLM Coding Plan Max；审查强 |
| DeepSeek V4.1 Flash | 32（旧档 33） | 42.3（厂商卡） | 便宜、快、额度大 |

AA v5 分数来自 `docs/research/model-benchmarks-2026-11-08.md` 与其引用的 AA v5 文章（https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5，访问 2026-11-08）。TB4 的 harness、effort 和运行日期不同，不能直接相减；这里只作方向。GLM-5.3 的 TB4 41.8 来自 Terminal-Bench 4.0 榜单镜像（https://snorkel.ai/leaderboard/terminal-bench-4-0/，访问 2026-11-08），Claude Code harness、max effort、2026-08-14 运行。DeepSeek 42.3 来自 OrcaRouter 对 DeepSeek 模型卡的转述（https://www.orcarouter.ai/zh-CN/blog/swe-2-flash-launch-access-and-claims，访问 2026-11-08）。Terra 的 49.49%/50.3% 分别来自旧档和 AA，Vals TB4 页已 404，未统一口径。

### 1. Kimi Code

#### 价格与档位（官方）

- Plus：$19/月；年付 $15/月，$180/年。
- Pro：$39/月；年付 $31/月，$372/年。
- Max：$99/月；年付 $79/月，$948/年。
- Ultra：$199/月；年付 $159/月，$1,908/年。

来源：Kimi K2.7 Code 定价页（https://www.kimi.ai/resources/kimi-k2-7-code-pricing，访问 2026-11-08）。中文页另有 Go/Plus/Pro/Max/Ultra 的 CNY 档位，Go 不含 coding 额度。年付价按官方“年付总价/12”折算。

#### 额度口径

- 官方产品介绍页写：“每 5 小时约 300–1,200 次请求，最高 30 并发”，周额度“每 7 天自动刷新”，但没有给按档位的具体数字（https://www.kimi.ai/resources/kimi-code-introduction，访问 2026-11-08）。
- 会员文档又说新套餐“取消周额度上限”，只保留 5 小时滚动窗口 + 月度总配额；旧套餐仍按周刷新。两页口径不一致，购买时应以控制台/购买页为准（https://www.kimi.com/code/docs/en/kimi-code/membership，访问 2026-11-08）。
- 额度按请求/agent 调用计，不是按 token；官方没有公开“一次请求”如何折算。第三方评测称 Plus 落在 300 次/5 小时的低端、高 Tier 可到 1,200 次，但这是推断（https://pureailabs.com/ai-coder/kimi-code-review/，访问 2026-11-08）。

#### 模型与公开 benchmark

- **Kimi K3.1 Pro**：2.8T 总参数 / 104B 激活 MoE，1M 上下文，2026-10-23 发布，11-04 开放权重；thinking-only。AA v5 46，高于 GLM-5.3 和 DeepSeek V4.1 Flash 的 32，低于 Terra 的 51（AA v5 文章，https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5，访问 2026-11-08）。
- 官方自报：Terminal-Bench 4.0 65.7%，SWE-Marathon v1.1 51.7%，DeepSWE v1.1 75.5%，HLE-Full with tools 70.0%；ProgramBench 31.5% 落后 Opus 5.5 的 65.0%。这些是厂商数字，尚无独立复现（https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart，https://byteiota.com/kimi-k3-1-pro-open-weights，访问 2026-11-08）。
- **Kimi K2.7 Code**：1T 总参数 / 32B 激活，256K 上下文，开放权重；AA v5 模型页显示 N/A（无公开 API 口径），AA v4.1 为 42；SWE-bench Verified 78.2%，TB2.1 67.0%，LiveCodeBench 82.0%。来源：Kimi 产品页（https://www.kimi.ai/resources/kimi-k2-7-code，访问 2026-11-08）、benchmarklist（http://www.benchmarklist.com/models/moonshotai-kimi-k2.7-code，访问 2026-11-08）。K2.7 与 K3.1 Pro 不是同一代，不能混用分数。
- 注意：Kimi K3.1 Pro 的 65.7% TB4 是官方自报，和 GLM-5.3 的 41.8% 独立榜、Terra 的 49.5–50.3% 不是同一来源；只能作方向，不能写成“Kimi 比 Terra 高 15 分”。

#### API / 第三方客户端

- 官方 Claude Code 教程给出 Anthropic 兼容端点，指导把 Claude Code 的模型请求转发到 Kimi Code API；需要 Kimi Code 套餐和 API key（https://www.kimi.com/code/docs/third-party-tools/claude-code，访问 2026-11-08）。
- 档位与上下文：Plus/Moderato 的 `k3.1-pro` 为 262,144；Pro/Allegretto 起为 1,048,576，并有 `k3.1-pro-highspeed`；Go 无 coding 额度。K3.1 Pro 仅支持思考模式，关闭思考的请求会被拒绝。
- 官方明确“推荐新建会话并使用 Kimi Coding Plan 原生接口协议，以获得最佳效果稳定性，代理协议转换可能引起效果波动”。这句话对 Magpie 这类转发器是直接风险提示。
- 条款：Kimi Code 社区准则写“subscriptions are for interactive use only”，兼容 Claude Code 等主流工具；禁止转售、禁止账号共享、禁止“伪造或篡改客户端身份信息”（https://www.kimi.com/en/help/kimi-code/community-guidelines，访问 2026-11-08）。直连 Claude Code 是官方支持的；经 Magpie 转发是否属于“篡改客户端身份”未明确，属于灰区。

#### 社区反馈（与官方分开）

- 有评测称 $99 的 Max 用户在单次会话中 47 分钟打满 5 小时额度；默认 `reasoning_effort: max` 会加快消耗。这是二手转述，未见原始帖（https://www.eesel.ai/blog/kimi-k3-1-pro-review，访问 2026-11-08）。
- Pure AI Labs 的评测把“5 小时 300–1,200 次、最高 30 并发”列为卖点，同时把并发上限视为隔夜批量管道的痛点（https://pureailabs.com/ai-coder/kimi-code-review/，访问 2026-11-08）。
- 未找到可直接引用的一手 Reddit/V2EX 帖；上述是评测文章转述，证据等级为社区/二手。

#### 结论

**补充，优先试用 Plus；额度不够升 Pro。** 它是目前唯一在“官方支持 Claude Code + 质量高于 GLM/DeepSeek + 价格低于 GLM Max”三项上同时成立的候选。但它仍低于 Terra 的 AA v5，且额度不透明、thinking-only、经 Magpie 转发有协议和条款灰区，所以不适合直接替掉 Terra；更适合顶替部分 GLM/DeepSeek worker 流量，保留 GLM 做审查。

### 2. MiniMax M Plan

#### 价格与档位

- Go：$22/月；年付 $220（标价 $264）。
- Explore：$55/月；年付 $550（标价 $648）。
- Build：$132/月；年付 $1,320（标价 $1,560）。
- 年付相当于“付 10 个月送 2 个月”。来源：MiniMax M Plan 官方页（https://minimax.io/m-plan，访问 2026-11-08；页面为 JS 渲染，价格取自搜索摘要，未直接读到表格）。第三方汇总与官方口径一致（https://agentplans.fyi/compare/minimax/，访问 2026-11-08）。

#### 额度口径

- Go 1x、Explore 3x、Build 7.5x；文本/图像/音频共用 5 小时 + 周双窗口，视频只走周窗口；未公布绝对 token、请求数或 RPM/TPM 数字。
- 官方 FAQ：额度用尽后可买 credit pack、升级、等刷新或转按量；RPM/TPM 限流通常约 1 分钟恢复，高峰期可能收紧；M Plan 定位“individual, interactive developer use”，生产环境建议按量付费（https://platform.minimax.io/docs/m-plan/faq，访问 2026-11-08）。
- 第三方估算 Go 约 1.7B tokens/月、Explore 5.1B、Build 12.5B，并发约 3–4/4–5/6–7；这些是估算，不是官方数字（https://wiki.licenseware.io/wiki/minimax-m-plan-and-usage-limits，访问 2026-11-08）。

#### 模型与公开 benchmark

- 所有档位文本模型为 **MiniMax M3.1 Flash**，1M 上下文；Explore/Build 额外有 H3 视频。
- AA v4.1 为 42，同版本 DeepSeek V4.1 Flash 1017 为 45；GLM-5.3-Flash 同为 42，Gemini 3.8 Flash 41（https://the-decoder.com/minimax-m3-1-flash-shows-chinas-ai-price-race-has-no-floor-in-sight，访问 2026-11-08）。注意这是 v4.1，不是基线用的 v5.0.1；不能把 42 和 GLM-5.3 的 32 直接相减。
- Terminal-Bench 4.0：独立榜 25.8%，MiniMax 自报 38.1%；DeepSWE 1.1 73.7，低于 DeepSeek 的 77.0；AutomationBench-AA 73% 领先，但 GDPval-AA 和 TB4 落后（https://www.terapep.com/blog/minimax-m3-1-flash-leaderboards-artificial-analysis-space-bunny-2026，https://venturebeat.com/technology/minimaxs-new-m3-1-flash-beats-deepseek-and-opus-5-on-a-key-business-benchmark-at-lower-cost-but-with-a-high-hallucination-rate，访问 2026-11-08）。
- AA 还标记其 AA-Omniscience hallucination rate 93%：模型倾向于回答而不是承认不知道；“93%”不是“93% 的答案错误”，引用时要保留口径（同上）。

#### API / 第三方客户端

- M Plan 使用单独的 Subscription Key，与按量 API Key 不能混用；支持 OpenAI/Anthropic 兼容协议，官方列出 Claude Code、Codex、Cursor、OpenCode、Pi、Hermes Agent、OpenClaw 等（https://platform.minimax.io/docs/m-plan，https://platform.minimax.io/docs/m-plan/faq，访问 2026-11-08）。
- 未发现明确的“禁止本地网关/代理”条款；官方限制主要是个人交互式使用、账号不得转借、生产用按量。经 Magpie 转发是否合规未核实。

#### 社区反馈

- 实测文章称“拿 Go 当主力铁定不够用”，做到第 4 个测试任务就触发 5 小时限额；轻量试用或当副驾驶可以，主力写码建议 Explore（https://iadecider.com/articles/minimax-code-review，https://www.toutiao.com/article/7704952734885085746/，访问 2026-11-08）。
- 有二手 Reddit 转述称每天写码 4–8 小时只用掉 20–30% 额度，但该文本身是 SEO/评测站，可信度低（https://docs.bswen.com/blog/2026-03-28-minimax-coding-plan-review，访问 2026-11-08）。两条社区证据方向相反，不能合并成结论。

#### 结论

**低成本备胎，不替换主力。** 它比 Kimi 便宜一点，官方接入 Claude Code，但模型质量低于 DeepSeek V4.1 Flash 的同版本分数，TB4 独立成绩也明显更低；Go 的额度对重度 agent 使用偏紧。适合低风险批量、草稿、文档类任务，或作为额度耗尽时的第二通道。

### 3. GLM Coding Plan

#### 价格与档位

- Lite：$18/月；年付 $12.6/月（7 折）。
- Pro：$80/月；年付 $56/月。
- Max：$168/月；年付 $117.60/月。
- Team：Standard $88/席位/月（66,000 credits/周）；Premium $188/席位/月（155,000 credits/周），至少 2 席位。

来源：z.ai 订阅页（https://z.ai/subscribe，访问 2026-11-08；页面为 JS 渲染，价格取自搜索摘要，未直接读到表格）与官方文档（https://docs.z.ai/devpack/overview，访问 2026-11-08）。中文文档只给额度、不给价格（https://docs.bigmodel.cn/cn/coding-plan/overview，访问 2026-11-08）。

#### 额度口径

- Lite：2,000 credits/5 小时，10,000/周。
- Pro：12,000/5 小时，60,000/周。
- Max：28,000/5 小时，140,000/周。
- 5 小时 + 周双限额；5 小时额度按消耗后 5 小时滚动重置；周额度每 7 天重置；不滚存、不溢出到按量。
- credits 公式：`(输入 tokens × 输入倍率 + 缓存输入 × 缓存倍率 + 输出 × 输出倍率) / 10,000`；GLM-5.3 倍率 6.9 / 1.7 / 24，GLM-5.3-Flash 2.3 / 0.56 / 8（第三方转述官方文档，https://oxalpha.run/blog/glm-coding-plan，访问 2026-11-08）。
- 闲时按 50% credits 计费；高峰为周一至周五 14:00–18:00 UTC+8（官方文档，https://docs.z.ai/devpack/overview，访问 2026-11-08）。

#### 模型与公开 benchmark

- 所有档位支持 GLM-5.3 和 GLM-5.3-Flash；GLM-5.2/5.1 自动路由到 5.3，GLM-5-Turbo/4.7 自动路由到 5.3-Flash。
- AA v5 32；TB4 41.8；AA Coding Index 74.8（第三方镜像，https://benchlm.ai/benchmarks/aacodingindex，访问 2026-11-08；这是 Coding Index，不是 Intelligence Index，不能和 32/51 混比）。
- 审查：Macroscope 77.4（召回 76.4%、精确 78.4%、成本 $3.86）；Qodo F1 52.1%（精确 51.5%、召回 52.7%、每 PR $0.76、P50 226 秒）。来源见基线档案与其引用的 Macroscope/Qodo 页（访问 2026-11-08）。这是保留 GLM 的主要理由，不是 AA 综合分。

#### API / 第三方客户端

- 官方支持 Claude Code、Codex、OpenCode、Cursor、ZCode、AutoClaw 等 20+ 工具；Claude Code 是明确支持项（https://docs.z.ai/devpack/overview，访问 2026-11-08）。
- 条款比 Kimi/MiniMax 严：
  - “usage quota under GLM Coding Plan is only used within officially supported tools.”
  - 禁止 “unauthorized or unsupported tools (such as SDK-based access or other third-party integrations)”。
  - 禁止 “resell, sub-resell, repackage, aggregate, proxy or otherwise provide the GLM Coding Plan to any third party”。
  - 账号绑定单一自然人或团队，禁止共享、出租、转借。
  - 违规可限流、冻结权益，3 次以上可封号；付款一般不退款。
  来源：https://docs.z.ai/legal-agreement/subscription-terms，https://docs.z.ai/devpack/usage-policy，访问 2026-11-08。
- 对 Magpie 的含义：官方允许 Claude Code，但条款同时禁止“proxy / aggregate / 第三方集成”。本地单用户网关是否算“proxy to third party”没有明确判例；按字面，风险高于 Kimi/MiniMax。经本地网关转发属于条款灰区，使用前自行评估。

#### 社区反馈

- V2EX「GML 限流也太难顶了」：Max 用户反映高峰期限流；Lite 用户称“用得少没被限流，但经常感觉降智”；帖中回顾了 2026-01 限售公告和后续致歉（https://www.v2ex.com/t/1187116，访问 2026-11-08）。
- 论坛帖「避雷智谱 GLM Coding Plan，日常 429 限流」：用户日常 429，回帖称把 key 塞进 newapi/网关会被标记；官方文档对 OpenClaw 走次级调度、尽力交付（https://www.locdd.com/t/topic/36776，访问 2026-11-08）。
- 第三方分析称官方从未公布并发上限，只有动态调整和 Max>Pro>Lite 优先级；高峰期易限（https://zentor.ai/blog/glm-coding-plan-rate-limits，访问 2026-11-08）。
- 这些是社区个案，不能推出“所有 Max 用户都被限流”；但“网关/代理可能触发风控”与条款方向一致。

#### 结论

**保留，尤其作为 reviewer。** GLM-5.3 的审查证据仍是典型组合里最强的；Max 的 140,000 credits/周是否必要，需要按实际消耗核对。如果实际用量低于 60,000/周，Pro 更划算；如果经常打满 5 小时窗口，Max 的优先级和额度有意义。不要为了省 $88/月把审查主力降档，除非有替代审查模型。

### 4. 阿里云百炼 Qwen Coding Plan

#### 价格与档位

- Pro：$50/月（国际站）；国内 ¥200/月。新客首月有 ¥39.90 活动。
- Lite：¥40/月，已停止新购（2026-03-20 起），续费/升级也在 2026-04-13 停止。
- 来源：阿里云官方文档（https://www.alibabacloud.com/help/doc-detail/3023066.html，访问 2026-11-08；中文页 https://docs.bailian.console.aliyun.com/zh/model-studio/coding-plan-overview，访问 2026-11-08）。

#### 额度口径

- Pro：6,000 次/5 小时、45,000 次/周、90,000 次/月；三层同时生效，先到先停。
- 5 小时额度按滚动释放；周额度周一 00:00 UTC+8 重置；月额度按订阅日重置。
- 按“模型调用次数”计，不是用户提问次数；简单任务约 5–10 次调用，复杂任务 10–30+ 次。
- 官方明确禁止把套餐 key 用于自动化脚本、应用后端或其他非交互场景。

#### 模型与公开 benchmark

- 支持版本：qwen3.7-plus（视觉）、qwen3.6-plus（视觉）、kimi-k2.5（视觉）、glm-5、MiniMax-M2.5、qwen3.5-plus（视觉）。只支持列出的精确版本。
- Qwen3.7 Plus：AA v5 页面无分数；AA v4.1 聚合值约 23–26；SWE-bench Verified 77.7%，TB2.0 70.3%，LiveCodeBench v6 89.6%（https://generate.anotherwrapper.com/tools/llm-pricing/kimi-k2.7-code/qwen3.7-plus，https://genmagic.co/models/qwen-qwen3-7-plus，访问 2026-11-08）。
- 套餐里的 GLM-5、Kimi K2.5、MiniMax M2.5 都不是典型组合的 GLM-5.3 / Kimi K3.1 / MiniMax M3.1，代际偏低。Qwen3.7 Plus 本身也没有 AA v5 分数，不能证明“不低于该组合”。

#### API / 第三方客户端

- 官方支持 Claude Code、OpenCode、Cursor、Codex、Qwen Code、Cline、Kilo CLI、WorkBuddy 等；使用套餐专属 key 和 coding-intl 端点。
- 限制：非退款；仅限交互式编码工具；禁止自动化脚本、应用后端、非交互场景；个人使用，禁止共享；并发高时可能排队/限流；名额每日 00:00 UTC+8 补充。

#### 社区反馈

- V2EX「阿里云 Coding Plan 增加动态限流，频繁暂停无法使用」：Pro 用户频繁 429，套餐原本已有 5 小时/周限制，又叠加不透明动态限流，触发后暂停 1 小时；评论有人测算每小时约 200–300 请求即触发，也有人称被无理由封号（https://global.v2ex.com/t/1207731，访问 2026-11-08）。
- 阿里云开发者社区文章确认三层额度同时生效，短时集中调用会 429；建议降低并发（https://developer.aliyun.com/article/1755838，访问 2026-11-08）。
- 这些与官方“交互式使用、禁止脚本”的方向一致；对 Claude Code 子代理并行调用尤其不友好。

#### 结论

**不推荐替换。** 模型代际低于典型组合，动态限流和封号风险高，只适合当“打杂”通道。如果需要一个每月 90,000 次请求的廉价池，且能接受质量下降和限流，才考虑 Pro。

### 5. 火山方舟 Coding Plan

#### 价格与档位

- Lite：¥40/月；首购首月 ¥9.9；季付 ¥120。
- Pro：¥200/月；首购首月 ¥49.9；季付 ¥600。
- 来源：火山方舟模型价格页（https://ark.volcengine.com/docs/82379/2630943，访问 2026-11-08）。官方介绍文只给额度、不给价格（https://www.volcengine.com/article/37351，访问 2026-11-08）。

#### 额度口径

- Lite：约 1,200 次/5 小时、9,000 次/周、18,000 次/月。
- Pro：Lite 的 5 倍，约 6,000/5 小时、45,000/周、90,000/月。
- 按模型调用次数估算；一次提问可能触发 5–30 次调用，实际消耗高于提问数。
- 5 小时额度按首次请求时间周期刷新；周一 00:00 重置周额度；每月 1 日 00:00 重置月额度。
- 额度耗尽只等刷新，不消耗其他资源包或余额。

#### 模型与公开 benchmark

- 官方介绍页列出的模型：Doubao-Seed-2.0-Code、Doubao-Seed-Code、GLM-4.7、DeepSeek-V3.2、Kimi-K2.5；另有 Auto 智能调度。宣传页另称“最新支持 DeepSeek-V4 系列、GLM-5.3 系列”，与介绍页的模型表不一致，未核实哪个是当前实际路由。
- Doubao-Seed-2.0-Code：SWE-bench Verified 约 76.5，Terminal-Bench 2.0 约 55.8；这是聚合页/评测文章数字，且同页存在 52.0/61.8 的冲突版本（https://evolink.ai/blog/doubao-seed-2-0-review-benchmarks-pricing，https://www.ainchina.com/blog/china-ai-benchmark-war-caught-frontier-2026，访问 2026-11-08）。
- Terminal-Bench 4.0 没有找到可引用的 Doubao 成绩；不能拿 TB2.0 与典型组合的 TB4 直接比。

#### API / 第三方客户端

- 官方支持 Claude Code、Cursor、Cline、OpenCode、OpenClaw 等十余款工具；套餐额度跨工具共享。
- 明确限制：“仅在 AI 编程工具中生效，不可用于 API 直接调用”；主要适配个人开发场景，企业走模型 API。
- 经 Magpie 转发会被视为“API 直接调用”还是“AI 编程工具内使用”，条款没有写清；按字面，把套餐 key 接到通用网关的风险高于官方客户端直连。

#### 社区反馈

- 本次没有找到可引用的一手 V2EX/Reddit 讨论；只有官方介绍和第三方横评。第三方横评提到国内 Coding Plan 的共同问题是限流和禁用 API 化调用（https://forceinjection.github.io/09_inference_system/cost_analysis/coding_plan/coding_plan_report.html，访问 2026-11-08）。
- 因此火山方舟的社区证据是缺口，不能写成“稳定”或“不稳定”。

#### 结论

**不推荐替换。** 额度/价格比不错，但模型代际低于典型组合，模型表与宣传页冲突，且禁止 API 直调。只有在需要极低成本跑大量简单任务、并接受模型质量下降时才考虑 Lite/Pro。

### 6. 腾讯云 Coding Plan

#### 价格与档位

- Lite：¥40/月。
- Pro：¥200/月。
- 另有 CodeBuddy 个人版（IDE/插件订阅）：标准版 ¥99/月、高级版 ¥199/月、旗舰版 ¥999/月，和腾讯云 Coding Plan 不是同一个产品。
- 来源：腾讯云官方文档（https://cloud.tencent.com/document/product/1823/130092，访问 2026-11-08）；CodeBuddy 定价页（http://www.codebuddy.cn/docs/ide/Account/pricing，访问 2026-11-08）。

#### 额度口径

- Lite：约 1,200 次/5 小时、9,000 次/周、18,000 次/月。
- Pro：约 6,000 次/5 小时、45,000 次/周、90,000 次/月。
- 按模型调用次数计，不是用户提问次数；简单提示 5–15 次调用，复杂 15–30+ 次。
- 达到上限直接中断，不排队；额度按周期刷新。

#### 模型与公开 benchmark

- 官方只写 Auto（`tc-code-latest`），模型目录动态，不能保证某个模型永久可用；不支持多模态。
- 搜索页/第三方称含混元 HY 2.0 Instruct、GLM-5、Kimi-K2.5、MiniMax-M2.5/M2.7；这些不是官方文档的固定模型表，未核实当前实际路由（https://codingplan.org，访问 2026-11-08）。
- 没有可引用的 Terminal-Bench 4.0 或 AA v5 成绩；模型代际整体低于典型组合。

#### API / 第三方客户端

- 支持 Claude Code、CodeBuddy Code、OpenCode、Cline、Cursor、Codex、Kilo CLI、Kilo Code 等。
- 明确禁止：API 式访问；脚本、应用后端、非交互批量调用；账号共享。违规可暂停或封 key。
- 官方建议企业开发用独立的文本生成服务。

#### 社区反馈

- 一篇用户实测记录“隐形限流”：响应从 1 秒变 8 秒以上但不报错；高峰期输出质量下降，长代码退化成注释或残缺片段；多轮对话第三四轮上下文被截断；报错不返回 429，只给模糊 error report，几分钟后恢复（http://www.hqwc.cn/a/1845113.html，访问 2026-11-08）。
- 第三方横评称腾讯云更适合腾讯云/企业微信生态内开发者，长期高频使用需慎选（https://forceinjection.github.io/09_inference_system/cost_analysis/coding_plan/coding_plan_report.html，访问 2026-11-08）。
- 上述是社区/二手，不是受控测量；但“无明确 429、质量下降”与“动态调度”方向一致。

#### 结论

**不推荐。** 模型不固定、代际偏低、隐性限流和禁用 API 化调用；对 Claude Code 子代理并行场景不友好。除非已经在腾讯云生态内，否则没有理由替换典型组合。

### 7. Devin / Windsurf

#### 价格与档位

- Free：$0；轻量 agent 配额，模型可用性受限；无限 inline edits 和 Tab 补全。
- Pro：$20/月；更高配额、完整模型可用性、Devin Cloud、宣传“Free use of SWE-2”；额外用量按 API 价购买。
- Max：$200/月；显著更高配额。
- Teams：$80/月团队费 + $40/月/全职席位，最多 200 用户。
- Enterprise：定制。
- 来源：Devin 定价页（https://devin.ai/pricing，访问 2026-11-08）。

#### 额度口径

- 官方没有给 token、消息或 credits 数字；只说 Free “light quota”、Pro “increased quotas”、Max “significantly higher quotas”。
- Free/Pro/Max 额度按日/周刷新；每条消息的计费随模型、任务大小/难度、推理量变化。
- SWE-2 Flash：**免费至 2026-12-04 18:00 UTC**；之后 $0.10/M 输入、$0.01/M 缓存读、$0.125/M 缓存写、$0.50/M 输出；仅 Devin Desktop/CLI，不含 Devin Cloud；Flash Medium 在 Free 可用，High/Max 需付费。
- SWE-2：**self-serve 套餐在 Devin Desktop/CLI 内免费至 2026-11-30**；不含 Devin Cloud；之后 $3/M 输入、$15/M 输出、$0.30/M 缓存输入。Enterprise 另有折扣。
- 来源：Devin 模型文档（https://docs.devin.ai/desktop/models，https://docs.devin.ai/desktop/chat/models，访问 2026-11-08）。

#### 模型与公开 benchmark

- SWE-2 Flash：276B 总参数 / 12B 激活 MoE，基于 Thinking Machines 的 Inkling-Small 后训练；约 200 tok/s，官方称 3× 快、1/5 价格。
- 厂商自报：SWE-2 Flash / SWE-2 的 TB4 为 20.0 / 27.3；TB2.1 为 89.2 / 92.8；DeepSWE 1.1 为 60.1 / 73.0；FrontierCode 2.0 为 24.0 / 23.8；SWE-Bench Pro v2 Hard 为 89.9 / 90.6；ExploitBench 34.8 / 36.1。
- 对比：GLM-5.3 TB4 41.8、DeepSeek V4.1 Flash 42.3、Terra 49.5–50.3。SWE-2 系列在 TB4 上明显低于典型组合；FrontierCode 2.0 略高于 SWE-2，但仍是厂商自报。
- 来源：Cognition 发布文（https://cognition.com/blog/swe-2-flash，访问 2026-11-08）；OrcaRouter 分析（https://www.orcarouter.ai/zh-CN/blog/swe-2-flash-launch-access-and-claims，访问 2026-11-08）。OrcaRouter 指出所有数字都是厂商自报，未披露 harness、best-of-N 和上下文窗口。

#### API / 第三方客户端

- 只有 Devin Desktop 和 Devin CLI；SWE-2 Flash 明确“不在 Devin Cloud”；SWE-2 的免费也不含 Cloud。
- 没有公开的模型推理 API、模型 ID、按 token 的独立价格或权重下载。Devin 文档里的 “List Models API” 是账户模型管理接口，不是第三方推理端点。
- 因此不能接入 Claude Code、Magpie 或其他第三方客户端；条款也未提供第三方调用路径。是否允许外部自动化未核实，但技术上没有端点。

#### 社区反馈

- 没有找到一手 Reddit/Hacker News/V2EX 讨论；只有新闻稿和评测转述。Cognition 自报“打败所有美国开放权重模型”的说法被 OrcaRouter 收窄：领先的是更小的 Flint；对 616B 的 Muse Spark 仅领先 0.1；763B 的 DeepSeek 在 TB4 以 42.3 对 20.0 领先 SWE-2 Flash（https://www.orcarouter.ai/zh-CN/blog/swe-2-flash-launch-access-and-claims，访问 2026-11-08）。
- 免费窗口的结束日期有冲突：官方模型文档写 2026-12-04 18:00 UTC（https://docs.devin.ai/desktop/models）；Cognition 官方博客（https://cognition.com/blog/swe-2-flash，2026-11-04）写 "Free through 11/30"。两处都是一手来源，按较早的 11-30 做打算更稳（均访问 2026-11-08）。

#### 结论

**免费试用，不接入。** “免费”是真的，但范围仅限 Devin Desktop/CLI、时间有限、Free 档只给 Flash Medium；没有 API，无法进入 Claude Code/Magpie 工作流。质量也低于典型组合，所以不适合作为替换或补充后端。想评估 Devin 这个产品可以试，想补模型额度不值得。

### 8. Cursor / X Subscription（Grok）

#### 价格与档位

- Free $0；Plus $8/月；Premium $30/月；Super $100/月；Ultra $200/月。
- Teams $30+/用户/月；Enterprise 定制。
- 来源：Cursor 定价页（https://cursor.com/pricing，访问 2026-11-08）。页面写明“仅通过 X Subscription Corp 销售”，并显示 Cursor + Grok 共享用量池。

#### 额度口径

- 用量以相对标签表示：Plus “Basic”，Premium 4x Plus，Super 15x Plus，Ultra 50x Plus；没有绝对 token/请求数。
- 共享池覆盖 Cursor 和 Grok 的 Chat/Imagine/Voice/Bot；周刷新；用尽可买 top-up。
- API 用量单独按标准模型价计费，不占套餐池；第三方模型在 Premium 及以上按 list price 另计。

#### 模型与公开 benchmark

- Plus 仅 Grok 模型；Premium 及以上可用最新 Grok 和第三方模型。
- Grok 4.6 的 AA Coding Index 为 76.8（第三方镜像，https://llmbenchmark.ai/benchmarks/artificial-analysis-coding-index，访问 2026-11-08）；这是 Coding Index，不是 Intelligence Index，不能和 Terra 51/GLM 32 直接比。
- Cursor 本身不发布模型 benchmark；质量取决于所选模型。

#### API / 第三方客户端

- 套餐不含 Claude Code 或通用 API 额度；Grok API 另按标准价计费。Cursor 是 IDE/agent 客户端，不是 Claude Code 后端。
- 如果目标是“给 Claude Code 加额度”，这个套餐不满足硬条件；如果目标是换一个 IDE/agent 工作台，可以作为补充。

#### 社区反馈

- 本次没有找到可引用的一手社区讨论；定价页显示的是 2026-10-12 的 X Subscription 整合，旧 Cursor Pro/Pro+ 结构已被替换。第三方页面仍有旧结构，容易误读（https://x.ai/news/x-subscription，访问 2026-11-08）。
- 由于套餐刚整合，限流/稳定性证据不足，标为未核实。

#### 结论

**不推荐作 Claude Code 后端；可作 IDE 补充。** 它的价值在 Cursor/Grok 工作台，不在给 Claude Code 工作流加 API 额度。若用户愿意另开一个 IDE，Premium $30 的 4x Plus 比单独买 Cursor Pro 更划算；但对本任务的目标没有帮助。

### 9. GitHub Copilot

#### 价格与档位

- Free $0；Pro $10/月；Pro+ $39/月；Max $100/月。
- Business $19/席位/月；Enterprise $39/席位/月。
- 来源：GitHub 官方文档（https://docs.github.com/en/enterprise-cloud@latest/copilot/about-github-copilot/subscription-plans-for-github-copilot，访问 2026-11-08）。

#### 额度口径

- 2026-06-01 起改为 GitHub AI Credits：约 1 credit = $0.01。
- Pro：1,000 基础 + 500 flex = 1,500/月；Pro+：3,900 + 3,100 = 7,000/月；Max：10,000 + 10,000 = 20,000/月；Business 1,900/用户/月；Enterprise 3,900/用户/月。
- 补全免费；chat、agent、code review、CLI 消耗 credits；具体消耗随模型、上下文、请求类型变化。

#### 模型与公开 benchmark

- Pro/Pro+/Max 可用：Claude Haiku 4.5/5.5、Sonnet 5/5.5、Gemini 3.8 Flash、GPT-5.3-Codex、GPT-5.6 Luna/Terra、GPT-6 Luna、GPT-6.1 Terra、Grok 4.5/4.6/4.7、Kimi K3、MAI-Code-1.1-Flash 等。
- Pro+/Max 额外：Claude Opus 4.8/5/5.5、Fable 5/5.1、Gemini 4 Argon、GPT-5.6 Sol、GPT-6 Astra、GPT-6 Sol、GPT-6.1 Sol。
- 这是目前最便宜的“在订阅内接触 Terra/Astra”的入口之一；但模型只在 Copilot 客户端内可用，不能导出 API。

#### API / 第三方客户端

- 所有计划含 Copilot CLI 和 Copilot app；第三方 agent 在 Pro/Pro+/Max 可用。
- 官方文档没有给第三方客户端 API；Copilot 订阅不是通用模型 API。不能把 Copilot 的 Terra/Astra 额度接到 Claude Code 或 Magpie。
- 因此不满足硬条件；除非用户愿意把 Copilot CLI 作为另一个独立工具使用。

#### 社区反馈

- 2026-06-01 转 credits 后，大量用户抱怨额度消耗过快：Pro+ 用户两小时用掉 7,000 credits 的 8%，一次重构约 $6；有人一天内耗尽月度额度（https://www.ghacks.net/2026/06/02/github-copilot-usage-based-billing-takes-effect-drawing-developer-backlash-over-rapid-credit-depletion/，https://gigazine.net/gsc_news/en/20260603-github-copilot-credit-consumption/，访问 2026-11-08）。
- 这些是社区/媒体报道，不是受控测量；但“额度不可预测”是重复出现的主题。

#### 结论

**不满足硬条件，不推荐替换。** 如果只看“便宜接触 Terra/Astra”，Copilot Pro+ 很有吸引力；但它是封闭客户端，不能给 Claude Code 加额度。用户若愿意增加一个 Copilot CLI 工作流，可以作为补充；否则不解决当前问题。

### 10. Google Gemini / Antigravity

#### 价格与档位

- Google AI Plus：官方页价格字段为空；搜索摘要为 $7.99/月（2026-06-08 从 $7.99 调整的说法存在冲突）。
- Google AI Pro：$19.99/月；年付 $199.99。
- Google AI Ultra 5x：$99.99/月；Ultra 20x 价格字段为空（搜索摘要 $249.99 或 $289.98，区域差异）。
- 来源：Google One AI 计划页（https://one.google.com/intl/en_us/about/google-ai-plans，访问 2026-11-08）；价格空缺处用搜索摘要补，标为未核实。

#### 额度口径

- Antigravity 请求额度只给相对标签：Plus “Limited”、Pro “Expanded”、Ultra 5x “Higher”、Ultra 20x “Highest”；没有数字。
- Colab 计算单元：50/200/1,000/2,000 每月；Cloud credits：Pro $10/月、Ultra 5x $40/月、Ultra 20x $100/月。
- Gemini CLI 和 Gemini Code Assist 消费者入口自 2026-06-18 起停止服务；Google AI Pro/Ultra 用户被迁移到 Antigravity。官方 AI 计划页已不再列 Gemini CLI/Code Assist。
- 来源：Google One 页面（同上）；Gemini CLI 停服报道（https://digitalnerds.in/posts/google-antigravity-cli-replaces-gemini-cli-2026，访问 2026-11-08）。

#### 模型与公开 benchmark

- Gemini 4 Argon：AA v5 50，接近 Terra 51，高于 GLM/DeepSeek 32（AA v5 文章，访问 2026-11-08）。
- Gemini 3.8 Flash：AA v5 页未给；第三方称 41（AA v4.1 口径），低于 DeepSeek 45（https://the-decoder.com/minimax-m3-1-flash-shows-chinas-ai-price-race-has-no-floor-in-sight，访问 2026-11-08）。
- 质量本身不差，问题在接入方式，不在模型。

#### API / 第三方客户端

- 消费者订阅的 coding 入口是 Antigravity（桌面/CLI）；没有包含 Gemini API 额度。要用 Claude Code，需要单独的 Gemini API key，按量计费。
- 因此不满足硬条件；Antigravity 也不能把额度导出给 Magpie。

#### 社区反馈

- Gemini CLI 停服引发 backlash：原 Apache 2.0 项目约 10 万 star、6,000+ merged PR；Antigravity CLI 闭源、无 1:1 功能对齐；免费层每日请求从约 1,000 降到约 20，破坏 CI/CD 和脚本（https://vibe-coding.academy/news/2026-06-15-google-shuts-down-the-open-source-gemini-cli-on-june-18-pushing-devs-to-antigra，https://aibacon.net/posts/google-gemini-cli-sunset-antigravity-cli-june-18.html，访问 2026-11-08）。
- 这些是社区/媒体报道；官方只确认迁移，未确认“1,000→20”的具体数字。

#### 结论

**不满足硬条件，不推荐。** Gemini 4 Argon 的质量接近 Terra，但订阅不提供 API 额度，只能留在 Antigravity 里。若愿意另开 Antigravity 工作流，可以试用 Pro；对 Claude Code/Magpie 没有帮助。

### 11. Mistral

#### 价格与档位

- Free：$0；有限消息、搜索和编码会话。
- Pro：$14.99/月；含 $15/月 API credits；全 day coding（CLI/IDE/web）。
- Team：$24.99/用户/月；更高限额；$50/月 API credits（页面 “Users” 控件显示）。
- Enterprise：定制。
- 来源：Mistral 定价页（https://mistral.ai/pricing，访问 2026-11-08）。

#### 额度口径

- Pro/Team 标注 “Up to 6x free” 消息、“Up to 5x free” 搜索、“Up to 40x free” 图片；编码部分只说 “all-day coding” 和 fair use，没有公开请求/token 数字。
- Pro 的 $15/月 API credits 可以按 Devstral 2 的 API 价使用；超出后按量付费或 BYOK。
- 来源：Mistral 定价页；Mistral Vibe 2.0 公告（https://mistral.ai/news/mistral-vibe-2-0，访问 2026-11-08）。

#### 模型与公开 benchmark

- Devstral 2：123B dense，256K 上下文，$0.40/M 输入、$2.00/M 输出；Devstral Small 2：24B，Apache 2.0，$0.10/$0.30。
- 质量：AA Intelligence Index 8.6，Coding Index 31.3，TB4 0.0%，TB2.1 30.3%；Vals SWE-bench 62.8%，厂商自报 SWE-bench Verified 72.2%。来源：OpenRouter/AA 镜像（https://openrouter.ai/mistralai/devstral-2512/uptime，访问 2026-11-08）、Vals 镜像（https://openrouter.helicone.ai/mistralai/devstral-2512/providers，访问 2026-11-08）。
- 无论用哪个口径，都明显低于 GLM-5.3/DeepSeek/Terra；不适合作为质量不低于典型组合的候选。

#### API / 第三方客户端

- Vibe 运行在 web、CLI、IDE（VS Code/JetBrains）、iOS、Android；API 是 OpenAI 兼容，可用 BYOK 或 API credits。
- 技术上可以接 Claude Code（通过兼容层），但质量低；订阅额度主要给 Vibe，不给通用 Claude Code 池。
- 条款：Pro/Team 受 fair use 和 Mistral ToS 限制；学生价 $5.99/月，最长 12 个月。

#### 社区反馈

- 本次没有找到可引用的一手社区讨论；只有第三方价格汇总。限流/稳定性证据不足，标为未核实。

#### 结论

**不推荐。** 价格便宜、API 也便宜，但 Devstral 2 的质量远低于典型组合；$15 API credits 也撑不起大量 Claude Code 子代理。除非只需要一个很便宜的草稿模型，否则没有替换价值。

### 12. Anthropic Claude Code

#### 价格与档位

- Pro：$20/月；年付 $17/月（$200/年）。
- Max：$100/月；5x Pro。
- Ultra：$200/月；10x Pro 周额度，验证账户无 5 小时限制；含 $200/月 API credits。
- 来源：Claude 定价页（https://claude.com/pricing，访问 2026-11-08）。官方页面在 Max/Ultra 命名上不完全一致（有的写 Max 5x/Max 20x），这里按当前定价表写。

#### 额度口径

- 所有档位都是 5 小时 + 周窗口；Pro 1x、Max 5x、Ultra 10x 周额度；Ultra 对验证账户取消 5 小时限制。
- 限额随模型、对话长度、文件大小变化；官方没有给绝对 token/请求数。
- Max 含 $100/月 API credits；Ultra 含 $200/月。

#### 模型与公开 benchmark

- Opus 5.5 AA v5 58（#1 档），高于 Terra 51、GLM/DeepSeek 32；Sonnet 5.5、Fable 5.1 等也在前列（AA v5 文章，访问 2026-11-08）。
- Claude Code 原生支持子代理、hooks、MCP 等；这是 Claude Code 原生工作流的路径。

#### API / 第三方客户端

- Claude Code 包含在 Pro 及以上；这是第一方客户端，不存在“第三方接入”问题。
- API 另计；订阅的 API credits 可用于 API 调用，但不能把订阅额度直接当通用 API 池。

#### 社区反馈

- 不是本次调研重点；未收集。价格/额度以官方页为准。

#### 结论

**质量兜底，非性价比。** 如果目标是“模型质量不低于典型组合”，Opus 5.5 是最稳的；但 $100/$200 的月费换来的额度未必比典型组合大，且 Claude Code CLI 本身已经可用。适合作为质量优先时的替换或兜底，不适合作为“额度大、性价比高”的答案。

### 13. OpenAI ChatGPT / Codex

#### 价格与档位

- Plus：$20/月；Pro：从 $100/月起（FAQ 提到 $100 和 $200 两档）；Business/Enterprise 另计。
- Codex 包含在 Free/Go/Plus/Pro/Business/Enterprise 中。
- 来源：Codex 定价页（https://www.chatgpt.com/codex/pricing，访问 2026-11-08）。

#### 额度口径

- Plus/Standard Business 的 Codex 额度按模型给区间：GPT-6.1 Sol 15–160、GPT-6 Astra 5–45、GPT-6 Sol 15–150、GPT-6 Luna 350–3,000、GPT-5.6 Sol 10–100、GPT-5.6 Luna 250–2,000、GPT-5.5 15–80；单位未在页面写明。
- 本地消息和 cloud chats 共享额度；周限额可能叠加。
- API 另按量计费；订阅不含通用 API 额度。

#### 模型与公开 benchmark

- Sol/Astra 的 AA v5 为 55/57，高于 Terra 51；Codex 是高质量编码入口。
- 但 Terra 不在 Codex 的额度表里；若经第三方中转使用 Terra，Codex 不能直接替代这个路由。

#### API / 第三方客户端

- Codex CLI/IDE/云；API key 另计。不是 Claude Code 的额度来源。
- 如果用户愿意把 Codex 作为第二工作流，Plus $20 可以考虑；但不能把额度接到 Claude Code/Magpie。

#### 社区反馈

- 未收集；本次重点是订阅额度与接入，不是 Codex 质量。

#### 结论

**质量高，但不解决第三方额度。** 适合作为独立 Codex 工作流或质量对照，不适合替换典型 Claude Code 组合的额度来源。

### 14. 免费/低价入口

#### OpenRouter 免费模型

- 免费模型 20 请求/分钟、50 请求/天；一次性充值 $10 后 1,000 请求/天。
- 当前免费模型包括 Nemotron 3 Ultra（AA 约 22.9）、Crouton Alpha、Gemma 4 等；多数免费端点会拿提示训练，只有 Xing4.0 例外。
- 来源：OpenRouter 免费模型集合（https://openrouter.ai/collections/free-models，访问 2026-11-08）、llmperks（https://llmperks.com/openrouter，访问 2026-11-08）、TeamDay（https://www.teamday.ai/blog/best-free-openrouter-models-coding-2026，访问 2026-11-08）。
- 结论：**不推荐生产**。50/天对编码 agent 太紧；1,000/天需要先充值，且模型质量低于典型组合。可以作为离线/低风险任务的免费备胎。

#### Kilo 免费 MiniMax M3.1 Flash

- Kilo 宣布 MiniMax M3.1 Flash 限时免费；1M 上下文；Kilo 代码 agent 榜约 #73。
- 来源：Kilo 公告（https://blog.kilo.ai/p/minimax-m31-flash-is-free-in-kilo，访问 2026-11-08）、模型页（https://kilo.ai/models/minimax-minimax-m3-1-flash-free，访问 2026-11-08）。
- 结论：**免费试玩，不依赖**。没有结束日期，随时可能收费；Kilo 是独立客户端，不是 Claude Code 的额度来源。适合评估 M3.1 Flash 的实际手感。

## 未核实项和风险

### 价格与额度

- GLM、MiniMax、Kimi 的部分价格页是 JS 渲染，直接抓取只返回导航或空表；本文件的价格来自同一官方 URL 的搜索摘要，已标注。购买前必须在结账页复查。
- Kimi 的周额度口径冲突：会员文档说新套餐取消周限额，产品介绍页说周额度每 7 天刷新；按档位的具体请求数未公布。300–1,200 是区间，不是每档固定值。
- MiniMax 未公布绝对 token/请求数；第三方估算的 1.7B/5.1B/12.5B tokens/月是推算，不是官方。
- GLM 的 Max $168/$117.60、Pro $80/$56、Lite $18/$12.6 来自搜索摘要；官方文档只确认 credits。credits 公式和倍率来自第三方转述，未在官方页逐项核对。
- 火山方舟的模型表存在冲突：官方介绍页列 Doubao-Seed-2.0-Code、Doubao-Seed-Code、GLM-4.7、DeepSeek-V3.2、Kimi-K2.5；宣传页称最新支持 DeepSeek-V4、GLM-5.3。当前实际路由未核实。
- 腾讯云只写 Auto，模型目录动态；第三方列的混元/GLM/Kimi/MiniMax 不是官方固定表。
- Google AI Plus、Ultra 20x 的价格字段为空；$7.99/$249.99 来自搜索摘要，区域差异大。
- OpenAI Codex 的额度单位未写明；不同模型的区间不能直接换算成请求数。
- Cursor/X Subscription 的整合细节（xAI 是否收购 Cursor）未在页面声明；只能写“Cursor + Grok 共享用量池，由 X Subscription Corp 销售”。

### Benchmark 口径

- AA v5.0.1 只覆盖部分候选：Terra 51、GLM-5.3 32、DeepSeek V4.1 Flash 32、Kimi K3.1 Pro 46、Gemini 4 Argon 50、Claude Opus 5.5 58。Kimi K2.7 Code、MiniMax M3.1、Qwen3.7 Plus、Grok、Devstral 没有 v5 分数或页面 N/A。
- Kimi K2.7 Code 的 AA v4.1 42、MiniMax M3.1 的 42、DeepSeek 的 45 是同一版本（v4.1）的口径；不能和 v5 的 32/51 直接相减。v4 与 v5 的评测集和权重不同。
- Terminal-Bench 4.0 的分数来自不同 harness（Claude Code、Codex、Grok Build、mini-SWE-agent）和不同 effort；GLM-5.3 41.8 是独立榜，Kimi K3.1 Pro 65.7、SWE-2 27.3、DeepSeek 42.3 是厂商自报。不能把它们当成同一场比赛。
- MiniMax M3.1 的 TB4 有 25.8（独立）和 38.1（厂商）两个版本；本文件优先用独立值，但保留两者。
- SWE-bench Verified 的 95.4（GLM-5.3，Vals 补丁生成）和 78.2（Kimi K2.7 Code）不是同一 harness；不能直接说“GLM 比 Kimi 高 17 分”。
- AA Coding Index（GLM-5.3 74.8、Grok 4.6 76.8）与 AA Intelligence Index（32/51）是不同指标；不要混用。

### 条款与合规

- **GLM**：官方允许 Claude Code，但条款明确禁止 proxy/aggregate/第三方集成和账号共享。本地 Magpie 网关是否构成“proxy to third party”没有明确判例；按字面风险较高。但换套餐时不能忽略。
- **Kimi**：官方支持 Claude Code 直连；社区准则禁止伪造/篡改客户端身份、禁止转售。经 Magpie 转发是否属于“篡改身份”未明确；官方还明确说代理协议转换可能引起效果波动。建议直连 Kimi 端点，或至少保留直连回退。
- **MiniMax**：官方支持 Claude Code，M Plan Key 与按量 Key 分离；未发现明确反代理条款，但仅限个人交互式使用，生产要按量。
- **阿里云/火山/腾讯**：都禁止 API 直调、脚本、后端、非交互批量；Claude Code 直连是支持的，但经通用网关转发可能被判定为 API 化调用。阿里云还有未披露的动态限流和封号个案。
- **Devin**：只有官方客户端，没有推理 API；不存在“在 Claude Code 中使用”的合规路径。
- **Copilot/Cursor/Google**：订阅额度绑定自家客户端，没有通用 API；不存在第三方接入路径。
- **Anthropic/OpenAI**：订阅和 API 分开；Claude Code/Codex 原生可用，API 另计。

### 社区证据的局限

- GLM、阿里云、腾讯云的限流/降智/封号是个案，样本和口径不明；不能推出“所有用户都会遇到”。
- Kimi 的“47 分钟打满 5 小时”是评测文章转述，未见原始帖；MiniMax 的“4 个任务打满”是个人实测；两者都不能当统计结论。
- Devin、Cursor/X、Mistral、火山方舟没有找到一手社区讨论；相关“稳定性”判断只能标未核实。
- Copilot 的 credits 抱怨有多个媒体来源，但具体消耗随任务变化；不能用一个案例推算月度成本。

### 尚未回答的问题

- Kimi Code Plus 的 5 小时额度到底是 300 还是更高？官方没有按档位公布；需要看购买页/控制台，或用实际任务测。
- GLM Max 的 140,000 credits/周对多模型工作流是否必要？需要统计实际 credits 消耗；本文件没有真实用量数据。
- MiniMax Go 的 1x 额度能否支撑 Claude Code 子代理的并行调用？官方没有绝对数字；社区实测偏紧。
- 火山方舟当前实际路由是否已升级到 GLM-5.3/DeepSeek-V4？官方介绍页与宣传页冲突。
- 各平台对“本地网关”的判定标准；条款只给原则，没有可验证的执行口径。
- 2026-11 之后价格/额度是否还会变；本文件是当日快照。

## 主要来源

### 官方定价、文档与条款

- Kimi K2.7 Code 定价：https://www.kimi.ai/resources/kimi-k2-7-code-pricing
- Kimi K2.7 Code 产品页：https://www.kimi.ai/resources/kimi-k2-7-code
- Kimi Code 会员文档：https://www.kimi.com/code/docs/en/kimi-code/membership
- Kimi Code 产品介绍（额度区间）：https://www.kimi.ai/resources/kimi-code-introduction
- Kimi Claude Code 接入：https://www.kimi.com/code/docs/third-party-tools/claude-code
- Kimi Code 社区准则：https://www.kimi.com/en/help/kimi-code/community-guidelines
- Kimi K3.1 Pro 快速开始：https://platform.moonshot.ai/docs/guide/kimi-k3-1-pro-quickstart
- MiniMax M Plan：https://minimax.io/m-plan
- MiniMax M Plan FAQ：https://platform.minimax.io/docs/m-plan/faq
- MiniMax M Plan 文档：https://platform.minimax.io/docs/m-plan
- GLM Coding Plan 总览：https://docs.z.ai/devpack/overview
- GLM Coding Plan 中文总览：https://docs.bigmodel.cn/cn/coding-plan/overview
- GLM Coding Plan 订阅页：https://z.ai/subscribe
- GLM Usage Policy：https://docs.z.ai/devpack/usage-policy
- GLM 订阅条款：https://docs.z.ai/legal-agreement/subscription-terms
- 阿里云 Coding Plan（国际）：https://www.alibabacloud.com/help/doc-detail/3023066.html
- 阿里云 Coding Plan（中文）：https://docs.bailian.console.aliyun.com/zh/model-studio/coding-plan-overview
- 火山方舟模型价格：https://ark.volcengine.com/docs/82379/2630943
- 火山方舟 Coding Plan 介绍：https://www.volcengine.com/article/37351
- 腾讯云 Coding Plan：https://cloud.tencent.com/document/product/1823/130092
- CodeBuddy 定价：http://www.codebuddy.cn/docs/ide/Account/pricing
- Devin 定价：https://devin.ai/pricing
- Devin 模型文档：https://docs.devin.ai/desktop/models
- Devin 模型文档（Chat）：https://docs.devin.ai/desktop/chat/models
- Cognition SWE-2 Flash：https://cognition.com/blog/swe-2-flash
- Cursor 定价：https://cursor.com/pricing
- X Subscription：https://x.ai/news/x-subscription
- GitHub Copilot 计划：https://docs.github.com/en/enterprise-cloud@latest/copilot/about-github-copilot/subscription-plans-for-github-copilot
- Google AI 计划：https://one.google.com/intl/en_us/about/google-ai-plans
- Mistral 定价：https://mistral.ai/pricing
- Mistral Vibe 2.0：https://mistral.ai/news/mistral-vibe-2-0
- Claude 定价：https://claude.com/pricing
- Codex 定价：https://www.chatgpt.com/codex/pricing

### 独立榜单与评测

- AA Intelligence Index v5：https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5
- AA Kimi K2.7 Code：https://artificialanalysis.ai/models/kimi-k2-7-code
- AA Qwen3.7 Plus：https://artificialanalysis.ai/models/qwen3-7-plus
- Terminal-Bench 4.0 榜单：https://snorkel.ai/leaderboard/terminal-bench-4-0/
- AA Coding Index 镜像：https://benchlm.ai/benchmarks/aacodingindex
- Macroscope 代码审查：https://macroscope.com/content/ai-code-review-benchmark-best-models
- Qodo 代码审查：https://www.qodo.ai/blog/which-llm-should-review-your-code/
- Kimi K2.7 Code benchmarklist：http://www.benchmarklist.com/models/moonshotai-kimi-k2.7-code
- Devstral 2 AA/OpenRouter：https://openrouter.ai/mistralai/devstral-2512/uptime
- Devstral 2 Vals 镜像：https://openrouter.helicone.ai/mistralai/devstral-2512/providers

### 社区与二手评测

- V2EX GLM 限流：https://www.v2ex.com/t/1187116
- 避雷 GLM：https://www.locdd.com/t/topic/36776
- V2EX 阿里云动态限流：https://global.v2ex.com/t/1207731
- 腾讯云隐形限流：http://www.hqwc.cn/a/1845113.html
- Kimi 评测（47 分钟额度）：https://www.eesel.ai/blog/kimi-k3-1-pro-review
- Kimi 评测（300–1,200 次）：https://pureailabs.com/ai-coder/kimi-code-review/
- MiniMax 评测（Go 不够）：https://iadecider.com/articles/minimax-code-review
- MiniMax 实测：https://www.toutiao.com/article/7704952734885085746/
- Copilot credits 反弹：https://www.ghacks.net/2026/06/02/github-copilot-usage-based-billing-takes-effect-drawing-developer-backlash-over-rapid-credit-depletion/
- Gemini CLI 停服：https://vibe-coding.academy/news/2026-06-15-google-shuts-down-the-open-source-gemini-cli-on-june-18-pushing-devs-to-antigra
- Kilo 免费 MiniMax：https://blog.kilo.ai/p/minimax-m31-flash-is-free-in-kilo
- OpenRouter 免费模型：https://openrouter.ai/collections/free-models

以上 URL 均在 2026-11-08 访问。搜索摘要来源（z.ai、minimax.io/m-plan、agentplans、Kimi membership 等）已在正文标注，未逐页读取表格的已写明。
