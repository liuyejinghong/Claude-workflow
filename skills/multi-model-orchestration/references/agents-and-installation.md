# 代理可用性与安装排查

skill `multi-model-orchestration` 的按需参考：派发时找不到推荐代理，或安装/加载状态不清时读这里。可用性的权威规则在 skill 首段，本页不重复；把已配置的模型绑定到角色（`/multi-model-orchestration install`）见 [installation.md](installation.md)。

## 四种可用性分支

| 情况 | 动作 | 风险限制 |
|---|---|---|
| 完整：推荐代理都可用 | 按常规选型派发。 | 高风险仍归当前最高能力代理，不为速度下放。 |
| 部分：只有子集可用 | 继续工作，不因个别代理缺失停摆；按现有代理的 description、能力与权限挑最接近的替代（Explore 只读，可做检索；低风险可用 general-purpose）。 | 不降低任务合同要求；高风险不因某个代理缺失降给低能力 worker。 |
| 无自定义代理：只有内置类型 | 内置通用代理可承接委托角色；与主控同模型、但在独立上下文执行，也算职责委托。 | 高风险实现或审查没有能力匹配者时说明缺口、继续无依赖工作，按主文「审查与返工」与可用性规则处理；不因能力不够或强制委托由主控硬接。 |
| 无 Agent 工具 | 规则不强制委托时，主控串行执行并显式切换独立验证视角。 | 项目或用户规则强制委托、或指定模型必须使用时，报告缺口，不静默改为自行执行。 |

审查与修复的约束见 skill 主文「审查与返工」节，本页不重复。

## 安装方式

| 方式 | 内容 | 之后要做 |
|---|---|---|
| 默认（推荐） | `./install.sh` 只复制完整便携 skill 目录（含 `references/`、`assets/`、`scripts/`）到 `~/.claude/skills/`，不安装具名 agent、不改 settings、不写 `CLAUDE.md`。 | 用 `/multi-model-orchestration install` 把环境已有候选绑定到角色（见 [installation.md](installation.md)）；不要求 Magpie。 |
| 手工仅 skill | 把 `skills/multi-model-orchestration/` 整个目录复制到 skills 目录，与默认安装等效。 | 同上；skill 本地资源随目录走。 |
| 个人预设 | `./install.sh --preset` 在默认之外追加安装 7 个示例 agent（6 核心 + 可选 Gemini）与既有 `haiku-5.5-max` 迁移。 | 路由/凭据仍需自行配置；本仓库参考环境为 Magpie，见 [Magpie 路由示例](https://github.com/liuyejinghong/Claude-workflow/blob/main/examples/magpie-routing.md)。 |
| 部分 agent | 只复制已接入的模型定义（预设的或自备的）。 | 缺的模型按「四种可用性分支」处理；也可在 install 分支按描述绑定现有 agent，不做任意能力替换。 |

安装步骤（默认）：

```bash
git clone https://github.com/liuyejinghong/Claude-workflow.git   # 只从可信来源 checkout
cd Claude-workflow
./install.sh
```

`install.sh` 对已有同名文件做唯一非覆盖备份（保留现有文件与更早备份），不改 CLI 配置、provider 或全局 `CLAUDE.md`；目标目录可用 `CLAUDE_HOME` 自定义，settings 根可由 `CLAUDE_CONFIG_DIR` 指定（`CLAUDE_HOME` override 优先）。安装或同步后需重启（新开会话或 `claude --continue`），再查看实际工具目录确认角色可见；新装的 agents 目录不承诺固定生效时间。常驻规则模板 `templates/CLAUDE.md.snippet` 只有一句 skill 引用，按需合并进全局 `~/.claude/CLAUDE.md`。

## 验证与修改边界

- `scripts/verify.sh` 默认只做本地检查（已安装的 skill 文件与所选角色定义，不联网）；`--models` 可选扫描已配置模型/列表；`--smoke` 必须显式设置 `SMOKE_MODEL`（无默认模型）做一次工具往返。列表里包含某模型不等于 CLI 兼容、工具往返可用或压力测试通过。
- 普通使用不改 settings/agents/CLAUDE.md；只有安装分支在具体 preview 与授权 apply 下写入选定字段（四键 env 白名单与 canonical `modelSettings` 限制见 [installation.md](installation.md)）。安装 agent、改本机 settings 或代理配置都需用户明确授权；写前先核对必要字段（优先 helper 白名单摘要）、备份后再写。
- skill 内参考用相对路径（随目录安装，安装副本有效）；仓库/外部文档用绝对 URL。
