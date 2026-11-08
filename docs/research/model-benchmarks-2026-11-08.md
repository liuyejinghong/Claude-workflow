# 2026-11-08 六模型评分核查与修正

这份笔记补充 2026-11-07 归档，不覆盖历史快照。范围只含 `~/.claude/orchestration.json` 的六个模型：Terra、Sol、Astra、DeepSeek V4.1 Flash、GLM-5.3、GLM-5.3-Flash。网关专属型号不纳入。

角色卡优先级是 2026-11-08 的本地配置快照，不是推荐。外部榜单、价格和路由会变；重新决策前先复查官方页和当前角色卡。

## 结论

- 2026-11-08 的角色卡把 Terra 放在 worker 和 engineer 第 1，DeepSeek V4.1 Flash 第 2，GLM-5.3 第 3；reviewer 和 editor 以 GLM-5.3 第 1。Sol、Astra、GLM-5.3-Flash 在列出的岗位为 priority 0。
- GLM-5.3 可以继续做 reviewer。AA v5 综合分 32 不含代码审查基准；Macroscope 和 Qodo 的审查证据支持 GLM-5.3，限制是 checkpoint 和覆盖范围。
- AA v5.0.1 给 OpenAI 三款模型的分数是 Astra 57（#5/69）、Sol 55（#8/69）、Terra 51（#14/69）。旧档缺版本号和排名。
- 旧档“Sol/Astra 的 Vals SWE-bench/Scale 等榜单位于 GLM-5.3 之上”没有对应行，撤回。
- OpenAI API 的最大上下文是 1.05M，最大输入 922K，最大输出 128K。Codex 默认窗口不同：Sol/Astra 272K，Terra 500K；三者最大 872K。
- Terra 的本地 5 条样本不能写成 0% 错误率：1 条 403、1 条 200 但零 usage、3 条成功测试。
- GLM-5.3-Flash 的“近期 1,962 次”是全历史、大小写分组计数，不是近期样本。Flash 没有审查分数，不能外推 GLM-5.3 的审查结论。
- DeepSeek 的 AA 分数 33 与 32 仍未定因。GLM-5.3-Flash 的 AA 28 本次未核到来源页。

## 本地角色卡快照

2026-11-08 读取 `~/.claude/orchestration.json` 的结果如下。表中 Terra 指 `gpt-6.1-terra`，Sol 指 `gpt-6.1-sol`，Astra 指 `gpt-6-astra`，DeepSeek 指 `deepseek-v4.1-flash`，GLM-5.3 指 `glm-5.3`，Flash 指 `glm-5.3-flash`。短横线表示该岗位未列该模型；priority 0 表示已列但停用。

| 岗位 | priority 1 | priority 2 | priority 3 | priority 0 |
|---|---|---|---|---|
| worker | Terra | DeepSeek | GLM-5.3 | Flash |
| engineer | Terra | DeepSeek | GLM-5.3 | Sol |
| reviewer | GLM-5.3 | DeepSeek | — | Sol、Astra |
| researcher | DeepSeek | GLM-5.3 | — | Flash |
| editor | GLM-5.3 | DeepSeek | — | — |

说明：这张表只记录当前配置，不证明能力排序。2026-11-07 归档把 Flash 的 researcher 窄位写成 priority 3，那是当时的建议；现行角色卡仍为 priority 0。

## AA Intelligence Index v5.0.1（third_party）

本笔记采用的 AA 版本是 v5.0.1。v5.0.1 在 2026-11-03 列入变更记录，v5.0 发布于 2026-10-27。v5 与 v4 的评测集和权重不同，分数不能直接相减。

| 模型 | 综合分 | 排名 | effort | 每任务成本 | 输出速度 |
|---|---:|---:|---|---:|---:|
| GPT-6 Astra | 57 | #5/69 | max | $6.24 | 41 tok/s |
| GPT-6.1 Sol | 55 | #8/69 | max | $1.27 | 52 tok/s |
| GPT-6.1 Terra | 51 | #14/69 | max | $0.96 | 73 tok/s |

- AA v5 由 9 项基准合成，四大类各占 25%，约 60% 的权重来自私有或留出集。AA 没有公开代码审查或 PR 审查基准。
- AA 官方页取整为 57/55/51。二手汇总另有 Terra 48、Sol 52 等小数版本，与 v5.0.1 不一致，不采用。
- GLM-5.3 在 AA v5 文章（2026-10-27）为 32。DeepSeek V4.1 Flash 1017（max）在同一文章为 32；2026-11-07 归档写 33。两个数字的差异未定因，可能是快照或 effort 档不同。
- GLM-5.3-Flash 的 AA 28 来自 2026-11-07 归档。本次核查的 AA 文章没有 Flash 行，列为缺口。
- Terra 的 51 来自 AA v5.0.1 模型页；AA v5 文章本身未给 Terra 综合分。

