# token-speed 0.6.0

适用于 Claude Code 2.1.296 的 function-hooks mod。在提示框上方，主控与每个活跃子代理各用一行显示模型、effort、上下文与输出速率，工作区放在最后一行。只观察原有模型请求，不调用额外模型或 tokenizer。速率依赖本机 Magpie 和 `curl`，请求完成后通过引擎 process API 安全读取本地用量；分支通过同一 API 调用本机 git。

```text
⚡ main · gpt-6.1-sol · high · Ctx ██████▊    67%/500k · Last 31.2 · Avg 28.6 tok/s · streaming
🌳 abcdefg1 · glm-5.3-flash · max · Ctx █▍         14%/1.0M · Last 29.1 · Avg 30.4 tok/s · streaming
⌂ Claude-workflow on main
```

主控始终第一，子代理按首次观察顺序每个一行，切换 view 不过滤。短 id 自动延长到可区分同会话代理；工具间隙保留行，Last 保留本代理当前完整模型最近一次仍有效的可测速请求，明确终态后隐藏，历史通过 `/tok-speed` 查询。带 survey 或 `maxRows=0` 时隐藏，其它插件和引擎的内容原样保留。只有主控时为代理行加工作区行，共两行；行数预算不足先丢工作区。

各列按终端显示宽度对齐，包括双宽的 `⚡`、CJK 与常见 emoji。宽屏速率数字右对齐，单位 `tok/s` 每行只显示一次；不足时先省略 status、进度条，再缩短模型。Last 和 Avg 始终同等优先。模型压到不足 4 格（原名称不足 4 格时保留原宽）时切换为每代理一行的紧凑格式：

```text
⚡ main gpt-6.1-sol high C42%/500k L31.2 A28.6
⚡ main C42% L31.2 A28.6
🌳 abc12345 C—/? L— A—
```

紧凑行优先显示 `Last`、`Avg`；空间不足时 `L` 明确表示 Last、`A` 表示 Avg，单位同为 tok/s。按实际 cell 宽度依次缩短模型、省略模型、effort、上下文窗口容量，保留百分比或未知标记；不会将未知显示为 0%。32 列以上保留代理短 id，24–31 列必要时用可区分最短前缀，主控可缩为 `m`，子代理必要时省略 `🌳` 以保留两项速率。只有异常长读数或极窄终端仍装不下时，才进一步降级，最终截断仅作保护。紧凑行不画进度条，工作区行只显示分支（无分支时显示仓库名）。每次渲染重新预算，变宽自动恢复完整布局。

宽度采用宿主提供的 `bodyColumns`，可能小于终端总列数。`[-]` 折叠标记、滚动和 `n more` 提示由 Claude Code 的 AbovePrompt 宿主管理；插件不改变其行数预算，有空余行才在代理之后显示工作区。

进度条是固定 10 个终端 cell 的短矩形，轨道使用 theme `rate_limit_empty`，整格填充 `█`，尾部使用 `▏▎▍▌▋▊▉` 表示 1/8 cell。共 80 个视觉档位（10 格 × 8 档），因此 0–100 的整数百分点不是每个都有不同的条形：相邻百分点可落在同一档（例如 67% 与 68% 的条形相同，但数字 `67%`、`68%` 不同）。宽屏也不扩展为长条。窄屏可省略条形，数值始终保持整数 1% 精度。填充固定使用 theme `rate_limit_fill`，不随占用变化，没有横向渐变；Ctx 数值用 `text`，未知占用用 `inactive`。未知占用只画轨道空条，并以 `—%` 或 `?` 明确标为未知，不能解释为 0%。

