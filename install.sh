#!/usr/bin/env bash
# 安装可移植编排 skill；--preset 额外安装 examples/magpie/agents 的 8 个示例 agent（Magpie 个人示例）并迁移旧档 haiku-5.5-max.md。
# 默认不改 settings/CLAUDE.md/agents；覆盖前为既有目标创建唯一备份，绝不删除旧 .bak。Bash 3.2 兼容。
# 写入前先做一次简单预检（目标类型/符号链接/来源）；预检失败时不开始任何写入。
# 不做多文件事务：失败时如实报告已完成的阶段与备份位置。
set -euo pipefail

usage() {
  printf '%s\n' \
    '用法：install.sh [--preset] [--help]' \
    '  默认：只复制完整 skill 目录（含 references/assets/scripts）到 <config>/skills/multi-model-orchestration' \
    '  --preset：另安装 8 个示例 agent（examples/magpie/agents，本仓库 Magpie 个人示例），并迁移旧档 haiku-5.5-max.md（唯一备份，不覆盖旧 .bak）' \
    '配置目录：CLAUDE_HOME > CLAUDE_CONFIG_DIR > HOME/.claude；拒绝符号链接目标；' \
    'skill 备份：<config>/.workflow-backups/install-<唯一名>/multi-model-orchestration（目录权限 0700）；' \
    'preset agent 备份：<原名>.bak.<时间戳>.<PID>（冲突时追加序号）；不删除任何既有备份。'
}

PRESET=false
for arg in "$@"; do
  case "$arg" in
    --preset) PRESET=true ;;
    --help|-h) usage; exit 0 ;;
    *)
      printf '不支持的参数：%s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

SRC="$(cd "$(dirname "$0")" && pwd)"

if [ -n "${CLAUDE_HOME:-}" ]; then
  DEST="$CLAUDE_HOME"