## worker 与 reviewer 是两种合同

worker 和 engineer 写代码、改代码，用 Terminal-Bench、SWE-bench、CrossSWE、Bug Hunt 和 AA 综合分等代理指标衡量。reviewer 只读 diff 和上下文，报告缺陷和证据，用真实缺陷集上的精确率、召回率和 F1 衡量。AA 综合分适合给 worker 排序，不能直接否定 reviewer。

### GLM-5.3 可以继续做 reviewer

可以。理由有三条。

1. AA v5 不含代码审查基准，32 是综合代理能力，不是审查能力。
2. Qodo 明确把 GLM-5.3 排为开源权重第一；Macroscope 同榜显示 GLM-5.3 仅次于榜首 GPT-6 Astra，但该页未按开源/闭源分类，不能据此推出“开源权重第一”。Macroscope 的精确率 78.4% 适合由主控逐条复核的 reviewer 合同。
3. GLM-5.3 在当前角色卡中为 worker priority 3；实际写码频率未统计。reviewer 的独立性来自本次审查未参与代码编写，而不是使用频率假设。

限制：reviewer 不是终审。GLM-5.3 有思考常开、5 小时额度、长任务稳定性弱于 Terra 的已知弱点。子代理审查结论不作自动门禁，高风险改动仍由两个模型各审一次，再由主控验收。

### Macroscope：GLM-5.3 与 DeepSeek V4.1 Flash 同榜（third_party）

| 模型（配置） | 调和分 | 召回率 | 精确率 | 信噪比 | 成本 |
|---|---:|---:|---:|---:|---:|
| GLM-5.3（max） | 77.4 | 76.4% | 78.4% | 2.24:1 | $3.86 |
| DeepSeek V4.1 Flash（max） | 72.0 | 83.1% | 63.5% | 1.27:1 | $0.75 |

- 方法：MacroscopeBench，12,000+ 个已验证缺陷，来自 1,500+ 个公开仓库、14 种语言。缺陷埋在引入该缺陷的提交上，另混入无缺陷提交测精确率。每模型跑 3 次取均值，双 LLM 裁判未具名。Score 是召回率与精确率的调和平均，功能上即 F1。
- 榜首是 GPT-6 Astra（max，78.0，精确率 91.7%）。Astra 为 priority 0，只作对照。
- 页面没有 GLM-5.3-Flash 行。
- 页面不披露逐行运行日期、checkpoint、agent 框架和上下文窗口。DeepSeek 行的 checkpoint 未知；“早于 1017”只是按文章日期 2026-09-22 与 1017 命名惯例推断，不能写成事实。

### Qodo：GLM-5.3 对 DeepSeek V4 Pro（third_party）

- GLM-5.3（high）：F1 52.1%，精确率 51.5%，召回率 52.7%，每 PR $0.76，P50 226 秒。
- 方法：13 个模型、38 种配置；125 个 PR、703 个已知缺陷；单审查者，关闭 explorer 子代理，只变模型和推理档；Claude Sonnet 4.6 逐对裁判。
- “开源权重第一”成立。GLM-5.3 之上只有 Claude Opus 5.5（56.8%）、Sonnet 5.5、Fable 5.1，均为闭源。下方开源权重为 DeepSeek V4 Pro 49.9%、Kimi K3 49.0%。
- DeepSeek 只测了 V4 Pro，没有 V4.1 Flash 行。页面没有 GLM-5.3-Flash 行。
- 源内数字不一致：Sonnet 5.5 的 F1 在表格、正文和另一处分别写 54.9%、54.0%、51.7%。引用时以表格行核对。

### 撤回绝对说法

“没有同 harness 的 GLM/DeepSeek 审查对照”这个绝对说法撤回。

- Macroscope 在同一个 MacroscopeBench 上同时有 GLM-5.3 和 DeepSeek V4.1 Flash，但 DeepSeek 的 checkpoint 未知。
- Qodo 在同一个 harness 上比较 GLM-5.3 和 DeepSeek V4 Pro，没有 V4.1 Flash。
- 正确说法：没有 GLM-5.3 对 DeepSeek-V4.1-Flash-1017 的同 checkpoint、同 harness 审查对照。

## OpenAI：API 与 Codex 的窗口和价格（vendor）

OpenAI 三款模型的 API 窗口相同，Codex 默认窗口和价格不同。1.05M 是 API 最大上下文，不能当作 Codex 的实际可用窗口。

