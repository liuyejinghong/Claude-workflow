#!/usr/bin/env bash
# 默认仅检查模型列表；显式 --smoke 才消耗 Haiku 生成额度验证工具往返。
# 使用现有环境凭据，不读取配置文件，不打印 key 或原始响应。
set -euo pipefail

SMOKE=false
case "${1:-}" in
  "") ;;
  --smoke) SMOKE=true ;;
  --help|-h)
    printf '%s\n' '用法：verify.sh [--smoke]' \
      '默认 GET 模型列表；--smoke 验证 Haiku tool_use -> tool_result -> end_turn。' \
      '环境：ANTHROPIC_BASE_URL、ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY；可显式设置 SMOKE_MODEL。'
    exit 0 ;;
  *) printf '%s\n' '不支持的参数；用法：verify.sh [--smoke]' >&2; exit 2 ;;
esac
if [ "$#" -gt 1 ]; then
  printf '%s\n' '参数过多；用法：verify.sh [--smoke]' >&2
  exit 2
fi
: "${ANTHROPIC_BASE_URL:?ANTHROPIC_BASE_URL 未设置}"
VERIFY_KEY="${ANTHROPIC_AUTH_TOKEN:-${ANTHROPIC_API_KEY:-}}"
if [ -z "$VERIFY_KEY" ]; then
  printf '%s\n' 'ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY 未设置' >&2
  exit 2
fi
VERIFY_BASE="$ANTHROPIC_BASE_URL"
while [[ "$VERIFY_BASE" == */ ]]; do VERIFY_BASE="${VERIFY_BASE%/}"; done
case "$VERIFY_BASE" in
  */v1) VERIFY_API="$VERIFY_BASE" ;;
  *) VERIFY_API="$VERIFY_BASE/v1" ;;
esac
VERIFY_MODEL="${SMOKE_MODEL:-opencode-go/claude-haiku-5-5:medium}"
VERIFY_TMP="$(mktemp -d "${TMPDIR:-/tmp}/claude-workflow-verify.XXXXXX")"
trap 'rm -rf "$VERIFY_TMP"' EXIT
H=(-H "Authorization: Bearer $VERIFY_KEY" -H "x-api-key: $VERIFY_KEY" \
   -H "anthropic-version: 2023-06-01" -H 'content-type: application/json')

printf '%s\n' '模型列表（无生成请求）'
# 不加 anthropic-version，避免兼容代理改写非 Claude 模型 ID。
if ! curl -sS -f -m 20 "$VERIFY_API/models" \
  -H "Authorization: Bearer $VERIFY_KEY" -H "x-api-key: $VERIFY_KEY" \
  -o "$VERIFY_TMP/models.json"; then
  printf '%s\n' '模型列表 HTTP/连接失败；检查当前路由服务。' >&2
  exit 1
fi
python3 -I - "$VERIFY_TMP/models.json" "${SMOKE_MODEL:-}" <<'PY'
import json
import re
import sys

try:
    with open(sys.argv[1]) as source:
        response = json.load(source)
    if not isinstance(response, dict) or response.get("error") or response.get("type") == "error":
        raise ValueError("模型列表返回 API 错误")
    data = response.get("data")
    if not isinstance(data, list):
        raise ValueError("模型列表缺少 data 数组")
    ids = {item["id"] for item in data if isinstance(item, dict) and isinstance(item.get("id"), str)}
    haiku_ids = ("opencode-go/claude-haiku-5-5",)
    if sys.argv[2]:
        explicit = re.sub(r"\[1m\]$", "", sys.argv[2])
        base = re.sub(r":(?:low|medium|high|xhigh|max)$", "", explicit)
        haiku_ids = (explicit, base)
    required = (
        ("GPT-6.1 Sol", ("gpt-6.1-sol", "codex/gpt-6.1-sol")),
        ("GPT-6 Astra", ("gpt-6-astra", "codex/gpt-6-astra")),
        ("GLM-5.3", ("glm-5.3", "zcode/GLM-5.3")),
        ("GLM-5.3-Flash", ("glm-5.3-flash", "zcode/GLM-5.3-Flash")),
        ("Haiku 5.5", haiku_ids),
    )
    missing = []
    for label, candidates in required:
        found = next((candidate for candidate in candidates if candidate in ids), None)
        if found is None:
            print(f"  缺失 {label}（候选：{', '.join(candidates)}）", file=sys.stderr)
            missing.append(label)
        else:
            print(f"  OK {label}: {found}")
    gemini = "commandcode/google/gemini-3.8-flash"
    if gemini in ids:
        print(f"  OK 可选 Gemini 3.8 Flash: {gemini}")
    else:
        print(f"  未接入可选 Gemini（{gemini}）；不影响其他 agent 与通过结果")
    if missing:
        raise SystemExit(1)
