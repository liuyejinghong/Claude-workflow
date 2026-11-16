"""决定与问题记录的合同测试；临时目录沿用 test_setup.py 的 WORKFLOW_TEST_TMPDIR 约定。"""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[2]
LEDGER = PROJECT / "skills" / "multi-model-orchestration" / "scripts" / "ledger.py"
JOB_TMP = Path(os.environ.get("WORKFLOW_TEST_TMPDIR", tempfile.gettempdir())).resolve()


class LedgerContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ledger-contract-", dir=JOB_TMP)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.dir = self.root / "ledger"

    def command(self, *arguments):
        return subprocess.run([sys.executable, "-I", "-B", str(LEDGER), "--dir", str(self.dir),
                               *map(str, arguments)], capture_output=True, text=True)

    def add(self, *arguments):
        return self.command("add", *arguments)

    def add_finding(self, identifier, category="logic", **options):
        arguments = ["--kind", "finding", "--id", identifier, "--text", "finding " + identifier,
                     "--category", category]
        for name, value in options.items():
            arguments += ["--" + name, str(value)]
        result = self.add(*arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def add_verdict(self, identifier, verdict, **options):
        arguments = ["--kind", "finding.verdict", "--id", identifier, "--verdict", verdict,
                     "--text", verdict]
        for name, value in options.items():
            arguments += ["--" + name, str(value)]
        result = self.add(*arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def records(self):
        text = (self.dir / "ledger.jsonl").read_text(encoding="utf-8")
        return [json.loads(line) for line in text.splitlines()]

    def section(self, text, heading):
        captured, started = [], False
        for line in text.splitlines():
            if line == heading:
                started = True
            elif started and line.startswith("#"):
                break
            elif started:
                captured.append(line)
        return "\n".join(captured)

    def test_add_computes_seq_and_timestamp(self):
        result = self.add("--kind", "decision", "--id", "D1", "--text", "保留单写入者",
                          "--category", "scope", "--stage", "E1", "--refs", "a.md, b.md")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["seq"], 1)
        result = self.add("--kind", "finding", "--id", "F1", "--text", "缺少边界校验",
                          "--category", "validation", "--stage", "C3b", "--round", "1",
                          "--reviewer", "reviewer-a")
        self.assertEqual(result.returncode, 0, result.stderr)
        first, second = self.records()
        self.assertEqual([first["seq"], second["seq"]], [1, 2])
        self.assertRegex(first["ts"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertEqual(first["refs"], ["a.md", "b.md"])
        self.assertEqual(first["stage"], "E1")
        self.assertEqual(second["category"], "validation")
        self.assertEqual(second["stage"], "C3b")
        self.assertEqual(second["round"], 1)
        self.assertEqual(second["reviewer"], "reviewer-a")

    def test_add_rejects_invalid_records_without_writing(self):
        self.assertEqual(self.add("--kind", "decision", "--id", "D1", "--text", "root").returncode, 0)
        self.assertEqual(self.add("--kind", "finding", "--id", "F1", "--text", "found",
                                  "--category", "logic").returncode, 0)
        before = (self.dir / "ledger.jsonl").read_bytes()
        cases = [
            ("unknown kind", "--kind", "progress", "--id", "X1", "--text", "x"),
            ("unknown field", "--kind", "decision", "--id", "D2", "--text", "x", "--verdict", "confirmed"),
            ("duplicate decision", "--kind", "decision", "--id", "D1", "--text", "again"),
            ("duplicate finding", "--kind", "finding", "--id", "F1", "--text", "again", "--category", "x"),
            ("missing category", "--kind", "finding", "--id", "F2", "--text", "x"),
            ("missing layer", "--kind", "finding.verdict", "--id", "F1", "--verdict", "confirmed", "--text", "ok"),
            ("bad verdict", "--kind", "finding.verdict", "--id", "F1", "--verdict", "maybe", "--text", "x"),
            ("layer on revoked", "--kind", "finding.verdict", "--id", "F1", "--verdict", "revoked",
             "--text", "x", "--layer", "code"),
            ("unknown superseded decision", "--kind", "decision.supersede", "--id", "D9",
             "--by", "D1", "--text", "x"),
            ("unknown replacement", "--kind", "decision.supersede", "--id", "D1",
             "--by", "D9", "--text", "x"),
            ("self supersede", "--kind", "decision.supersede", "--id", "D1", "--by", "D1", "--text", "x"),
            ("unknown finding", "--kind", "finding.verdict", "--id", "F9", "--verdict", "deferred", "--text", "x"),
            ("round zero", "--kind", "finding", "--id", "F3", "--text", "x", "--category", "logic",
             "--round", "0"),
            ("round negative", "--kind", "finding", "--id", "F4", "--text", "x", "--category", "logic",
             "--round", "-1"),
            ("round decimal", "--kind", "finding", "--id", "F5", "--text", "x", "--category", "logic",
             "--round", "1.5"),
            ("round text", "--kind", "finding", "--id", "F6", "--text", "x", "--category", "logic",
             "--round", "abc"),
            ("source removed", "--kind", "finding", "--id", "F7", "--text", "x", "--category", "logic",
             "--source", "sol"),
            ("stage on supersede", "--kind", "decision.supersede", "--id", "D1", "--by", "",
             "--text", "x", "--stage", "E1"),
        ]
        for label, *arguments in cases:
            with self.subTest(case=label):
                result = self.command("add", *arguments)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertRegex(result.stderr, "错误|error")
                self.assertEqual((self.dir / "ledger.jsonl").read_bytes(), before)

    def test_supersede_digest_sections(self):
        for identifier, text in (("D1", "旧决定"), ("D2", "新决定"), ("D3", "待撤销")):
            self.assertEqual(self.add("--kind", "decision", "--id", identifier, "--text", text).returncode, 0)
        self.assertEqual(self.add("--kind", "decision.supersede", "--id", "D1", "--by", "D2",
                                  "--text", "被新证据推翻").returncode, 0)
        self.assertEqual(self.add("--kind", "decision.supersede", "--id", "D3", "--by", "",
                                  "--text", "用户撤销").returncode, 0)
        result = self.command("digest")
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.section(result.stdout, "## 现行决定")
        self.assertIn("D2", current)
        self.assertNotIn("D1", current)
        self.assertNotIn("D3", current)
        self.assertNotIn("## 已被替代/撤销的决定", result.stdout)
        self.assertIn("已被替代/撤销的决定：2 条（用 digest --all 查看）", result.stdout)
        full = self.command("digest", "--all")
        self.assertEqual(full.returncode, 0, full.stderr)
        replaced = self.section(full.stdout, "## 已被替代/撤销的决定")
        self.assertIn("D1 → D2（被新证据推翻）", replaced)
        self.assertIn("D3 已撤销（用户撤销）", replaced)
        self.assertEqual((self.dir / "digest.md").read_text(encoding="utf-8"), result.stdout)
        self.assertNotEqual((self.dir / "digest.md").read_text(encoding="utf-8"), full.stdout)

    def test_verdict_flow_folds_latest_status(self):
        for identifier, category in (("F1", "a"), ("F2", "b"), ("F3", "c"), ("F4", "d")):
            self.add_finding(identifier, category)
        self.add_verdict("F1", "confirmed", layer="check", fix="abc123")
        self.add_verdict("F1", "closed", layer="test")
        self.add_verdict("F2", "deferred")
        self.add_verdict("F3", "revoked")
        result = self.command("digest", "--all")
        self.assertEqual(result.returncode, 0, result.stderr)
        pending = self.section(result.stdout, "### 待裁定")
        confirmed = self.section(result.stdout, "### 成立未关闭")
        closed = self.section(result.stdout, "### 已关闭")
        revoked = self.section(result.stdout, "### 已撤销")
        deferred = self.section(result.stdout, "### 暂缓")
        self.assertIn("F4 [d]", pending)
        self.assertNotIn("F1", confirmed)
        self.assertIn("F1 [a]", closed)
        self.assertIn("处置层：test", closed)
        self.assertIn("F3 [c]", revoked)
        self.assertIn("F2 [b]", deferred)
        self.assertIn("| a | 0 | 0 | 1 | 0 | 0 | 1 |", result.stdout)

    def test_digest_default_hides_settled_and_all_shows_them(self):
        self.add_finding("F1", "logic", stage="C3b", round=1, reviewer="sol")
        self.add_finding("F2", "logic", stage="C3b", round=1, reviewer="glm")
        self.add_finding("F3", "logic", stage="C3b", round=2, reviewer="glm")
        self.add_verdict("F1", "confirmed", layer="test")
        self.add_verdict("F2", "closed", layer="code")
        self.add_verdict("F3", "deferred")
        default = self.command("digest")
        self.assertEqual(default.returncode, 0, default.stderr)
        self.assertIn("### 待裁定", default.stdout)
        self.assertIn("### 成立未关闭", default.stdout)
        self.assertNotIn("### 已关闭", default.stdout)
        self.assertNotIn("### 已撤销", default.stdout)
        self.assertNotIn("### 暂缓", default.stdout)
        self.assertIn("已关闭/已撤销/暂缓：2 条（用 digest --all 查看）", default.stdout)
        self.assertIn("| C3b | 1 | 2 | 2 |", default.stdout)
        self.assertIn("| C3b | 2 | 1 | 0 |", default.stdout)
        full = self.command("digest", "--all")
        self.assertEqual(full.returncode, 0, full.stderr)
        self.assertIn("### 已关闭", full.stdout)
        self.assertIn("### 暂缓", full.stdout)
        self.assertIn("F2 [logic]", self.section(full.stdout, "### 已关闭"))
        self.assertIn("F3 [logic]", self.section(full.stdout, "### 暂缓"))
        self.assertEqual((self.dir / "digest.md").read_text(encoding="utf-8"), default.stdout)

    def test_stats_counts_rounds_and_reviewers(self):
        self.add_finding("F1", "logic", stage="C3b", round=1, reviewer="sol")
        self.add_finding("F2", "logic", stage="C3b", round=1, reviewer="sol")
        self.add_finding("F3", "logic", stage="C3b", round=2, reviewer="glm")
        self.add_finding("F4", "logic", stage="E1", round=1, reviewer="glm")
        self.add_finding("F5", "logic", reviewer="sol")
        self.add_verdict("F1", "confirmed", layer="test")
        self.add_verdict("F2", "closed", layer="code")
        self.add_verdict("F3", "confirmed", layer="test")
        self.add_verdict("F4", "revoked")
        result = self.command("stats")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertIn("阶段 C3b：审查 2 轮", lines)
        self.assertIn("  第 1 轮：发现 2，成立 2", lines)
        self.assertIn("  第 2 轮：发现 1，成立 1", lines)
        self.assertIn("  审查者：glm 成立 1；sol 成立 2", lines)
        self.assertIn("阶段 E1：审查 1 轮", lines)
        self.assertIn("  第 1 轮：发现 1，成立 0", lines)
        self.assertIn("  审查者：glm 成立 0", lines)
        self.assertIn("阶段 （未标注阶段）：审查 0 轮", lines)
        self.assertIn("  （未标注轮次）：发现 1，成立 0", lines)
        self.assertIn("  审查者：sol 成立 0", lines)

    def test_stats_stage_filter(self):
        self.add_finding("F1", "logic", stage="C3b", round=1, reviewer="sol")
        self.add_finding("F2", "logic", stage="E1", round=1, reviewer="glm")
        self.add_verdict("F1", "confirmed", layer="test")
        filtered = self.command("stats", "--stage", "C3b")
        self.assertEqual(filtered.returncode, 0, filtered.stderr)
        self.assertIn("阶段 C3b：审查 1 轮", filtered.stdout)
        self.assertIn("  审查者：sol 成立 1", filtered.stdout)
        self.assertNotIn("E1", filtered.stdout)
        missing = self.command("stats", "--stage", "absent")
        self.assertEqual(missing.returncode, 0, missing.stderr)
        self.assertEqual(missing.stdout.strip(), "阶段 absent：无发现记录")

    def test_legacy_source_reads_as_reviewer(self):
        self.dir.mkdir()
        records = [
            {"seq": 1, "ts": "2026-01-01T00:00:00Z", "kind": "finding", "id": "F1",
             "text": "旧发现", "category": "logic", "source": "old-reviewer"},
            {"seq": 2, "ts": "2026-01-01T00:00:00Z", "kind": "finding.verdict", "id": "F1",
             "text": "确认", "verdict": "confirmed", "layer": "code"},
        ]
        (self.dir / "ledger.jsonl").write_text(
            "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
            encoding="utf-8")
        result = self.command("digest", "--all")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("审查者：old-reviewer", result.stdout)
        stats = self.command("stats")
        self.assertEqual(stats.returncode, 0, stats.stderr)
        self.assertIn("old-reviewer 成立 1", stats.stdout)
        shown = json.loads(self.command("show", "F1").stdout.splitlines()[0])
        self.assertEqual(shown["reviewer"], "old-reviewer")
        self.assertNotIn("source", shown)

    def test_count_and_check_or_test_flag(self):
        findings = (("A1", "logic"), ("A2", "logic"), ("A3", "logic"),
                    ("B1", "contract"), ("B2", "contract"), ("C1", "single"))
        for identifier, category in findings:
            self.add_finding(identifier, category)
        verdicts = (
            ("A1", "confirmed", "code"), ("A2", "closed", "none"), ("A3", "confirmed", "code"),
            ("B1", "confirmed", "check"), ("B2", "closed", "test"), ("C1", "confirmed", "rule"),
        )
        for identifier, verdict, layer in verdicts:
            self.add_verdict(identifier, verdict, layer=layer)
        result = self.command("count")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.splitlines()
        self.assertIn("logic: 3 成立（处置层：code, none, code）  需补检查或测试", lines)
        self.assertIn("contract: 2 成立（处置层：check, test）", lines)
        self.assertIn("single: 1 成立（处置层：rule）", lines)
        filtered = self.command("count", "--category", "logic")
        self.assertEqual(filtered.returncode, 0, filtered.stderr)
        self.assertEqual(filtered.stdout.strip(), "logic: 3 成立（处置层：code, none, code）  需补检查或测试")
        missing = self.command("count", "--category", "absent")
        self.assertEqual(missing.stdout.strip(), "absent: 0 成立")

    def test_dir_that_is_file_rejected(self):
        target = self.root / "not-a-dir"
        target.write_text("x")
        result = subprocess.run([sys.executable, "-I", "-B", str(LEDGER), "--dir", str(target), "digest"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--dir 不是目录", result.stderr)

    def test_corrupt_line_reports_number_and_stops(self):
        self.assertEqual(self.add("--kind", "decision", "--id", "D1", "--text", "root").returncode, 0)
        with open(self.dir / "ledger.jsonl", "a", encoding="utf-8") as handle:
            handle.write("{not json\n")
        for arguments in (("digest",), ("count",), ("stats",), ("show", "D1")):
            with self.subTest(command=arguments[0]):
                result = self.command(*arguments)
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn(":2:", result.stderr)
        result = self.add("--kind", "decision", "--id", "D2", "--text", "x")
        self.assertEqual(result.returncode, 1)
        self.assertIn(":2:", result.stderr)
        self.assertFalse((self.dir / "digest.md").exists())

    def test_corrupt_optional_fields_rejected(self):
        self.dir.mkdir()
        base = {"seq": 1, "ts": "2026-01-01T00:00:00Z", "kind": "finding", "id": "F1",
                "text": "x", "category": "logic"}
        for label, extra in (("round", {"round": 0}), ("round type", {"round": "1"}),
                             ("reviewer", {"reviewer": 3}), ("stage", {"stage": 3}),
                             ("source type", {"source": 3})):
            with self.subTest(case=label):
                (self.dir / "ledger.jsonl").write_text(
                    json.dumps({**base, **extra}, ensure_ascii=False) + "\n", encoding="utf-8")
                result = self.command("digest")
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn("损坏", result.stderr)

    def test_torn_last_line_names_recovery(self):
        self.assertEqual(self.add("--kind", "decision", "--id", "D1", "--text", "root").returncode, 0)
        with open(self.dir / "ledger.jsonl", "a", encoding="utf-8") as handle:
            handle.write('{"seq": 2, "kind": "deci')
        result = self.command("digest")
        self.assertEqual(result.returncode, 1)
        self.assertIn(":2:", result.stderr)
        self.assertIn("半行", result.stderr)

    def test_ledger_is_append_only(self):
        self.assertEqual(self.add("--kind", "decision", "--id", "D1", "--text", "root").returncode, 0)
        before = (self.dir / "ledger.jsonl").read_bytes()
        self.assertEqual(self.add("--kind", "finding", "--id", "F1", "--text", "found",
                                  "--category", "logic").returncode, 0)
        after = (self.dir / "ledger.jsonl").read_bytes()
        self.assertTrue(after.startswith(before))
        self.assertEqual(len(after.splitlines()), 2)
        self.assertEqual(self.command("digest").returncode, 0)
        self.assertEqual((self.dir / "ledger.jsonl").read_bytes(), after)

    def test_show_prints_all_records_for_id(self):
        self.add_finding("F1")
        self.add_verdict("F1", "confirmed", layer="code")
        self.add_verdict("F1", "closed", layer="test")
        result = self.command("show", "F1")
        self.assertEqual(result.returncode, 0, result.stderr)
        shown = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([record["kind"] for record in shown], ["finding", "finding.verdict", "finding.verdict"])
        missing = self.command("show", "F9")
        self.assertEqual(missing.returncode, 1)
        self.assertIn("未找到 id", missing.stderr)

    def test_human_facing_text_does_not_use_old_name(self):
        self.assertEqual(self.add("--kind", "decision", "--id", "D1", "--text", "root").returncode, 0)
        outputs = []
        for arguments in (("--help",), ("add", "--help"), ("digest", "--help"), ("stats", "--help"),
                          ("count", "--help"), ("show", "--help"), ("digest",)):
            result = self.command(*arguments)
            self.assertEqual(result.returncode, 0, result.stderr)
            outputs.append(result.stdout + result.stderr)
        combined = "\n".join(outputs)
        self.assertNotIn("台账", combined)
        self.assertIn("决定与问题记录", combined)


if __name__ == "__main__":
    unittest.main()
