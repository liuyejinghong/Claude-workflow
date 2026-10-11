#!/usr/bin/env python3
"""根入口合同测试：install.sh 与 scripts/verify.sh。

覆盖合同 Agreed architecture 第 1 条与 Root verify.sh：
- 默认只安装完整 skill（不写 agents/settings/CLAUDE.md），--preset 才装 7 个示例 agent
  并迁移 haiku-5.5-max.md；唯一备份绝不覆盖既有 .bak；参数错误零副作用；符号链接目标拒绝。
- verify.sh 默认委托已安装 skill 的 scripts/setup.py verify --config-dir；--models 走
  scan --query-models；--smoke 必须显式 SMOKE_MODEL，恰好两轮工具往返、不先 GET 模型列表、
  只剥离客户端 [1m]、保留 :max、严格 2xx（重定向失败）、不泄露 key 或响应体。

fixtures 与 HTTP stub 均为本地临时目录/本地回环；不访问真实 provider，不写真实 ~/.claude。
注意：可移植 helper（skills/multi-model-orchestration/scripts/setup.py）与 assets 可能尚未
落地——install 测试把 skill 目录当作不透明整树复制（自动覆盖未来新增文件）；verify 测试用
stub setup.py 固定 CLI 接口。真实 helper 的端到端 verify 由主控在集成后运行。
"""

import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INSTALL = REPO / "install.sh"
VERIFY = REPO / "scripts" / "verify.sh"
SOURCE_SKILL = REPO / "skills" / "multi-model-orchestration"
SOURCE_AGENTS = REPO / "agents"

_TEMP_DIRS = []


def _tmp_base():
    """fixture 目录优先 CLAUDE_JOB_DIR/tmp，其次系统临时目录。"""
    job = os.environ.get("CLAUDE_JOB_DIR")
    if job:
        base = Path(job) / "tmp"
        base.mkdir(parents=True, exist_ok=True)
        return base
    return Path(tempfile.gettempdir())


def make_sandbox(label):
    path = Path(tempfile.mkdtemp(prefix=f"entrypoint-{label}-", dir=str(_tmp_base())))
    _TEMP_DIRS.append(path)
    return path


def tearDownModule():
    for path in _TEMP_DIRS:
        shutil.rmtree(path, ignore_errors=True)