| 项目 | GPT-6 Astra | GPT-6.1 Sol | GPT-6.1 Terra |
|---|---|---|---|
| API 上下文 / 最大输入 / 最大输出 | 1,050,000 / 922,000 / 128,000 | 同左 | 同左 |
| API effort | low、medium（默认）、high、xhigh、max | 同左 | none、low、medium（默认）、high、xhigh、max |
| Codex 默认 context_window | 272,000 | 272,000 | 500,000 |
| Codex 最大 context_window | 872,000 | 872,000 | 872,000 |
| Codex effort / 默认 | low、medium、high、xhigh、max、ultra / low | 同左 | 同左 |
| 标准价格（输入 / 输出 / 缓存输入，每 1M） | $10 / $50 / $1 | $2 / $10 / $0.10 | $1 / $5 / $0.05 |
| 输入超过 272K | 整请求输入与缓存 2 倍，输出 1.5 倍 | 同左 | 同左 |
| 发布日 | 2026-09-03 | 2026-09-29 | 2026-10-26 |
| 知识截止日 | 2026-04-30 | 2026-04-30 | 2026-06-01 |

说明：

- API 默认 effort 为 medium，Codex 默认 effort 为 low。API 的 Sol/Astra 不接受 `none`；Terra 接受 `none`。Codex 三者都支持 `ultra`。
- 长上下文计费按 272K 输入 token 分界。超过后，整个请求按 2 倍输入/缓存、1.5 倍输出计价。
- OpenAI 发布页（Sol、Astra）、ChatGPT Release Notes 和 Path to Astra 在 2026-11-08 返回 403，未直接读取。API 页、定价页和 Codex models.json 可读。发布日来自 AA 模型页。

### OpenAI 发布表：只作二手复刻

OpenAI 发布页返回 403，发布表的数字来自 ComputingForGeeks 对 OpenAI 图表的复刻，属 vendor 数字经二手转述，未直接读取原文。五项都没有写 harness。

只保留方向性结论：Sol 在 DeepSWE 1.1 反超 Astra；GDP.pdf 两项基本持平；Astra 在 AutomationBench、OSWorld、TB-Science 领先。发布表的样本口径、工具数和子集划分等细节未能核实，本笔记不采用。

## 本地样本与版本修正（local）

本地样本不是受控评测。下面只保留能从日志核对的计数，不补算错误率。

- Terra：2026-11-07 记录时的局部样本共 5 条，不代表当前全量。其中 1 条 HTTP 403，1 条 HTTP 200 但零 usage，3 条成功测试。零 usage 的请求不能算成功样本。旧表“HTTP 错误率 0%”不成立；5 条不足以计算错误率。
- GLM-5.3-Flash：“近期 1,962 次”不是近期样本。1,962 是 2026-11-07 记录的大小写 `GLM-5.3-Flash` 分组全历史计数，不代表当前全量；另有小写 `glm-5.3-flash` 分组 27,256 条。分组按大小写区分，没有限定日期。51 tok/s、TTFT 4.4 秒和约 0% 错误率没有随分组和日期重新计算，不能当成一次干净的近期测量。
- GLM-5.3：日志中存在 13,923 条样本计数，但日期范围和大小写分组的速度数字未在本档统一重算。不把旧表“72–88 tok/s”、TTFT 或错误率当作单一受控测量。
- DeepSeek V4.1 Flash：93,477 条样本从 2026-10-17 起，215 tok/s、TTFT 2.1 秒；错误率是旧档记录的约 0.05%，统计口径未在本档重算，不作为受控错误率。官方 `deepseek-flash` 当前指 1017，但本机 workbuddy 上游是否已核实该 checkpoint 未知。不能把路由名直接等同 1017。
- 工具冒烟和 HTTP 成功率不等于任务正确率。GLM-5.3-Flash 的 Read 工具和截图读取成功，只说明该路由的基础工具和视觉输入可用。这不证明长任务可靠性。

## 明确撤回的旧说法

1. **Vals SWE-bench/Scale 对比**：旧档写“Sol/Astra 的 Vals SWE-bench/Scale 等榜单位于 GLM-5.3 之上”。Vals SWE-bench 页没有 Astra、Sol、Terra 行，最新只到 GPT-5.6；Terra 只有 Vals Index 行。撤回。可引用的是 Vals Index v2.2：Astra 65.02%（#6）、Sol 63.94%（#8）、Terra 60.54%（#11），快照 2026-11-05。
2. **DeepSeek Macroscope 行早于 1017**：旧档把该推断写成事实。Macroscope 页不写逐行运行日期和 checkpoint；“早于 1017”只是推断。撤回为“checkpoint 未知”。
3. **GLM worker 3 由 AA/TB4 证明**：AA 综合分和 TB4 是一般编码能力的代理指标，不是岗位优先级的证明。Terra 的 TB4 数字也未核清：旧档为 49.49%，AA 为 50.3%，Vals TB4 页 404。撤回“证明”说法，只保留方向性证据。
4. **“没有同 harness 的 GLM/DeepSeek 审查对照”**：绝对说法撤回。Macroscope 有同基准对照，但 checkpoint 未知；Qodo 有同 harness 对照，但只有 V4 Pro。正确说法见上一节。

