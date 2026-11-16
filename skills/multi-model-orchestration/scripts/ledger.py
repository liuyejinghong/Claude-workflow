#!/usr/bin/env python3
"""主控侧的追加式决定与问题记录：ledger.jsonl 只追加，digest.md 由记录生成。

记什么：决定、审查发现及其处理结果。谁写：只有主控，审查者仍只在自己的报告里写发现。
何时读：压缩或接手后先读 digest.md，恢复现行决定与未了结的发现。单一写入者，不加锁。
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
OPTIONS = ("id", "text", "category", "refs", "stage", "round", "reviewer",
           "verdict", "layer", "fix", "by")
FIELDS = {"decision": {"id", "text", "refs", "category", "stage"},
          "decision.supersede": {"id", "text", "by"},
          "finding": {"id", "text", "category", "refs", "stage", "round", "reviewer"},
          "finding.verdict": {"id", "text", "verdict", "layer", "fix"}}
REQUIRED = {"decision": ("id", "text"), "decision.supersede": ("id", "text"),
            "finding": ("id", "text", "category"), "finding.verdict": ("id", "text", "verdict")}
GROUPS = (("pending", "待裁定"), ("confirmed", "成立未关闭"), ("closed", "已关闭"),
          ("revoked", "已撤销"), ("deferred", "暂缓"))
UNLABELED_STAGE = "（未标注阶段）"
UNLABELED_ROUND = "（未标注轮次）"
UNLABELED_REVIEWER = "（未标注审查者）"


class LedgerError(Exception):
    pass


def ledger_path(directory):
    return os.path.join(directory, "ledger.jsonl")


def load_records(path, allow_missing=False):
    if not os.path.exists(path):
        if allow_missing:
            return []
        raise LedgerError(f"未找到决定与问题记录：{path}（先运行 add）")
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
            if kind in ("decision", "finding") and record.get("stage") is not None \
                    and not isinstance(record["stage"], str):
                raise LedgerError(f"{path}:{number}: 损坏的 {kind} 记录（stage 必须是字符串）")
            if kind == "finding":
                number_round = record.get("round")
                if number_round is not None and (isinstance(number_round, bool)
                                                 or not isinstance(number_round, int)
                                                 or number_round <= 0):
                    raise LedgerError(f"{path}:{number}: 损坏的 finding 记录（round 必须是正整数）")
                # 旧记录用 source 表示审查者，与 reviewer 同义；只在读取时映射，写入已不再接受 source。
                # 现存 ledger.jsonl 都迁移为 reviewer 后删除这段兼容。
                if "source" in record:
                    if "reviewer" not in record:
                        record["reviewer"] = record["source"]
                    record.pop("source")
                if record.get("reviewer") is not None and not isinstance(record["reviewer"], str):
                    raise LedgerError(f"{path}:{number}: 损坏的 finding 记录（reviewer 必须是字符串）")
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
    if "round" in values:
        number_round = values["round"]
        if isinstance(number_round, bool) or not isinstance(number_round, int) or number_round <= 0:
            raise LedgerError("round 必须是正整数")
    identifier = values["id"]
    if kind in ("decision", "finding"):
        if identifier in decisions or identifier in findings:
            raise LedgerError(f"id 已存在：{identifier}")
        return
    if kind == "decision.supersede":
        if identifier not in decisions:
            raise LedgerError(f"被替代的决定不存在：{identifier}")
        replacement = values.get("by", "")
        if replacement == identifier:
            raise LedgerError("决定不能替代自身")
        if replacement and replacement not in decisions:
            raise LedgerError(f"替代者决定不存在：{replacement}")
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
    record.update({name: values[name] for name in
                   ("category", "refs", "stage", "round", "reviewer", "verdict", "layer", "fix")
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


def is_established(verdict):
    return status_of(verdict) in SETTLED


def finding_counts(findings, verdicts):
    table = {}
    for category in sorted({record["category"] for record in findings.values()}):
        counts = {key: 0 for key, _ in GROUPS}
        for identifier, record in findings.items():
            if record["category"] == category:
                counts[status_of(verdicts.get(identifier))] += 1
        table[category] = counts
    return table


def stage_round_counts(findings, verdicts):
    table = {}
    for identifier, record in findings.items():
        key = (record.get("stage") or UNLABELED_STAGE, record.get("round"))
        counts = table.setdefault(key, [0, 0])
        counts[0] += 1
        counts[1] += int(is_established(verdicts.get(identifier)))
    return table


def stage_sort(label):
    return (label == UNLABELED_STAGE, label)


def round_sort(number):
    return (0, number) if isinstance(number, int) else (1, 0)


def decision_sections(decisions, superseded):
    current, replaced = [], []
    for identifier, record in decisions.items():
        category = f" [{record['category']}]" if record.get("category") else ""
        stage = f"（阶段：{record['stage']}）" if record.get("stage") else ""
        refs = f"（证据：{', '.join(record['refs'])}）" if record.get("refs") else ""
        event = superseded.get(identifier)
        if event is None:
            current.append(f"- {identifier}{category}{stage}：{record['text']}{refs}")
            continue
        reason = f"（{event['text']}）" if event["text"] else ""
        original = f"；原决定：{record['text']}"
        if event.get("by"):
            replaced.append(f"- {identifier} → {event['by']}{reason}{original}")
        else:
            replaced.append(f"- {identifier} 已撤销{reason}{original}")
    return current, replaced


def finding_line(identifier, record, verdict):
    line = f"- {identifier} [{record['category']}]：{record['text']}"
    details = []
    if record.get("stage"):
        details.append(f"阶段：{record['stage']}")
    if record.get("round"):
        details.append(f"轮次：{record['round']}")
    if record.get("reviewer"):
        details.append(f"审查者：{record['reviewer']}")
    for label, key in (("处置层", "layer"), ("修复", "fix")):
        if verdict and verdict.get(key):
            details.append(f"{label}：{verdict[key]}")
    if details:
        line += "（" + "；".join(details) + "）"
    return line


def render_digest(records, include_settled=False):
    decisions, findings, superseded, verdicts = index(records)
    current, replaced = decision_sections(decisions, superseded)
    count = finding_counts(findings, verdicts)
    stage_count = stage_round_counts(findings, verdicts)
    groups = {key: [] for key, _ in GROUPS}
    for identifier, record in findings.items():
        groups[status_of(verdicts.get(identifier))].append(
            finding_line(identifier, record, verdicts.get(identifier)))
    lines = ["# 决定与问题记录", "",
             f"生成时间：{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}；"
             f"共 {len(records)} 条记录。", "",
             "## 现行决定", "", *(current or ["（无）"]), ""]
    if include_settled:
        lines += ["## 已被替代/撤销的决定", "", *(replaced or ["（无）"]), ""]
    elif replaced:
        lines += [f"已被替代/撤销的决定：{len(replaced)} 条（用 digest --all 查看）", ""]
    lines += ["## 发现", ""]
    for key, label in (GROUPS if include_settled else GROUPS[:2]):
        lines += [f"### {label}", "", *(groups[key] or ["（无）"]), ""]
    if not include_settled:
        settled = sum(len(groups[key]) for key in ("closed", "revoked", "deferred"))
        if settled:
            lines += [f"已关闭/已撤销/暂缓：{settled} 条（用 digest --all 查看）", ""]
    lines += ["## 类别统计", "",
              "| 类别 | " + " | ".join(label for _, label in GROUPS) + " | 成立合计 |",
              "| --- |" + " --- |" * (len(GROUPS) + 1)]
    if count:
        for category, counts in count.items():
            settled = counts["confirmed"] + counts["closed"]
            values = [counts[key] for key, _ in GROUPS]
            lines.append(f"| {category} | " + " | ".join(map(str, values)) + f" | {settled} |")
    else:
        lines.append("| （无） |" + " 0 |" * len(GROUPS) + " 0 |")
    lines += ["", "## 阶段×轮次统计", "",
              "| 阶段 | 轮次 | 发现数 | 成立数 |",
              "| --- | --- | --- | --- |"]
    if stage_count:
        for key in sorted(stage_count, key=lambda item: (stage_sort(item[0]), round_sort(item[1]))):
            stage, number_round = key
            counts = stage_count[key]
            shown_round = number_round if isinstance(number_round, int) else UNLABELED_ROUND
            lines.append(f"| {stage} | {shown_round} | {counts[0]} | {counts[1]} |")
    else:
        lines.append(f"| （无） | {UNLABELED_ROUND} | 0 | 0 |")
    return "\n".join(lines) + "\n"


def command_digest(directory, records, include_settled=False):
    default_text = render_digest(records)
    text = render_digest(records, include_settled=True) if include_settled else default_text
    path = os.path.join(directory, "digest.md")
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        handle.write(default_text)
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
                  if record["category"] == name and is_established(verdicts.get(identifier))]
        line = f"{name}: {len(layers)} 成立" + (f"（处置层：{', '.join(layers)}）" if layers else "")
        if len(layers) >= 2 and not any(layer in ("check", "test") for layer in layers):
            line += "  需补检查或测试"
        print(line)
    return 0


def command_stats(records, stage):
    _, findings, _, verdicts = index(records)
    table = {}
    for identifier, record in findings.items():
        if stage and record.get("stage") != stage:
            continue
        entry = table.setdefault(record.get("stage") or UNLABELED_STAGE,
                                 {"rounds": {}, "reviewers": {}})
        counts = entry["rounds"].setdefault(record.get("round"), [0, 0])
        counts[0] += 1
        established = is_established(verdicts.get(identifier))
        counts[1] += int(established)
        reviewer = record.get("reviewer") or UNLABELED_REVIEWER
        entry["reviewers"][reviewer] = entry["reviewers"].get(reviewer, 0) + int(established)
    if not table:
        print(f"阶段 {stage}：无发现记录" if stage else "无发现记录")
        return 0
    blocks = []
    for name in sorted(table, key=stage_sort):
        entry = table[name]
        rounds = entry["rounds"]
        numbered = sorted(number for number in rounds if isinstance(number, int))
        block = [f"阶段 {name}：审查 {len(numbered)} 轮"]
        for number in numbered:
            counts = rounds[number]
            block.append(f"  第 {number} 轮：发现 {counts[0]}，成立 {counts[1]}")
        if None in rounds:
            counts = rounds[None]
            block.append(f"  {UNLABELED_ROUND}：发现 {counts[0]}，成立 {counts[1]}")
        if entry["reviewers"]:
            block.append("  审查者：" + "；".join(
                f"{reviewer} 成立 {entry['reviewers'][reviewer]}"
                for reviewer in sorted(entry["reviewers"])))
        blocks.append("\n".join(block))
    print("\n".join(blocks))
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
    if "round" in values:
        try:
            values["round"] = int(values["round"])
        except (TypeError, ValueError):
            raise LedgerError("round 必须是正整数") from None
    if "refs" in values:
        values["refs"] = [item.strip() for item in values["refs"].split(",") if item.strip()]
    return {name: value for name, value in values.items() if name == "by" or value not in ("", [])}


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, help="记录目录（ledger.jsonl 与 digest.md）")
    commands = parser.add_subparsers(dest="command", required=True)
    adding = commands.add_parser("add", help="追加一条记录")
    adding.add_argument("--kind", required=True)
    for name in OPTIONS:
        adding.add_argument("--" + name)
    digest = commands.add_parser("digest", help="生成决定与问题摘要（默认只列未了结项）")
    digest.add_argument("--all", action="store_true", dest="show_all",
                        help="同时输出已了结项；digest.md 仍写默认版")
    commands.add_parser("count", help="统计各类别成立发现数").add_argument("--category")
    stats = commands.add_parser("stats", help="按阶段与轮次统计审查发现")
    stats.add_argument("--stage")
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
            return command_digest(directory, records, args.show_all)
        if args.command == "count":
            return command_count(records, args.category)
        if args.command == "stats":
            return command_stats(records, args.stage)
        return command_show(records, args.id)
    except (LedgerError, OSError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
