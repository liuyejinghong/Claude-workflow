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

完成。接下来：
  1. 按 examples/cpa-config.example.yaml 在 CPA 中配置 GLM 上游（GPT 需在 CPA 中完成 Codex 登录）
  2. 把 templates/CLAUDE.md.snippet 合并进 $DEST/CLAUDE.md
  3. 运行 scripts/verify.sh 检查模型与推理强度
  4. 重启 Claude Code（claude --continue 可保留对话）
MSG
