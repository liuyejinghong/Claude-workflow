# 角色卡：岗位候选与优先级

skill `multi-model-orchestration` 的按需参考：决定"某个岗位用哪些原生 agent、按什么顺序"时读这里。角色卡只管候选与优先级；模型、effort、工具与描述仍以原生 agent 定义为准，JSON 不改 agent 权限，也不代配路由。

## 配置位置与结构

全局配置：`<config>/orchestration.json`，`<config>` 依次取 `CLAUDE_HOME`、`CLAUDE_CONFIG_DIR`、`~/.claude`。

```json
{
  "version": 1,
  "roles": {
    "worker": {
      "candidates": [
        {"agent": "minimax-m3.1-flash-free", "priority": 1},
        {"agent": "deepseek-v4.1-flash-free", "priority": 2},
        {"agent": "deepseek-v4.1-flash", "priority": 3},
        {"agent": "glm-5.3", "priority": 4},
        {"agent": "glm-5.3-flash", "priority": 0}
      ]
    },
    "engineer": {"candidates": [{"agent": "gpt-6.1-sol", "priority": 1}]},
    "reviewer": {
      "candidates": [
        {"agent": "gpt-6.1-sol", "priority": 1},
        {"agent": "gpt-6-astra", "priority": 2}
      ]
    },
    "researcher": {
      "candidates": [
        {"agent": "minimax-m3.1-flash-free", "priority": 1},
        {"agent": "deepseek-v4.1-flash-free", "priority": 2},
        {"agent": "deepseek-v4.1-flash", "priority": 3}
      ]
    },
    "editor": {"candidates": [{"agent": "gemini-3.8-flash", "priority": 1}]}
  }
}
```

- 五个岗位：`worker`、`engineer`、`reviewer`、`researcher`、`editor`。岗位可整体省略，`candidates` 可为空数组。
- `agent` 写你工具目录里**确切的原生 agent 名**（不是模型 ID）；`priority` 是 0..10 的整数，1 最高、10 最低，0 表示该岗位停用；同值按卡内出现顺序。
- 拒绝：bool 当整数、越界 priority、未知字段、同一岗位内 agent 重复。跨岗位可以重复同一 agent。没有 `enabled` 字段——启停只用 priority 表达。
- 卡不复制 model/effort/description：这些以原生 agent 定义为准。

完整示例见 [examples/magpie/orchestration.json](https://github.com/liuyejinghong/Claude-workflow/blob/main/examples/magpie/orchestration.json)：按维护者本机已装的原生 agent 写出，两个 free 档定义（`minimax-m3.1-flash-free` 与 `deepseek-v4.1-flash-free`）已收录在 `examples/magpie/agents/`，可用 `./install.sh --preset` 一并安装；换环境仍要把 `agent` 改成你目录里的确切名字。

## 读取卡

主控每次派发前运行 `cards`（可用 `--role` 只读所选岗位）。

```text
python3 -I <installed-skill>/scripts/setup.py cards [--config-dir DIR] [--role ROLE]
```

- 每次调用都重新读表：改 priority 不需要重启或 reload。
- 输出：`ok` / `command` / `config_path` / `configured` / `roles[]`。`roles[]` 每项含 `role`、`description`、`body`、可选 `tools`、`configured`、`candidates`（启用候选，priority 1..10，按 priority 稳定排序）、`disabled_candidates`（priority 0 的停用项，按卡内原序）。`--role` 只返回该岗位。
- 整个配置文件缺失：`configured` 为 false，明确报告"未配置"，按原有 description 选型流程走，不猜不虚构。
- 配置损坏：直接报告需要修复（指出非法字段），**不**静默回退默认选型。
- 配置文件存在但该岗位被省略、`candidates` 为空或全为 priority 0：该岗位没有可派发候选，报告缺口；**不**回退推荐模型，也不绕过 priority 0 去默认派发。
- 只读本地文件：不读密钥、不联网。

## 运行时怎么用

每次派发前运行 `cards`（可用 `--role` 只读所选岗位），按当前表选候选：

1. 先读岗位定义（职责合同与工具范围）。
2. 结合当前会话工具目录里 agent 的 description 判断适用性、模态与限定条件；只考虑目录里已显示、可直接调用的 agent，文件存在不等于已加载。
3. 在适用、已启用（priority ≥ 1）且已加载的候选里按 priority 选（1 最高、10 最低，同值按卡内顺序）。
4. 本次用户指定的模型优先，但不能默默启用 priority 0 的停用项；要用停用项就改卡，不构造额外确认流程。

冲突口径：卡维护的偏好排序优先于原 agent description 或全局规则里"相对默认/备用"的措辞；职责范围、"仅用户指定才用"这类硬边界仍然有效，照旧按 agent 定义与主控规则执行。

- 找不到能力匹配的候选：报告缺口并继续无依赖工作，不静默替换、不降级硬做。
- 执行中断或产出不达验收：按主控既有的诊断与交接规则处理，不自动重跑。

## 委托合同怎么带进 prompt

- 派发时把所选岗位的 body（职责与交付合同）并入本次 prompt，与任务目标、路径、约束和验收标准合成一份自包含 prompt；不能只报一个 agent 名就派发。
- 岗位带 `tools`（editor 为 Read/Glob/Grep/Edit/Write）时，在合同里显式写出工具范围。
- 卡里的 tools 是合同说明，不是权限控制：JSON 不修改原生 agent 的权限或定义，agent 定义原样使用。

## 写卡（plan 的 orchestration 段）

plan 新增顶层 `orchestration`，值就是上面那份完整配置（`version` + `roles`），可与 `roles`（单模型入口）、`context`、`always_delegate` 并存：

```json
{
  "orchestration": {
    "version": 1,
    "roles": {"worker": {"candidates": [{"agent": "existing-agent", "priority": 1}]}}
  }
}
```

- 走现有 preview → apply → verify：preview 给出目标文件与字段，apply 先做唯一备份，再逐文件原子替换。
- 只有 `orchestration` 时只写这一个 JSON：零 agent、零 settings、零全局 `CLAUDE.md` 改动。新建的配置文件权限 0600；已有文件保持原权限。
- 字段非法、未知字段、越界 priority 等一律拒绝，不用空对象覆盖原文件。

## 什么时候走哪条路

- 已有可复用的原生 agent：写卡即可（轻量路径）。不跑 scan 安装流程，不动 provider、订阅与上下文参数。
- 缺 agent，或要显式配置单模型入口（`roles.<role>.model`）：走 [installation.md](installation.md) 的 scan → 匹配 → 上下文检查 → preview → apply。
- 角色卡不代配路由与凭据。

## 与旧单模型入口的关系

- 旧 `roles.<role>.model` / `effort` 生成的 `workflow-*` 单模型 agent 入口保留可用（兼容路径），覆盖当前五个岗位。
- 新配置优先引用你已有的原生 agent，不为每个岗位再生成一份重复代理。
- 旧 `visual` 岗位不再提供：已存在的 `workflow-visual` 文件不会被删除或改动。要继续用这类能力，改用其他岗位并配一个已确认原生视觉的 agent；不承诺自动迁移。

## 以后加模型

- 已经是已加载的原生 agent：加一条 candidate 与 priority 即可。
- 需要新路由：先装一个原生 agent（路由与凭据由你的环境负责），再在卡里引用；卡不代配路由。
- 改 priority 下次读表即生效；agent 是否有变更以实际工具目录为准。