主控上下文来自 `$.session.usage()`，与状态栏同口径，最近响应的 uncached + cache-read + cache-written 输入 tokens 除以窗口；首次响应或成功压缩后无读数显示 `—%/窗口`。已知读数不会被打回未知：缺少有效 tokens 的部分读数（窗口相同）与主控模型切换都会沿用上一次已知读数，只有成功压缩（主控）或整会话重置才清空，因此进度条不会在两次轮询之间闪回 `—%`。子代理输入量来自自己最近一次响应的 CLI usage，不累计多次请求。子代理分母由启动时读取一次的 `data/model-contexts.json` 提供，无联网刷新。优先顺序为实际运行窗口、明确 CLI override、官方默认、未知；官网仅提供容量时明确标为官方 capacity。输入始终取自己最近一次 CLI response，主控仍以 `$.session.usage()` 为准。数据中的官方来源、核验日期和 registry 版本可通过 `/tok-speed` 查看。读取或严格解析失败时，官方表为空，保留已确认的 Sol/Astra 500000、GLM-5.3/Flash 1000000 后备，不中断请求。

官方记录覆盖当前前沿型号，共 25 条（各条核验日期见 registry；`gpt-6.1-sol` 为 2026-10-12，`gpt-6.1-terra` 为 2026-10-27，其余为 2026-10-09）。Anthropic：`claude-haiku-5-5`、`claude-sonnet-5-5`、`claude-opus-5-5`、`claude-fable-5-1`、`claude-fable-5`、`claude-mythos-5-1`、`claude-mythos-5`、`claude-opus-5`、`claude-sonnet-5`、`claude-opus-4-8`、`claude-opus-4-7`、`claude-opus-4-6`、`claude-sonnet-4-6` 为共享输入输出上下文 1M，`claude-haiku-4-5`、`claude-sonnet-4-5` 为 200k。OpenAI：`gpt-6.1-sol` 为 Codex/Work 默认 500000 / max 1000000（Tibo 2026-10-12 公告），`gpt-6.1-terra` 为 Codex 官方默认 500000 / max 872000 并带 API 总上下文 1050000 元数据（官方 Codex models.json 与 API 文档，2026-10-27 核验），`gpt-6-astra`、`gpt-6-sol`、`gpt-6-luna` 仍为 Codex 官方默认 272000 / max 872000，其中 `gpt-6.1-sol` 与 `gpt-6-astra` 另带 API 总上下文 1050000 与 max input 922000 元数据。`glm-5.3`、`glm-5.3-flash`、`deepseek-v4.1-flash`（aliases `deepseek-flash`、`deepseek-v4-flash`）、`deepseek-v4-pro`、`gemini-3.8-flash` 官网只给出容量且未声明默认/最大，按官方 capacity 记录；Gemini 的 1,048,576 是输入上限，输出上限 65,536 单独存在，不是共享窗口。用户 override 独立存放，不混作官方事实。MiniMax `minimax-m3.1-flash-free`（alias `minimax-m3.1-flash-preview:free`）另有本机已确认的 1000000 override（2026-10-19）；DeepSeek `deepseek-v4.1-flash-free` 另有本机网关已确认的 1000000 override（2026-10-20）。匹配只用去渠道的 canonical 尾名及精确 aliases，不匹配子串，不把未知邻近型号映射到已知型号；不使用动态 `haiku`/`opus`/`sonnet` 别名，不因 `[1m]` 选择官方最大值。来源分别记录为 `cli-input-window-config`、`cli-input-official-default`、`cli-input-official-capacity`。

新增 provider/model 时，只添加具有官方 URL、核验日期和精确型号的记录；未核实的型号保持 unknown，或单独添加有理由的 local override。模型最大上下文不保证路由实际 cap，registry 不把最大值当默认。不复制主控百分比，数值超过窗口可显示超过 100%，只限制条形填充。成功安装的压缩清对应行输入读数，保留已知窗口；precompute 和 skip 不清。