elif [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
  DEST="$CLAUDE_CONFIG_DIR"
else
  DEST="$HOME/.claude"
fi
if [ "$DEST" != "/" ]; then
  while [ "${DEST%/}" != "$DEST" ]; do DEST="${DEST%/}"; done
fi

# 唯一备份路径：永不覆盖既有 .bak；时间戳+PID 冲突时追加序号。
unique_backup_path() {
  local base="$1.bak.$(date +%Y%m%d%H%M%S).$$"
  local candidate="$base"
  local n=1
  while [ -e "$candidate" ] || [ -L "$candidate" ]; do
    candidate="$base.$n"
    n=$((n + 1))
  done
  printf '%s' "$candidate"
}

require_dir_target() {
  if [ -L "$1" ]; then
    printf '错误：%s（%s）是符号链接，拒绝写入。\n' "$1" "$2" >&2
    exit 2
  fi
  if [ -e "$1" ] && [ ! -d "$1" ]; then
    printf '错误：%s（%s）已存在且不是目录，未改动。\n' "$1" "$2" >&2
    exit 2
  fi
}

require_file_target() {
  if [ -L "$1" ]; then
    printf '错误：%s（%s）是符号链接，拒绝覆盖。\n' "$1" "$2" >&2
    exit 2
  fi
  if [ -e "$1" ] && [ ! -f "$1" ]; then
    printf '错误：%s（%s）已存在且不是普通文件，未改动。\n' "$1" "$2" >&2
    exit 2
  fi
}

# 失败/中断时可恢复：只清理本脚本用 mktemp 新建的暂存目录；
# 若目标缺失而备份仍在（换入失败场景），还原备份。不声称多文件事务。
stage_dir=""
backup_dir=""
install_target=""
cleanup() {
  code=$?
  if [ -n "$stage_dir" ] && [ -e "$stage_dir" ]; then
    rm -rf "$stage_dir"
  fi
  if [ "$code" -ne 0 ] && [ -n "$backup_dir" ] && [ -e "$backup_dir" ] \
    && [ -n "$install_target" ] && [ ! -e "$install_target" ]; then
    if mv "$backup_dir" "$install_target" 2>/dev/null; then
      printf '错误：skill 安装未完成，已还原原目录（该目录未改动）。\n' >&2
    else
      printf '错误：skill 安装未完成且无法自动还原；原目录备份在 %s\n' "$backup_dir" >&2
    fi
  fi
  return 0
}
trap cleanup EXIT

# 简单预检：在任何写入之前检查全部将触碰的目标与来源。失败即退出，尚未开始写入。
preflight() {
  if [ -L "$DEST" ]; then
    printf '错误：配置目录 %s 是符号链接，拒绝安装；请使用真实目录。\n' "$DEST" >&2
    exit 2
  fi
  if [ -e "$DEST" ] && [ ! -d "$DEST" ]; then
    printf '错误：配置目录 %s 已存在且不是目录，未改动。\n' "$DEST" >&2
    exit 2
  fi
  if [ ! -d "$SRC/skills/multi-model-orchestration" ] || [ ! -f "$SRC/skills/multi-model-orchestration/SKILL.md" ]; then
    printf '错误：仓库缺少 skill 目录或 SKILL.md（%s/skills/multi-model-orchestration），未安装。\n' "$SRC" >&2
    exit 1
  fi
  require_dir_target "$DEST/skills" "skills 目录"
  require_dir_target "$DEST/skills/multi-model-orchestration" "skill 目标"
  require_dir_target "$DEST/.workflow-backups" "skill 备份根目录"
  if [ "$PRESET" = true ]; then
    if [ ! -d "$SRC/examples/magpie/agents" ]; then
      printf '错误：仓库缺少 %s，未安装 preset agents。\n' "$SRC/examples/magpie/agents" >&2
      exit 1
    fi
    require_dir_target "$DEST/agents" "agents 目录"
    local f
    for f in "$SRC/examples/magpie/agents"/*.md; do
      [ -e "$f" ] || continue
      require_file_target "$DEST/agents/$(basename "$f")" "agent 目标"
    done
    require_file_target "$DEST/agents/haiku-5.5-max.md" "旧档 haiku-5.5-max"
  fi
}

install_skill() {
  local src="$SRC/skills/multi-model-orchestration"
  local parent="$DEST/skills"
  local target="$parent/multi-model-orchestration"
  local stage_root stage backup_root backup_session

  require_dir_target "$parent" "skills 目录"
  mkdir -p "$parent"
  require_dir_target "$target" "skill 目标"

  # 暂存目录用 mktemp 新建：唯一命名，绝不删除已存在的碰撞目录；失败清理只清这一份。
  stage_root="$(mktemp -d "$parent/.multi-model-orchestration.stage.XXXXXX")"
  stage="$stage_root/multi-model-orchestration"
  stage_dir="$stage_root"
  if ! cp -R "$src" "$stage"; then
    rm -rf "$stage_root"
    stage_dir=""
    printf '错误：复制 skill 到暂存目录失败；目标未改动，未写入任何文件。\n' >&2
    exit 1
  fi

  install_target="$target"
  if [ -e "$target" ]; then
    # 完整 skill 备份必须留在 skills 之外，避免旧 SKILL.md 被 CLI 再次发现。
    backup_root="$DEST/.workflow-backups"
    require_dir_target "$backup_root" "skill 备份根目录"
    mkdir -p "$backup_root"
    chmod 700 "$backup_root"
    backup_session="$(mktemp -d "$backup_root/install-XXXXXX")"
    chmod 700 "$backup_session"
    backup_dir="$backup_session/multi-model-orchestration"
    mv "$target" "$backup_dir"
  fi
  if ! mv "$stage" "$target"; then
    printf '错误：写入目标目录失败，尝试还原备份。\n' >&2
    exit 1
  fi
  stage_dir=""
  rmdir "$stage_root" 2>/dev/null || true

  printf 'skill → %s\n' "$target"
  if [ -n "$backup_dir" ]; then
    printf '备份 → %s\n' "$backup_dir"
  fi
}

install_preset_agents() {
  local src_agents="$SRC/examples/magpie/agents"
  local parent="$DEST/agents"
  local count=0
  local f name t b

  require_dir_target "$parent" "agents 目录"
  mkdir -p "$parent"

  for f in "$src_agents"/*.md; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    t="$parent/$name"
    b=""
    require_file_target "$t" "agent 目标"
    if [ -e "$t" ]; then
      b="$(unique_backup_path "$t")"
      if ! cp -p "$t" "$b"; then
        printf '错误：备份 %s 失败；安装不完整：skill 已安装、agent 已写入 %s 个；%s 未改动。\n' "$t" "$count" "$t" >&2
        exit 1
      fi
      printf '备份 → %s\n' "$b"
    fi
    if ! cp "$f" "$t"; then
      if [ -n "$b" ]; then
        printf '错误：写入 %s 失败；安装不完整：skill 已安装、agent 已写入 %s 个；原文件备份在 %s。\n' "$t" "$count" "$b" >&2
      else
        printf '错误：写入 %s 失败；安装不完整：skill 已安装、agent 已写入 %s 个；该文件此前不存在，无备份。\n' "$t" "$count" >&2
      fi
      exit 1
    fi
    printf 'agent  → %s\n' "$t"
    count=$((count + 1))
  done

  # 迁移：清理已停用的旧别名 haiku-5.5-max；保留唯一备份（不覆盖已有 *.bak）。不改动用户自有的 haiku-5.5.md 等自定义 agent。
  local old="$parent/haiku-5.5-max.md"
  require_file_target "$old" "旧档 haiku-5.5-max"
  if [ -e "$old" ]; then
    b="$(unique_backup_path "$old")"
    if ! cp -p "$old" "$b"; then
      printf '错误：迁移前备份 %s 失败；安装不完整：skill 已安装、%s 个 agent 已写入；旧档未改动。\n' "$old" "$count" >&2
      exit 1
    fi
    if ! rm "$old"; then
      printf '错误：移除旧档 %s 失败；安装不完整：skill 已安装、%s 个 agent 已写入；备份在 %s，旧档仍存在。\n' "$old" "$count" "$b" >&2
      exit 1
    fi
    printf '迁移 → %s（已移除旧档 haiku-5.5-max.md）\n' "$b"
  fi

  printf 'preset：已安装 %s 个示例 agent；示例模型与路由需在你的环境确认后才可用。\n' "$count"
}

preflight
install_skill
if [ "$PRESET" = true ]; then
  install_preset_agents
fi

printf '\n'
printf '完成：可移植编排 skill 已安装到 %s/skills/multi-model-orchestration。\n' "$DEST"
if [ "$PRESET" = true ]; then
  printf 'preset 另安装了 8 个示例 agent（examples/magpie 的 Magpie 个人示例；示例路由不是安装前提，需按你的环境确认）。\n'
fi
printf '默认未改 settings、agents（preset 除外）与 CLAUDE.md。\n'
printf '提示：已有 Claude 订阅且所需 Claude 模型全部可用时，直接使用 Claude Code 原生子代理即可，通常无需本项目的角色编排。\n'
printf '下一步（在 Claude Code 中执行）：\n'
printf '  /multi-model-orchestration install\n'
printf '按该 skill 的安装参考完成：适用性检查 → 扫描可用模型 → 角色匹配与上下文选择 → preview 连同配置确认表一次确认 → apply；未经确认不写配置。\n'
printf '本地校验可用 scripts/verify.sh（--models 扫描；--smoke 需显式 SMOKE_MODEL）。\n'