其他修正：

- Fireworks DeepSWE：旧档曾把该表结果写成与 Terra/Sol 接近并列，但当前可核验来源不足，撤回该比较；本档不采用该表的具体数字。
- GLM-5.3 的 Vals SWE-bench 95.40%（#6）是补丁生成基准，不是审查。开源权重内 GLM-5.3 还低于 DeepSeek V4 Pro 0813 的 96.40%（#2），不能据此说 GLM-5.3 是最强开源编码模型。
- Bug Hunt 的 DeepSeek 21.7 与 42.7 可能是版本、快照或 harness 差异，仍未定因；不要合并成一个版本的可比范围。
- “GLM 的 editor 明显更好”和“Flash 全部不适合”是 2026-11-07 的建议，不是能力事实。
- “把窗口压到 272K 以避开加价”是配置目标，不是账单保证；aipai 账单未核实。

## 补充风险（community）

以下为 2026-11-08 来源核查记录中的社区证据，只作方向。

- Astra 长流不结束：Codex #51886（2026-10-08，open）记录 17/268 次跑满 900 秒，最终 `request_timeout`；另有 15/943 次触发 900 秒截止。正常 295 次中位 120 秒，最大 680 秒。这是 Astra 的问题，不是 Sol。
- Sol/Astra 缺参考图时判定不清：Codex #54514（2026-10-16，open）为 6 次单次运行（2 模型 × 3 条件），6/6 都回“not yet confirmed”。作者写明这不是统计失败率。
- 额度与容量：Codex #50761（2026-10-04）报告 Plus/Work 的 5 小时额度消耗异常快；Codex #58875（2026-11-02）报告有空余额度仍提示容量不足。
- 社区情绪：Sol 的速度好评率 15%，Astra 的成本好评率 21%（modelsentiment，截至 2026-11-08）。这是 Reddit 情绪指数，不是能力评测。

## 未核验与缺口

- AA 的 DeepSeek 33 与 32 未定因。GLM-5.3-Flash 的 AA 28 未在本次核查的 AA 文章找到。
- Macroscope 没有逐行运行日期、checkpoint、agent 框架和上下文窗口；裁判模型未具名。Qodo 只测 DeepSeek V4 Pro，没有 V4.1 Flash。两个基准都用 LLM 裁判，裁判偏差未量化。
- Vals SWE-bench 快照停在 2026-09-01，页面已归档（性能饱和）。DeepSeek V4.1 Flash 1017 与 Terra 没有同口径行。
- OpenAI 发布页和帮助页在 2026-11-08 返回 403。发布表只有二手复刻，没有原始 harness。发布表的样本口径、工具数和子集划分等细节未核实，本笔记不采用。
- 没有六个模型同 harness、同 effort 的完整对照。本地速度受 Magpie 路由、provider、effort 和缓存影响，不是受控 benchmark。
- 除来源核查记录标明直接抓取的页面和返回 403 的页面外，本笔记没有重新打开外部链接。价格和榜单会变，重新决策前先复查。

## 来源与证据等级

证据等级沿用 2026-11-07 归档：`vendor` 为厂商自报或官方文档；`third_party` 为独立榜单、论文或受控评测；`community` 为 GitHub issue、论坛、个人实测；`local` 为本机 Magpie 或 Claude Code 实测。

本笔记依据两份 2026-11-08 来源核查记录整合：

- `role-card-openai-2026-11-08.md`（2026-11-08 核查记录）
- `role-card-reviewer-2026-11-08.md`（2026-11-08 核查记录）

reviewer 核查记录标明直接抓取 Macroscope、Qodo、AA v5 文章和 Vals SWE-bench；OpenAI 核查记录标明发布页与帮助页返回 403。其余 URL 见下，未在本笔记中重新核验。

### 官方与厂商（vendor）

