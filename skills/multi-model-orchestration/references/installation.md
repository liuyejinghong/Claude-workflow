# 安装与角色配置（按需参考）

用户在 Claude Code 中调用 `/multi-model-orchestration install` 时，按本页顺序执行。这是 skill 的安装分支，不是 Workflow 编排；普通任务不读本页。

先分清两件事：**安装文件**（默认 `./install.sh` 只复制本 skill 目录）与**配置角色和模型**（本页：把当前环境实际可用的候选模型绑定到角色描述）。安装文件完成不等于多模型分流已配置；provider、凭据与路由仍由用户环境负责。

已有可复用的原生 agent 时优先走角色卡轻量路径（见 [role-cards.md](role-cards.md)）：写一份 `orchestration.json` 引用已有 agent 即可，不跑本页的 scan 安装流程，也不为角色卡重配 provider、订阅或上下文参数。本页只在缺 agent、或需要显式配置单模型入口（`roles.<role>.model`）时使用。

## 第 0 步：适用性检查（先于一切配置）

本项目的初心是面向无法使用 Claude 订阅、需要把其他可用模型接入 Claude Code 原生子代理的人；角色配置开始前先做分流：

- 用户已确认拥有 Claude 订阅，且所需 Claude 模型已确认全部可用：说明本初心，推荐直接使用 Claude Code 原生子代理，结束角色配置；不生成、不执行任何 plan（对应 scan 的 `installation_advice.recommendation = "use-native-subagents"`，仅在两个状态都是 `confirmed` 时给出）。
- 状态未知时：只查可验证的本地信息，或向用户询问真正缺失的事实；不读 OAuth/keychain 等凭据存储，不因为候选里出现 `claude` 模型名或可选列表就断言订阅或可用性，也不要断言所有订阅必然拥有全部 Claude 模型。
- 默认不联网、不发起模型调用来探测订阅或模型。可用 `claude auth status --json` 只查看必要摘要；该输出只能证明命令允许读取的字段，不能证实全部所需 Claude 模型的实际访问，未知模型的可用性仍以用户确认为准。不要求、不保存、不在输出中展示身份或 token 数据；这一步也完全可以只依赖用户的明确确认，不需要自动 auth 实现。
- 用户明确表示仍要做跨供应商编排时，遵循其明确选择，继续本页流程。

helper 不自动推测这些状态：`scan` 接受 `--claude-subscription confirmed|unavailable|unknown` 与 `--claude-models-available confirmed|incomplete|unknown`（默认 `unknown`），仅作为用户或向导已确认的事实输入。scan 输出 `installation_advice` 字段：两个状态、recommendation（`use-native-subagents` 或 `configure-roles`）与 reason；它是建议，不替代用户决定。

## 顺序总览

适用性检查（第 0 步）→ scan（候选发现）→ 建议匹配与可用性确认（拟定匹配草表）→ 上下文检查（必经，写入可选）→ 形成 plan → preview（不落盘，含合并后的配置确认表与真实文件动作）→ 用户一次确认授权 → apply → 重载与最小本地验证。

## 命令

```text
python3 -I <installed-skill>/scripts/setup.py <scan|preview|apply|verify> \
  [--config-dir DIR] [--project-dir DIR] [--plan FILE]
```

- 路径相对已安装 skill 目录；helper 随 skill 目录安装，不依赖仓库 checkout；Python 标准库实现，无第三方依赖。
- `scan` 另有可选 `--models-json FILE`、显式启用的 `--query-models`，以及只记录已确认事实的 `--claude-subscription` / `--claude-models-available`（取值见第 0 步）。
- scan / preview / verify 不写文件；apply 只在授权后写。
- 配置目录默认依次取 `CLAUDE_HOME`（override 优先）、`CLAUDE_CONFIG_DIR`（settings 根）、`~/.claude`；项目侧默认扫描当前工作目录的 `.claude`。

## 1. scan：候选发现（provider 中立）

