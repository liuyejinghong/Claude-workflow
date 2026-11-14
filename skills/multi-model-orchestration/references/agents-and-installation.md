# 代理可用性与安装排查

skill `multi-model-orchestration` 的按需参考：派发时找不到所需代理，或安装/加载状态不清时读这里。可用性的权威规则在 skill 首段，本页不重复；把用户确认的模型绑定到角色（`/multi-model-orchestration install`）见 [installation.md](installation.md)；岗位候选与优先级见 [role-cards.md](role-cards.md)。

## 四种可用性分支

| 情况 | 动作 | 风险限制 |
|---|---|---|
| 完整：所需代理都可用 | 按常规选型派发。 | 高风险仍归当前最高能力代理，不为速度下放。 |
| 部分：只有子集可用 | 继续工作，不因个别代理缺失停摆；按现有代理的 description、能力与权限挑最接近的替代（Explore 只读，可做检索；低风险可用 general-purpose）。 | 不降低任务合同要求；高风险不因某个代理缺失降给低能力 worker。 |
| 无自定义代理：只有内置类型 | 内置通用代理可承接委托角色；与主控同模型、但在独立上下文执行，也算职责委托。 | 高风险实现或审查没有能力匹配者时说明缺口、继续无依赖工作，按主文「审查与返工」与可用性规则处理；不因能力不够或强制委托由主控硬接。 |
| 无 Agent 工具 | 规则不强制委托时，主控串行执行并显式切换独立验证视角。 | 项目或用户规则强制委托、或指定模型必须使用时，报告缺口，不静默改为自行执行。 |

审查与修复的约束见 skill 主文「审查与返工」节，本页不重复。

## 安装方式

| 方式 | 内容 | 之后要做 |
|---|---|---|
| 默认（只装 skill） | `./install.sh` 只复制完整便携 skill 目录（含 `references/`、`assets/`、`scripts/`）与六岗纯职责定义到 `~/.claude/skills/`，不创建模型代理、不写 `orchestration.json`、不预置候选或 priority、不改 settings、不写 `CLAUDE.md`。 | 全新配置且尚无用户绑定时，六岗处于未配置状态。已有角色卡、代理和设置会保留。需要时由用户明确运行 `/multi-model-orchestration install`，向导先探索当前会话已能调用的 agent/模型与用户偏好，再按确认的 `model` 或 `inherit` 绑定（见 [installation.md](installation.md)）；不要求特定网关。 |
| 手工仅 skill | 把 `skills/multi-model-orchestration/` 整个目录复制到 skills 目录，与默认安装等效。 | 同上；skill 本地资源随目录走。 |
| 角色卡（轻量） | 不装任何 agent，只在用户明确要求时写一份 `<config>/orchestration.json`，引用你已有的原生 agent 与 priority。 | 每次读表用 `setup.py cards`；改 priority 即时生效，不需要重载；见 [role-cards.md](role-cards.md)。 |
| 历史命令（已停用） | `./install.sh --preset` 不再安装个人示例模型；执行会明确报错并退出，不写入任何文件。 | 按当前环境实际可用的 agent/模型与偏好，通过安装向导或角色卡显式配置；provider/凭据自行负责。 |
| 自备 agent | 只把你自己的模型定义放到 agents 目录；这不是默认安装的一部分。 | 缺的模型按‘四种可用性分支’处理；也可在 install 分支按用户确认绑定现有 agent，不做任意能力替换。 |

默认安装完成后，skill 与六岗纯职责定义可用。全新配置且尚无用户绑定时，没有角色代理或候选表；已有角色卡、代理和设置会保留，按现有有效规则使用。没有角色卡时，按当前会话实际可用的 agent 与用户指定选型；用户明确要求并确认后，才通过安装向导写新绑定或角色卡。

安装步骤（默认）：

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git   # 只从可信来源 checkout
cd Claude-workflow
./install.sh
```

`install.sh` 覆盖前将旧 skill 整目录备份到 `<config>/.workflow-backups/install-<唯一名>/multi-model-orchestration/`（备份根目录与本次目录权限均为 0700），避免备份中的 `SKILL.md` 被当作活跃 skill；不覆盖更早备份，也不迁移或删除既有旧版 `.bak`。脚本不改 CLI 配置、provider 或全局 `CLAUDE.md`；目标目录可用 `CLAUDE_HOME` 自定义，settings 根可由 `CLAUDE_CONFIG_DIR` 指定（`CLAUDE_HOME` override 优先）。安装或同步后需重启（新开会话或 `claude --continue`），再查看实际工具目录确认 skill 与可用 agent 状态；默认安装不会新增 agent，既有本机 agent、settings 与角色卡配置不受影响。常驻规则模板 `templates/CLAUDE.md.snippet` 只有一句 skill 引用，按需合并进全局 `~/.claude/CLAUDE.md`。

## 验证与修改边界

- `scripts/verify.sh` 默认只做本地检查（已安装的 skill 文件、六岗职责定义与用户明确选择的角色定义（如有），不联网、不发生成请求）；`--models` 可选扫描已配置模型/列表；`--smoke` 必须显式设置 `SMOKE_MODEL`（无默认模型）做一次工具往返。列表里包含某模型不等于 CLI 兼容、工具往返可用或压力测试通过。
- 普通使用不改 settings/agents/CLAUDE.md；只有安装分支在具体 preview 与授权 apply 下写入选定字段（四键 env 白名单与 canonical `modelSettings` 限制见 [installation.md](installation.md)）。安装 agent、改本机 settings 或代理配置都需用户明确授权；写前先核对必要字段（优先 helper 白名单摘要）、备份后再写。
- skill 内参考用相对路径（随目录安装，安装副本有效）；仓库/外部文档用绝对 URL。
