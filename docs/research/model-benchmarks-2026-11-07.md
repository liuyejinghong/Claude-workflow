# 2026-11-07 子代理模型评分与岗位适配归档

这份文档归档 2026-11-07 对当前可用子代理模型的评分、社区反馈、本地实测和岗位适配判断，供后续复查与重新评估。它是**当日快照**，不是默认推荐，也不保证外部榜单、价格或路由仍然有效。

## 范围与结论

- 评估对象：`gpt-6.1-terra`（第三方中转）、`deepseek-v4.1-flash`（DeepSeek-V4.1-Flash-1017）、`glm-5.3`、`glm-5.3-flash`。
- 对照对象：`gpt-6.1-sol`、`gpt-6-astra`（已停用，仅保留评分对照）。
- 当日角色卡：worker / engineer 以 Terra 为首选、DeepSeek 第二、GLM-5.3 第三；reviewer 以 GLM-5.3 首选、DeepSeek 第二；researcher 以 DeepSeek 首选、GLM-5.3 第二；editor 以 GLM-5.3 首选、DeepSeek 第二；GLM-5.3-Flash 全部 priority 0。
- 结论：GLM-5.3-Flash 没有通用岗位位置，维持停用；唯一可考虑的窄位是 researcher 的图片/文档抽取备用（priority 3，必须人工复核、不得无人值守）。DeepSeek 适合执行与调研，GLM-5.3 适合审查与中文，Terra 适合困难实现。

## 证据等级与版本约定

- `vendor`：厂商自报或官方文档，未经独立复现。
- `third_party`：独立榜单、论文或受控评测；仍需注意 harness、effort 和样本量。
- `community`：GitHub issue、论坛、个人实测；只作方向性证据，必须写清 harness 和版本。
- `local`：本机 Magpie 流水、Claude Code 冒烟测试；只代表本机路由和当日状态。

版本核对：

- `glm-5.3-flash` 指 Z.ai 的 GLM-5.3-Flash（320B total / 18B active）；`glm-5.3-flashx` 是另一个更贵的变体，不能混用。没有公开的 `glm-5.3-flash-trial` 模型 ID；Trial 更像 Coding Plan 试用卡。
- `deepseek-v4.1-flash` 当前对应 1017 checkpoint；`deepseek-v4-pro`、`deepseek-v4-flash`（旧版）和 `deepseek-flash` 是不同路由或旧版本。（2026-11-08 修正：见 model-benchmarks-2026-11-08.md）
- `gpt-6.1-terra` 的官方上下文是 1.05M，最大输入 922K，最大输出 128K；Codex 目录的默认 `context_window` 是 500K，最大可配置 872K。
- 不同 harness 的 Terminal-Bench、SWE-bench 分数不能直接相减；下表把来源和口径放在同一行，跨行比较只作方向。

## 评分总表

| 指标 | GPT-6.1 Terra | DeepSeek V4.1 Flash | GLM-5.3 | GLM-5.3-Flash |
|---|---:|---:|---:|---:|
| Vals Index（综合） | 60.54% | **61.26%** | 59.73% | 50.86% |
| AA Intelligence Index v5 | **51** | 33 | 32 | 28 |
| Vals SWE-bench Verified | — | — | **95.40%**（第 6） | 92.00%（第 10） |
| Vals Terminal-Bench 4.0 | **49.49%** | 31.82% | 38.89% | 37.37% |
| CrossSWE Pass@1 | — | 52.63% | — | 43.86% |
| Bug Hunt Bench /105 | — | 21.7（榜单）/ 42.7（另一快照，7 次均值） | 19 | 17.7 |
| MMMU-Pro | 85.5 | 82.5 自报 / 77.0 AA | — | 86.0 Vals / 78.4 Mercor |
| 官方价格（每 1M） | $1 / $5；>272K 输入 $2 / 输出 $7.50 | 官方人民币 ¥1 / ¥4（高峰翻倍） | $1.40 / $4.40 | **$0.15 / $0.50** |
| Vals 每任务成本 | $2.94 | **$0.66** | $8.52 | $2.05 |
| 输出速度（AA） | 73 tok/s | **161 tok/s** | 64 tok/s | 57 tok/s |