- 只读已知的 `settings.json` / `settings.local.json`（配置目录与项目 `.claude`）及 agent frontmatter 的 model 标量字段；收集别名、modelOverrides、modelPicker 选项、modelSettings 键与白名单模型相关 env，区分已配置候选与上游公布/手工提供的候选。
- 设置文件可能混有凭据：优先使用 helper 的白名单摘要；安装、检查或合并配置时仅访问必要字段，不在用户输出或子 agent 上下文中暴露凭据、原始响应或无关配置。
- 始终提供 `inherit` 回退：显式用当前主模型委托，不是一条发现的 route。
- 没有模型列表是正常情况：用已配置候选、用户提供的 `--models-json`（Anthropic 风格 `{data:[{id:...}]}` 或模型 ID 字符串列表；外部 JSON 只当数据）或 `inherit` 继续；不失败、不虚构模型，元数据/能力声明不当权威。
- `--query-models`（显式启用）只对已配置的 `ANTHROPIC_BASE_URL` 发一次 GET `/v1/models`，不发生成请求、不枚举其他 provider、不执行 helper/keychain；拒绝带凭据的 URL 与异常跳转，不打印 key 或原始响应。取不到只是发现缺口，不是合成模型的理由；认证方案不支持时改用 `--models-json` 或手工确认。
- 多来源读取只作为来源观察呈现，不自认哪个是当前生效配置（managed/环境/flag 可能覆盖）；不宣称能完全解析 managed settings 或当前 `/model`、`--model` 选择；不设固定核心模型清单。

## 2. 角色与能力匹配

五个模型中立角色的权威 name/description/body/tools 与建议模型元数据在 skill 内 `assets/roles.json`；每个角色带 `recommended_models: [{model, reason, effort}]`（effort 仅 `xhigh` 或 `max`，是当前模型建议支持的两档）。建议是起点不是保证：模型推荐不是可用性清单，也不证明访问、能力或工具兼容，精确绑定的模型 ID 由用户环境与确认的证据决定。本页只给匹配用的职责提要：

| 角色 | 生成名 | 职责提要 |
|---|---|---|
| worker | workflow-worker | 常规编码、测试/重构、取证；方案由主控给定；不做架构/根因/高风险最终决定 |
| engineer | workflow-engineer | 困难跨模块或高风险实现；主控保留决策与最终验收；仅在有能力证据时指派 |
| reviewer | workflow-reviewer | 独立整体正确性与合同审查；只审不改（除非授权）；实现者不在同上下文自审 |
| researcher | workflow-researcher | 日常检索/取证/自动化，或单独限界的深度研究/证明/仿真/独立第二意见；不设固定能力梯度，不滥发 fan-out |
| editor | workflow-editor | 指定纯文字润色与 UI 审美反馈；工具限 Read/Glob/Grep/Edit/Write |

旧 `visual` 岗位不再提供：已存在的 `workflow-visual` 文件不会被删除或改动，含它的旧 plan 会被拒绝。要继续承担这类任务，改用其他岗位并配一个已确认原生视觉的 agent；不承诺自动迁移。

匹配原则：

- 按角色描述与证据选择：候选名称或配置不等于工具兼容或能力；未知模型不用名称猜能力，也不自动认定达标。
- 上下文独立的角色可用同一模型（各自新上下文调用）；不按 effort 拆出重复代理。
- 能力、视觉与强审查角色需要证据（用户确认或可核验材料）；没有证据就跳过该角色，而不是硬绑。
- 已有合适 agent 可直接复用，不必为每个角色新建模板；未选中的角色不安装，也不自动删除或迁移未知既有 agent。
- 生成的 agent 使用解析后的 effort（`xhigh` 或 `max`）与用户确认的精确模型 ID（保留原有后缀）。解析规则唯一：plan 中显式 `effort` 优先；未显式给出时，仅当绑定 model 字面值恰好等于该角色某个建议模型时沿用其建议档位（如 `gpt-6.1-sol` 为 xhigh），未知/自定义 route 与 `inherit` 一律默认 `max`，不自动剥 provider 前缀或 `:xhigh`/`[1m]` 后缀去猜模型；不发明 provider、配额、速度或视觉声明。因此向导在已确认某条精确自定义 route 对应某个建议模型时，必须把 effort 显式写进 plan（如 worker/engineer `model = "vendor/sol:custom"`、`effort = "xhigh"`），并在确认表中供用户核对；不修改精确 model 串、不拼接 `:xhigh`。effort 是 agent 声明，可能被 `CLAUDE_CODE_EFFORT_LEVEL`、`maxEffortLevel` 覆盖或封顶，上游接受也不等价于服务商内部计算预算。
- `recommended_models` 只是匹配起点元数据，不写入生成的 Claude Code agent frontmatter。