Effort 来源保存在状态并可由命令查看：`request` 为 `turn.step.effort`，`applied` 为 classic PostToolUse/Stop 的 `effort.level`，`configured` 为主控当前模型的配置后备：先读取环境变量 `CLAUDE_CODE_EFFORT_LEVEL`，合法档位优先于 settings；变量缺失、不合法或读取失败时，依次回退到 `modelSettings[model].effortLevel`、全局 `effortLevel` 与明确模型后缀。reload 后主控立即读取配置后备，无数据为 `—`；不硬编码 high，不扫描 agent 定义。`request` 与 `applied` 读数仍优先于 `configured`（更可靠），且各自保留来源记录。`configured` 只是配置档位，不能当作上游实际应用的证据，外部 provider 是否已应用不保证。只选取 settings 的这些 effort 字段与上述环境变量，不保存或打印其它 settings 或环境变量。

工作区为仓库根目录名（非 git 使用会话根目录名），附当前分支；detached HEAD 不显示分支，约每 5 秒刷新。显示使用 theme tokens：主控标签为 `claude`、子代理标签与行次要信息为 `inactive`；模型名为 `text`（普通文本，不着色）；有效 Avg/Last 数字为 `text`，缺值为 `inactive`，速率不以 `success` 表示；effort 按档位着色（数值为 `subtle`）；状态 idle/waiting/streaming 为 `inactive`，aborted 为 `warning`，error 为 `error`，usage unavailable 为 `warning`。工作区行为 `inactive`。颜色跟随 CLI 主题。

## 安装

在 Claude Code 中添加 marketplace 并安装：

```text
/plugin marketplace add liuyejinghong/Claude-workflow
/plugin install token-speed@claude-workflow-mods
```

也可用固定 tag `token-speed-v0.6.0` 获取源文件，并从 checkout 加载：

```sh
git clone --branch token-speed-v0.6.0 https://github.com/liuyejinghong/Claude-workflow.git
claude --plugin-dir ./Claude-workflow/mods/token-speed
```

已安装用户升级时，先刷新 marketplace，再更新插件；在已有会话中执行 `/reload-plugins` 加载更新：

```text
/plugin marketplace update claude-workflow-mods
/plugin update token-speed@claude-workflow-mods
/reload-plugins
```

升级到 0.5.0 会清除更早版本的估算测速历史，仅从插件实际观察到的请求开始统计。升级到 0.6.0 可复用 0.5.0 已保存、带完整证据的认证样本；Avg 改为汇总本会话所有代理（包括已结束）同完整请求模型最近 24 小时内的有效测速请求，不补录没有观察证据的旧请求。安装后的插件由 Claude Code 加载；开发时请修改自己的 checkout，不要直接修改 `plugins/cache` 副本。

## 命令

- `/tok-speed`：列出各代理的短 id 角色、任务描述、当前模型、各模型 Last 和最近 24 小时 Avg，以及 Magpie 来源、请求匹配条件与统计范围。
- `/tok-speed reset`：清空本会话统计。任意代理请求仍 active 时拒绝；工具间隙可 reset，保留活跃代理元数据和行。
- `/clear`：清空统计、代理行与待匹配请求；晚返回的旧流、HTTP 或 spawn 元数据不复活统计，新 turn.step 刷新 session id 并重启计时器。

状态包括 `waiting`、`streaming`、`idle`、`aborted`、`error`、`usage unavailable`。行状态反映原模型流：没有内容前为 waiting，观察到内容后为 streaming，结束后按实际结果更新。测速状态在 `/tok-speed` 每模型的 `latest` 中独立显示：`waiting`、`streaming`、等待落账的 `pending`、已认证的 `measured`、请求失败/中断的 `failed`、有明确证据不能测速的 `unmeasurable`、关联冲突的 `ambiguous` 和查询失败/记录缺失/证据容量不足的 `unavailable`。新请求和这些状态不会清空已有 Last；若最新请求还未提供有效测速，命令明确标记 Last 来自此前可测速请求。新采纳代理模型为 `unknown`，直到实际 step 或明确 resolved model 的 spawn。

## 模型名称与统计归属

