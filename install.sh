#!/usr/bin/env bash
# 安装可移植编排 skill 和模型中立的岗位资料。Bash 3.2 兼容。
# 默认不改 settings/CLAUDE.md/agents；覆盖前为既有目标创建唯一备份，绝不删除旧 .bak。
# 写入前先做一次简单预检（目标类型/符号链接/来源）；预检失败时不开始任何写入。
# 不做多文件事务：失败时如实报告已完成的阶段与备份位置。
set -euo pipefail

usage() {
  printf '%s\n' \
    '用法：install.sh [--help]' \
    '  默认：只复制完整 skill 目录（含 references/assets/scripts）到 <config>/skills/multi-model-orchestration' \
    '  --preset 已停用，不安装个人模型代理；请在配置可用模型后自行创建或绑定代理。' \
    '配置目录：CLAUDE_HOME > CLAUDE_CONFIG_DIR > HOME/.claude；拒绝符号链接目标；' \
    'skill 备份：<config>/.workflow-backups/install-<唯一名>/multi-model-orchestration（目录权限 0700）；不删除既有备份。'
}

SHOW_HELP=false
for arg in "$@"; do
  case "$arg" in
    --preset)
      printf '%s\n' '错误：--preset 已停用，未写入任何文件；请配置可用模型后自行创建或绑定代理。' >&2
      exit 2
      ;;
    --help|-h) SHOW_HELP=true ;;
    *)
      printf '不支持的参数：%s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done
if [ "$SHOW_HELP" = true ]; then
  usage
  exit 0
fi

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

preflight
install_skill

printf '\n'
printf '完成：可移植编排 skill 已安装到 %s/skills/multi-model-orchestration。\n' "$DEST"
printf '默认未改 settings、agents、角色卡与 CLAUDE.md。\n'
printf '提示：已有 Claude 订阅且所需 Claude 模型全部可用时，直接使用 Claude Code 原生子代理即可，通常无需本项目的角色编排。\n'
printf '下一步（在 Claude Code 中执行）：\n'
printf '  /multi-model-orchestration install\n'
printf '按该 skill 的安装参考完成：适用性检查 → 扫描可用模型 → 角色匹配与上下文选择 → preview 连同配置确认表一次确认 → apply；未经确认不写配置。\n'
printf '本地校验可用 scripts/verify.sh（--models 扫描；--smoke 需显式 SMOKE_MODEL）。\n'