- OpenAI 定价（来源记录日期 2026-11-08）：https://developers.openai.com/api/docs/pricing
- GPT-6.1 Sol 模型页：https://developers.openai.com/api/docs/models/gpt-6.1-sol
- GPT-6 Astra 模型页：https://developers.openai.com/api/docs/models/gpt-6-astra
- GPT-6.1 Terra 模型页：https://developers.openai.com/api/docs/models/gpt-6.1-terra
- Codex models.json：https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json
- GPT-6.1 Sol 发布页（403）：https://openai.com/index/introducing-gpt-6-1-sol
- GPT-6 Astra 发布页（403）：https://openai.com/index/gpt-6-astra
- ChatGPT Release Notes（403）：https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Path to Astra（403）：https://openai.com/index/path-to-astra/
- Z.ai GLM-5.3：https://z.ai/blog/glm-5.3
- GLM-5.3-Flash 模型卡：https://huggingface.co/zai-org/GLM-5.3-Flash
- DeepSeek 更新日志：https://api-docs.deepseek.com/zh-cn/updates
- DeepSeek-V4.1-Flash-1017 模型卡：https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash-1017

### 独立榜单与论文（third_party）

- AA Intelligence Index v5 公告（2026-10-27）：https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v5
- AA Changelog（v5.0.1，2026-11-03）：https://artificialanalysis.ai/changelog
- AA GPT-6.1 Sol：https://artificialanalysis.ai/models/gpt-6-1-sol
- AA GPT-6 Astra：https://artificialanalysis.ai/models/gpt-6-astra
- AA GPT-6.1 Terra：https://artificialanalysis.ai/models/gpt-6-1-terra
- Vals Index v2.2（2026-11-05 快照）：https://vals.ai/benchmarks/vals_index
- Vals SWE-bench（页面 updated 2026-09-01，2026-11-08 抓取）：https://www.vals.ai/benchmarks/swebench
- Vals TB-Science 0.1（2026-08-27 发布）：https://www.vals.ai/benchmarks/terminal-bench-science
- Vals SRE Bench：https://www.vals.ai/benchmarks/srebench
- Vals Code Migration v1.1：https://www.vals.ai/benchmarks/code-migration-v1-1
- Vals Terminal-Bench 4.0（404）：https://vals.ai/benchmarks/terminal-bench-4-0
- CrossSWE：https://arxiv.org/abs/2611.01484v1
- DeepSWE（2026-09-22 更新）：https://deepswe.datacurve.ai/
- TB-Science 公告：https://www.terminal-bench-science.ai/announcement
- OSWorld 2.0：https://osworld-v2.xlang.ai/
- GDP.pdf：https://www.kaggle.com/benchmarks/surge-ai/gdp-pdf
- ComputingForGeeks 对 OpenAI 发布表的复刻：https://computingforgeeks.com/gpt-6-sol-luna-released-features-benchmarks

### 代码审查（third_party）

- Macroscope（2026-09-22，2026-11-08 抓取）：https://macroscope.com/content/ai-code-review-benchmark-best-models
- Qodo（2026-10-12，2026-11-08 抓取）：https://www.qodo.ai/blog/which-llm-should-review-your-code/
- CRJudgeBench：https://aicodereview.cc/blog/ai-code-review-tools-low-false-positives

### 社区（community）

- Codex #54514：https://github.com/openai/codex/issues/54514
- Codex #51886：https://github.com/openai/codex/issues/51886
- Codex #50761：https://github.com/openai/codex/issues/50761
- Codex #58875：https://github.com/openai/codex/issues/58875
- eesel GPT-6.1 Sol 评测：https://www.eesel.ai/blog/gpt-6-1-sol-review
- modelsentiment GPT-6.1 Sol：https://modelsentiment.com/m/gpt-6.1-sol
- modelsentiment GPT-6 Astra：https://modelsentiment.com/m/gpt-6-astra
- InfoQ 极速版定价抱怨：https://infoq.cn/article/soBOt9TSckGlJlBS519y
- Kilo Code #14475：https://github.com/Kilo-Org/kilocode/issues/14475
- llmgateway #4366：https://github.com/theopenco/llmgateway/issues/4366
- vLLM #59608：https://github.com/vllm-project/vllm/issues/59608

### 本机（local）

- `~/.claude/orchestration.json`（2026-11-08 读取）
- 本机 Magpie 流水与 Claude Code 冒烟记录（2026-10-17 起；Terra 与冒烟记录为 2026-11-07，见 2026-11-07 归档和上方修正）

## 维护约定

- 本文件是 2026-11-07 归档的补充，不替代原快照。角色卡和路由变化另建当次文件。
- 每条结论标证据类型和日期。跨 harness 的分数只作方向，不直接相减。
- 本地样本写清分组、大小写、日期范围和失败计数；样本不足时不计算错误率。
- 不写入 API key、令牌或账号信息。