def _bash_version(path):
    try:
        proc = subprocess.run(
            [path, "-c", 'printf "%s.%s" "${BASH_VERSINFO[0]}" "${BASH_VERSINFO[1]}"'],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def _select_bash():
    """优先用 Bash 3.2（合同要求），没有则退回 PATH 中的 bash。"""
    for candidate in ("/bin/bash", shutil.which("bash")):
        if candidate and _bash_version(candidate) == "3.2":
            return candidate
    return shutil.which("bash") or "/bin/bash"


BASH = _select_bash()
BASH_VERSION = _bash_version(BASH)

_CLEARED_KEYS = (
    "CLAUDE_HOME",
    "CLAUDE_CONFIG_DIR",
    "CLAUDE_JOB_DIR",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "SMOKE_MODEL",
    "XDG_CONFIG_HOME",
    "CURL_HOME",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
)


def _env(extra):
    env = os.environ.copy()
    for key in _CLEARED_KEYS:
        env.pop(key, None)
    env["NO_PROXY"] = "127.0.0.1,localhost"
    env["no_proxy"] = "127.0.0.1,localhost"
    env.update(extra)
    return env


def run_install(args, extra_env, cwd=None):
    return subprocess.run(
        [BASH, str(INSTALL), *args],
        capture_output=True,
        text=True,
        env=_env(extra_env),
        cwd=str(cwd or REPO),
        timeout=120,
    )


def run_verify(args, extra_env):
    return subprocess.run(
        [BASH, str(VERIFY), *args],
        capture_output=True,
        text=True,
        env=_env(extra_env),
        cwd=str(REPO),
        timeout=180,
    )


def tree_snapshot(root):
    """路径 -> (类型, 内容/链接目标)；用于“未改动”与“整树复制”断言。"""
    if not root.exists():
        return None
    snapshot = {}
    for path in sorted(root.rglob("*")):
        key = path.relative_to(root).as_posix()
        if path.is_symlink():
            snapshot[key] = ("link", os.readlink(path))
        elif path.is_dir():
            snapshot[key] = ("dir", None)
        else:
            snapshot[key] = ("file", path.read_bytes())
    return snapshot


# ---------------------------------------------------------------- HTTP stub


class _StubHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _handle(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        body = None
        if raw:
            try:
                body = json.loads(raw)
            except ValueError:
                body = raw
        request = {
            "method": self.command,
            "path": self.path,
            "headers": dict(self.headers.items()),
            "body": body,
        }
        self.server.requests.append(request)
        status, payload, extra_headers = self.server.responder(request, self.server)
        data = payload.encode("utf-8") if isinstance(payload, str) else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    do_GET = _handle
    do_POST = _handle

    def log_message(self, format, *args):  # noqa: A002 - 静默测试服务器日志
        pass


class LocalStub:
    """本地回环 stub；只接受 127.0.0.1 上的 HTTP，不触网。"""

    def __init__(self, responder):
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
        self._server.responder = responder
        self._server.requests = []
        self._server.post_count = 0
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    @property
    def base_url(self):
        host, port = self._server.server_address[:2]
        return f"http://{host}:{port}"

    @property
    def requests(self):
        return self._server.requests

    def close(self):
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=10)


def tool_roundtrip_responder(request, server):
    if request["method"] == "GET":
        return 200, {"data": []}, None
    server.post_count += 1
    if server.post_count == 1:
        return (
            200,
            {
                "id": "msg_stub_1",
                "type": "message",
                "role": "assistant",
                "model": request["body"].get("model") if isinstance(request["body"], dict) else None,
                "stop_reason": "tool_use",
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu_stub_1",
                        "name": "route_marker",
                        "input": {"marker": "WORKFLOW_TOOL_OK"},
                    }
                ],
            },
            None,
        )
    if server.post_count == 2:
        return (
            200,
            {
                "id": "msg_stub_2",
                "type": "message",
                "role": "assistant",
                "model": request["body"].get("model") if isinstance(request["body"], dict) else None,
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": "WORKFLOW_TOOL_OK"}],
            },
            None,
        )
    return 500, {"type": "error", "error": {"type": "overloaded_error", "message": "stub"}}, None


def redirect_responder(request, server):
    return 302, "redirect-body-sentinel", {"Location": "http://127.0.0.1:1/redirected"}


def _headers_lower(request):
    return {key.lower(): value for key, value in request["headers"].items()}


# ----------------------------------------------------------------- install


