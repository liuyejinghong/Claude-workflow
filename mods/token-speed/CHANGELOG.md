# token-speed Changelog

## 0.6.0

对应 tag `token-speed-v0.6.0`。

- Last 改为本代理、本完整请求模型最近完成且仍有效的认证测速样本；等待、流中、失败、截断、不可测速和落账延迟保留旧值。详情单独显示最新请求测速状态，并标明 Last 来自此前请求；乱序落账不能覆盖较晚完成样本，可靠撤销回退保留的更早样本或未知。
- Avg 在当前 session 中跨主控及所有子代理（含已结束）按完整请求模型汇总最近24h认证日志，以 tokens 总和 / 测速时长总和计算；新同模型代理可立即看到 Avg，自身 Last 仍未知。渠道与裸模型分开，未来/重复样本不进入均值。
- 查询按相近待匹配起点分组，单飞读取近期完整前缀并双扫校验；旧历史不再扩大新请求查询，超过2000行的可证明前缀仍可使用，最多8页/遍和4秒/批，超预算组独立退避。只有已覆盖候选窗内的旧样本才复验，范围外保留；相对 period 依赖同机墙钟与60秒余量。
- 候选按代理、完整模型及usage三元组索引；每次渲染/详情只计算一次跨代理模型均值。独立保存 Last 的完整认证证据，继续保持 lease/epoch、reset/clear、五次重试及跨截止事务回滚保护；新增用户可观察行为和负载回归测试。
- 修复查询进行期间新 step 完成导致唯一性证明过期的问题：查询与实际 CAS 回调校验证据版本，冲突时放弃本批并保留有限重试；CAS 使用当时 host state 的 Last/log 证明。已发出而迟到的写入按批次/字段回滚，保留后来请求状态。
- 修复4096个过期历史 Last 永久占满候选容量：完整 Last 留在 host state 参与需要时的复核，过期后脱离工作索引；仍可能与 pending 共用网关行的非 Last 旧证据暂留。先持久化退役时间水位再回收，失败不删除；reload 保留水位，墙钟回拨到已退役范围时保守拒绝新认证。新增查询/CAS竞争、2天/365天容量、长请求覆盖及水位写入拒绝回归。
- 修复证据回收水位拒写导致每秒无限重试、pending 永远不耗尽：先选定到期组并计入单飞及五次指数退避预算，再准备回收；CAS 重试与读回检查截止、epoch/session、证据版本和对象引用。回收失败不删除旧证据、不认证本批，能写状态时标 unavailable；本组耗尽后停止，新请求保留独立恢复机会。新增长期拒写/未保存水位、双组预算、CAS冲突、超时及clear/lease回归。

## 0.5.0

对应 tag `token-speed-v0.5.0`。

- Last/Avg 依赖本机 Magpie 请求记录及 measured Speed 口径，彻底移除字符估算、首内容估算与实时速率列。宽/窄屏保留 Last+Avg；紧凑 L=Last、A=Avg，按实际宽度降级。
- 按 session、agent、完整 canonical 请求模型、step 起止与 CLI usage 三元组双向唯一匹配；失败、无法测速、延迟未落账、候选歧义或计数不一致为 `—`。只使用本插件实际观察请求，不把 title/fork/其它 session 或旧历史归属当前代理。
- Avg 按 Magpie完成时间滚动24小时，以测速输出 token 总和/测速窗口总时长计算。旧独立/全程速率桶清除，保留代理/context/effort等元数据；reload保留认证样本，reset/clear和模块generation防止迟到结果重生。
- 本机 Claude 来源与用途复核，冲突候选保留参与歧义；每次稳定查询复验保留证据的双向唯一关联，迟到歧义或原行消失撤销样本，不将其它行重新归属旧请求。无待匹配请求时不持续查询。
- loopback URL 校验，通过禁用 curlrc、代理及重定向的无 shell curl GET 查询，仅接受完整 HTTP 200 JSON；单飞后台有限重试、覆盖保留证据与待匹配请求的时间窗、双次完整分页一致性检查。不读取认证，不保存请求正文/账号/错误正文，不重发模型请求；缺少 curl 或查询失败时保持未知。
- 修复 session id 迟到覆盖、配置刷新覆盖实际 fallback 模型、证据容量过期后无法恢复及过期批次迟到提交；无法取消的宿主状态写入在 settle 后按批次撤销，存在撤销前短暂可读的宿主边界。
- 新增 mock process 集成和边界测试，保留流透传、生命周期、上下文、effort、工作区与宽度合同；README 说明安装升级、来源与恢复边界。

## 0.4.6

对应 tag `token-speed-v0.4.6`。

- 新增 `gpt-6.1-terra` 官方窗口记录（2026-10-27 核验）：Codex 官方默认 500000、最大 872000，另带 API 总上下文 1050000 元数据。来源为官方 Codex [`models.json`](https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json)，API 模型页列为附加来源；官方 models 表由 24 条增至 25 条。
- 新增用户确认的 `gpt-6-astra` 500000 override（`User-confirmed CLI window`），并加入 registry 读取或严格解析失败时的后备 override，与既有 `gpt-6.1-sol` 500000 一致。
- 以上数值只作为上下文分母，不是性能、吞吐或上游实际 cap 的保证。Terra 的 Codex max 872000 与 API 总上下文 1050000 同样只记录为元数据，不因 `[1m]` 自动选用最大值，registry 不把最大窗口当默认。
- `/tok-speed` 命令文本版本同步为 0.4.6；更新后 reload 生效。

