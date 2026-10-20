"""Contract tests; all installation fixtures live under the authorized job tmp."""

import contextlib
import copy
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

    def test_role_recommendation_schema_and_rejections(self):
        assets = SETUP.load_assets()
        for role, asset in assets.items():
            recommendations = asset["recommended_models"]
            self.assertTrue(isinstance(recommendations, list) and recommendations)
            models = [item["model"] for item in recommendations]
            self.assertEqual(len(models), len(set(models)))
            for item in recommendations:
                self.assertEqual(set(item), {"model", "reason", "effort"})
                self.assertTrue(SETUP.valid_model(item["model"]))
                self.assertTrue(SETUP.valid_recommendation_reason(item["reason"]))
                self.assertIn(item["effort"], SETUP.EFFORT_LEVELS)
            text = json.dumps(recommendations, ensure_ascii=False)
            self.assertNotIn(":max", text)
            self.assertNotIn("[1m]", text)

        def mutate(mutator):
            broken = copy.deepcopy(assets)
            mutator(broken)
            return broken

        bad = [
            mutate(lambda a: a["worker"].pop("recommended_models")),
            mutate(lambda a: a["worker"].update(recommended_models=[])),
            mutate(lambda a: a["worker"].update(recommended_models="glm-5.3")),
            mutate(lambda a: a["worker"].update(recommended_models=["glm-5.3"])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"reason": "missing model"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "missing effort"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "ok", "effort": "high"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "ok", "effort": "MAX"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "ok", "effort": "max "}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "ok", "effort": None}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "ok", "tier": 1}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm 5.3", "reason": "space in id", "effort": "max"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "", "effort": "max"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": " padded ", "effort": "max"}])),
            mutate(lambda a: a["worker"].update(recommended_models=[{"model": "glm-5.3", "reason": "line\nbreak", "effort": "max"}])),
            mutate(lambda a: a["worker"]["recommended_models"].append(dict(assets["worker"]["recommended_models"][0]))),
        ]
        for broken in bad:
            label = json.dumps(broken["worker"].get("recommended_models"), ensure_ascii=False)
            with self.subTest(recommendations=label):
                with self.assertRaises(SETUP.SetupError):
                    SETUP.validate_assets(broken)

    def test_recommendations_preserve_model_task_boundaries(self):
        assets = SETUP.load_assets()
        for asset in assets.values():
            self.assertNotIn("claude-haiku-5-5",
                             [item["model"] for item in asset["recommended_models"]])
        worker = assets["worker"]["recommended_models"]
        self.assertEqual([item["model"] for item in worker],
                         ["glm-5.3", "glm-5.3-flash"])
        worker_reasons = {item["model"]: item["reason"] for item in worker}
        self.assertIn("质量优先", worker_reasons["glm-5.3-flash"])
        self.assertIn("编码", worker_reasons["glm-5.3-flash"])
        reviewer_reasons = {item["model"]: item["reason"]
                            for item in assets["reviewer"]["recommended_models"]}
        self.assertEqual(set(reviewer_reasons), {"gpt-6.1-sol", "gpt-6-astra"})
        self.assertNotEqual(reviewer_reasons["gpt-6.1-sol"], reviewer_reasons["gpt-6-astra"])
        self.assertIn("独立第二意见", reviewer_reasons["gpt-6-astra"])
        researcher = assets["researcher"]["recommended_models"]
        self.assertEqual([item["model"] for item in researcher], ["deepseek-v4.1-flash"])
        ds_reason = researcher[0]["reason"]
        self.assertIn("取证", ds_reason)
        for role, asset in assets.items():
            for item in asset["recommended_models"]:
                self.assertEqual(item["effort"],
                                 "xhigh" if item["model"] in ("gpt-6.1-sol", "gpt-6-astra") else "max")
        reviewer_efforts = {item["model"]: item["effort"]
                            for item in assets["reviewer"]["recommended_models"]}
        self.assertEqual(reviewer_efforts["gpt-6-astra"], "xhigh")
        self.assertEqual(SETUP.resolved_effort(assets["reviewer"], {"model": "gpt-6-astra"}), "xhigh")

    def test_resolved_effort_consistent_across_render_table_summary_and_verify(self):
        plan = {"roles": {
            "engineer": {"model": "gpt-6.1-sol"},
            "reviewer": {"model": "vendor/sol:custom", "effort": "xhigh"},
            "worker": {"model": "inherit"},
            "researcher": {"model": "vendor/research:custom"},
        }}
        assets = SETUP.load_assets()
        _targets, summary = SETUP.prepare(plan, self.config)
        by_role = {row["role"]: row for row in summary["configuration_table"]}
        self.assertEqual(by_role["engineer"]["effort"], "xhigh")
        self.assertEqual(by_role["reviewer"]["effort"], "xhigh")
        self.assertEqual(by_role["worker"]["effort"], "max")
        self.assertEqual(by_role["researcher"]["effort"], "max")
        agents = {agent["role"]: agent for agent in summary["agents"]}
        for role, binding in plan["roles"].items():
            rendered = SETUP.render_agent(assets[role], binding).decode()
            values = SETUP.frontmatter_scalars(rendered.encode())
            self.assertEqual(values["effort"], by_role[role]["effort"])
            self.assertEqual(agents[role]["effort"], by_role[role]["effort"])
            self.assertEqual(values["model"], binding["model"])
            self.assertNotIn(binding["model"] + ":xhigh", rendered)
        SETUP.apply_plan(plan, self.config)
        efforts = {agent["name"]: agent["effort"] for agent in SETUP.verify(self.config)["agents"]}
        self.assertEqual(efforts["workflow-engineer"], "xhigh")
        self.assertEqual(efforts["workflow-reviewer"], "xhigh")
        self.assertEqual(efforts["workflow-worker"], "max")
        self.assertEqual(efforts["workflow-researcher"], "max")

    def test_recommendations_never_written_into_agent_definitions(self):
        plan = {"roles": {"worker": {"model": "vendor/exact:route[1m]", "notes": "keep exact id"}}}
        assets = SETUP.load_assets()
        rendered = SETUP.render_agent(assets["worker"], plan["roles"]["worker"]).decode()
        self.assertNotIn("recommended_models", rendered)
        for item in assets["worker"]["recommended_models"]:
            self.assertNotIn(item["model"], rendered)
        SETUP.apply_plan(plan, self.config)
        data = (self.config / "agents" / "workflow-worker.md").read_text()
        self.assertNotIn("recommended_models", data)
        for item in assets["worker"]["recommended_models"]:
            self.assertNotIn(item["model"], data)
        self.assertEqual(SETUP.frontmatter_scalars(data.encode())["model"], "vendor/exact:route[1m]")

    def test_configuration_table_complete_and_exact_routes(self):
        plan = {"roles": {"worker": {"model": "vendor/exact:route[1m]"},
                          "editor": {"model": "claude-haiku-5-5", "notes": "user-confirmed note"}}}
        _targets, summary = SETUP.prepare(plan, self.config)
        table = summary["configuration_table"]
        self.assertEqual([row["role"] for row in table], list(SETUP.ROLE_NAMES))
        by_role = {row["role"]: row for row in table}
        self.assertEqual(by_role["worker"]["model"], "vendor/exact:route[1m]")
        self.assertEqual(by_role["worker"]["status"], "selected")
        self.assertEqual(by_role["worker"]["effort"], "max")
        self.assertIsNone(by_role["worker"]["notes"])
        self.assertEqual(by_role["editor"]["model"], "claude-haiku-5-5")
        self.assertEqual(by_role["editor"]["notes"], "user-confirmed note")
        for role in ("engineer", "reviewer", "researcher"):
            row = by_role[role]
            self.assertEqual(row["status"], "skipped")
            self.assertIsNone(row["model"])
            self.assertIsNone(row["effort"])
            self.assertIsNone(row["notes"])
            self.assertEqual(row["name"], "workflow-" + role)
            self.assertTrue(row["description"])
            self.assertTrue(row["recommended_models"])
        worker_agent = next(agent for agent in summary["agents"] if agent["role"] == "worker")
        self.assertEqual(worker_agent["recommended_models"], by_role["worker"]["recommended_models"])
        self.assertEqual(worker_agent["model"], "vendor/exact:route[1m]")
        self.assertIn("availability list", " ".join(summary["notes"]))

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

    def test_installation_advice_states_matrix_only_double_confirmed_skips(self):
        for subscription in ("confirmed", "unavailable", "unknown"):
            for available in ("confirmed", "incomplete", "unknown"):
                with self.subTest(subscription=subscription, available=available):
                    result = SETUP.scan(self.config, self.project,
                                        claude_subscription=subscription,
                                        claude_models_available=available)
                    advice = result["installation_advice"]
                    self.assertEqual(advice["claude_subscription"], subscription)
                    self.assertEqual(advice["claude_models_available"], available)
                    self.assertTrue(advice["reason"])
                    if subscription == "confirmed" and available == "confirmed":
                        self.assertEqual(advice["recommendation"], "use-native-subagents")
                        self.assertIn("原生子代理", advice["reason"])
                        self.assertIn("无需安装本项目", advice["reason"])
                    else:
                        self.assertEqual(advice["recommendation"], "configure-roles")
        with self.assertRaises(SETUP.SetupError):
            SETUP.scan(self.config, self.project, claude_subscription="guessed")
        with self.assertRaises(SETUP.SetupError):
            SETUP.scan(self.config, self.project, claude_models_available="partial")

    def test_claude_candidates_and_recommendations_never_auto_confirm(self):
        assets = SETUP.load_assets()
        advertised = [item["model"] for asset in assets.values() for item in asset["recommended_models"]]
        self.put_json(self.config / "settings.json",
                      {"model": "claude-opus-5-5", "availableModels": ["claude-sonnet-5-5", "claude-haiku-5-5"]})
        models_json = self.put_json(self.root / "models.json", advertised + ["claude-opus-5-5"])
        result = SETUP.scan(self.config, self.project, models_json=models_json)
        advice = result["installation_advice"]
        self.assertEqual(advice["recommendation"], "configure-roles")
        self.assertEqual(advice["claude_subscription"], "unknown")
        self.assertEqual(advice["claude_models_available"], "unknown")
        ids = {entry["id"] for entry in result["candidates"]}
        self.assertIn("claude-opus-5-5", ids)
        self.assertIn("inherit", ids)
        self.assertIn("glm-5.3", ids)

    def test_scan_cli_advice_flags_readonly_and_safe(self):
        secret = "ADVICE_SCAN_PRIVATE"
        self.put_json(self.config / "settings.json", {"env": {"ANTHROPIC_API_KEY": secret}})
        before = self.files()
        result = self.command("scan", "--config-dir", self.config, "--project-dir", self.project,
                              "--claude-subscription", "confirmed",
                              "--claude-models-available", "confirmed")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, self.files())
        output = json.loads(result.stdout)
        advice = output["installation_advice"]
        self.assertEqual(advice["recommendation"], "use-native-subagents")
        self.assertEqual(advice["claude_subscription"], "confirmed")
        self.assertEqual(advice["claude_models_available"], "confirmed")
        self.assertNotIn(secret, result.stdout + result.stderr)
        result = self.command("scan", "--config-dir", self.config, "--project-dir", self.project)
        output = json.loads(result.stdout)
        self.assertEqual(output["installation_advice"]["recommendation"], "configure-roles")
        self.assertEqual(output["installation_advice"]["claude_subscription"], "unknown")
        self.assertEqual(output["installation_advice"]["claude_models_available"], "unknown")
        result = self.command("scan", "--config-dir", self.config, "--project-dir", self.project,
                              "--claude-subscription", "guessed")
        self.assertEqual(result.returncode, 2)
        self.assertEqual(before, self.files())

    def test_preview_configuration_table_readonly(self):
        secret = "PREVIEW_TABLE_PRIVATE"
        self.put_json(self.config / "settings.json", {"permissions": {"allow": [secret]}})
        plan = {"roles": {"worker": {"model": "custom/exact:limit"}}}
        path = self.put_json(self.root / "plan.json", plan)
        before = self.files()
        result = self.command("preview", "--plan", path, "--config-dir", self.config)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(before, self.files())
        self.assertNotIn(secret, result.stdout + result.stderr)
        output = json.loads(result.stdout)
        table = output["configuration_table"]
        self.assertEqual([row["role"] for row in table], list(SETUP.ROLE_NAMES))
        worker = table[0]
        self.assertEqual(worker["status"], "selected")
        self.assertEqual(worker["model"], "custom/exact:limit")
        self.assertEqual(worker["effort"], "max")
        self.assertEqual({row["status"] for row in table[1:]}, {"skipped"})
        self.assertTrue(all(row["recommended_models"] for row in table))
        self.assertIn("availability list", " ".join(output["notes"]))

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
            {"roles": {"worker": {"model": "safe/model", "effort": "high"}}},
            {"roles": {"worker": {"model": "safe/model", "effort": "MAX"}}},
            {"roles": {"worker": {"model": "safe/model", "effort": "max "}}},
            {"roles": {"worker": {"model": "safe/model", "effort": None}}},
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

    def orchestration(self, *candidates):
        return {"version": 1, "roles": {"worker": {"candidates": list(candidates)}}}

    def fingerprints(self):
        return {str(path.relative_to(self.root)): (path.read_bytes(), SETUP.signature(path.stat()))
                for path in self.root.rglob("*") if path.is_file()}

    def test_orchestration_boundaries_stable_priority_and_exact_names(self):
        candidates = [
            {"agent": "plugin:slow.agent+v2@native", "priority": 10},
            {"agent": "second-listed", "priority": 1},
            {"agent": "disabled-first", "priority": 0},
            {"agent": "third-listed", "priority": 1},
            {"agent": "disabled-second", "priority": 0},
            {"agent": "Agent_中文", "priority": 5},
        ]
        configuration = self.orchestration(*candidates)
        configuration["roles"]["reviewer"] = {"candidates": [dict(candidates[1])]}
        self.put_json(self.config / "orchestration.json", configuration)
        result = SETUP.cards(self.config)
        self.assertEqual([card["role"] for card in result["roles"]],
                         ["worker", "engineer", "reviewer", "researcher", "editor"])
        worker = result["roles"][0]
        self.assertTrue(worker["configured"])
        self.assertEqual(worker["candidates"], [candidates[1], candidates[3], candidates[5], candidates[0]])
        self.assertEqual(worker["disabled_candidates"], [candidates[2], candidates[4]])
        reviewer = next(card for card in result["roles"] if card["role"] == "reviewer")
        self.assertEqual(reviewer["candidates"], [candidates[1]])
        assets = SETUP.load_assets()
        for card in result["roles"]:
            asset = assets[card["role"]]
            self.assertEqual(card["description"], asset["description"])
            self.assertEqual(card["body"], asset["body"])
            self.assertEqual(card.get("tools"), asset.get("tools"))
            self.assertNotIn("model", card)
            self.assertNotIn("effort", card)
            self.assertNotIn("recommended_models", card)
        self.assertIn("runtime tool catalog", " ".join(result["notes"]))
        self.assertIn("not proof", " ".join(result["notes"]))
        self.assertIn("Priority 0 disables", " ".join(result["notes"]))
        self.assertIn("no automatic dispatch, retry or fallback", " ".join(result["notes"]))

    def test_orchestration_rejects_noninteger_and_out_of_range_priorities(self):
        for priority in (True, False, 1.0, 0.0, 10.0, -1, 11, "1", None, [], {}):
            with self.subTest(priority=priority):
                configuration = self.orchestration({"agent": "native-agent", "priority": priority})
                before = self.files()
                with self.assertRaisesRegex(SETUP.SetupError, "integer from 0 to 10"):
                    SETUP.apply_plan({"orchestration": configuration}, self.config)
                self.assertEqual(before, self.files())
                self.assertFalse(self.config.exists())

    def test_orchestration_schema_unknown_fields_and_duplicates_rejected(self):
        candidate = {"agent": "native-agent", "priority": 1}
        valid = self.orchestration(candidate)
        bad = [None, [], {}, {"version": 1}, {"roles": {}},
               {**valid, "enabled": True}, {**valid, "roles": []},
               {**valid, "roles": None}, {**valid, "roles": {"unknown": {"candidates": []}}},
               {**valid, "roles": {"worker": None}},
               {**valid, "roles": {"worker": {}}},
               {**valid, "roles": {"worker": {"candidates": None}}},
               {**valid, "roles": {"worker": {"candidates": {}}}},
               {**valid, "roles": {"worker": {"candidates": [], "priority": 1}}},
               self.orchestration(None), self.orchestration("native-agent"),
               self.orchestration({"agent": "native-agent"}),
               self.orchestration({"priority": 1}),
               self.orchestration(candidate, {"agent": "native-agent", "priority": 0})]
        for version in (True, False, 0, 2, 1.0, "1", None):
            bad.append({**valid, "version": version})
        for extra in ("enabled", "model", "effort", "description", "route", "notes"):
            bad.append(self.orchestration({**candidate, extra: "unsupported"}))
            bad.append({**valid, "roles": {"worker": {"candidates": [], extra: "unsupported"}}})
        for configuration in bad:
            with self.subTest(configuration=configuration):
                before = self.files()
                with self.assertRaises(SETUP.SetupError):
                    SETUP.apply_plan({"orchestration": configuration}, self.config)
                self.assertEqual(before, self.files())
                self.assertFalse(self.config.exists())

    def test_orchestration_rejects_unsafe_agent_types_without_echoing_values(self):
        for agent in (None, True, 12, [], {}, "", "native agent", " native", "native ",
                      "native\tagent", "native\nagent", "native\x00agent", "native\x1fagent",
                      "native\x7fagent", "native​agent", "native agent", "../agent", "a/b",
                      "/absolute/agent", r"a\b", ".", ".."):
            with self.subTest(agent=agent):
                with self.assertRaises(SETUP.SetupError) as caught:
                    SETUP.validate_orchestration(self.orchestration({"agent": agent, "priority": 1}))
                self.assertNotIn("native\x00agent", str(caught.exception))

    def test_cards_missing_configuration_readonly_and_config_dir_precedence(self):
        result = self.command("cards")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(set(output), {"ok", "command", "config_path", "configured", "roles", "notes"})
        self.assertEqual(output["command"], "cards")
        self.assertEqual(output["config_path"], str(self.config / "orchestration.json"))
        self.assertFalse(output["configured"])
        self.assertEqual(len(output["roles"]), 5)
        for card in output["roles"]:
            self.assertFalse(card["configured"])
            self.assertEqual(card["candidates"], [])
            self.assertEqual(card["disabled_candidates"], [])
        self.assertFalse(self.config.exists())
        os.environ["CLAUDE_HOME"] = str(self.root / "preferred")
        preferred = json.loads(self.command("cards").stdout)
        self.assertEqual(preferred["config_path"], str(self.root / "preferred" / "orchestration.json"))
        overridden = json.loads(self.command("cards", "--config-dir", self.config).stdout)
        self.assertEqual(overridden["config_path"], str(self.config / "orchestration.json"))
        del os.environ["CLAUDE_HOME"]
        del os.environ["CLAUDE_CONFIG_DIR"]
        fallback = json.loads(self.command("cards").stdout)
        self.assertEqual(fallback["config_path"], str(self.root / "home" / ".claude" / "orchestration.json"))
        self.assertFalse((self.root / "home").exists())
        self.assertFalse((self.root / "preferred").exists())

    def test_cards_empty_omitted_and_disabled_roles_remain_distinct(self):
        configuration = {"version": 1, "roles": {
            "worker": {"candidates": []},
            "engineer": {"candidates": [{"agent": "native-agent", "priority": 0}]},
        }}
        self.put_json(self.config / "orchestration.json", configuration)
        result = SETUP.cards(self.config)
        self.assertTrue(result["configured"])
        by_role = {card["role"]: card for card in result["roles"]}
        for name in ("worker", "engineer"):
            self.assertTrue(by_role[name]["configured"])
            self.assertEqual(by_role[name]["candidates"], [])
        self.assertEqual(by_role["worker"]["disabled_candidates"], [])
        self.assertEqual(by_role["engineer"]["disabled_candidates"],
                         [{"agent": "native-agent", "priority": 0}])
        self.assertFalse(by_role["reviewer"]["configured"])
        self.assertEqual(by_role["reviewer"]["candidates"], [])
        self.put_json(self.config / "orchestration.json", {"version": 1, "roles": {}})
        result = SETUP.cards(self.config)
        self.assertTrue(result["configured"])
        self.assertTrue(all(not card["configured"] for card in result["roles"]))

    def test_cards_only_reads_assets_and_configuration_and_never_scans_runtime(self):
        secret = "CARDS_PRIVATE_SENTINEL"
        self.put_json(self.config / "settings.json", {"secret": secret})
        (self.config / "CLAUDE.md").write_text(secret)
        native = self.config / "agents" / "native-agent.md"
        native.parent.mkdir()
        native.write_text(secret)
        self.put_json(self.config / "orchestration.json",
                      self.orchestration({"agent": "native-agent", "priority": 1}))
        allowed = {self.config / "orchestration.json", SETUP.SKILL_ROOT / "assets" / "roles.json"}
        real_read = SETUP.read_bytes

        def confined_read(path, *args, **kwargs):
            self.assertIn(path, allowed)
            return real_read(path, *args, **kwargs)

        before = self.fingerprints()
        with mock.patch.object(SETUP, "read_bytes", side_effect=confined_read), \
                mock.patch.object(SETUP, "scan", side_effect=AssertionError("unexpected settings scan")), \
                mock.patch.object(SETUP, "query_models", side_effect=AssertionError("unexpected network")):
            result = SETUP.cards(self.config)
        self.assertEqual(before, self.fingerprints())
        self.assertNotIn(secret, json.dumps(result))
        self.assertNotIn("loaded", result["roles"][0])
        self.assertNotIn("available", result["roles"][0]["candidates"][0])

    def test_cards_cli_role_filter_and_fresh_read_in_same_process(self):
        path = self.put_json(self.config / "orchestration.json",
                             self.orchestration({"agent": "first-agent", "priority": 1}))
        first = SETUP.cards(self.config, "worker")
        self.assertEqual(len(first["roles"]), 1)
        self.assertEqual(first["roles"][0]["candidates"][0]["agent"], "first-agent")
        self.put_json(path, self.orchestration({"agent": "second-agent", "priority": 10}))
        second = SETUP.cards(self.config, "worker")
        self.assertEqual(second["roles"][0]["candidates"], [{"agent": "second-agent", "priority": 10}])
        result = self.command("cards", "--role", "editor")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual([card["role"] for card in output["roles"]], ["editor"])
        self.assertFalse(output["roles"][0]["configured"])
        self.assertEqual(output["roles"][0]["tools"], ["Read", "Glob", "Grep", "Edit", "Write"])
        for role in ("visual", "unknown"):
            result = self.command("cards", "--role", role)
            self.assertEqual(result.returncode, 2)
        path.unlink()
        self.assertFalse(SETUP.cards(self.config)["configured"])
        self.assertEqual(SETUP.cards(self.config, "worker")["roles"][0]["candidates"], [])

    def test_cards_cli_malformed_duplicate_keys_and_unknown_fields_fail_closed(self):
        path = self.config / "orchestration.json"
        path.parent.mkdir()
        bad_files = [
            b'{"secret":"CARDS_BROKEN_PRIVATE", invalid',
            b'{"version":1,"version":1,"roles":{}}',
            b'{"version":1,"roles":{"worker":{"candidates":[],"candidates":[]}}}',
            b'{"version":1,"roles":{"worker":{"candidates":[{"agent":"one","agent":"two","priority":1}]}}}',
            b'{"version":true,"roles":{}}', b'{"version":1,"roles":{},"model":"CARDS_BROKEN_PRIVATE"}',
            b'{"version":1,"roles":{"worker":{"candidates":[{"agent":"one","priority":NaN}]}}}',
            b'[]', b'', b'\xff',
        ]
        for existing in bad_files:
            with self.subTest(existing=existing):
                path.write_bytes(existing)
                before = self.fingerprints()
                result = self.command("cards", "--role", "reviewer")
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertFalse(json.loads(result.stderr)["ok"])
                self.assertNotIn("CARDS_BROKEN_PRIVATE", result.stderr)
                self.assertEqual(before, self.fingerprints())

    def test_orchestration_only_preview_and_apply_preserve_all_other_fingerprints(self):
        secret = "KEEP_NATIVE_AGENT_DESCRIPTION_AND_SETTINGS"
        settings = self.put_json(self.config / "settings.json", {"private": secret})
        claude = self.config / "CLAUDE.md"
        claude.write_text(secret)
        native = self.config / "agents" / "native-worker.md"
        native.parent.mkdir()
        native.write_text('---\nname: native-worker\ndescription: "' + secret +
                          '"\nmodel: "vendor/native:exact"\neffort: xhigh\n---\nKeep body\n')
        legacy = self.config / "agents" / "workflow-worker.md"
        legacy.write_text("user-owned legacy bytes")
        (self.config / "settings.local.json").write_text("existing malformed settings must not be read")
        configuration = self.orchestration({"agent": "native-worker", "priority": 1})
        plan = self.put_json(self.root / "cards-plan.json", {"orchestration": configuration})
        before = self.fingerprints()
        preview = self.command("preview", "--plan", plan)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(before, self.fingerprints())
        summary = json.loads(preview.stdout)
        path = self.config / "orchestration.json"
        self.assertEqual(summary["targets"], [{"path": str(path), "action": "create"}])
        self.assertEqual(summary["role_cards"]["configuration"], configuration)
        self.assertEqual(summary["role_cards"]["config_path"], str(path))
        self.assertEqual(summary["agents"], [])
        self.assertEqual(summary["context_patch"], {})
        self.assertIsNone(summary["delegation_rule"])
        self.assertTrue(all(row["status"] == "skipped" for row in summary["configuration_table"]))
        self.assertTrue(all("candidates" not in row for row in summary["configuration_table"]))
        self.assertNotIn(secret, preview.stdout + preview.stderr)
        applied = self.command("apply", "--plan", plan)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        output = json.loads(applied.stdout)
        self.assertEqual(output["written"], [str(path)])
        self.assertIsNone(output["backup"])
        self.assertEqual(json.loads(path.read_bytes()), configuration)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        after = self.fingerprints()
        self.assertEqual({key: value for key, value in after.items()
                          if key != "config/orchestration.json"}, before)
        self.assertEqual(settings.read_text(), json.dumps({"private": secret}))
        self.assertEqual(claude.read_text(), secret)

    def test_orchestration_only_new_install_and_repeat_apply_make_no_extra_files(self):
        plan = {"orchestration": self.orchestration({"agent": "plugin:native", "priority": 1})}
        first = SETUP.apply_plan(plan, self.config)
        path = self.config / "orchestration.json"
        self.assertEqual(first["written"], [str(path)])
        self.assertEqual(list(self.config.iterdir()), [path])
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        before = self.fingerprints()
        repeated = SETUP.apply_plan(plan, self.config)
        self.assertEqual(repeated["written"], [])
        self.assertIsNone(repeated["backup"])
        self.assertEqual(repeated["targets"], [{"path": str(path), "action": "unchanged"}])
        self.assertEqual(before, self.fingerprints())
        self.assertFalse((self.config / ".workflow-backups").exists())

    def test_orchestration_existing_format_mode_and_unique_backups_preserved(self):
        original = self.orchestration({"agent": "first-agent", "priority": 1})
        path = self.put_json(self.config / "orchestration.json", original)
        path.chmod(0o640)
        before = self.fingerprints()
        no_change = SETUP.apply_plan({"orchestration": original}, self.config)
        self.assertEqual(no_change["written"], [])
        self.assertEqual(before, self.fingerprints())
        original_bytes = path.read_bytes()
        historic = self.config / "orchestration.json.bak"
        historic.write_bytes(b"historic bytes")
        changed = self.orchestration({"agent": "second-agent", "priority": 10})
        first = SETUP.apply_plan({"orchestration": changed}, self.config)
        first_backup = Path(first["backup"])
        self.assertEqual((first_backup / "orchestration.json").read_bytes(), original_bytes)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE((first_backup / "orchestration.json").stat().st_mode), 0o640)
        self.assertEqual(stat.S_IMODE(first_backup.stat().st_mode), 0o700)
        changed_bytes = path.read_bytes()
        second = SETUP.apply_plan({"orchestration": {"version": 1, "roles": {}}}, self.config)
        second_backup = Path(second["backup"])
        self.assertNotEqual(first_backup, second_backup)
        self.assertEqual((second_backup / "orchestration.json").read_bytes(), changed_bytes)
        self.assertEqual((first_backup / "orchestration.json").read_bytes(), original_bytes)
        self.assertEqual(historic.read_bytes(), b"historic bytes")
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o640)

    def test_orchestration_invalid_existing_content_blocks_all_preflight_writes(self):
        plan = {"orchestration": self.orchestration({"agent": "native", "priority": 1}),
                "roles": {"worker": {"model": "inherit"}},
                "context": {"env": {"CLAUDE_CODE_MAX_OUTPUT_TOKENS": "32000"}},
                "always_delegate": True}
        path = self.config / "orchestration.json"
        self.config.mkdir()
        for existing in (b'{"secret":"EXISTING_PRIVATE",invalid', b'[]',
                         b'{"version":1,"roles":{},"enabled":true}',
                         b'{"version":1,"version":1,"roles":{}}',
                         b'{"version":1,"roles":{"worker":{"candidates":[{"agent":"one","priority":true}]}}}'):
            with self.subTest(existing=existing):
                path.write_bytes(existing)
                before = self.fingerprints()
                for operation in (SETUP.prepare, SETUP.apply_plan):
                    with self.assertRaises(SETUP.SetupError) as caught:
                        operation(plan, self.config)
                    self.assertNotIn("EXISTING_PRIVATE", str(caught.exception))
                    self.assertEqual(before, self.fingerprints())
                self.assertEqual(list(self.config.iterdir()), [path])

    def test_orchestration_symlink_target_parent_and_nonfile_rejected(self):
        plan = {"orchestration": self.orchestration()}
        self.config.mkdir()
        path = self.config / "orchestration.json"
        external = self.put_json(self.root / "external.json", {"version": 1, "roles": {}})
        for target in (external, self.root / "missing-external.json"):
            path.symlink_to(target)
            for operation in (SETUP.prepare, SETUP.apply_plan):
                with self.assertRaisesRegex(SETUP.SetupError, "non-symlink"):
                    operation(plan, self.config)
            with self.assertRaises(SETUP.SetupError):
                SETUP.cards(self.config)
            self.assertTrue(path.is_symlink())
            path.unlink()
        self.assertEqual(json.loads(external.read_bytes()), {"version": 1, "roles": {}})
        self.assertFalse((self.root / "missing-external.json").exists())
        path.mkdir()
        with self.assertRaises(SETUP.SetupError):
            SETUP.apply_plan(plan, self.config)
        self.assertEqual(list(path.iterdir()), [])
        path.rmdir()
        self.config.rmdir()
        external_dir = self.root / "external-config"
        external_dir.mkdir()
        self.config.symlink_to(external_dir, target_is_directory=True)
        with self.assertRaisesRegex(SETUP.SetupError, "non-symlink"):
            SETUP.apply_plan(plan, self.config)
        self.assertEqual(list(external_dir.iterdir()), [])

    def test_orchestration_detects_change_between_prepare_and_atomic_replace(self):
        plan = {"orchestration": self.orchestration({"agent": "native", "priority": 1})}
        targets, _summary = SETUP.prepare(plan, self.config)
        self.put_json(self.config / "orchestration.json", {"version": 1, "roles": {}})
        before = self.fingerprints()
        with self.assertRaisesRegex(SETUP.SetupError, "changed after preflight"):
            SETUP.atomic_replace(targets[0])
        self.assertEqual(before, self.fingerprints())
        self.assertEqual(list(self.config.iterdir()), [self.config / "orchestration.json"])

    def test_orchestration_and_compatibility_plan_sections_work_together(self):
        plan = {"orchestration": self.orchestration({"agent": "native", "priority": 1}),
                "roles": {"editor": {"model": "inherit"}},
                "context": {"env": {"CLAUDE_CODE_MAX_CONTEXT_TOKENS": "200000"}},
                "always_delegate": True}
        result = SETUP.apply_plan(plan, self.config)
        self.assertEqual(set(result["written"]), {
            str(self.config / "orchestration.json"), str(self.config / "agents" / "workflow-editor.md"),
            str(self.config / "settings.json"), str(self.config / "CLAUDE.md")})
        self.assertEqual(result["agents"][0]["model"], "inherit")
        self.assertEqual(result["role_cards"]["configuration"], plan["orchestration"])
        self.assertEqual(SETUP.apply_plan(plan, self.config)["written"], [])

    def test_visual_plan_rejected_but_user_owned_visual_agent_untouched(self):
        visual = self.config / "agents" / "workflow-visual.md"
        visual.parent.mkdir(parents=True)
        visual.write_text("user-owned visual role; intentionally not generated frontmatter")
        before = self.fingerprints()
        for plan in ({"roles": {"visual": {"model": "inherit"}}},
                     {"orchestration": {"version": 1, "roles": {"visual": {"candidates": []}}}}):
            with self.subTest(plan=plan):
                with self.assertRaisesRegex(SETUP.SetupError, "without a separate visual role"):
                    SETUP.apply_plan(plan, self.config)
        SETUP.apply_plan({"orchestration": self.orchestration()}, self.config)
        self.assertEqual(self.fingerprints()["config/agents/workflow-visual.md"],
                         before["config/agents/workflow-visual.md"])
        self.assertEqual(SETUP.verify(self.config)["agents"], [])

    def test_verify_reports_five_cards_and_rejects_bad_configuration(self):
        configuration = self.orchestration({"agent": "plugin:not-loaded", "priority": 1})
        path = self.put_json(self.config / "orchestration.json", configuration)
        result = self.command("verify")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertTrue(output["configured"])
        self.assertEqual(output["config_path"], str(path))
        self.assertEqual(len(output["role_cards"]), 5)
        self.assertEqual(output["agents"], [])
        self.assertIn("references/role-cards.md", output["required_resources"])
        self.assertIn("not proof that an agent is loaded", " ".join(output["notes"]))
        path.write_text('{"version":1,"roles":{"worker":{"candidates":[{"agent":"native","priority":true}]}}}')
        before = self.fingerprints()
        result = self.command("verify")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("integer from 0 to 10", json.loads(result.stderr)["error"])
        self.assertEqual(before, self.fingerprints())
        path.unlink()
        output = SETUP.verify(self.config)
        self.assertFalse(output["configured"])
        self.assertEqual(len(output["role_cards"]), 5)

    def test_verify_requires_role_card_reference_in_installed_copy(self):
        installed = self.root / "installed-skill-cards"
        shutil.copytree(SETUP.SKILL_ROOT, installed, ignore=shutil.ignore_patterns("__pycache__"))
        reference = installed / "references" / "role-cards.md"
        self.assertTrue(reference.is_file(), "Document writer must provide the role-cards.md resource before integration.")
        reference.unlink()
        result = self.command("verify", helper=installed / "scripts" / "setup.py")
        self.assertEqual(result.returncode, 1)
        self.assertIn("role-cards.md", result.stderr)
        self.assertFalse(self.config.exists())

    def test_cli_help_unknown_flags_and_safe_json_errors(self):
        result = self.command("--help")
        self.assertEqual(result.returncode, 0)
        for command in ("cards", "scan", "preview", "apply", "verify"):
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