每个代理独立按 **请求 `turn.step.model`** 保存认证样本与 Last；Avg 在当前 session 内按完整请求模型汇总所有代理的日志。新建同模型子代理即使尚无自己的测速请求，Last 为 `—`，Avg 仍可显示主控及已结束代理贡献的均值。`usage.model` 和 Magpie `served` 不改变标签或桶。只清理末尾 `[1m]`、`(high)`、`:high` 等已知配置后缀，完整渠道是请求身份的一部分，不以尾名推断渠道；bare model 与 `channel/model` 不相等，同名换渠道也不串。UI 仅隐藏最后 `/` 之前的渠道前缀，命令保留完整名；其它合法冒号部分不删除。

升级清除旧全程和独立估算的速率桶，保留代理、context、effort、workspace 等元数据；仅 `magpie-measured-v1` 且带匹配证据的样本可以进入当前 Last/Avg。

## 统计含义

**Last 和 Avg 直接采用本机 Magpie 的 measured Speed 口径，不带估算 `~`。** 依赖 Magpie v0.1.1792 的请求用量字段及 `ledDecode` 算法；只使用 measured，不混入页面可能显示的 `>=` floor。不保证底层供应商真实 reasoning token 数或推理耗时绝对准确。

- Last：本代理、本完整请求模型最近完成且仍有效的认证测速样本，按 Magpie 完成时间决定先后，较早请求迟到账不覆盖较晚请求。等待、流中、失败、中断、不可测速和等待落账时保留此前 Last。Last 的完整样本证据独立保留，不因 24h Avg 出窗而消失；可靠复核撤销时回退仍保留的更早有效样本，没有则为 `—`。不保留无限回退历史。
- Avg：**本 session、本插件启动后实际观察到的请求**中，所有代理（含已结束）同完整请求模型最近 24 小时有效测速输出 token 总数 / 测速窗口总时长，按 **Magpie 请求完成时间 `t + ms`** 判窗，严格要求完成时间大于 `now - 24h` 且不晚于 now，边界及更早样本出窗；不取每条速度算术平均，不跨 session。例如 149/1294ms 与正文 184/1673ms 合并为 333/2967ms≈112.2 tok/s。
- 没有 reasoning 时用 `out / (ms - ttft_ms)`；reasoning>0 且 first_text>0 时用 `(out - reasoning) / (ms - first_text_ms)`；否则仅在 first_reasoning≥ttft、flow>0、reasoning≤out 时用全部输出及 first_reasoning。
- hidden 且无 first_text、无 TTFT、output≤0、窗口不足100ms、超过10000 tok/s、flow×4<测速窗口、可见 reasoning 后正文突发条件触发、失败/取消/截断均不测速。optional reasoning/flow 省略按 Magpie JSON 为0；status/out/ms/ttft 等必要字段缺失不可补猜。149/1294ms≈115.1；638总输出含454 reasoning，正文184/1673ms≈110.0。

插件优先读取进程 `ANTHROPIC_BASE_URL`，缺失或读取失败才用 `settings.env.ANTHROPIC_BASE_URL`；明确设置的远程/非法地址不回退。只允许无用户名密码的 http(s) `localhost`、`127.0.0.1`、`[::1]` 字面地址。通过无 shell 的 `curl` GET 查询，禁用 curlrc、代理及重定向，仅接受 HTTP 200；连接和进程均有有限超时，缺少 curl、非零退出、输出截断或无效 JSON 时保持未知。无认证信息读取或传播，不保存账号、上游身份、错误正文或请求内容。

访问本地 `/v1/magpie/usage/requests?via=through&computer=this&q=<session>`，客户端复核 `(native_session || session) === $.session.id()`、主控 subagent 为空/子代理 id 精确相等、canonical 完整 `req` 与 step model 相等。只采纳 agent 为 `claude`、`claude-code` 或 `cc`，且 kind、via、computer、source 缺省或为空的本机普通 Claude 请求；title/summary 等用途、非 Claude、同步来源、远程转发、handed_on/rejected 条目不能提供测速。相同匹配条件下的这些冲突条目仍参与歧义判定，不会因提前排除而制造唯一关联。`computer=this` 和客户端字段只能排除有标记的跨机来源，不能识别所有 LAN 直连；session id 也不是完整请求 id。

