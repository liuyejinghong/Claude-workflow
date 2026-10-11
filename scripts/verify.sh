#!/usr/bin/env bash
# 根入口验证。
# 默认：本地校验已安装 skill（调用 skill 自带 scripts/setup.py verify；无网络）。
# --models：经 setup.py scan --query-models 扫描已配置模型；不要求固定 6 个模型。
# --smoke：必须显式 SMOKE_MODEL（无默认模型）；Messages 工具两轮往返；不先 GET 模型列表。
# 安全：不打印 key 或响应体；不跟随重定向；严格 2xx 检查；python3 -I；临时目录优先 CLAUDE_JOB_DIR/tmp。
set -euo pipefail

usage() {
  printf '%s\n' \
    '用法：verify.sh [--models | --smoke | --help]' \
    '  （无参数）本地校验已安装 skill：python3 -I <skill>/scripts/setup.py verify --config-dir <config>' \
    '  --models  经 setup.py scan --query-models 扫描已配置模型（无 6 模型硬要求）' \
    '  --smoke   显式 Messages 工具往返；必须设置 SMOKE_MODEL 为已确认的真实模型 ID' \
    '配置目录：CLAUDE_HOME > CLAUDE_CONFIG_DIR > HOME/.claude。' \
    '冒烟环境：ANTHROPIC_BASE_URL 与 ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY；' \
    'SMOKE_MODEL 的客户端 [1m] 标记发送前剥离，其余部分（含 provider :max 约定）保持原样。'
}

MODE="verify"
for arg in "$@"; do
  case "$arg" in
    --models)
      if [ "$MODE" != "verify" ]; then
        printf '只接受一个模式参数（--models 或 --smoke）。\n' >&2
        exit 2
      fi
      MODE="models"
      ;;
    --smoke)
      if [ "$MODE" != "verify" ]; then
        printf '只接受一个模式参数（--models 或 --smoke）。\n' >&2
        exit 2
      fi
      MODE="smoke"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf '不支持的参数：%s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

config_dir() {
  if [ -n "${CLAUDE_HOME:-}" ]; then
    printf '%s' "$CLAUDE_HOME"
  elif [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
    printf '%s' "$CLAUDE_CONFIG_DIR"
  else
    printf '%s' "$HOME/.claude"
  fi
}

run_helper() {
  local dest="$1"
  shift
  local setup="$dest/skills/multi-model-orchestration/scripts/setup.py"
  if [ ! -f "$setup" ]; then
    printf '未找到已安装 skill 的 scripts/setup.py：%s\n' "$setup" >&2
    printf '请先在仓库运行 ./install.sh 安装完整 skill（helper 只用 Python 标准库）。\n' >&2
    exit 1
  fi
  python3 -I "$setup" "$@"
}

case "$MODE" in
  verify)
    DEST="$(config_dir)"
    if [ "$DEST" != "/" ]; then
      while [ "${DEST%/}" != "$DEST" ]; do DEST="${DEST%/}"; done
    fi
    printf '本地校验已安装 skill：%s/skills/multi-model-orchestration\n' "$DEST"
    run_helper "$DEST" verify --config-dir "$DEST"
    ;;
  models)
    DEST="$(config_dir)"
    if [ "$DEST" != "/" ]; then
      while [ "${DEST%/}" != "$DEST" ]; do DEST="${DEST%/}"; done
    fi
    printf '扫描已配置模型（setup.py scan --query-models；列表缺失按发现缺口处理，不合成模型）\n'
    run_helper "$DEST" scan --query-models --config-dir "$DEST"
    ;;
  smoke)
    MODEL="${SMOKE_MODEL:-}"
    if [ -z "$MODEL" ]; then
      printf '必须显式设置 SMOKE_MODEL 为已确认的真实模型 ID；不提供默认模型，不隐式使用 Haiku。\n' >&2
      exit 2
    fi
    if [ -z "${ANTHROPIC_BASE_URL:-}" ]; then
      printf 'ANTHROPIC_BASE_URL 未设置。\n' >&2
      exit 2
    fi
    AUTH_TOKEN="${ANTHROPIC_AUTH_TOKEN:-}"
    API_KEY_VALUE="${ANTHROPIC_API_KEY:-}"
    if [ -z "$AUTH_TOKEN" ] && [ -z "$API_KEY_VALUE" ]; then
      printf 'ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY 未设置。\n' >&2
      exit 2
    fi

    BASE="${ANTHROPIC_BASE_URL}"
    while [ "${BASE%/}" != "$BASE" ]; do BASE="${BASE%/}"; done
    case "$BASE" in
      http://*@*|https://*@*)
        printf '拒绝使用含用户信息的 ANTHROPIC_BASE_URL（凭据不进 URL）。\n' >&2
        exit 2
        ;;
      http://*|https://*) ;;
      *)
        printf 'ANTHROPIC_BASE_URL 必须是 http(s) URL。\n' >&2
        exit 2
        ;;
    esac
    case "$BASE" in
      */v1) API="$BASE" ;;
      *) API="$BASE/v1" ;;
    esac

    # 只剥离客户端 [1m] 标记；不伪造、不添加 :max/[1m] 或任何路由前缀。
    SEND_MODEL="$MODEL"
    case "$MODEL" in
      *'[1m]') SEND_MODEL="${MODEL%'[1m]'}" ;;
    esac
    if [ -z "$SEND_MODEL" ]; then
      printf 'SMOKE_MODEL 剥离客户端 [1m] 标记后为空，拒绝发送。\n' >&2
      exit 2
    fi

    if [ -n "${CLAUDE_JOB_DIR:-}" ]; then
      TMP_ROOT="$CLAUDE_JOB_DIR/tmp"
      mkdir -p "$TMP_ROOT"
    else
      TMP_ROOT="${TMPDIR:-/tmp}"
      TMP_ROOT="${TMP_ROOT%/}"
    fi
    VERIFY_TMP="$(mktemp -d "$TMP_ROOT/claude-workflow-verify.XXXXXX")"
    trap 'rm -rf "$VERIFY_TMP"' EXIT

    H=(-H 'content-type: application/json' -H 'anthropic-version: 2023-06-01')
    if [ -n "$AUTH_TOKEN" ]; then
      H+=(-H "Authorization: Bearer $AUTH_TOKEN")
    fi
    if [ -n "$API_KEY_VALUE" ]; then
      H+=(-H "x-api-key: $API_KEY_VALUE")
    fi

    printf '工具往返冒烟（发送生成请求，消耗额度）；冒烟模型：%s\n' "$SEND_MODEL"

    post_messages() {
      local body="$1"
      local out="$2"
      local label="$3"
      local status
      # -q 必须是 curl 之后的第一个参数：禁读用户 ~/.curlrc，避免 location/verbose 让冒烟跟随重定向并泄露凭据。
      if ! status="$(curl -q -sS -m 60 --write-out '%{http_code}' -o "$out" "${H[@]}" --data-binary "@$body" "$API/messages")"; then
        printf '%s：HTTP/连接失败（未打印响应体）；报告上游与可识别错误，不自动降级。\n' "$label" >&2
        return 1
      fi
      case "$status" in
        2[0-9][0-9]) return 0 ;;
        *)
          printf '%s：HTTP 状态 %s（严格 2xx 检查；不跟随重定向；未打印响应体）。\n' "$label" "$status" >&2
          return 1
          ;;
      esac
    }

    python3 -I - "$SEND_MODEL" "$VERIFY_TMP/request1.json" <<'PY'