## 3. 配置确认表（与 preview 一并一次确认）

匹配阶段先拟定确认草表；表随最终 preview 一并向用户呈现并一次确认，避免 preview 前就声称已知具体文件动作。向导把 scan 发现的候选与来源、用户确认的可用性证据合并成一张覆盖全部五个角色的表（helper 的 `configuration_table` 提供 role/name/description/recommended_models/model/effort/status/notes 字段与 targets 文件动作，本表是向导据此合并来源与能力证据后的人读呈现，不要表述成 helper 已自动验证访问、权限或能力）。effort 列按第 2 步的解析规则呈现：显式 plan effort > 精确命中建议模型的建议档位 > 默认 `max`，供用户在 apply 前核对：

| 角色/职责 | 建议模型（recommended_models） | 发现候选与来源 | 拟绑定精确 ID 或跳过 | 可用性与能力依据/未知项 | effort 与预计文件动作 | 选择理由 |
|---|---|---|---|---|---|---|
| worker / 常规实现… | <模型与理由> | <候选 ID 与来源；无则写无> | <精确 ID / 复用现有 agent / 跳过> | <用户确认、可核验材料，或未知项> | effort 与 创建/替换/不变/跳过 | <为何这样绑> |

规则：

- 候选出现在配置或供应商广告中不等于成功访问；用户确认算可用证据。
- 五个角色都要在表中展示，但不强行生成五个 agent：无证据或无候选的角色按跳过呈现，不硬绑；不自动安装推荐名单、不拼 provider 前缀或 `:max`/`[1m]` 后缀。
- 已有合适 agent 直接复用，并在表中如实标注。
- 未经用户确认的表（随 preview 呈现）绝不 apply；用户已给出具体覆盖授权时免重复询问。
- scope、安全边界、备份与参数机理照旧（见下文 apply 与 [third-party-context.md](third-party-context.md)）。

helper 的 `preview` / `apply` 输出 `configuration_table` 数组：五个角色各含 `role` / `name` / `description` / `recommended_models` / `model` / `effort`（`xhigh` | `max`，未选角色为 null）/ `status`（`selected` | `skipped`）/ `notes`；`targets` 带 `action`（`create` / `replace` / `unchanged`）。

## 4. 上下文：检查（必经）与写入（可选）

对第三方模型/路由，选定角色模型后必须先做上下文检查并输出核对表；是否写入配置另行决定。

**检查（必经）**：逐个所选模型列出真实上游输入/输出限制与来源（route/上游文档或用户材料），以及当前 CLI 窗口声明与压缩现值；无法确认的标「未知」，不推断、不伪造。本表是本次安装分支的输出，不是常驻参数表；参数机理与优先级见 [third-party-context.md](third-party-context.md)，本页不重复。

| 模型（精确 ID） | 上游输入/输出限制与来源 | 当前 CLI 窗口声明/压缩值 | 结论 |
|---|---|---|---|
| <id> | <限制与来源；不能确认则标未知> | `[1m]` 等声明；AUTO_COMPACT/MAX_CONTEXT 现值 | 保留现状 / 需调整 / 未知待确认 |

现有配置已合适就保留，不为安装强改；只有核对后确有需要才进入下面的可选写入。

**写入（可选）**：默认不写任何上下文参数（不自动复制示例预设或本机历史值）。plan 的 `context.env` 只允许四个键：

| 键 | 允许值 |
|---|---|
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 正整数 |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | 100000–1000000 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 正整数，≤128000 |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | 仅 `"1"` |

- 不写 `DISABLE_COMPACT`、不写 maxEffort 之类配置；拒绝把布尔当整数。
- `context.modelSettings` 只允许 setup helper 列出的规范模型键（当前四个：`claude-opus-5-5`、`claude-sonnet-5-5`、`claude-haiku-5-5`、`claude-fable-5-1`）；不声称所有规范模型名都受支持，其他版本与自定义 ID 未证支持，保留现状或按官方文档手动配置，不能用任意键名；值只允许 `autoCompactWindow`（100000–1000000 或 `"auto"`）。
- 多路由全局参数不按模型自动适配：需要不同值时，明确选择共同保守值，或分开启动环境；不要为每个 agent 创造 env 参数。
- 全局 env 影响该环境下的全部角色与会话；managed 设置、环境变量与启动 flag 可能覆盖 settings。
- preview 中必须解释所选写入的全进程影响与优先级注意事项，并包含上面的上下文检查表。