`turn.step` 不提供 HTTP request id，因此还须网关开始时间处于观察到的 step 起止之间、完成与 step finish 相差不超过2秒，以及 CLI `input+cache_write / output / cache_read` 三元组相等，建立双向唯一一对一关联。缺 usage、0、deferred/retry 导致计数不一致、同 tokens 的 title/summary/fork 候选、一条网关行对应两个 step 都不能产生新测速样本；已有 Last 保留，最新请求状态单独说明原因。本地后处理/排队超过2秒会保守拒绝，不放宽猜测。API 的 q 不检索 native_session；自定义 X-Magpie-Session 覆盖时可能查不到，不能承诺覆盖，查不到不归属。

后台在请求结束至少750ms后，于1秒轮询中开始匹配；延迟落账最多5次指数节流重试，证明前保留已有 Last，没有则为 `—`。网络单飞；优先到期请求，同期优先近期起点，并合并首个起点前后5秒内的待匹配请求。长请求独立分组，超预算只让本组退避，不阻塞其它近期请求。查询使用秒级 `last` period，从本组最早起点前60秒开始；旧认证记录不扩大当前查询。每页最多500、每遍最多8页；读完整页直到看见严格早于本组起点的记录（必须读完起点同毫秒的所有平局）或全量结束，再完整重读此前缀。两遍的 total、顺序、重复及签名任一变化都废弃本批。超过2000条仍可认证已证明完整的近期前缀，超过页数/4秒预算则保守拒绝本组。

本批已读候选与内存工作证据、CAS 回调当前 host state 中的完整 Last/log 证明共同参与按代理、模型和 usage 索引的双向唯一性；历史 Last 不占用工作索引容量，也不能因脱离内存制造唯一关联。只有候选起点范围被本批完整覆盖的旧请求才重新检查原本 key；覆盖内出现歧义、缺失或改 key 时撤销该样本，Avg 不再包含它，Last 回退到保留的有效样本或未知。短窗外旧样本没有复验，不能因本批未读到它而撤销；失败或不稳定查询也不撤销。没有待匹配请求时停止查询，迟到冲突只有在后续查询覆盖该请求时才可能发现，不承诺持续审计。相对 period 依赖 CLI 与 loopback Magpie 使用同机墙钟，60秒余量涵盖4秒批次和普通时钟误差；超过余量的时钟偏差无法从此 API 核验。

工作索引最多4096条，保留 pending、最近24h证据，以及仍可能与当前 pending/新完成 step 共用网关行的过期非 Last 证据（两次 finish 相差最多4秒）。过期非 pending Last 的完整证明留在 host state，脱离工作容量；4096 个已结束模型的历史 Last 不会永久堵住新请求。回收前先向 host state 保存单调时间水位并读回确认，写入失败或证据版本变化不删除内存；reload 恢复水位。后台回收属于选中组的同一次单飞尝试，失败或超时也消耗该组最多5次的指数退避预算，能写状态时标为 unavailable；耗尽后移除本组 pending，不继续每秒写水位或查询，独立新请求保有自己的预算。若后续墙钟回拨使新 step 的 finish 落在已退役水位后4秒以内，保守拒绝新认证，直到完成时间越过该边界；旧 Last 仍按覆盖范围复验。未过期/仍可能冲突的工作证据占满容量时，新请求仍为 unavailable。

