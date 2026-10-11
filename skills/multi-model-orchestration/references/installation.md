# 安装与角色配置（按需参考）

用户在 Claude Code 中调用 `/multi-model-orchestration install` 时，按本页顺序执行。这是 skill 的安装分支，不是 Workflow 编排；普通任务不读本页。

先分清两件事：**安装文件**（默认 `./install.sh` 只复制本 skill 目录）与**配置角色和模型**（本页：把当前环境实际可用的候选模型绑定到角色描述）。安装文件完成不等于多模型分流已配置；provider、凭据与路由仍由用户环境负责。

## 顺序总览

scan（候选发现）→ 角色与能力匹配 → 上下文检查（必经，写入可选）→ 形成 plan → preview（不落盘）→ 用户授权后 apply → 重载与最小本地验证。

## 命令

```text
python3 -I <installed-skill>/scripts/setup.py <scan|preview|apply|verify> \
  [--config-dir DIR] [--project-dir DIR] [--plan FILE]
```

- 路径相对已安装 skill 目录；helper 随 skill 目录安装，不依赖仓库 checkout；Python 标准库实现，无第三方依赖。
- `scan` 另有可选 `--models-json FILE`，以及显式启用的 `--query-models`。
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

六个模型中立角色的权威 name/description/body/tools 在 skill 内 `assets/roles.json`；本页只给匹配用的职责提要：

| 角色 | 生成名 | 职责提要 |
|---|---|---|
| worker | workflow-worker | 常规编码、测试/重构、取证；方案由主控给定；不做架构/根因/高风险最终决定 |
| engineer | workflow-engineer | 困难跨模块或高风险实现；主控保留决策与最终验收；仅在有能力证据时指派 |
| reviewer | workflow-reviewer | 独立整体正确性与合同审查；只审不改（除非授权）；实现者不在同上下文自审 |
| visual | workflow-visual | 原生图像/截图证据分析；需确认原生视觉，否则跳过或只用已提取文字 |
| researcher | workflow-researcher | 研究/证明/仿真/限定范围的第二意见；不设固定能力梯度，不滥发 fan-out |
| editor | workflow-editor | 指定纯文字润色与 UI 审美反馈；工具限 Read/Glob/Grep/Edit/Write |

匹配原则：

- 按角色描述与证据选择：候选名称或配置不等于工具兼容或能力；未知模型不用名称猜能力，也不自动认定达标。
- 上下文独立的角色可用同一模型（各自新上下文调用）；不按 effort 拆出重复代理。
- 能力、视觉与强审查角色需要证据（用户确认或可核验材料）；没有证据就跳过该角色，而不是硬绑。
- 已有合适 agent 可直接复用，不必为每个角色新建模板；未选中的角色不安装，也不自动删除或迁移未知既有 agent。
- 生成的 agent 使用 `effort: max` 与用户确认的精确模型 ID（保留原有后缀）；不发明 `:max`、`[1m]`、provider、配额、速度或视觉声明。`effort: max` 是 agent 声明，可能被 `CLAUDE_CODE_EFFORT_LEVEL`、`maxEffortLevel` 覆盖或封顶，上游接受也不等价于服务商内部计算预算。

## 3. 上下文：检查（必经）与写入（可选）

对第三方模型/路由，选定角色模型后必须先做上下文检查并输出核对表；是否写入配置另行决定。

**检查（必经）**：逐个所选模型列出真实上游输入/输出限制与来源（route/上游文档或用户材料），以及当前 CLI 窗口声明与压缩现值；无法确认的标「未知」，不推断、不伪造。本表是本次安装分支的输出，不是常驻参数表；参数机理、优先级与本仓库历史数值口径见 [third-party-context.md](third-party-context.md)，本页不重复。

| 模型（精确 ID） | 上游输入/输出限制与来源 | 当前 CLI 窗口声明/压缩值 | 结论 |
|---|---|---|---|
| <id> | <限制与来源；不能确认则标未知> | `[1m]` 等声明；AUTO_COMPACT/MAX_CONTEXT 现值 | 保留现状 / 需调整 / 未知待确认 |

现有配置已合适就保留，不为安装强改；只有核对后确有需要才进入下面的可选写入。

**写入（可选）**：默认不写任何上下文参数（不自动复制 272000/65536）。plan 的 `context.env` 只允许四个键：

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

## 4. plan 与 preview

plan schema（各段均可省略；拒绝未知可写字段）：

```json
{
  "roles": {
    "worker": { "model": "inherit" },
    "reviewer": { "model": "exact-confirmed-id", "notes": "可选：用户确认的强项/限制" }
  },
  "context": {
    "modelSettings": { "claude-opus-5-5": { "autoCompactWindow": 200000 } },
    "env": { "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "200000" }
  },
  "always_delegate": false
}
```

- 未选角色不生成；`context` 缺省不写配置；`always_delegate` 缺省 false。
- preview 输出 = helper 的精确文件/字段摘要 + 第 3 步生成的模型上下文核对表（真实上游 limit 由向导按来源核对，helper JSON/schema 不含能力或上游限制）；另含将生成的 agent 名/模型/描述摘要、context 补丁及其全进程影响、可选一行常驻规则、精确目标路径；不落盘，也不 dump 完整现有 settings / `CLAUDE.md` / agents。
- 校验失败（不安全模型串、符号链接目标、非法或未知字段、不支持的 context 值、损坏的现有 settings）一律拒绝，不用空对象覆盖原文件。

## 5. apply（授权后）

- 必须先看过具体 preview 并授权这些写入；已有明确覆盖授权时不重复询问。
- 写入前对将改动的现有文件做唯一备份（保留更早备份），备份目录用私有权限；新 settings 用私有模式，保留原有文件模式。
- 先整体预检目标文件与 settings 结构并生成内容，再按文件原子替换；不宣称多文件事务，失败时如实报告备份位置与部分写入。
- 只合并 plan 选中的 `autoCompactWindow` 与白名单 env 键，保留其他设置值；`always_delegate: true` 时把常驻规则那句恰好追加一次到 `CLAUDE.md`（保留其他字节），false 时不触碰、不删除已有规则。
- 不改无关文件；对应配置未选择时不创建；重复 apply 不重复、跳过未变化文件。

## 6. 重载与最小验证

- 重载：新开会话，或 `claude --continue` 保留对话重启。新装的 agents 目录需重启后才会出现在实际工具目录；不承诺固定生效时间，以重启后的实际工具目录为准。
- `setup.py verify`：本地检查已安装 skill 的 SKILL.md、references、`assets/roles.json`、`scripts/setup.py` 是否存在，以及所选 `workflow-*` 定义的基本 frontmatter/model/effort:max；仅安装 skill 或部分角色也算通过。
- 默认 `setup.py verify` 不发生成请求。可选逐角色 Read 自证或显式 `--smoke` 冒烟是单独发起的模型调用，会消耗所选模型额度，不能表述为零生成检查；这些调用只作最小可读性/连通证据，不声明模型性能、不做压力测试。

## 不会做的事

- 不代做凭据/登录/keychain、provider provisioning 或路由配置；不替用户创建 Magpie route。
- 不虚构未知模型的兼容性、能力、配额、速度或原生视觉；不伪造 `:max`/`[1m]`。
- 普通使用不写任何 settings/agents/CLAUDE.md；写入只发生在安装分支的具体 preview 与授权之后。
