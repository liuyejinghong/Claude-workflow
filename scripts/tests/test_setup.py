"""Contract tests; all installation fixtures live under the authorized job tmp."""

import contextlib
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest import mock


PROJECT = Path(__file__).resolve().parents[2]
HELPER = PROJECT / "skills" / "multi-model-orchestration" / "scripts" / "setup.py"
JOB_TMP = Path(os.environ.get("WORKFLOW_TEST_TMPDIR", tempfile.gettempdir())).resolve()
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("workflow_setup_contract", HELPER)
SETUP = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SETUP
SPEC.loader.exec_module(SETUP)


class SetupContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="setup-contract-", dir=JOB_TMP)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.config = self.root / "config"
        self.project = self.root / "project"
        self.project.mkdir()
        self.environment = {"HOME": str(self.root / "home"), "PATH": os.environ.get("PATH", ""),
                            "CLAUDE_CONFIG_DIR": str(self.config), "PYTHONDONTWRITEBYTECODE": "1"}
        self.env_patch = mock.patch.dict(os.environ, self.environment, clear=True)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def put_json(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
        return path

    def command(self, *arguments, helper=HELPER):
        return subprocess.run([sys.executable, "-I", "-B", str(helper), *map(str, arguments)],
                              cwd=self.project, env=dict(os.environ), capture_output=True, text=True)

    def files(self):
        return {str(path.relative_to(self.root)): (path.read_bytes(), stat.S_IMODE(path.stat().st_mode))
                for path in self.root.rglob("*") if path.is_file()}

    def test_role_assets_limits_and_exact_models(self):
        assets = SETUP.load_assets()
        self.assertEqual(set(assets), set(SETUP.ROLE_NAMES))
        self.assertEqual(assets["editor"]["tools"], SETUP.EDITOR_TOOLS)
        for role, asset in assets.items():
            self.assertEqual(asset["name"], "workflow-" + role)
            self.assertIn("First use Read", asset["body"])
            self.assertIn("actual", asset["body"])
            self.assertIn("scope" if role != "researcher" else "scoped", asset["body"])
        self.assertIn("without edits", assets["reviewer"]["body"])
        self.assertIn("same context", assets["reviewer"]["body"])
        model = 'vendor/model:existing[1m]"quoted'
        rendered = SETUP.render_agent(assets["worker"], {"model": model}).decode()
        values = SETUP.frontmatter_scalars(rendered.encode())
        self.assertEqual(values["model"], model)
        self.assertEqual(values["effort"], "max")
        self.assertNotIn(":max", rendered)

    def test_quoted_frontmatter_comments_preserve_exact_scalars(self):
        cases = (
            ('"vendor/exact-model" # confirmed provider route', "vendor/exact-model"),
            ("'vendor/exact-model'\t# confirmed provider route", "vendor/exact-model"),
            (json.dumps('vendor/model#variant:with"quote\\escape') + " # comment",
             'vendor/model#variant:with"quote\\escape'),
            ("'vendor/model#variant:it''s' # comment", "vendor/model#variant:it's"),
            ("vendor/plain#variant\t# comment", "vendor/plain#variant"),
        )
        for scalar, expected in cases:
            with self.subTest(scalar=scalar):
                data = ("---\nmodel: " + scalar + "\n---\n").encode()
                self.assertEqual(SETUP.frontmatter_scalars(data)["model"], expected)
        for scalar in ('"vendor/model"#comment', '"vendor/model"garbage',
                       '"vendor/model" garbage', "'vendor/model'#comment", "'vendor/model'garbage",
                       "'vendor/model' garbage", "'unterminated"):
            with self.subTest(invalid=scalar):
                data = ("---\nmodel: " + scalar + "\n---\n").encode()
                with self.assertRaises(SETUP.SetupError):
                    SETUP.frontmatter_scalars(data)

    def test_scan_agent_only_quoted_comment_without_discovery_gap(self):
        path = self.config / "agents" / "only-model.md"
        path.parent.mkdir(parents=True)
        for scalar in ('"vendor/exact-model" # confirmed provider route',
                       "'vendor/exact-model' # confirmed provider route"):
            with self.subTest(scalar=scalar):
                path.write_text("---\nname: only-model\nmodel: " + scalar + "\n---\n")
                with mock.patch.object(SETUP, "query_models", side_effect=AssertionError("unexpected network")):
                    result = SETUP.scan(self.config, self.project)
                self.assertEqual({item["id"] for item in result["candidates"]},
                                 {"vendor/exact-model", "inherit"})
                candidate = next(item for item in result["candidates"] if item["id"] == "vendor/exact-model")
                self.assertEqual(candidate["observations"][0]["source"], str(path))
                self.assertFalse(any("Could not read" in gap or "No model IDs found" in gap
                                     for gap in result["gaps"]))

    def test_config_dir_override_order(self):
        self.assertEqual(SETUP.default_config_dir(), self.config)
        os.environ["CLAUDE_HOME"] = str(self.root / "override")
        self.assertEqual(SETUP.default_config_dir(), self.root / "override")
        del os.environ["CLAUDE_HOME"]
        del os.environ["CLAUDE_CONFIG_DIR"]
        self.assertEqual(SETUP.default_config_dir(), self.root / "home" / ".claude")

    def test_scan_candidates_sources_readonly_and_no_secrets(self):
        secret = "PRIVATE_SENTINEL_DO_NOT_PRINT"
        settings = {
            "model": "other-upstream/base", "autoCompactWindow": "auto",
            "modelOverrides": {"default": "other-upstream/override"},
            "modelPicker": {"options": [{"model": "other-upstream/picker", "description": secret}]},
            "availableModels": ["other-upstream/available"],
            "modelSettings": {"other-upstream/window": {"autoCompactWindow": 200000, "secret": secret}},
            "apiKeyHelper": secret, "permissions": {"private": secret},
            "env": {"ANTHROPIC_API_KEY": secret, "PRIVATE_ENV": secret,
                    "ANTHROPIC_BASE_URL": "https://user:" + secret + "@example.invalid/",
                    "ANTHROPIC_DEFAULT_SONNET_MODEL": "other-upstream/from-settings",
                    "ANTHROPIC_DEFAULT_MODEL": "other-upstream/default",
                    "ANTHROPIC_DEFAULT_FABLE_MODEL": "other-upstream/fable",
                    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "200000", "CLAUDE_CODE_USE_BEDROCK": "1",
                    "CLAUDE_CODE_USE_CUSTOM": secret},
        }
        self.put_json(self.config / "settings.json", settings)
        self.put_json(self.project / ".claude" / "settings.local.json", {"model": "project-model"})
        agent = self.config / "agents" / "existing.md"
        agent.parent.mkdir()
        agent.write_text('---\nname: existing\nmodel: "other-upstream/agent:suffix"\n---\n' + secret)
        os.environ["ANTHROPIC_MODEL"] = "process-model"
        os.environ["ANTHROPIC_API_KEY"] = secret
        os.environ["CLAUDE_CODE_AUTO_COMPACT_WINDOW"] = "300000"
        before = self.files()
        with mock.patch.object(SETUP, "query_models", side_effect=AssertionError("unexpected network")):
            result = SETUP.scan(self.config, self.project)
        self.assertEqual(before, self.files())
        text = json.dumps(result)
        self.assertNotIn(secret, text)
        self.assertNotIn("apiKeyHelper", text)
        ids = {entry["id"] for entry in result["candidates"]}
        self.assertTrue({"other-upstream/base", "other-upstream/override",
                         "other-upstream/picker", "other-upstream/available", "other-upstream/window",
                         "other-upstream/agent:suffix", "other-upstream/from-settings", "project-model",
                         "other-upstream/default", "other-upstream/fable", "process-model", "inherit"}.issubset(ids))
        self.assertNotIn("CLAUDE_CODE_USE_CUSTOM", text)
        observations = result["context_observations"]
        self.assertTrue(any(item["field"] == "autoCompactWindow" and item["value"] == "auto"
                            for item in observations))
        self.assertTrue(any(item["value"] == "200000" for item in observations))
        self.assertTrue(any(item["value"] == "300000" for item in observations))
        self.assertTrue(all("effective" not in item for item in observations))

    def test_no_list_and_models_json_fallback(self):
        result = SETUP.scan(self.config, self.project)
        self.assertEqual([entry["id"] for entry in result["candidates"]], ["inherit"])
        self.assertTrue(result["gaps"])
        empty = self.put_json(self.root / "empty-models.json", {"data": []})
        result = SETUP.scan(self.config, self.project, models_json=empty)
        self.assertTrue(any("no usable IDs" in gap for gap in result["gaps"]))
        for supplied in (["manual/one", "manual/one", "manual/two"],
                         {"data": [{"id": "manual/one", "nativeVision": True}, {"id": "manual/two"}]}):
            path = self.put_json(self.root / "models.json", supplied)
            result = SETUP.scan(self.config, self.project, models_json=path)
            self.assertEqual({entry["id"] for entry in result["candidates"]},
                             {"manual/one", "manual/two", "inherit"})
            self.assertNotIn("nativeVision", json.dumps(result))

    def test_local_query_only_get_and_redirect_refused(self):
        requests = []
        secret = "LOCAL_TEST_AUTH"

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, self.headers.get("Authorization"), self.headers.get("x-api-key")))
                if self.path == "/redirect/v1/models":
                    self.send_response(302)
                    self.send_header("Location", "/capture")
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"data":[{"id":"local/model:confirmed","private":"HIDDEN_RESPONSE"}]}')

            def do_POST(self):
                requests.append(("POST", None, None))
                self.send_error(405)

            def log_message(self, _format, *_arguments):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f"http://127.0.0.1:{server.server_port}"
        os.environ.update({"ANTHROPIC_BASE_URL": base, "ANTHROPIC_AUTH_TOKEN": secret,
                           "ANTHROPIC_API_KEY": "LOCAL_KEY"})
        result = SETUP.scan(self.config, self.project, query=True)
        self.assertIn("local/model:confirmed", [entry["id"] for entry in result["candidates"]])
        self.assertEqual(requests, [("/v1/models", "Bearer " + secret, "LOCAL_KEY")])
        self.assertNotIn(secret, json.dumps(result))
        self.assertNotIn("HIDDEN_RESPONSE", json.dumps(result))
        os.environ["ANTHROPIC_BASE_URL"] = base + "/redirect"
        result = SETUP.scan(self.config, self.project, query=True)
        self.assertTrue(any("redirect refused" in gap for gap in result["gaps"]))
        self.assertEqual([item[0] for item in requests], ["/v1/models", "/redirect/v1/models"])
        os.environ["ANTHROPIC_BASE_URL"] = base.replace("http://", "http://user:password@")
        result = SETUP.scan(self.config, self.project, query=True)
        self.assertTrue(any("without credentials" in gap for gap in result["gaps"]))
        self.assertEqual(len(requests), 2)
        os.environ["ANTHROPIC_BASE_URL"] = "https://api.anthropic.com"
        result = SETUP.scan(self.config, self.project, query=True)
        self.assertTrue(any("Native API" in gap for gap in result["gaps"]))
        os.environ["ANTHROPIC_BASE_URL"] = base
        os.environ["CLAUDE_CODE_USE_BEDROCK"] = "1"
        result = SETUP.scan(self.config, self.project, query=True)
        self.assertTrue(any("provider switches" in gap for gap in result["gaps"]))
        self.assertEqual(len(requests), 2)

    def test_preview_readonly_targeted_patch_and_global_notes(self):
        secret = "KEEP_SETTINGS_PRIVATE"
        self.put_json(self.config / "settings.json", {"permissions": {"allow": [secret]},
                                                       "env": {"ANTHROPIC_API_KEY": secret}})
        plan = {"roles": {"worker": {"model": "custom/exact:limit"}},
                "context": {"env": {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "200000"}},
                "always_delegate": True}
        path = self.put_json(self.root / "plan.json", plan)
        before = self.files()
        result = self.command("preview", "--plan", path)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, self.files())
        self.assertNotIn(secret, result.stdout + result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["agents"][0]["model"], "custom/exact:limit")
        self.assertIn("every role/session", " ".join(output["notes"]))
        self.assertIn("managed", " ".join(output["notes"]))
        self.assertEqual(len(output["targets"]), 3)

    def test_partial_apply_without_context_or_rule(self):
        existing = self.config / "agents" / "unrelated.md"
        existing.parent.mkdir(parents=True)
        existing.write_text("existing agent")
        plan = {"roles": {"worker": {"model": "same/model:confirmed"},
                          "reviewer": {"model": "same/model:confirmed"}}, "always_delegate": False}
        result = SETUP.apply_plan(plan, self.config)
        self.assertEqual(len(result["written"]), 2)
        self.assertFalse((self.config / "settings.json").exists())
        self.assertFalse((self.config / "CLAUDE.md").exists())
        self.assertEqual(existing.read_text(), "existing agent")
        for role in ("worker", "reviewer"):
            data = (self.config / "agents" / ("workflow-" + role + ".md")).read_bytes()
            self.assertEqual(SETUP.frontmatter_scalars(data)["model"], "same/model:confirmed")
        result = SETUP.verify(self.config)
        self.assertEqual(len(result["agents"]), 2)

    def test_apply_preserves_nested_settings_modes_backups_and_rule_idempotence(self):
        secret = "PRESERVE_PRIVATE_CONFIG"
        settings = {"permissions": {"allow": ["Read"], "deny": [secret]},
                    "modelSettings": {"claude-opus-5-5": {"effortLevel": "high", "extra": {"keep": True}},
                                      "unrelated/model": {"extra": [1, 2]}},
                    "env": {"ANTHROPIC_API_KEY": secret, "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000"},
                    "hooks": {"keep": secret}}
        settings_path = self.put_json(self.config / "settings.json", settings)
        settings_path.chmod(0o640)
        before_settings = settings_path.read_bytes()
        claude_path = self.config / "CLAUDE.md"
        claude_path.write_bytes(b"Keep these exact bytes.\r\nNo final newline")
        claude_path.chmod(0o640)
        old = self.config / "settings.json.bak"
        old.write_bytes(b"older backup")
        agent = self.config / "agents" / "workflow-worker.md"
        agent.parent.mkdir()
        agent.write_text("old worker")
        agent.chmod(0o600)
        plan = {"roles": {"worker": {"model": "vendor/actual:already-max"}},
                "context": {"modelSettings": {"claude-opus-5-5": {"autoCompactWindow": 200000}},
                            "env": {"CLAUDE_CODE_MAX_OUTPUT_TOKENS": "65536"}},
                "always_delegate": True}
        result = SETUP.apply_plan(plan, self.config)
        merged = json.loads(settings_path.read_bytes())
        self.assertEqual(merged["permissions"], settings["permissions"])
        self.assertEqual(merged["hooks"], settings["hooks"])
        self.assertEqual(merged["env"]["ANTHROPIC_API_KEY"], secret)
        self.assertEqual(merged["modelSettings"]["claude-opus-5-5"]["extra"], {"keep": True})
        self.assertEqual(merged["modelSettings"]["unrelated/model"], settings["modelSettings"]["unrelated/model"])
        self.assertEqual(stat.S_IMODE(settings_path.stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE(agent.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(claude_path.stat().st_mode), 0o640)
        backup = Path(result["backup"])
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o700)
        self.assertEqual((backup / "settings.json").read_bytes(), before_settings)
        self.assertEqual((backup / "agents" / "workflow-worker.md").read_text(), "old worker")
        self.assertEqual(old.read_bytes(), b"older backup")
        rule = SETUP.load_rule()
        self.assertTrue(claude_path.read_bytes().startswith(b"Keep these exact bytes.\r\nNo final newline\n"))
        self.assertEqual(claude_path.read_bytes().count(rule), 1)
        self.assertNotIn(secret, json.dumps(result))
        repeated = SETUP.apply_plan(plan, self.config)
        self.assertEqual(repeated["written"], [])
        self.assertIsNone(repeated["backup"])
        self.assertEqual(claude_path.read_bytes().count(rule), 1)
        plan["context"]["env"]["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = "64000"
        next_apply = SETUP.apply_plan(plan, self.config)
        self.assertNotEqual(next_apply["backup"], result["backup"])
        self.assertTrue(backup.exists())
        self.assertEqual(SETUP.apply_plan({"always_delegate": False}, self.config)["written"], [])
        self.assertEqual(claude_path.read_bytes().count(rule), 1)

    def test_new_settings_private_and_empty_plan_no_writes(self):
        self.assertEqual(SETUP.apply_plan({}, self.config)["written"], [])
        self.assertFalse(self.config.exists())
        SETUP.apply_plan({"context": {"env": {"CLAUDE_CODE_MAX_CONTEXT_TOKENS": "272000"}}}, self.config)
        self.assertEqual(stat.S_IMODE((self.config / "settings.json").stat().st_mode), 0o600)
        self.assertFalse((self.config / "agents").exists())
        self.assertFalse((self.config / "CLAUDE.md").exists())

    def test_invalid_plans_refuse_all_writes(self):
        base = {"roles": {"worker": {"model": "safe/model"}}}
        invalid = [
            {**base, "unknown": True}, {"roles": {"unknown": {"model": "safe"}}},
            {"roles": {"worker": {"model": "safe", "tools": "Bash"}}},
            {"roles": {"worker": {"model": "line\ninjection"}}},
            {"roles": {"worker": {"model": "unsafe\x00id"}}},
            {"context": {"env": {"CLAUDE_CODE_DISABLE_COMPACT": "1"}}},
            {"context": {"env": {"CLAUDE_CODE_MAX_OUTPUT_TOKENS": "128001"}}},
            {"context": {"env": {"CLAUDE_CODE_MAX_OUTPUT_TOKENS": True}}},
            {"context": {"env": {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "500k"}}},
            {"context": {"env": {"CLAUDE_CODE_AUTO_COMPACT_WINDOW": "99999"}}},
            {"context": {"env": {"CLAUDE_CODE_DISABLE_1M_CONTEXT": "0"}}},
            {"context": {"modelSettings": {"vendor/id:max[1m]": {"autoCompactWindow": 200000}}}},
            {"context": {"modelSettings": {"claude-unknown": {"autoCompactWindow": 200000}}}},
            {"context": {"modelSettings": {"claude-opus-5-5": {"autoCompactWindow": True}}}},
            {"context": {"modelSettings": {"claude-opus-5-5": {"effortLevel": "max"}}}},
            {"always_delegate": 1},
        ]
        for bad in invalid:
            with self.subTest(plan=bad):
                before = self.files()
                with self.assertRaises(SETUP.SetupError):
                    SETUP.apply_plan(bad, self.config)
                self.assertEqual(before, self.files())
                self.assertFalse(self.config.exists())

    def test_all_preflight_before_write_malformed_settings_and_symlinks(self):
        plan = {"roles": {"worker": {"model": "safe/model"}},
                "context": {"env": {"CLAUDE_CODE_MAX_OUTPUT_TOKENS": "65536"}}}
        self.config.mkdir()
        settings_path = self.config / "settings.json"
        for existing in (b'{"private":"NO_LEAK", invalid', b'[]', b'{"env": []}'):
            settings_path.write_bytes(existing)
            before = self.files()
            with self.assertRaises(SETUP.SetupError) as caught:
                SETUP.apply_plan(plan, self.config)
            self.assertNotIn("NO_LEAK", str(caught.exception))
            self.assertEqual(before, self.files())
            self.assertFalse((self.config / "agents").exists())
        settings_path.unlink()
        external = self.put_json(self.root / "external.json", {})
        settings_path.symlink_to(external)
        with self.assertRaises(SETUP.SetupError):
            SETUP.apply_plan(plan, self.config)
        self.assertEqual(external.read_text(), "{}")
        settings_path.unlink()
        external_agents = self.root / "external-agents"
        external_agents.mkdir()
        (self.config / "agents").symlink_to(external_agents, target_is_directory=True)
        with self.assertRaises(SETUP.SetupError):
            SETUP.apply_plan({"roles": plan["roles"]}, self.config)
        self.assertEqual(list(external_agents.iterdir()), [])

    def test_change_detection_and_honest_partial_failure(self):
        plan = {"roles": {"worker": {"model": "safe/model"}, "reviewer": {"model": "safe/model"}}}
        targets, _summary = SETUP.prepare(plan, self.config)
        targets[0].path.parent.mkdir(parents=True)
        targets[0].path.write_text("concurrent content")
        with self.assertRaises(SETUP.SetupError):
            SETUP.assert_unchanged(targets[0])
        targets[0].path.unlink()
        real_replace = SETUP.atomic_replace
        count = 0

        def fail_second(target):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("SECRET_EXCEPTION_CONTENT")
            return real_replace(target)

        with mock.patch.object(SETUP, "atomic_replace", side_effect=fail_second):
            with self.assertRaises(SETUP.ApplyError) as caught:
                SETUP.apply_plan(plan, self.config)
        self.assertEqual(caught.exception.details["written"], [str(targets[0].path)])
        self.assertNotIn("SECRET_EXCEPTION_CONTENT", str(caught.exception))
        self.assertTrue(targets[0].path.exists())
        self.assertFalse(targets[1].path.exists())

    def test_verify_standalone_skill_only_partial_and_missing_resource(self):
        installed = self.root / "installed-skill"
        shutil.copytree(SETUP.SKILL_ROOT, installed, ignore=shutil.ignore_patterns("__pycache__"))
        helper = installed / "scripts" / "setup.py"
        result = self.command("verify", "--config-dir", self.config, helper=helper)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["agents"], [])
        self.assertFalse(self.config.exists())
        plan = self.put_json(self.root / "plan.json", {"roles": {"editor": {"model": "inherit"}}})
        self.assertEqual(self.command("apply", "--plan", plan, helper=helper).returncode, 0)
        result = self.command("verify", helper=helper)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(json.loads(result.stdout)["agents"]), 1)
        (installed / "assets" / "roles.json").unlink()
        result = self.command("verify", helper=helper)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Cannot read file", result.stderr)

    def test_cli_help_unknown_flags_and_safe_json_errors(self):
        result = self.command("--help")
        self.assertEqual(result.returncode, 0)
        for command in ("scan", "preview", "apply", "verify"):
            self.assertIn(command, result.stdout)
        result = self.command("preview", "--help")
        self.assertIn("Plan schema/example", result.stdout)
        result = self.command("scan", "--bad-flag")
        self.assertEqual(result.returncode, 2)
        invalid = self.root / "invalid.json"
        invalid.write_text('{"secret":"PRIVATE_JSON_SENTINEL", nonsense')
        result = self.command("apply", "--plan", invalid)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("PRIVATE_JSON_SENTINEL", result.stdout + result.stderr)
        self.assertFalse(self.config.exists())
        duplicate = self.root / "duplicate.json"
        duplicate.write_text('{"always_delegate":false,"always_delegate":true}')
        result = self.command("apply", "--plan", duplicate)
        self.assertEqual(result.returncode, 1)
        self.assertFalse(self.config.exists())


if __name__ == "__main__":
    unittest.main()
