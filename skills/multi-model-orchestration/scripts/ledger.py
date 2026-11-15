#!/usr/bin/env python3
"""主控侧的追加式裁定与发现台账：ledger.jsonl 只追加，digest.md 由记录生成。

只有主控写入；审查者仍只在自己的报告里写发现。单一写入者，不加锁。
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

KINDS = ("decision", "decision.supersede", "finding", "finding.verdict")
VERDICTS = ("confirmed", "revoked", "closed", "deferred")
LAYERS = ("code", "check", "test", "rule", "none")
SETTLED = ("confirmed", "closed")
OPTIONS = ("id", "text", "category", "refs", "source", "verdict", "layer", "fix", "by")
FIELDS = {"decision": {"id", "text", "refs", "category"}, "decision.supersede": {"id", "text", "by"},
          "finding": {"id", "text", "category", "refs", "source"},
          "finding.verdict": {"id", "text", "verdict", "layer", "fix"}}
REQUIRED = {"decision": ("id", "text"), "decision.supersede": ("id", "text"),
            "finding": ("id", "text", "category"), "finding.verdict": ("id", "text", "verdict")}
GROUPS = (("pending", "待裁定"), ("confirmed", "成立未关闭"), ("closed", "已关闭"),
          ("revoked", "已撤销"), ("deferred", "暂缓"))


class LedgerError(Exception):
    pass


def ledger_path(directory):
    return os.path.join(directory, "ledger.jsonl")


def load_records(path, allow_missing=False):
    if not os.path.exists(path):
        if allow_missing:
            return []
        raise LedgerError(f"未找到台账文件：{path}（先运行 add）")
    records = []
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                hint = "（写入中断留下的半行，删除该行即可恢复）" if not line.endswith("\n") else ""
                raise LedgerError(f"{path}:{number}: 无法解析的 JSON 行{hint}") from None
            if not isinstance(record, dict) or record.get("kind") not in KINDS \
                    or not isinstance(record.get("seq"), int) \
                    or not isinstance(record.get("id"), str) \
                    or not isinstance(record.get("text"), str):
                raise LedgerError(f"{path}:{number}: 损坏的记录")
            kind = record["kind"]
            if (kind == "finding" and not isinstance(record.get("category"), str)) \
                    or (kind == "decision.supersede" and not isinstance(record.get("by"), str)) \
                    or (kind == "finding.verdict" and record.get("verdict") not in VERDICTS):
                raise LedgerError(f"{path}:{number}: 损坏的 {kind} 记录")
            records.append(record)
    return records


def index(records):
    tables = {kind: {} for kind in KINDS}
    for record in records:
        tables[record["kind"]][record["id"]] = record
    return (tables["decision"], tables["finding"],
            tables["decision.supersede"], tables["finding.verdict"])


def validate_add(kind, values, decisions, findings):
    if kind not in KINDS:
        raise LedgerError(f"未知 kind：{kind}；可用：{', '.join(KINDS)}")
    unknown = sorted(set(values) - FIELDS[kind])
    if unknown:
        raise LedgerError(f"{kind} 不接受字段：{', '.join(unknown)}")
    missing = [name for name in REQUIRED[kind] if not values.get(name)]
    if missing:
        raise LedgerError(f"{kind} 缺少必填字段：{', '.join(missing)}")
    identifier = values["id"]
    if kind in ("decision", "finding"):
        if identifier in decisions or identifier in findings:
            raise LedgerError(f"id 已存在：{identifier}")
        return
    if kind == "decision.supersede":
        if identifier not in decisions:
            raise LedgerError(f"被替代的裁定不存在：{identifier}")
        replacement = values.get("by", "")
        if replacement == identifier:
            raise LedgerError("裁定不能替代自身")
        if replacement and replacement not in decisions:
            raise LedgerError(f"替代者裁定不存在：{replacement}")
        return
    if identifier not in findings:
        raise LedgerError(f"发现不存在：{identifier}")
    verdict = values["verdict"]
    if verdict not in VERDICTS:
        raise LedgerError(f"verdict 必须是：{', '.join(VERDICTS)}")
    if verdict in SETTLED:
        if values.get("layer") not in LAYERS:
            raise LedgerError(f"{verdict} 必须提供 layer：{', '.join(LAYERS)}")
    elif values.get("layer") or values.get("fix"):
        raise LedgerError(f"{verdict} 不接受 layer 或 fix")


def make_record(records, kind, values):
    record = {"seq": max((item["seq"] for item in records), default=0) + 1,
              "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "kind": kind, "id": values["id"], "text": values["text"]}
    record.update({name: values[name] for name in ("category", "refs", "source", "verdict", "layer", "fix")
                   if name in values})
    if kind == "decision.supersede":
        record["by"] = values.get("by", "")
    return record


def append_record(directory, record):
    os.makedirs(directory, exist_ok=True)
    with open(ledger_path(directory), "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def status_of(verdict):
    return verdict["verdict"] if verdict else "pending"


def finding_counts(findings, verdicts):
    table = {}
    for category in sorted({record["category"] for record in findings.values()}):
        counts = {key: 0 for key, _ in GROUPS}
        for identifier, record in findings.items():
            if record["category"] == category:
                counts[status_of(verdicts.get(identifier))] += 1
        table[category] = counts
    return table


def decision_sections(decisions, superseded):
    current, replaced = [], []
    for identifier, record in decisions.items():
        category = f" [{record['category']}]" if record.get("category") else ""
        refs = f"（证据：{', '.join(record['refs'])}）" if record.get("refs") else ""
        event = superseded.get(identifier)
        if event is None:
            current.append(f"- {identifier}{category}：{record['text']}{refs}")
            continue
        reason = f"（{event['text']}）" if event["text"] else ""
        original = f"；原裁定：{record['text']}"
        if event.get("by"):
            replaced.append(f"- {identifier} → {event['by']}{reason}{original}")
        else:
            replaced.append(f"- {identifier} 已撤销{reason}{original}")
    return current, replaced


def render_digest(records):
    decisions, findings, superseded, verdicts = index(records)
    current, replaced = decision_sections(decisions, superseded)
    count = finding_counts(findings, verdicts)
    groups = {key: [] for key, _ in GROUPS}
    for identifier, record in findings.items():
        verdict = verdicts.get(identifier)
        line = f"- {identifier} [{record['category']}]：{record['text']}"
        details = [f"{label}：{verdict[key]}" for label, key in (("处置层", "layer"), ("修复", "fix"))
                   if verdict and verdict.get(key)]
        if details:
            line += "（" + "；".join(details) + "）"
        groups[status_of(verdict)].append(line)
    lines = ["# 裁定与发现台账", "",
             f"生成时间：{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}；"
             f"共 {len(records)} 条记录。", "",
             "## 现行裁定", "", *(current or ["（无）"]), "",
             "## 已被替代/撤销的裁定", "", *(replaced or ["（无）"]), "",
             "## 发现", ""]
    for key, label in GROUPS:
        lines += [f"### {label}", "", *(groups[key] or ["（无）"]), ""]
    lines += ["## 类别计数", "",
              "| 类别 | " + " | ".join(label for _, label in GROUPS) + " | 成立合计 |",
              "| --- |" + " --- |" * (len(GROUPS) + 1)]
    if count:
        for category, counts in count.items():
            settled = counts["confirmed"] + counts["closed"]
            values = [counts[key] for key, _ in GROUPS]
            lines.append(f"| {category} | " + " | ".join(map(str, values)) + f" | {settled} |")
    else:
        lines.append("| （无） |" + " 0 |" * len(GROUPS) + " 0 |")
    return "\n".join(lines) + "\n"


def command_digest(directory, records):
    text = render_digest(records)
    path = os.path.join(directory, "digest.md")
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(temporary, path)
    sys.stdout.write(text)
    return 0


def command_count(records, category):
    _, findings, _, verdicts = index(records)
    table = finding_counts(findings, verdicts)
    if category and category not in table:
        print(f"{category}: 0 成立")
        return 0
    for name in ([category] if category else table):
        layers = [verdicts[identifier]["layer"] for identifier, record in findings.items()
                  if record["category"] == name and status_of(verdicts.get(identifier)) in SETTLED]
        line = f"{name}: {len(layers)} 成立" + (f"（处置层：{', '.join(layers)}）" if layers else "")
        if len(layers) >= 2 and not any(layer in ("check", "test") for layer in layers):
            line += "  需补检查或测试"
        print(line)
    return 0


def command_show(records, identifier):
    selected = [record for record in records
                if record["id"] == identifier or record.get("by") == identifier]
    if not selected:
        raise LedgerError(f"未找到 id：{identifier}")
    print("\n".join(json.dumps(record, ensure_ascii=False) for record in selected))
    return 0


def values_from(args):
    values = {name: getattr(args, name) for name in OPTIONS if getattr(args, name) is not None}
    if "refs" in values:
        values["refs"] = [item.strip() for item in values["refs"].split(",") if item.strip()]
    return {name: value for name, value in values.items() if name == "by" or value not in ("", [])}


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, help="台账目录（ledger.jsonl 与 digest.md）")
    commands = parser.add_subparsers(dest="command", required=True)
    adding = commands.add_parser("add", help="追加一条记录")
    adding.add_argument("--kind", required=True)
    for name in OPTIONS:
        adding.add_argument("--" + name)
    commands.add_parser("digest", help="按当前状态生成摘要并写入 digest.md")
    commands.add_parser("count", help="统计各类别成立发现数").add_argument("--category")
    commands.add_parser("show", help="打印某个 id 的全部记录").add_argument("id")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        directory = os.path.abspath(os.path.expanduser(args.dir))
        if os.path.exists(directory) and not os.path.isdir(directory):
            raise LedgerError(f"--dir 不是目录：{directory}")
        path = ledger_path(directory)
        if args.command == "add":
            records = load_records(path, allow_missing=True)
            decisions, findings, _, _ = index(records)
            values = values_from(args)
            validate_add(args.kind, values, decisions, findings)
            record = make_record(records, args.kind, values)
            append_record(directory, record)
            print(json.dumps(record, ensure_ascii=False))
            return 0
        records = load_records(path)
        if args.command == "digest":
            return command_digest(directory, records)
        if args.command == "count":
            return command_count(records, args.category)
        return command_show(records, args.id)
    except (LedgerError, OSError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
