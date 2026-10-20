# 2026-10-20 热门编码 / agent 编排模型调研

## 取样方法与日期

- 主要来源：用户指定 models.dev 为主要来源，取样日期 2026-10-20。模型 ID、档位定位、定价量级、上下文与能力标签（tool_call / reasoning / 多模态输入）以 models.dev 的 `https://models.dev/api.json` 为准。
- 官方页面只用于核对存疑项：Anthropic `platform.claude.com/docs/en/models/overview`、OpenAI `developers.openai.com/api/docs/models` 与 `learn.chatgpt.com/docs/models`、Google `ai.google.dev/gemini-api/docs/models` 与 `/pricing`、DeepSeek `api-docs.deepseek.com/quick_start/pricing`、智谱 `docs.z.ai/guides/overview/pricing`、Moonshot `platform.kimi.ai/docs/pricing/chat`、MiniMax `platform.minimax.io/docs/guides/pricing`、阿里云 `alibabacloud.com/help/en/model-studio/billing-for-model-studio`。
- 热度只作辅助取样：OpenRouter `openrouter.ai/rankings`（Artificial Analysis Intelligence Index 榜，数据截至 2026-10-19）、`openrouter.ai/models?order=trending`、`openrouter.ai/api/v1/models`。只作取样记录，不作能力结论。
- 价格均为每百万 token 的公开美元标价；DeepSeek 官方页以人民币计价，已在行内标注。星数、点赞、热度数值只作取样记录。

## 各厂商当前模型

### Anthropic

- `claude-fable-5-1` | 旗舰（最难推理 / 长时 agent） | 官方定位 demanding reasoning and long-horizon agentic work，1M 上下文、128K 输出，最慢档 | $10 输入 / $50 输出
- `claude-opus-5-5` | 旗舰（主力） | 官方定位 long-running agentic coding and knowledge work，建议多数负载首选，1M 上下文 | $4 输入 / $20 输出
- `claude-sonnet-5-5` | 均衡 | 官方称"速度与智能的最佳组合"，Fast 档，1M 上下文 | $2 输入 / $10 输出
- `claude-haiku-5-5` | 快速 | 官方称 Fastest，用于分类、抽取、路由等高吞吐低延迟任务，1M 上下文 | $0.10 输入 / $0.50 输出 起
- `claude-opus-5` / `claude-sonnet-5` / `claude-fable-5` | 上一代（官方列为 legacy，仍可用） | 上代同线能力 | $5/$25、$2/$10、$10/$50

### OpenAI
- `gpt-6-astra` | 旗舰 | 官方"最强模型，用于最难的工作"，1.05M 上下文、128K 输出，工具含 Functions / Web search / File search / Computer use | $10 输入 / $50 输出
- `gpt-6.1-sol` | 均衡（困难实现主力） | 官方推荐复杂编码与 agent 流程，措辞为"接近 Astra 的表现、更低成本"，推理档 low/medium/high/xhigh/max | $2 输入 / $10 输出
- `gpt-6-luna` | 快速便宜 | 官方"最高效模型，适合聚焦与高吞吐任务"，推理支持 none 档 | $0.10 输入 / $0.50 输出
- `gpt-6-sol` | 上一代 Sol | Codex 页把它列为 `gpt-5.4` 的替换目标 | $2 输入 / $10 输出
- `gpt-5.6-cyber` | 专用（安全） | 官方仅面向授权漏洞研究与安全测试 | 官方页未标价
- Codex 系现状：当前 Codex CLI 可选 `gpt-6-astra`、`gpt-6.1-sol`、`gpt-6-luna`；带 `-codex` 后缀的 `gpt-5.3-codex`、`gpt-5.3-codex-spark` 已弃用或退役（codex-spark 于 2026-09-14 退役）。

### Google Gemini

