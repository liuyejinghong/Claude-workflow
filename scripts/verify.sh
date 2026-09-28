#!/usr/bin/env bash
# 检查 CPA 是否暴露了所需模型，并确认 GPT 推理强度后缀生效。
# 使用 Claude Code 当前环境中的 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN，不读取也不打印任何 key。
set -euo pipefail
: "${ANTHROPIC_BASE_URL:?ANTHROPIC_BASE_URL 未设置}"
: "${ANTHROPIC_AUTH_TOKEN:?ANTHROPIC_AUTH_TOKEN 未设置}"
H=(-H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" -H "anthropic-version: 2023-06-01" -H "content-type: application/json")

echo "== 模型列表"
# 不带 anthropic-version 头：带上时 CPA 返回 Claude 格式列表，非 Claude 模型名会被改写
models=$(curl -s -m 20 "$ANTHROPIC_BASE_URL/v1/models" -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN")
for m in gpt-6-astra gpt-6-sol glm-5.3 glm-5.3-flash; do
  if grep -q "\"$m\"" <<<"$models"; then echo "  ✓ $m"; else echo "  ✗ $m 未在 CPA 中找到"; fi
done

ask() {
  curl -s -m 300 "$ANTHROPIC_BASE_URL/v1/messages" "${H[@]}" \
    -d "{\"model\":\"$1\",\"max_tokens\":4000,\"messages\":[{\"role\":\"user\",\"content\":\"How many trailing zeros in 125!? Number only.\"}]}" |
    python3 -c "import json,sys;d=json.loads(sys.stdin.read(),strict=False);u=d.get('usage',{});print(d.get('error') or ('thinking_tokens', u.get('output_tokens_details',{}).get('thinking_tokens'), 'output_tokens', u.get('output_tokens')))"
}
echo "== 推理强度后缀（low 的思考 token 应明显少于 xhigh；GLM 不返回 thinking_tokens，显示 None 属正常）"
for m in 'gpt-6-sol(low)' 'gpt-6-sol(xhigh)' 'glm-5.3' 'glm-5.3-flash'; do printf '  %-18s ' "$m"; ask "$m"; done