## 0.4.5

对应 tag `token-speed-v0.4.5`。

- 补齐 DeepSeek free 档的精确尾名本机窗口 override：`deepseek-v4.1-flash-free`，窗口 1000000，记为 `Locally confirmed gateway window (2026-10-20)`。存放于 registry 的 overrides，不写入官方 models 表，官方 24 条记录不变；0.4.4 已收录的 MiniMax override 不重复添加。
- 该数值来自本机网关实测，不是官方公布容量，也未做压力验证；仅作上下文分母后备。
- `/tok-speed` 命令文本版本同步为 0.4.5；更新后 reload 生效。

## 0.4.4

对应 tag `token-speed-v0.4.4`。

- 补齐 MiniMax 两个精确尾名的本机窗口 override：`minimax-m3.1-flash-free` 与 alias `minimax-m3.1-flash-preview:free`，窗口 1000000，记为 `Locally confirmed CLI window (2026-10-19)`。存放于 registry 的 overrides，不写入官方 models 表，官方 24 条记录不变。
- 该数值来自本机 CLI 确认，不是官方公布容量，也未做压力验证；仅作上下文分母后备。
- `/tok-speed` 命令文本版本同步为 0.4.4；更新后 reload 生效。

## 0.4.3

对应 tag `token-speed-v0.4.3`。

- 修复启动时 effort 显示：以前启动时漏读环境 effort 覆盖（`CLAUDE_CODE_EFFORT_LEVEL`），要发送消息后才显示正确；现在首次显示即读取覆盖值。
- 环境变量合法时优先于 settings；缺失、不合法或读取失败时回退到原有模型专属、全局与后缀顺序。`request` 与 `applied` 读数仍优先，`configured` 只是配置档位，不能当作上游实际应用的证据。
- `/tok-speed` 命令文本版本同步为 0.4.3。

## 0.4.2

对应 tag `token-speed-v0.4.2`。

- `gpt-6.1-sol`：官方默认按 Tibo（@thsottiaux）2026-10-12 公告更新为 500000、max 1000000（Codex/Work 默认 500k、可覆盖至 1M；原帖 https://x.com/thsottiaux/status/2109430343346581527），读取或严格解析失败的后备 override 同步 500000；sourceURL 改为原帖，API 页保留在 additionalSources。
- `/tok-speed` 命令文本版本同步为 0.4.2；`gpt-6-astra`、`gpt-6-sol`、`gpt-6-luna` 与 API 元数据保持原值。

## 0.4.1

对应 tag `token-speed-v0.4.1`。

- Emoji 语义修正：`🌳` 只表示子代理（worktree）。子代理行在宽屏由 `↳` 改为 `🌳` 前缀，紧凑模式同样加 `🌳` 前缀；工作区行恢复为 `⌂`（宽屏 `⌂ 仓库名 on 分支`，紧凑只显示分支）。感谢用户截图纠正。

## 0.4.0

对应 tag `token-speed-v0.4.0`。

- 手机/窄终端自适应紧凑布局。iPhone Air 等远程终端为 54 列，AbovePrompt 扣除宿主 `[-]` 预留后插件只有 49 列，旧布局会把模型压成 `…` 且 Avg 被行尾截断。现在原布局装不下时切换为每代理一行的紧凑格式，只保留 Live 一个实时速率（Avg 仍在宽屏与 `/tok-speed` 查看）：

  ```text
  ⚡ main gpt-6.1-sol high C42%/272k L~42.1
  abc12345 中文🙂长模型 max C—/? L~0.0
  🌳 main
  ```

- 降级顺序按各行实际 cell 宽度计算：缩模型至至少 4 格 → 去模型 → 去 effort → 上下文窗口容量缩为百分比（未知保持 `—%`/`?`，绝不写成 0%）→ 不足 32 列改用可见代理内可区分的最短 id 前缀 → 异常长数值或不足 24 列再去 Live → `fitText` 兜底。数字不截半，不虚构数值。
- 布局每次渲染按宿主传入的 `bodyColumns` 现算，终端拉宽自动恢复完整布局（进度条、Last、status、右对齐），无需新开会话。
- 紧凑模式主控标签 `⚡ main` 与宽屏一致；工作区行统一 `🌳` 前缀，紧凑模式只显示分支（无分支时显示仓库名），宽屏保持 `🌳 仓库名 on 分支`。
- 已知边界：`[-]` 折叠、`n more` 与行数滚动由 Claude Code 宿主管理，插件不接管。
- 测试 42 → 46：新增 24/32/40/49/54/60/80/120/240 列矩阵（长模型、CJK、ZWJ emoji、已知/未知上下文、Live 已知/未知）、同一 mount 49→24→120 恢复、窄屏子代理 id 区分（含 `m` 冲突）与 1–23 列极窄预算；真实终端在 54/37/29/125 列实测通过。

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