每批4秒后尚未提交的结果失效；单次 curl 连接最多1秒、传输最多2秒，宿主进程调用最多2.5秒。查询前捕获本模块证据版本，查询后及实际执行的 CAS 回调检查版本、epoch、lease 和待匹配批次；新完成请求、恢复或清理改变证据时整批放弃认证/撤销，保留未满5次的请求重试。CAS 冲突时用新的 host snapshot 重算匹配。若已发出的 state.set 在证据变化或截止后落地，settle 后按批次只回滚本批改动且仍等于本批结果的字段，保留后来请求的 latestStatus。宿主写入不可取消，撤销前可能被短暂读取；若恰逢模块重载、旧 lease 已失效，迟到提交可能由新模块保留，无法承诺这一交界的原子撤销。挂起期间保持单飞，不影响真实模型流。样本只在会话 host state；恢复时先接入完整证明，再按已持久化水位回收，未匹配证据不跨 reload，旧步骤无观察证据不作历史归属。`turn.complete` 汇总 usage 不重复累计；失败保留此前可信 Last；最新请求状态与 Last 来源分开，turn.complete 和代理终态不改写既有测速状态。

## 生命周期与边界

统计在本 session 的 version 2 host PluginState，每 loop 单独 row，顺序稳定。reload 保留已认证 Magpie 样本与元数据，旧 active 标为 aborted，旧模块用 host generation lease 拒绝异步写回；以 `$.agent.list()` 重建在跑代理元数据。该 API 不含模型，未观察请求的代理保持 unknown/Last —。每1秒 reconcile、每秒错开上下文用量轮询、每5秒工作区刷新在无流时也运行；渲染只读 host state，绝不等网络。每次渲染/详情只遍历一次会话日志生成完整模型聚合映射，各行复用；不重复维护跨会话或易漂移的全局累计。失败 list 保留行；生命周期 revision guard 防止旧 list 覆盖新 turn，只采纳 running、仅明确 completed/failed/killed 收尾，不按 absence 结束新 spawn。reset 成功清 samples/pending 并使旧异步结果失效；active 时仍拒绝，工具间隙保留活跃代理元数据。

`agent.list()` 只涉及本 session 的子代理/teammate，不扫描其它 CLI 或远程 session。API 不列 workflow agent，也无法观察远程 workflow loop；有本地 turn.step 时可单独统计。无实际观察 step 的行永远不推算速度。重复 session.start 不重复创建 timer；session.end 取消 timer 清空统计，不跨会话持久化。

流 hook 只调用一次 next(e)，原样 yield 所有 chunk/ref，原样返回 HookStream.result；不更改请求、顺序或工具 JSON。仪表自身异常被捕获，真实下游错误继续抛出，不重复请求。每个 loop 仅清理自己的 active。

## 开发检查

```sh
claude plugin validate <mod-dir> --strict
tsc -p <mod-dir>
claude plugin test <mod-dir>
```

本目录 tsconfig 开启 strict/noUncheckedIndexedAccess，包含 hooks、tests、自有 types 和生成的 `.claude-plugin/types`。测试使用实际 `claude-code/testing` 和 mock.clock 合成 stream，不联网或调用模型。

测试通过 mock process 模拟 curl，不访问外网或增加模型调用。覆盖 Magpie measured 已核实数值、reasoning/hidden/burst 过滤、必要字段缺失、跨代理加权平均、Last保留与乱序落账/撤销回退、最新请求状态、session/agent/完整渠道隔离、来源冲突、认证后双向复验、稳定前缀分页及同毫秒平局、5000条历史/2502条前缀/4500条超预算组与毫秒差并发负载、延迟落账与写入失败重试上限、curl失败/重定向/截断/超时、reset/clear 迟到保护、独立 host lease 替换及旧证据恢复；保留单次 next、原chunk/ref/result透传、生命周期竞态、上下文/effort/工作区、10格进度条、24/32/49/80/120等宽度预算、两项速率和未知语义。测试框架未提供模块热替换接口，恢复测试使用旧 host state 注入，lease 测试只替换 lease 且不 reset，未声称覆盖真实模块重载。真实会话中的匹配覆盖率及终端字体仍需现场观察，不能从 mock 推断。
