"""发现与裁定台账的合同测试；临时目录沿用 test_setup.py 的 WORKFLOW_TEST_TMPDIR 约定。"""

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
                          "--category", "scope", "--refs", "a.md, b.md")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["seq"], 1)
        result = self.add("--kind", "finding", "--id", "F1", "--text", "缺少边界校验",
                          "--category", "validation", "--source", "reviewer-a")
        self.assertEqual(result.returncode, 0, result.stderr)
        first, second = self.records()
        self.assertEqual([first["seq"], second["seq"]], [1, 2])
        self.assertRegex(first["ts"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertEqual(first["refs"], ["a.md", "b.md"])
        self.assertEqual(second["category"], "validation")
        self.assertEqual(second["source"], "reviewer-a")

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
        ]
        for label, *arguments in cases:
            with self.subTest(case=label):
                result = self.command("add", *arguments)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn("错误", result.stderr)
                self.assertEqual((self.dir / "ledger.jsonl").read_bytes(), before)

    def test_supersede_digest_sections(self):
        for identifier, text in (("D1", "旧裁定"), ("D2", "新裁定"), ("D3", "待撤销")):
            self.assertEqual(self.add("--kind", "decision", "--id", identifier, "--text", text).returncode, 0)
        self.assertEqual(self.add("--kind", "decision.supersede", "--id", "D1", "--by", "D2",
                                  "--text", "被新证据推翻").returncode, 0)
        self.assertEqual(self.add("--kind", "decision.supersede", "--id", "D3", "--by", "",
                                  "--text", "用户撤销").returncode, 0)
        result = self.command("digest")
        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.section(result.stdout, "## 现行裁定")
        replaced = self.section(result.stdout, "## 已被替代/撤销的裁定")
        self.assertIn("D2", current)
        self.assertNotIn("D1", current)
        self.assertNotIn("D3", current)
        self.assertIn("D1 → D2（被新证据推翻）", replaced)
        self.assertIn("D3 已撤销（用户撤销）", replaced)
        self.assertEqual((self.dir / "digest.md").read_text(encoding="utf-8"), result.stdout)

    def test_verdict_flow_folds_latest_status(self):
        for identifier, category in (("F1", "a"), ("F2", "b"), ("F3", "c"), ("F4", "d")):
            self.assertEqual(self.add("--kind", "finding", "--id", identifier, "--text", "finding " + identifier,
                                      "--category", category).returncode, 0)
        for arguments in (
            ["--kind", "finding.verdict", "--id", "F1", "--verdict", "confirmed", "--layer", "check",
             "--text", "确认", "--fix", "abc123"],
            ["--kind", "finding.verdict", "--id", "F1", "--verdict", "closed", "--layer", "test",
             "--text", "已补测试"],
            ["--kind", "finding.verdict", "--id", "F2", "--verdict", "deferred", "--text", "暂缓"],
            ["--kind", "finding.verdict", "--id", "F3", "--verdict", "revoked", "--text", "误报"],
        ):
            result = self.add(*arguments)
            self.assertEqual(result.returncode, 0, result.stderr)
        result = self.command("digest")
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

    def test_count_and_check_or_test_flag(self):
        findings = (("A1", "logic"), ("A2", "logic"), ("A3", "logic"),
                    ("B1", "contract"), ("B2", "contract"), ("C1", "single"))
        for identifier, category in findings:
            self.assertEqual(self.add("--kind", "finding", "--id", identifier, "--text", identifier,
                                      "--category", category).returncode, 0)
        verdicts = (
            ("A1", "confirmed", "code"), ("A2", "closed", "none"), ("A3", "confirmed", "code"),
            ("B1", "confirmed", "check"), ("B2", "closed", "test"), ("C1", "confirmed", "rule"),
        )
        for identifier, verdict, layer in verdicts:
            self.assertEqual(self.add("--kind", "finding.verdict", "--id", identifier, "--verdict", verdict,
                                      "--layer", layer, "--text", verdict).returncode, 0)
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
        for arguments in (("digest",), ("count",), ("show", "D1")):
            with self.subTest(command=arguments[0]):
                result = self.command(*arguments)
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn(":2:", result.stderr)
        result = self.add("--kind", "decision", "--id", "D2", "--text", "x")
        self.assertEqual(result.returncode, 1)
        self.assertIn(":2:", result.stderr)
        self.assertFalse((self.dir / "digest.md").exists())

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
        self.assertEqual(self.add("--kind", "finding", "--id", "F1", "--text", "found",
                                  "--category", "logic").returncode, 0)
        self.assertEqual(self.add("--kind", "finding.verdict", "--id", "F1", "--verdict", "confirmed",
                                  "--layer", "code", "--text", "确认").returncode, 0)
        self.assertEqual(self.add("--kind", "finding.verdict", "--id", "F1", "--verdict", "closed",
                                  "--layer", "test", "--text", "关闭").returncode, 0)
        result = self.command("show", "F1")
        self.assertEqual(result.returncode, 0, result.stderr)
        shown = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([record["kind"] for record in shown], ["finding", "finding.verdict", "finding.verdict"])
        missing = self.command("show", "F9")
        self.assertEqual(missing.returncode, 1)
        self.assertIn("未找到 id", missing.stderr)


if __name__ == "__main__":
    unittest.main()