class InstallEntrypoints(unittest.TestCase):
    def test_default_installs_skill_only_and_leaves_config_alone(self):
        sandbox = make_sandbox("default")
        claude = sandbox / "claude"
        home = sandbox / "home"
        (claude / "templates").mkdir(parents=True)
        (claude / "templates" / "keep.md").write_text("template sentinel\n", encoding="utf-8")
        (claude / "settings.json").write_text('{"keep": true}\n', encoding="utf-8")
        (claude / "agents").mkdir()
        (claude / "agents" / "custom.md").write_text("custom agent sentinel\n", encoding="utf-8")
        (claude / "CLAUDE.md").write_text("claude md sentinel\n", encoding="utf-8")
        (home / ".claude").mkdir(parents=True)

        proc = run_install([], {"CLAUDE_HOME": str(claude), "HOME": str(home)})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

        target_skill = claude / "skills" / "multi-model-orchestration"
        self.assertTrue((target_skill / "SKILL.md").is_file())
        self.assertEqual(tree_snapshot(SOURCE_SKILL), tree_snapshot(target_skill))

        self.assertEqual((claude / "templates" / "keep.md").read_text(encoding="utf-8"), "template sentinel\n")
        self.assertEqual((claude / "settings.json").read_text(encoding="utf-8"), '{"keep": true}\n')
        self.assertEqual((claude / "agents" / "custom.md").read_text(encoding="utf-8"), "custom agent sentinel\n")
        self.assertEqual((claude / "CLAUDE.md").read_text(encoding="utf-8"), "claude md sentinel\n")
        self.assertEqual(sorted(p.name for p in (claude / "agents").iterdir()), ["custom.md"])
        self.assertFalse((claude / "settings.local.json").exists())
        self.assertEqual(list((home / ".claude").iterdir()), [])

        self.assertIn("/multi-model-orchestration install", proc.stdout)
        self.assertNotIn("Magpie", proc.stdout)
        backups = [p.name for p in (claude / "skills").iterdir() if ".bak" in p.name]
        self.assertEqual(backups, [])

    def test_config_dir_resolution_order(self):
        sandbox = make_sandbox("resolve")

        cfg = sandbox / "cfg"
        home = sandbox / "home"
        proc = run_install([], {"CLAUDE_CONFIG_DIR": str(cfg), "HOME": str(home)})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue((cfg / "skills" / "multi-model-orchestration" / "SKILL.md").is_file())
        self.assertFalse((home / ".claude").exists())
        for absent in ("agents", "settings.json", "CLAUDE.md", "templates"):
            self.assertFalse((cfg / absent).exists(), absent)

        preferred = sandbox / "preferred"
        ignored = sandbox / "ignored"
        home2 = sandbox / "home2"
        proc = run_install(
            [],
            {"CLAUDE_HOME": str(preferred), "CLAUDE_CONFIG_DIR": str(ignored), "HOME": str(home2)},
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue((preferred / "skills" / "multi-model-orchestration" / "SKILL.md").is_file())
        self.assertFalse(ignored.exists())
        self.assertFalse((home2 / ".claude").exists())

        home3 = sandbox / "home3"
        proc = run_install([], {"HOME": str(home3)})
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue((home3 / ".claude" / "skills" / "multi-model-orchestration" / "SKILL.md").is_file())

    def test_repeat_install_unique_backups_and_history(self):
        sandbox = make_sandbox("repeat")
        claude = sandbox / "claude"
        home = sandbox / "home"
        home.mkdir()
        skills = claude / "skills"
        target = skills / "multi-model-orchestration"
        target.mkdir(parents=True)
        (target / "user-note.txt").write_text("first user note\n", encoding="utf-8")
        historic = skills / "multi-model-orchestration.bak"
        historic.write_text("historic bak sentinel\n", encoding="utf-8")

        env = {"CLAUDE_HOME": str(claude), "HOME": str(home)}

        def backup_dirs():
            return sorted(
                p
                for p in skills.iterdir()
                if p.is_dir() and p.name.startswith("multi-model-orchestration.bak")
            )

        proc = run_install([], env)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(len(backup_dirs()), 1)
        self.assertEqual((backup_dirs()[0] / "user-note.txt").read_text(encoding="utf-8"), "first user note\n")
        self.assertEqual(historic.read_text(encoding="utf-8"), "historic bak sentinel\n")
        self.assertEqual(tree_snapshot(SOURCE_SKILL), tree_snapshot(target))

        (target / "installed-marker.txt").write_text("after first install\n", encoding="utf-8")
        proc = run_install([], env)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertEqual(len(backup_dirs()), 2)
        captured = [
            (b / "installed-marker.txt").read_text(encoding="utf-8")
            if (b / "installed-marker.txt").exists()
            else None
            for b in backup_dirs()
        ]
        self.assertIn(None, captured)
        self.assertIn("after first install\n", captured)
        self.assertEqual(historic.read_text(encoding="utf-8"), "historic bak sentinel\n")

    def test_preset_agents_migration_and_unrelated_files_preserved(self):
        sandbox = make_sandbox("preset")
        claude = sandbox / "claude"
        home = sandbox / "home"
        home.mkdir()
        agents = claude / "agents"
        agents.mkdir(parents=True)
        (agents / "custom.md").write_text("custom sentinel\n", encoding="utf-8")
        (agents / "haiku-5.5-max.md").write_text("legacy alias sentinel\n", encoding="utf-8")
        (agents / "haiku-5.5-max.md.bak").write_text("older bak sentinel\n", encoding="utf-8")
        (agents / "haiku-5.5.md").write_text("old haiku content\n", encoding="utf-8")
        settings = claude / "settings.json"
        settings.write_text('{"keep": true}\n', encoding="utf-8")

        proc = run_install(["--preset"], {"CLAUDE_HOME": str(claude), "HOME": str(home)})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

        source_names = sorted(p.name for p in SOURCE_AGENTS.glob("*.md"))
        self.assertEqual(len(source_names), 7)
        for name in source_names:
            self.assertEqual((agents / name).read_bytes(), (SOURCE_AGENTS / name).read_bytes(), name)

        self.assertFalse((agents / "haiku-5.5-max.md").exists())
        migrated = [p for p in agents.iterdir() if p.name.startswith("haiku-5.5-max.md.bak.")]
        self.assertEqual(len(migrated), 1)
        self.assertEqual(migrated[0].read_text(encoding="utf-8"), "legacy alias sentinel\n")
        self.assertEqual((agents / "haiku-5.5-max.md.bak").read_text(encoding="utf-8"), "older bak sentinel\n")
        self.assertEqual((agents / "custom.md").read_text(encoding="utf-8"), "custom sentinel\n")

        replaced = [p for p in agents.iterdir() if p.name.startswith("haiku-5.5.md.bak.")]
        self.assertEqual(len(replaced), 1)
        self.assertEqual(replaced[0].read_text(encoding="utf-8"), "old haiku content\n")

        self.assertEqual(settings.read_text(encoding="utf-8"), '{"keep": true}\n')
        self.assertFalse((claude / "CLAUDE.md").exists())
        self.assertTrue((claude / "skills" / "multi-model-orchestration" / "SKILL.md").is_file())
        self.assertIn("/multi-model-orchestration install", proc.stdout)
        self.assertEqual(proc.stdout.count("agent  →"), 7)

    def test_arg_errors_and_help_have_no_effect(self):
        sandbox = make_sandbox("args")
        claude = sandbox / "claude"
        home = sandbox / "home"
        home.mkdir()
        (claude / "skills" / "multi-model-orchestration").mkdir(parents=True)
        (claude / "skills" / "multi-model-orchestration" / "SKILL.md").write_text("installed\n", encoding="utf-8")
        (claude / "agents").mkdir()
        (claude / "agents" / "custom.md").write_text("custom sentinel\n", encoding="utf-8")
        env = {"CLAUDE_HOME": str(claude), "HOME": str(home)}
        before = tree_snapshot(claude)

        for args in (["--nope"], ["--preset", "--nope"], ["extra"]):
            with self.subTest(args=args):
                proc = run_install(args, env)
                self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
                self.assertEqual(tree_snapshot(claude), before)

        proc = run_install(["--help"], env)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("用法", proc.stdout)
        self.assertEqual(tree_snapshot(claude), before)

    def test_symlink_targets_rejected(self):
        sandbox = make_sandbox("symlink")
        home = sandbox / "home"
        home.mkdir()

        claude = sandbox / "claude"
        real = sandbox / "real-skill"
        real.mkdir()
        (real / "SKILL.md").write_text("orig\n", encoding="utf-8")
        (claude / "skills").mkdir(parents=True)
        link = claude / "skills" / "multi-model-orchestration"
        link.symlink_to(real)
        proc = run_install([], {"CLAUDE_HOME": str(claude), "HOME": str(home)})
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("符号链接", proc.stderr)
        self.assertTrue(link.is_symlink())
        self.assertEqual((real / "SKILL.md").read_text(encoding="utf-8"), "orig\n")

        real_claude = sandbox / "real-claude"
        real_claude.mkdir()
        linked_claude = sandbox / "linked-claude"
        linked_claude.symlink_to(real_claude)
        proc = run_install([], {"CLAUDE_HOME": str(linked_claude), "HOME": str(home)})
        self.assertNotEqual(proc.returncode, 0)
        self.assertEqual(list(real_claude.iterdir()), [])

    def test_preset_preflight_blocks_before_any_write(self):
        # 预检必须先于任何写入：agent 目标或旧 alias 类型异常时，连 skill 都不应被安装。
        cases = ("agent target dir", "legacy alias dir")
        for case in cases:
            with self.subTest(case=case):
                sandbox = make_sandbox("preflight")
                claude = sandbox / "claude"
                home = sandbox / "home"
                home.mkdir()
                agents = claude / "agents"
                agents.mkdir(parents=True)
                if case == "agent target dir":
                    (agents / "deepseek-v4.1-flash.md").mkdir()
                else:
                    (agents / "haiku-5.5-max.md").mkdir()
                proc = run_install(["--preset"], {"CLAUDE_HOME": str(claude), "HOME": str(home)})
                self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
                self.assertIn("不是普通文件", proc.stderr)
                self.assertFalse((claude / "skills").exists(), "预检失败不得先安装 skill")
                self.assertFalse((claude / "skills" / "multi-model-orchestration").exists())

    def test_preset_runtime_failure_reports_partial_state(self):
        # 预检通过后中途失败：必须如实报告 skill 已安装、agent 写入数量与备份位置。
        sandbox = make_sandbox("partial")
        claude = sandbox / "claude"
        home = sandbox / "home"
        home.mkdir()
        agents = claude / "agents"
        agents.mkdir(parents=True)
        (agents / "deepseek-v4.1-flash.md").write_text("existing sentinel\n", encoding="utf-8")
        os.chmod(agents, 0o500)
        try:
            proc = run_install(["--preset"], {"CLAUDE_HOME": str(claude), "HOME": str(home)})
        finally:
            os.chmod(agents, 0o700)
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("安装不完整", proc.stderr)
        self.assertIn("skill 已安装", proc.stderr)
        self.assertTrue((claude / "skills" / "multi-model-orchestration" / "SKILL.md").is_file())
        self.assertEqual((agents / "deepseek-v4.1-flash.md").read_text(encoding="utf-8"), "existing sentinel\n")

    def test_scripts_parse_under_selected_bash(self):
        self.assertIsNotNone(BASH_VERSION, "未找到可用的 bash")
        for script in (INSTALL, VERIFY):
            with self.subTest(script=script.name):
                self.assertTrue(os.access(script, os.X_OK), f"{script} 缺少可执行位")
                proc = subprocess.run([BASH, "-n", str(script)], capture_output=True, text=True, timeout=30)
                self.assertEqual(proc.returncode, 0, proc.stderr)


# ------------------------------------------------------------------ verify


STUB_SETUP = """\
import json
import os
import sys

with open(os.environ["ENTRYPOINT_STUB_RECORD"], "w") as target:
    json.dump({
        "argv": sys.argv[1:],
        "isolated": int(bool(sys.flags.isolated)),
    }, target)
sys.exit(int(os.environ.get("ENTRYPOINT_STUB_EXIT", "0")))
"""


def make_installed_skill(claude):
    skill = claude / "skills" / "multi-model-orchestration"
    (skill / "scripts").mkdir(parents=True)
    (skill / "SKILL.md").write_text("---\nname: stub\n---\n", encoding="utf-8")
    (skill / "scripts" / "setup.py").write_text(STUB_SETUP, encoding="utf-8")
    return skill


class VerifyEntrypoints(unittest.TestCase):
    def test_default_delegates_to_helper_verify(self):
        sandbox = make_sandbox("verify-default")
        claude = sandbox / "claude"
        make_installed_skill(claude)
        record = sandbox / "record.json"
        env = {"CLAUDE_HOME": str(claude), "ENTRYPOINT_STUB_RECORD": str(record)}

        proc = run_verify([], env)
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        data = json.loads(record.read_text(encoding="utf-8"))
        self.assertEqual(data["argv"], ["verify", "--config-dir", str(claude)])
        self.assertEqual(data["isolated"], 1)

        proc = run_verify([], dict(env, ENTRYPOINT_STUB_EXIT="7"))
        self.assertEqual(proc.returncode, 7)

    def test_default_missing_helper_reports_install_hint(self):
        sandbox = make_sandbox("verify-missing")
        claude = sandbox / "claude"
        claude.mkdir()
        proc = run_verify([], {"CLAUDE_HOME": str(claude)})
        self.assertEqual(proc.returncode, 1)
        self.assertIn("setup.py", proc.stderr)
        self.assertIn("install.sh", proc.stderr)

    def test_models_delegates_scan_query_models(self):
        sandbox = make_sandbox("verify-models")
        claude = sandbox / "claude"
        make_installed_skill(claude)
        record = sandbox / "record.json"
        proc = run_verify(["--models"], {"CLAUDE_HOME": str(claude), "ENTRYPOINT_STUB_RECORD": str(record)})
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        data = json.loads(record.read_text(encoding="utf-8"))
        self.assertEqual(data["argv"], ["scan", "--query-models", "--config-dir", str(claude)])

    def test_smoke_requires_explicit_model_without_http(self):
        sandbox = make_sandbox("smoke-required")
        stub = LocalStub(tool_roundtrip_responder)
        try:
            base_env = {
                "CLAUDE_HOME": str(sandbox / "claude"),
                "ANTHROPIC_BASE_URL": stub.base_url,
                "ANTHROPIC_AUTH_TOKEN": "stub-secret-token",
                "CLAUDE_JOB_DIR": str(sandbox / "job"),
            }
            proc = run_verify(["--smoke"], base_env)
            self.assertEqual(proc.returncode, 2)
            self.assertIn("SMOKE_MODEL", proc.stderr)

            missing_base = dict(base_env)
            missing_base.pop("ANTHROPIC_BASE_URL")
            missing_base["SMOKE_MODEL"] = "stub-model"
            proc = run_verify(["--smoke"], missing_base)
            self.assertEqual(proc.returncode, 2)
            self.assertIn("ANTHROPIC_BASE_URL", proc.stderr)

            missing_auth = dict(base_env, SMOKE_MODEL="stub-model")
            missing_auth.pop("ANTHROPIC_AUTH_TOKEN")
            proc = run_verify(["--smoke"], missing_auth)
            self.assertEqual(proc.returncode, 2)
            self.assertIn("ANTHROPIC_AUTH_TOKEN", proc.stderr)

            self.assertEqual(stub.requests, [])
        finally:
            stub.close()

    def _run_smoke_case(self, supplied_model, expected_model, auth_token="stub-secret-token", api_key=None):
        sandbox = make_sandbox("smoke-roundtrip")
        stub = LocalStub(tool_roundtrip_responder)
        try:
            env = {
                "CLAUDE_HOME": str(sandbox / "claude"),
                "ANTHROPIC_BASE_URL": stub.base_url,
                "SMOKE_MODEL": supplied_model,
                "CLAUDE_JOB_DIR": str(sandbox / "job"),
            }
            if auth_token is not None:
                env["ANTHROPIC_AUTH_TOKEN"] = auth_token
            if api_key is not None:
                env["ANTHROPIC_API_KEY"] = api_key
            proc = run_verify(["--smoke"], env)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)

            methods = [request["method"] for request in stub.requests]
            self.assertEqual(methods, ["POST", "POST"], "只允许两轮 POST，且不得先 GET 模型列表")
            first, second = stub.requests
            self.assertEqual(first["path"], "/v1/messages")
            self.assertEqual(first["body"]["model"], expected_model)
            self.assertIn("WORKFLOW_TOOL_OK", proc.stdout)
            tool_result = second["body"]["messages"][-1]["content"][0]
            self.assertEqual(tool_result["tool_use_id"], "toolu_stub_1")
            self.assertEqual(tool_result["content"], "WORKFLOW_TOOL_OK")
            return first
        finally:
            stub.close()

    def test_smoke_strips_client_tag_keeps_provider_suffix(self):
        for supplied, expected in (
            ("stub-model[1m]", "stub-model"),
            ("stub-model:max[1m]", "stub-model:max"),
            ("stub-model:max", "stub-model:max"),
        ):
            with self.subTest(model=supplied):
                first = self._run_smoke_case(supplied, expected)
                self.assertEqual(_headers_lower(first).get("authorization"), "Bearer stub-secret-token")
                self.assertNotIn("x-api-key", _headers_lower(first))

    def test_smoke_api_key_header_variant(self):
        first = self._run_smoke_case("stub-model:max", "stub-model:max", auth_token=None, api_key="stub-api-key")
        headers = _headers_lower(first)
        self.assertEqual(headers.get("x-api-key"), "stub-api-key")
        self.assertNotIn("authorization", headers)

    def test_smoke_rejects_redirect_and_hides_body(self):
        sandbox = make_sandbox("smoke-redirect")
        stub = LocalStub(redirect_responder)
        try:
            env = {
                "CLAUDE_HOME": str(sandbox / "claude"),
                "ANTHROPIC_BASE_URL": stub.base_url,
                "ANTHROPIC_AUTH_TOKEN": "stub-secret-token",
                "SMOKE_MODEL": "stub-model",
                "CLAUDE_JOB_DIR": str(sandbox / "job"),
            }
            proc = run_verify(["--smoke"], env)
            self.assertNotEqual(proc.returncode, 0)
            self.assertIn("302", proc.stderr)
            self.assertNotIn("redirect-body-sentinel", proc.stdout + proc.stderr)
            self.assertEqual([request["method"] for request in stub.requests], ["POST"])
        finally:
            stub.close()

    def test_smoke_prefers_job_tmp_over_locked_tmpdir(self):
        sandbox = make_sandbox("smoke-tmp")
        job = sandbox / "job"
        locked = sandbox / "locked-tmp"
        locked.mkdir()
        os.chmod(locked, 0o500)
        stub = LocalStub(tool_roundtrip_responder)
        try:
            env = {
                "CLAUDE_HOME": str(sandbox / "claude"),
                "ANTHROPIC_BASE_URL": stub.base_url,
                "ANTHROPIC_AUTH_TOKEN": "stub-secret-token",
                "SMOKE_MODEL": "stub-model",
                "CLAUDE_JOB_DIR": str(job),
                "TMPDIR": str(locked),
            }
            proc = run_verify(["--smoke"], env)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            self.assertTrue((job / "tmp").is_dir(), "应优先在 CLAUDE_JOB_DIR/tmp 建临时目录")
        finally:
            os.chmod(locked, 0o700)
            stub.close()

    def test_smoke_ignores_curlrc_redirect_directive(self):
        # 安全回归：HOME/.curlrc 的 location/verbose 不得让冒烟跟随 307 到其他端口、
        # 不得把凭据发到跳转端，也不得把 key 打到 stderr。
        sandbox = make_sandbox("smoke-curlrc")
        target = LocalStub(tool_roundtrip_responder)
        try:

            def redirect_responder(request, server):
                return 307, "origin-redirect-body-sentinel", {"Location": f"{target.base_url}/v1/messages"}

            origin = LocalStub(redirect_responder)
            try:
                fake_home = sandbox / "home"
                fake_home.mkdir()
                (fake_home / ".curlrc").write_text("location\nverbose\n", encoding="utf-8")
                env = {
                    "HOME": str(fake_home),
                    "CLAUDE_HOME": str(sandbox / "claude"),
                    "CLAUDE_JOB_DIR": str(sandbox / "job"),
                    "ANTHROPIC_BASE_URL": origin.base_url,
                    "ANTHROPIC_API_KEY": "stub-api-key-curlrc",
                    "SMOKE_MODEL": "stub-model",
                }
                proc = run_verify(["--smoke"], env)
                combined = proc.stdout + proc.stderr
                self.assertNotEqual(proc.returncode, 0, combined)
                self.assertEqual(target.requests, [], "不得跟随 .curlrc 的 location 到其他端口")
                self.assertNotIn("stub-api-key-curlrc", combined)
                self.assertNotIn("origin-redirect-body-sentinel", combined)
                self.assertEqual([request["method"] for request in origin.requests], ["POST"])
            finally:
                origin.close()
        finally:
            target.close()

    def test_verify_flag_errors_and_help(self):
        proc = run_verify(["--nope"], {})
        self.assertEqual(proc.returncode, 2)
        proc = run_verify(["--models", "--smoke"], {})
        self.assertEqual(proc.returncode, 2)
        proc = run_verify(["--help"], {})
        self.assertEqual(proc.returncode, 0)
        self.assertIn("--models", proc.stdout)
        self.assertIn("SMOKE_MODEL", proc.stdout)

    def test_smoke_rejects_non_http_base_url(self):
        proc = run_verify(
            ["--smoke"],
            {
                "SMOKE_MODEL": "stub-model",
                "ANTHROPIC_BASE_URL": "file:///tmp/nope",
                "ANTHROPIC_AUTH_TOKEN": "stub-secret-token",
            },
        )
        self.assertEqual(proc.returncode, 2)
        self.assertIn("http", proc.stderr.lower())

    def test_smoke_rejects_credential_bearing_base_url(self):
        proc = run_verify(
            ["--smoke"],
            {
                "SMOKE_MODEL": "stub-model",
                "ANTHROPIC_BASE_URL": "http://user:pass@127.0.0.1:1",
                "ANTHROPIC_AUTH_TOKEN": "stub-secret-token",
            },
        )
        self.assertEqual(proc.returncode, 2)
        self.assertIn("用户信息", proc.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