- `gemini-4-argon` | 旗舰 | Gemini 4 旗舰推理模型，1M 上下文；官方定价页标注 2026-11-30 后输入涨到 $4、输出涨到 $20 | $2 输入 / $10 输出
- `gemini-3.8-flash` | 均衡 | 3.x 当前主力 Flash，Fast，1M 上下文，Free 层免费 | $0.75 输入 / $3.75 输出
- `gemini-3.6-flash` | 快速 | 与 3.8 Flash 同定价，1M 上下文 | $0.75 输入 / $3.75 输出
- `gemini-3.1-pro-preview` | 均衡（预览） | Pro 档，按提示长度分档计价 | $2 输入（≤200K）/ $12 输出
- `gemini-3.1-flash-lite` | 快速便宜 | 轻量高吞吐，1M 上下文 | $0.25 输入 / $1.50 输出
- 别名 / 预览：`gemini-flash-latest`、`gemini-3-flash-preview`、`gemini-3.1-flash-lite-preview`

### DeepSeek

- `deepseek-v4-pro` | 旗舰 | 1M 上下文，工具调用、JSON 输出、Responses API、Anthropic API 全支持；官方注明不支持图像理解 | 官方人民币：缓存未命中 ¥4.5 / 输出 ¥13.5（高峰时段翻倍）；models.dev 折算 $0.66 输入 / $1.98 输出
- `deepseek-flash` | 快速便宜 | 由 DeepSeek-V4.1-Flash-1017 提供，支持视觉理解，1M 上下文，并发上限 2500（v4-pro 为 500） | 官方人民币：缓存未命中 ¥1 / 输出 ¥4（高峰翻倍）；models.dev $0.15 输入 / $0.60 输出
- 退役别名 `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍可请求，但转发到 V4.1-Flash-1017 并按 Flash 价计费。

### 智谱 GLM

- `glm-5.3` | 旗舰 | 1M 上下文、128K 最大输出；官方文档写明推理强制开启（`thinking.type` 仅接受 enabled），`reasoning_effort` 取 low/high/max，默认 max；仅文本输入 | 官方 $1.4 输入 / $4.4 输出（缓存输入 $0.26）
- `glm-5.3-flashx` | 中间档 | Flash 的加强变体，多模态输入（text/image/video/pdf），1M 上下文 | 官方 $0.37 输入 / $1.25 输出
- `glm-5.3-flash` | 快速便宜 | 多模态输入，1M 上下文 | 官方 $0.15 输入 / $0.50 输出（缓存 $0.03）
- `glm-5.2` | 上一代旗舰 | 官方定价与 5.3 相同 | $1.4 输入 / $4.4 输出
- `glm-5.3-prime` | 未确认 | 仅见于 OpenRouter 模型列表；官方定价页与 GLM-5.3 文档均未列出该 ID | OpenRouter 列表 $2.8 输入 / $8.8 输出

### Moonshot Kimi

- `kimi-k3` | 旗舰 | 1,048,576 上下文，多模态输入；K3 系缓存写入按 5 分钟 / 1 小时分级计费 | $3 输入 / $15 输出
- `kimi-k2.7-code` | 编码向 | 专门的 code 型号，262,144 上下文 | $0.95 输入（缓存命中 $0.19）/ $4 输出
- `kimi-k2.7-code-highspeed` | 编码向高速 | 同代高速通道，输出更快 | $1.90 输入 / $8 输出
- `kimi-k2.6` | 通用 | 262,144 上下文 | $0.95 输入 / $4 输出

### MiniMax

- `MiniMax-M3` | 均衡 | 1M 上下文，多模态；输入 ≤512K 与 >512K 分档，priority 档为标准价 1.5 倍 | $0.30 输入 / $1.20 输出（≤512K）；>512K 时 $0.60 / $2.40
- `MiniMax-M3.1-Flash` | 快速便宜 | 1M 上下文，多模态（text/image/video），官方当前文本模型里的低价档 | $0.15 输入 / $0.60 输出（缓存读 $0.015）
- `MiniMax-M2.7` / `MiniMax-M2.7-highspeed` | 上一代 | 204,800 上下文 | $0.30/$1.20 与 $0.60/$2.40

### 阿里 Qwen
- `qwen3.8-max` | 旗舰 | 1M 上下文，多模态输入（text/image/video/pdf）；OpenRouter 智力指数榜第 4 | 新加坡区 $2 输入 / $6 输出（另有快照 `qwen3.8-max-0902`）
- `qwen3.7-plus` | 均衡 | 1M 上下文，按单请求输入长度分档；等价于快照 `qwen3.7-plus-2026-05-26` | $0.4 输入 / $1.6 输出（≤256K）；$1.2 / $4.8（>256K）
- `qwen3.8-flash` | 快速 | 1M 上下文，多模态 | $0.15 输入 / $0.47 输出
- `qwen3.7-flash` | 超快 | 1M 上下文，三档计价；等价于快照 `qwen3.7-flash-2026-07-15` | $0.03 输入 / $0.13 输出（≤32K）
- `qwen3-coder-plus` | 编码向（较早） | 1M 上下文，2025-07 发布 | $1 输入 / $5 输出

## 热度取样记录

- OpenRouter Artificial Analysis Intelligence Index 前 10（数据截至 2026-10-19）：`anthropic/claude-opus-5.5-20260921`、`anthropic/claude-sonnet-5.5-20260928`、`anthropic/claude-fable-5.1-20260831`、`qwen/qwen3.8-max-20260803`、`openai/gpt-6-astra-20260903`、`google/gemini-4-argon-20261013`、`openai/gpt-6.1-sol-20260929`、`anthropic/claude-opus-5-20260723`、`anthropic/claude-5-fable-20260609`、`meta/muse-spark-1.3-20260902`。
- OpenRouter trending 列表前两位为 `minimax/minimax-m3.1-flash:free`（1.48T tokens）与 `deepseek/deepseek-v4.1-flash-1017`（8.05T tokens）；`api/v1/models` 默认返回顺序前两位相同。页面未标统计周期，两条数值仅作取样记录。注意 `:free` 是该站自身的免费档后缀，不是官方模型名的一部分；公开模型名是 `MiniMax-M3.1-Flash`。

## 与 README 现表的写法对照

现表的私有路由名 → 公开完整模型名：`MiniMax-free` → `MiniMax-M3.1-Flash`；`DeepSeek-free` → `deepseek-flash`（DeepSeek-V4.1-Flash-1017）；`GLM-5.3` → `glm-5.3`；`GPT-6.1 Sol` → `gpt-6.1-sol`；`GPT-6 Astra` → `gpt-6-astra`；`Gemini-3.8-Flash` → `gemini-3.8-flash`。

## 按五类分工的候选池建议

**常规实现**（日常改代码、补测试、重构：先快和省，再看质量）

1. `MiniMax-M3.1-Flash` — $0.15/$0.60、1M 上下文，日常实现性价比最高。
2. `deepseek-flash` — 同价位，支持视觉与工具调用，并发上限最高。
3. `glm-5.3` — 贵一档（$1.4/$4.4）但工程实现质量更稳，适合质量敏感的日常改动。
4. `MiniMax-M3` — 同厂更强一档（$0.30/$1.20），不想升级到困难档时的折中。
5. `gemini-3.8-flash` — $0.75/$3.75、1M 上下文且多模态，要看截图或界面时用它。
6. `qwen3.8-flash` — $0.15/$0.47，最低成本的兜底。

**困难实现**（跨模块、难啃或高风险改动：先能力，再上下文与 agent 稳定性）

1. `gpt-6.1-sol` — 官方明确推荐用于复杂编码与 agent 流程，$2/$10 是"近 Astra 表现、更低成本"的档位。
2. `claude-opus-5-5` — 官方定位长时间 agent 编码，1M 上下文，$4/$20。
3. `kimi-k3` — 1,048,576 上下文，$3/$15，长仓库或长文档场景性价比突出。
4. `gpt-6-astra` — 官方最强模型，$10/$50，留作前一档仍不够时的最后一档。
5. `claude-fable-5-1` — 官方用于最难推理与长时 agent，$10/$50，同价位下比 Astra 更偏长链推理。

**独立复核**（换独立上下文只审不改：能力优先，尽量与实现方不同厂商）

1. `gpt-6.1-sol` — 强度与成本平衡最好，适合做默认复核档。
2. `gpt-6-astra` — 最强复核，成本最高，用于高风险改动。
3. `claude-opus-5-5` — 与 OpenAI 系不同族，复核视角更独立。
4. `glm-5.3` — 第三厂商，$1.4/$4.4，成本敏感的复核档。
5. `kimi-k2.7-code` — 编码专用复核，$0.95/$4。

**资料调研**（带来源的检索与调查：先快、便宜、上下文大）

1. `MiniMax-M3.1-Flash` — $0.15/$0.60、1M 上下文，抓取整理长资料性价比最高。
2. `deepseek-flash` — 同价位，支持视觉与工具调用。
3. `gemini-3.8-flash` — 联网与多模态检索强，$0.75/$3.75。
4. `qwen3.7-flash` — $0.03/$0.13，量大时用。
5. `gemini-3.1-flash-lite` — $0.25/$1.50，轻量高吞吐。
6. `glm-5.3-flash` — $0.15/$0.50，多模态输入。

**文字与审美**（文案润色、界面审美反馈：先多模态与响应速度）

1. `gemini-3.8-flash` — 官方当前主力 Flash，多模态输入（text/image/video），速度快。
2. `gemini-3.1-flash-lite` — 最快最便宜的一档，适合大量短文案。
3. `glm-5.3-flash` — 原生视觉输入，$0.15/$0.50。
4. `MiniMax-M3.1-Flash` — 支持 image/video 输入，$0.15/$0.60。
5. `qwen3.8-flash` — 多模态输入，$0.15/$0.47。
6. `gpt-6-luna` — $0.10/$0.50，高吞吐纯文本润色。

排序理由总述：常规实现与资料调研按"价格→速度"排，因为量大且单任务失败代价低；困难实现与独立复核按"能力→上下文长度→价格"排，因为失败代价高；文字与审美按"多模态输入→速度"排，因为需要看图。

## 来源链接

- 主要来源 models.dev：https://models.dev/api.json （站点 https://models.dev/）
- Anthropic：https://platform.claude.com/docs/en/models/overview ，https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- OpenAI：https://developers.openai.com/api/docs/models ，https://learn.chatgpt.com/docs/models
- Google：https://ai.google.dev/gemini-api/docs/models ，https://ai.google.dev/gemini-api/docs/pricing
- DeepSeek：https://api-docs.deepseek.com/quick_start/pricing ，https://api-docs.deepseek.com/zh-cn/quick_start/pricing
- 智谱：https://docs.z.ai/guides/overview/pricing ，https://docs.z.ai/guides/llm/glm-5.3
- Moonshot：https://platform.kimi.ai/docs/pricing/chat
- MiniMax：https://platform.minimax.io/docs/guides/pricing
- 阿里云：https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio ，https://www.alibabacloud.com/help/en/model-studio/getting-started/models
- OpenRouter：https://openrouter.ai/rankings ，https://openrouter.ai/models?q=&order=trending ，https://openrouter.ai/api/v1/models

## 事实风险与未确认项

1. models.dev 的 `zai/glm-5.3` 记 $0.079 输入 / $1.4 输出，与智谱官方 $1.4 / $4.4 不一致（疑为路由或折扣价）。写表应以官方价为定价来源。
2. `glm-5.3-prime` 只在 OpenRouter 模型列表出现，官方定价页与 GLM-5.3 文档均未列出，未确认能否直接调用。
3. Anthropic 官方定价页脚注提到 "Claude Mythos 5.1"，但模型总览表与 models.dev 均未给出其模型 ID，未查到该 ID。
4. DeepSeek 官方价以人民币计价，models.dev 给美元折算值，两者不可直接混排；高峰时段价是空闲时段的两倍。
5. OpenAI 官方模型目录页本次未列出 `gpt-5.6`、`gpt-5.6-terra`、`gpt-5.6-luna`（models.dev 有记录），因此未纳入候选池。
6. `gemini-3.1-pro-preview`、`gemini-3-flash-preview` 为预览 ID；Google 说明 `latest` 别名会在发新版时被替换（提前 2 周通知），故别名类名称不宜写进长期表格。
7. 热度只取到 OpenRouter 一个平台，trending 列表未标统计周期，未做多平台交叉验证；模型相对热度不能当作能力结论。
8. OpenRouter slug 与厂商官方 ID 写法不同（如 `anthropic/claude-opus-5.5` 对应官方 `claude-opus-5-5`）。README 表格建议一律写官方 ID，避免再出现本地网关的私有路由名。
9. 未查到：Qwen 新的编码向旗舰（`qwen3-coder-plus` 仍是 2025-07 版本）；Anthropic 有独立的编码专用型号（Opus/Sonnet/Fable/Haiku 均覆盖编码）。