读表注意：

- Vals Index、AA v5、Bug Hunt 的来源与快照不同；Bug Hunt 的 DeepSeek 分数出现 21.7 与 42.7 两个版本，尚未定因，不能拿单一数字排序。
- GLM-5.3-Flash 的 SWE-bench Verified 接近 GLM-5.3，但在 Vibe Code Bench、CrossSWE、Bug Hunt 等长程/跨文件任务上明显落后；它更像单仓库补丁模型。
- Terra 的 CrossSWE、Bug Hunt、Vals SWE-bench 没有同口径公开行；空白不代表 0。

## 分模型记录

### GPT-6.1 Terra

- 定位：GPT-6.1 系列的快速档，支持文本+图片，推理档 none/low/medium/high/xhigh/max/ultra。
- 官方：上下文 1.05M，最大输入 922K，最大输出 128K；$1 输入 / $5 输出，缓存输入 $0.05。
- 长上下文计费：输入超过 **272K** 后，整个请求按 **2× 输入/缓存、1.5× 输出** 计费；不是 500K。500K 是 Codex 的默认上下文窗口。
- 本地：第三方中转的 `gpt-6.1-terra` 可通；Claude Code 里把模型窗口压到 272K 以避开长上下文档费，`[1m]` 模型不受影响。
- 来源：[OpenAI 定价](https://developers.openai.com/api/docs/pricing)、[Terra 模型页](https://developers.openai.com/api/docs/models/gpt-6.1-terra)、[Codex models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)。

### DeepSeek V4.1 Flash

- 定位：快速、便宜的日常执行与调研模型；支持文本+图片，1M 上下文。
- 评分：Vals Index 61.26%、AA v5 33；CrossSWE 52.63%；Fireworks DeepSWE 69.6%（与 Terra/Sol 接近，成本低一个量级）；Bug Hunt 有 21.7/105 与 42.7/105 两个快照。
- 已知问题：社区报告超过约 500K 上下文质量下降；偶发改测试而不改业务代码、工具调用标记泄漏；合同应写明不得修改测试/脚手架来通过检查。
- 岗位：worker / engineer 第二、researcher 第一。
- 来源：[DeepSeek 更新日志](https://api-docs.deepseek.com/zh-cn/updates)、[DeepSeek 模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017)、[Vals Index](https://www.vals.ai/benchmarks/vals_index)。

### GLM-5.3

- 定位：纯文本旗舰，编码与审查强，1M 上下文、128K 输出；推理强制开启。
- 评分：Vals Index 59.73%、AA v5 32；Vals SWE-bench Verified 95.40%（第 6）；Macroscope 代码审查精确率 78.4%（DeepSeek 63.5%，但该 DeepSeek 行早于 1017）；Qodo F1 52.1（开源模型最高，但未测 DeepSeek V4.1 Flash）。
- 已知问题：思考常开，需要留足输出预算；5 小时额度限制；长任务稳定性弱于 Terra；不适合独立终审。
- 岗位：reviewer 第一、editor 第一、worker/engineer 第三。
- 来源：[Z.ai GLM-5.3](https://z.ai/blog/glm-5.3)、[Vals SWE-bench](https://www.vals.ai/benchmarks/swebench)、[Macroscope](https://macroscope.com/content/ai-code-review-benchmark-best-models)、[Qodo](https://www.qodo.ai/blog/which-llm-should-review-your-code/)。

### GLM-5.3-Flash

- 定位：低成本多模态 Flash，320B-A18B，1M 上下文，支持图片输入；不是 GLM-5.3 的廉价同质替代。
- 评分：Vals Index 50.86%、AA v5 28；SWE-bench Verified 92.00%（第 10）；TB4 37.37%；CrossSWE 43.86%；Bug Hunt 17.7/105。
- 多模态：CharXiv 89.4、OmniDocBench 90.76、OfficeQA 62.4、MMMU-Pro 78.4–86.0；文档/图表强，密集表格和手写公式仍有争议。
- 社区：长程、跨文件任务有虚报完成、空函数、漏改引用、65% 上下文崩坏等个案；Kilo #14475、llmgateway #4366 仍 open，vLLM #59608 的 parser 根因已修复。不能把所有 malformed tool call 都归因于模型本体。
- 本地：ZCode 路由可用；约 51 tok/s、TTFT 4.4s、HTTP 错误率约 0；Read 工具冒烟通过；用 Claude Code 读取 Magpie 截图能正确列出各档位模型（14 turns）。基础工具调用和视觉可用，但长任务不适合无人值守。
- 岗位：全部 priority 0；唯一窄位是 researcher priority 3 的图片/文档抽取，必须人工复核。
- 来源：[GLM-5.3-Flash 模型卡](https://huggingface.co/zai-org/GLM-5.3-Flash)、[Vals 模型页](https://vals.ai/models/zai_glm-5.3-flash)、[Wagtail 实测](https://stackness.dev/blog/glm-5-3-flash-as-a-coding-agent-a-month-of-daily-use-68-and-the-slot-it-kept)、[Kilo #14475](https://github.com/Kilo-Org/kilocode/issues/14475)、[llmgateway #4366](https://github.com/theopenco/llmgateway/issues/4366)、[vLLM #59608](https://github.com/vllm-project/vllm/issues/59608)。

### GPT-6.1 Sol / GPT-6 Astra（停用，仅对照）

- AA v5：Sol 55、Astra 57；Vals SWE-bench/Scale 等榜单位于 GLM-5.3 之上；曾用于困难实施与独立审查。
- 订阅到期后角色卡 priority 0；保留记录，不据此恢复。

## 岗位适配矩阵

| 岗位 | 推荐候选 | GLM-5.3-Flash | 证据强度 |
|---|---|---|---|
| worker | Terra 1、DeepSeek 2、GLM-5.3 3 | 0；窄任务可临时调用 | 强 |
| engineer | Terra 1、DeepSeek 2、GLM-5.3 3 | 0；不适合高风险 | 强 |
| reviewer | GLM-5.3 1、DeepSeek 2 | 0；无 Flash 专属审查证据 | 中 |
| researcher | DeepSeek 1、GLM-5.3 2 | 0；可选窄位 priority 3（图片/文档抽取） | 中 |
| editor | GLM-5.3 1、DeepSeek 2 | 0；中文写作无优势 | 中/弱 |

## 工具调用与长任务可靠性

- Kilo Code #14475：Kilo CLI 7.7.7，GLM-5.3-Flash 在 Code/Orchestrator 模式下宣布调用工具但不发结构化 call，或把 call 当文本输出，随后卡死；open。
- llmgateway #4366：OpenAI-compatible 流式 + tools，`finish_reason=tool_calls` 但 id/name/arguments 为空；open。
- vLLM #59608：NVFP4 + glm47/glm45 parser，结构化输出跳过隐式结束 reasoning 的 tool_call；4/4 复现，已修复。说明部分故障来自 parser，不是模型。
- Claude Code 400/1210：GLM-5.3 系列不接受 `thinking: disabled` 或继承 xhigh；客户端收窄档位后修复。
- 本机 Claude Code 冒烟：GLM-5.3-Flash 的 Read 工具和截图读取均成功；说明当前路由下的基础工具调用可用，不能把旧 issue 直接当作当前 harness 的失败率。

## 本地实测与运行参数

| 模型 | 样本 | 输出 tok/s（p50） | TTFT（p50） | HTTP 错误率 | 备注 |
|---|---:|---:|---:|---:|---|
| DeepSeek V4.1 Flash | 93,477 | 215 | 2.1s | 0.05% | 2026-10-17 起 |
| GLM-5.3 | 13,923 | 72–88 | 3.5–3.8s | 0.01–0.21% | 视路由/快照 |
| GLM-5.3-Flash | 1,962 | 51 | 4.4s | ~0% | 近期 ZCode 路由 |
| Terra（第三方中转） | 5 | 样本不足 | — | 0% | 2026-11-07 新接入 |

- 当前 Claude Code：`CLAUDE_CODE_MAX_CONTEXT_TOKENS=272000`（只影响无 `[1m]` 的模型，Terra）；`CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000`（`[1m]` 模型仍可用到 500K）。
- 已验证：Terra 的 `contextWindow` 为 272000；DeepSeek `[1m]` 仍为 1000000；把窗口压到 200K 的对照测试中，压缩在 preTokens 210K 触发。

## 未核验与风险

- 没有同一 harness、同一 effort 下的四模型完整对照；现有对比来自不同榜单和快照。
- GLM-5.3-Flash 没有 Flash 专属的 Qodo/Macroscope/EQ-Bench 行；不能把 GLM-5.3 本体的审查/写作分数外推。
- Terra 没有 CrossSWE、Bug Hunt、Vals SWE-bench 同口径行；Sol/Astra 已停用，只作历史对照。
- Bug Hunt 的 DeepSeek 分数有 21.7 与 42.7 两个快照；Vals Index 与 LLM Stats 的综合分排序也不完全一致，均未定因。
- 本机速度受 Magpie 路由、provider、effort 和缓存影响；不是受控 benchmark。
- 外部链接和价格会变；重新决策前先复查官方页和当前角色卡。

## 来源

- 官方：[OpenAI 定价](https://developers.openai.com/api/docs/pricing)、[GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)、[Codex models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)、[Z.ai GLM-5.3](https://z.ai/blog/glm-5.3)、[GLM-5.3-Flash](https://huggingface.co/zai-org/GLM-5.3-Flash)、[DeepSeek 更新日志](https://api-docs.deepseek.com/zh-cn/updates)。
- 受控榜/论文：[Vals Index](https://www.vals.ai/benchmarks/vals_index)、[Vals SWE-bench](https://www.vals.ai/benchmarks/swebench)、[Vals Terminal-Bench 4.0](https://vals.ai/benchmarks/terminal-bench-4-0)、[CrossSWE](https://arxiv.org/abs/2611.01484v1)、[DeepSWE](https://deepswe.datacurve.ai/)、[AA v5](https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5)。
- 代码审查：[Macroscope](https://macroscope.com/content/ai-code-review-benchmark-best-models)、[Qodo](https://www.qodo.ai/blog/which-llm-should-review-your-code/)、[CRJudgeBench](https://aicodereview.cc/blog/ai-code-review-tools-low-false-positives)。
- 社区：[Kilo #14475](https://github.com/Kilo-Org/kilocode/issues/14475)、[llmgateway #4366](https://github.com/theopenco/llmgateway/issues/4366)、[vLLM #59608](https://github.com/vllm-project/vllm/issues/59608)、[Linux.do 镜像](https://feedbbs.com/linuxdo/107455)、[Wagtail 实测](https://stackness.dev/blog/glm-5-3-flash-as-a-coding-agent-a-month-of-daily-use-68-and-the-slot-it-kept)。

## 维护约定

- 文件名沿用 `topic-YYYY-MM-DD.md`；每次新调研新建文件，不覆盖历史快照。
- 每条结论标证据类型和日期；价格、上下文、榜单分数必须写清 harness 和模型版本。
- 角色卡变化单独记录在当次文档，不把归档当现行配置；现行配置以 `~/.claude/orchestration.json` 和 `cards` 输出为准。
- 本档只保存公开来源和本机脱敏后的实测数据，不写入 API key、令牌或账号信息。