except (OSError, ValueError, TypeError) as error:
    print(f"模型列表解析失败：{error if not isinstance(error, json.JSONDecodeError) else '无效 JSON'}", file=sys.stderr)
    raise SystemExit(1)
PY

if [ "$SMOKE" = false ]; then
  printf '%s\n' '通过：模型列表完整。未发送生成请求；使用 --smoke 显式验证 Haiku。'
  exit 0
fi

printf '%s\n' 'Haiku Messages 工具往返冒烟（消耗生成额度）'
python3 -I - "$VERIFY_MODEL" "$VERIFY_TMP/request1.json" <<'PY'
import json
import sys

request = {
    "model": sys.argv[1],
    "max_tokens": 256,
    "messages": [{"role": "user", "content": "Call route_marker with marker HAIKU_TOOL_OK. After its result, reply with exactly that returned marker and no other text."}],
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

if ! curl -sS -f -m 60 "$VERIFY_API/messages" "${H[@]}" \
  --data-binary "@$VERIFY_TMP/request1.json" -o "$VERIFY_TMP/response1.json"; then
  printf '%s\n' 'Haiku 首轮 HTTP/连接失败；报告上游及可识别窗口/错误，不自动降级或付费。' >&2
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
        raise ValueError("Haiku 首轮返回 API 错误；报告上游及可识别窗口/错误，不自动降级或付费")
    if response.get("stop_reason") != "tool_use" or not isinstance(response.get("content"), list):
        raise ValueError("Haiku 首轮未以 tool_use 结束")
    calls = [block for block in response["content"] if isinstance(block, dict) and block.get("type") == "tool_use"]
    if len(calls) != 1 or calls[0].get("name") != "route_marker" or calls[0].get("input") != {"marker": "HAIKU_TOOL_OK"} or not calls[0].get("id"):
        raise ValueError("Haiku 工具名/参数/ID 不符合合同")
    request["messages"].extend([
        {"role": "assistant", "content": response["content"]},
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": calls[0]["id"], "content": "HAIKU_TOOL_OK"}]},
    ])
    request["tool_choice"] = {"type": "auto"}
    with open(sys.argv[3], "w") as target:
        json.dump(request, target)
    print("  OK 首轮：tool_use，工具名和输入正确")
except (OSError, ValueError, TypeError) as error:
    print(f"工具首轮验证失败：{error if not isinstance(error, json.JSONDecodeError) else '无效 JSON'}", file=sys.stderr)
    raise SystemExit(1)
PY

if ! curl -sS -f -m 60 "$VERIFY_API/messages" "${H[@]}" \
  --data-binary "@$VERIFY_TMP/request2.json" -o "$VERIFY_TMP/response2.json"; then
  printf '%s\n' 'Haiku 最终轮 HTTP/连接失败；报告上游及可识别窗口/错误，不自动降级或付费。' >&2
  exit 1
fi
python3 -I - "$VERIFY_TMP/response2.json" <<'PY'
import json
import sys

try:
    with open(sys.argv[1]) as source:
        response = json.load(source)
    if not isinstance(response, dict) or response.get("error") or response.get("type") == "error":
        raise ValueError("Haiku 最终轮返回 API 错误；报告上游及可识别窗口/错误，不自动降级或付费")
    if response.get("stop_reason") != "end_turn" or not isinstance(response.get("content"), list):
        raise ValueError("Haiku 最终轮未以 end_turn 结束")
    blocks = response["content"]
    if any(not isinstance(block, dict) or block.get("type") == "tool_use" for block in blocks):
        raise ValueError("Haiku 最终轮存在无效块或未结束的工具调用")
    text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text")
    if text.strip() != "HAIKU_TOOL_OK":
        raise ValueError("Haiku 最终响应内容不符合合同")
    print("  OK 最终轮：end_turn，HAIKU_TOOL_OK")
    print("通过：Haiku tool_use -> tool_result -> end_turn；这是协议冒烟，不是性能 A/B。")
except (OSError, ValueError, TypeError) as error:
    print(f"工具最终轮验证失败：{error if not isinstance(error, json.JSONDecodeError) else '无效 JSON'}", file=sys.stderr)
    raise SystemExit(1)
PY