import json
import sys

request = {
    "model": sys.argv[1],
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Call route_marker with marker WORKFLOW_TOOL_OK. After its result, reply with exactly that returned marker and no other text."}],
    "tools": [{
        "name": "route_marker",
        "description": "Return the supplied marker to verify tool routing.",
        "input_schema": {"type": "object", "properties": {"marker": {"type": "string"}}, "required": ["marker"], "additionalProperties": False},
    }],
    "tool_choice": {"type": "auto"},
}
with open(sys.argv[2], "w") as target:
    json.dump(request, target)
PY

    if ! post_messages "$VERIFY_TMP/request1.json" "$VERIFY_TMP/response1.json" '冒烟首轮'; then
      exit 1
    fi
    python3 -I - "$VERIFY_TMP/request1.json" "$VERIFY_TMP/response1.json" "$VERIFY_TMP/request2.json" <<'PY'
import json
import sys

try:
    with open(sys.argv[1]) as source:
        request = json.load(source)
    with open(sys.argv[2]) as source:
        response = json.load(source)
    if not isinstance(response, dict) or response.get("error") or response.get("type") == "error":
        raise ValueError("首轮返回 API 错误；报告上游与可识别错误，不自动降级")
    if response.get("stop_reason") != "tool_use" or not isinstance(response.get("content"), list):
        raise ValueError("首轮未以 tool_use 结束")
    calls = [block for block in response["content"] if isinstance(block, dict) and block.get("type") == "tool_use"]
    if len(calls) != 1 or calls[0].get("name") != "route_marker" or calls[0].get("input") != {"marker": "WORKFLOW_TOOL_OK"} or not calls[0].get("id"):
        raise ValueError("工具名/参数/ID 不符合合同")
    request["messages"].extend([
        {"role": "assistant", "content": response["content"]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": calls[0]["id"], "content": "WORKFLOW_TOOL_OK"}]},
    ])
    request["tool_choice"] = {"type": "auto"}
    with open(sys.argv[3], "w") as target:
        json.dump(request, target)
    print("  OK 首轮：tool_use，工具名与参数符合合同")
except (OSError, ValueError, TypeError) as error:
    print(f"工具首轮验证失败：{error if not isinstance(error, json.JSONDecodeError) else '无效 JSON'}", file=sys.stderr)
    raise SystemExit(1)
PY

    if ! post_messages "$VERIFY_TMP/request2.json" "$VERIFY_TMP/response2.json" '冒烟最终轮'; then
      exit 1
    fi
    python3 -I - "$VERIFY_TMP/response2.json" <<'PY'
import json
import sys

try:
    with open(sys.argv[1]) as source:
        response = json.load(source)
    if not isinstance(response, dict) or response.get("error") or response.get("type") == "error":
        raise ValueError("最终轮返回 API 错误；报告上游与可识别错误，不自动降级")
    if response.get("stop_reason") != "end_turn" or not isinstance(response.get("content"), list):
        raise ValueError("最终轮未以 end_turn 结束")
    blocks = response["content"]
    if any(not isinstance(block, dict) or block.get("type") == "tool_use" for block in blocks):
        raise ValueError("最终轮存在无效块或未结束的工具调用")
    text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
    if text.strip() != "WORKFLOW_TOOL_OK":
        raise ValueError("最终响应内容不符合合同")
    print("  OK 最终轮：end_turn，WORKFLOW_TOOL_OK")
    print("通过：WORKFLOW_TOOL_OK tool_use -> tool_result -> end_turn（协议冒烟，不是性能 A/B）。")
except (OSError, ValueError, TypeError) as error:
    print(f"工具最终轮验证失败：{error if not isinstance(error, json.JSONDecodeError) else '无效 JSON'}", file=sys.stderr)
    raise SystemExit(1)
PY
    ;;
esac