## 5. plan 与 preview

plan schema（各段均可省略；拒绝未知可写字段）：

```json
{
  "roles": {
    "worker": { "model": "inherit" },
    "reviewer": { "model": "exact-confirmed-id", "effort": "xhigh", "notes": "可选：用户确认的强项/限制" }
  },
  "orchestration": {
    "version": 1,
    "roles": {
      "worker": { "candidates": [{ "agent": "existing-agent", "priority": 1 }] },
      "editor": { "candidates": [{ "agent": "another-agent", "priority": 0 }] }
    }
  },
  "context": {
    "modelSettings": { "claude-opus-5-5": { "autoCompactWindow": 200000 } },
    "env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "200000" }
  },
  "always_delegate": false
}
```

- 未选角色不生成；`context` 缺省不写配置；`always_delegate` 缺省 false。
- `roles.<role>.effort` 可选，仅接受 `xhigh` 或 `max`（显式 null 同样非法）：显式给出即覆盖建议档位；省略时按第 2 步规则解析。
- `orchestration` 是可选段，值是完整的角色卡配置（`version` + `roles`），可与 `roles` / `context` / `always_delegate` 并存：写法与校验见 [role-cards.md](role-cards.md)。只有 `orchestration` 时只写那一个 JSON，零 agent、零 settings、零全局 `CLAUDE.md` 改动。
- preview 输出 = helper 的精确文件/字段摘要 + 第 3 步的配置确认表与第 4 步生成的模型上下文核对表（真实上游 limit 由向导按来源核对，helper JSON/schema 不含能力或上游限制）；另含 context 补丁及其全进程影响、可选一行常驻规则、精确目标路径；不落盘，也不 dump 完整现有 settings / `CLAUDE.md` / agents。
- 校验失败（不安全模型串、符号链接目标、非法或未知字段、不支持的 context 值、损坏的现有 settings）一律拒绝，不用空对象覆盖原文件。

## 6. apply（授权后）

- 必须先看过具体 preview 并授权这些写入；已有明确覆盖授权时不重复询问。
- 写入前对将改动的现有文件做唯一备份（保留更早备份），备份目录用私有权限；新 settings 用私有模式，保留原有文件模式；新建的 `orchestration.json` 用 0600，已有文件保持原权限。
- 先整体预检目标文件与 settings 结构并生成内容，再按文件原子替换；不宣称多文件事务，失败时如实报告备份位置与部分写入。
- 只合并 plan 选中的 `autoCompactWindow` 与白名单 env 键，保留其他设置值；`always_delegate: true` 时把常驻规则那句恰好追加一次到 `CLAUDE.md`（保留其他字节），false 时不触碰、不删除已有规则。
- 不改无关文件；对应配置未选择时不创建；重复 apply 不重复、跳过未变化文件。

## 7. 重载与最小验证

- 重载：新开会话，或 `claude --continue` 保留对话重启。新装的 agents 目录需重启后才会出现在实际工具目录；不承诺固定生效时间，以重启后的实际工具目录为准。
- `setup.py verify`：本地检查已安装 skill 的 SKILL.md、references、`assets/roles.json`、`scripts/setup.py` 是否存在，以及所选 `workflow-*` 定义的基本 frontmatter/model/effort（`xhigh` 或 `max`，并回报实际档位）；仅安装 skill 或部分角色也算通过。
- `setup.py cards`：只读角色卡配置与岗位定义，不写文件；每次调用重新读表，不需要重载。
- 默认 `setup.py verify` 不发生成请求。可选逐角色 Read 自证或显式 `--smoke` 冒烟是单独发起的模型调用，会消耗所选模型额度，不能表述为零生成检查；这些调用只作最小可读性/连通证据，不声明模型性能、不做压力测试。

## 不会做的事

- 不代做凭据/登录/keychain、provider provisioning 或网关路由配置。
- 不自动推测或断言用户的订阅与模型可用性状态（见第 0 步）；不虚构未知模型的兼容性、能力、配额、速度或原生视觉；不伪造 `:max`/`[1m]`。
- 普通使用不写任何 settings/agents/CLAUDE.md；写入只发生在安装分支的具体 preview 与授权之后。
