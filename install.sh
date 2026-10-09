#!/usr/bin/env bash
# 把 subagent 与 skill 安装到 ~/.claude（全局可用）。已存在的同名文件会先备份为 *.bak。
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${CLAUDE_HOME:-$HOME/.claude}"
mkdir -p "$DEST/agents" "$DEST/skills"

for f in "$SRC"/agents/*.md; do
  t="$DEST/agents/$(basename "$f")"
  [ -e "$t" ] && cp "$t" "$t.bak"
  cp "$f" "$t" && echo "agent  → $t"
done

s="$DEST/skills/multi-model-orchestration"
[ -e "$s" ] && rm -rf "$s.bak" && mv "$s" "$s.bak"
cp -R "$SRC/skills/multi-model-orchestration" "$s" && echo "skill  → $s"

cat <<MSG

完成：已同步 6 个 agent 与编排 skill，未修改 settings 或上游配置。其中 gemini-3.8-flash 为可选专项（文案/UI），需要自行在 Magpie 配置 commandcode 路由。接下来：
  1. 按 README 和 examples/magpie-routing.md 在 Magpie UI 统一确认上游与路由；Haiku 可选，需要 OpenCode Go；Gemini 可选，需要 Command Code。
  2. 把 templates/CLAUDE.md.snippet 合并进 $DEST/CLAUDE.md，保留其他章节；重载常驻规则。
  3. 运行 scripts/verify.sh 仅检查模型列表；显式 --smoke 才消耗 Haiku 生成额度验证工具往返。
  4. 当前 GPT 使用 codex/...:high（272k、无 [1m]）；GLM 与 Haiku 使用 [1m]，Haiku 为 :medium[1m]。
  5. 现有 agents 目录变化通常几秒后生效；若当前会话未识别新 agent，claude --continue 重启保留对话。
  6. 单次输出上限：Gemini 上游最高 65536。若 CLAUDE_CODE_MAX_OUTPUT_TOKENS 高于 65536 会 400，需将实际会话值调至 <=65536，例如 --settings '{"env":{"CLAUDE_CODE_MAX_OUTPUT_TOKENS":"65536"}}'（影响该会话全部模型）。本脚本不会修改该设置。
  分工与额度证据见 README.md 和 docs/haiku-vs-glm-flash.md。
MSG
