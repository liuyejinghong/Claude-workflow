#!/usr/bin/env python3
"""Local, provider-neutral installation planning for multi-model-orchestration."""

import argparse
import copy
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request


SKILL_ROOT = Path(__file__).resolve().parent.parent
ROLE_NAMES = ("worker", "engineer", "reviewer", "visual", "researcher", "editor")
EDITOR_TOOLS = ["Read", "Glob", "Grep", "Edit", "Write"]
# Deliberately finite: a claude-* spelling alone does not establish a supported key.
CANONICAL_MODELS = frozenset({
    "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1",
})
MODEL_ENV = (
    "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL",
    "ANTHROPIC_SMALL_FAST_MODEL", "CLAUDE_CODE_SUBAGENT_MODEL", "ANTHROPIC_CUSTOM_MODEL_OPTION",
)
PROVIDER_ENV = ("CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX",
                "CLAUDE_CODE_USE_FOUNDRY", "CLAUDE_CODE_USE_MANTLE")
CONTEXT_ENV = (
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS", "CLAUDE_CODE_DISABLE_1M_CONTEXT",
)
MAX_READ_BYTES = 2 * 1024 * 1024
MAX_MODELS_BYTES = 1024 * 1024
RUNTIME_NOTES = [
    "Configured or advertised model IDs are candidates, not proof of access, tool support or capability.",
    "Local observations do not resolve managed settings, active /model choices or CLI flags.",
]
PLAN_EXAMPLE = '''{
  "roles": {
    "worker": {"model": "inherit"},
    "reviewer": {"model": "exact-confirmed-id", "notes": "optional confirmed strength/limit"}
  },
  "context": {
    "modelSettings": {"claude-opus-5-5": {"autoCompactWindow": 200000}},
    "env": {
      "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "200000",
      "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "272000",
      "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "65536",
      "CLAUDE_CODE_DISABLE_1M_CONTEXT": "1"
    }
  },
  "always_delegate": false
}'''


class SetupError(Exception):
    """Safe error text only; never include configuration values or raw responses."""


class ApplyError(SetupError):
    def __init__(self, message, backup, written):
        super().__init__(message)
        self.details = {"backup": backup, "written": written,
                        "note": "File replacements are atomic individually, not a multi-file transaction."}


def absolute_path(value):
    return Path(os.path.abspath(os.path.expanduser(os.fspath(value))))


def default_config_dir():
    return absolute_path(os.environ.get("CLAUDE_HOME") or os.environ.get("CLAUDE_CONFIG_DIR")
                         or str(Path(os.environ.get("HOME", str(Path.home()))) / ".claude"))


def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def parse_json(data, label):
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=reject_duplicate_keys,
                          parse_constant=lambda _value: (_ for _ in ()).throw(ValueError("constant")))
    except (UnicodeDecodeError, ValueError, RecursionError):
        raise SetupError(f"Invalid JSON in {label}; existing content will not be replaced.") from None


def read_bytes(path, limit=MAX_READ_BYTES):
    try:
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise SetupError(f"Expected a regular, non-symlink file: {path}")
        with path.open("rb") as stream:
            data = stream.read(limit + 1)
        if len(data) > limit:
            raise SetupError(f"File exceeds the supported size: {path}")
        return data
    except OSError:
        raise SetupError(f"Cannot read file: {path}") from None


def load_json(path):
    return parse_json(read_bytes(path), str(path))


def valid_model(value):
    return (isinstance(value, str) and 0 < len(value) <= 512
            and all(char.isprintable() and not char.isspace() for char in value))


def check_keys(value, allowed, label):
    if not isinstance(value, dict) or set(value) - set(allowed):
        raise SetupError(f"{label} must be an object containing only supported fields.")


def context_env_value(key, value):
    if not isinstance(value, str):
        raise SetupError(f"{key} requires a string value.")
    if key == "CLAUDE_CODE_DISABLE_1M_CONTEXT":
        if value != "1":
            raise SetupError(f"{key} permits only the string 1.")
        return value
    if not re.fullmatch(r"[0-9]+", value):
        raise SetupError(f"{key} requires a plain positive integer string.")
    try:
        number = int(value)
    except ValueError:
        raise SetupError(f"Unsupported integer value for {key}.") from None
    if number <= 0:
        raise SetupError(f"{key} requires a positive value.")
    if key == "CLAUDE_CODE_AUTO_COMPACT_WINDOW" and not 100000 <= number <= 1000000:
        raise SetupError(f"{key} must be between 100000 and 1000000.")
    if key == "CLAUDE_CODE_MAX_OUTPUT_TOKENS" and number > 128000:
        raise SetupError(f"{key} cannot exceed 128000.")
    return value


def valid_window(value):
    return value == "auto" or (type(value) is int and 100000 <= value <= 1000000)


def validate_plan(plan):
    check_keys(plan, ("roles", "context", "always_delegate"), "Plan")
    roles = plan.get("roles", {})
    check_keys(roles, ROLE_NAMES, "roles")
    for role, binding in roles.items():
        check_keys(binding, ("model", "notes"), f"Role {role}")
        if not valid_model(binding.get("model")):
            raise SetupError(f"Role {role} requires a nonempty model ID without whitespace or controls.")
        if "notes" in binding:
            note = binding["notes"]
            if not isinstance(note, str) or len(note) > 500 or not note.isprintable():
                raise SetupError(f"Role {role} notes must be a short, printable single line.")
    context = plan.get("context", {})
    check_keys(context, ("modelSettings", "env"), "context")
    model_settings = context.get("modelSettings", {})
    if not isinstance(model_settings, dict):
        raise SetupError("context.modelSettings must be an object.")
    for model, settings in model_settings.items():
        if model not in CANONICAL_MODELS:
            raise SetupError("context.modelSettings permits only the canonical model keys listed in --help.")
        check_keys(settings, ("autoCompactWindow",), "Per-model context settings")
        if set(settings) != {"autoCompactWindow"} or not valid_window(settings["autoCompactWindow"]):
            raise SetupError("autoCompactWindow requires 100000..1000000 as an integer, or the string auto.")
    environment = context.get("env", {})
    check_keys(environment, CONTEXT_ENV, "context.env")
    for key, value in environment.items():
        context_env_value(key, value)
    if "always_delegate" in plan and type(plan["always_delegate"]) is not bool:
        raise SetupError("always_delegate requires a boolean.")
    return plan


def load_assets():
    assets = load_json(SKILL_ROOT / "assets" / "roles.json")
    if not isinstance(assets, dict) or set(assets) != set(ROLE_NAMES):
        raise SetupError("Role assets must contain exactly the six documented neutral roles.")
    for role, asset in assets.items():
        check_keys(asset, ("name", "description", "body", "tools"), f"Asset {role}")
        if asset.get("name") != "workflow-" + role:
            raise SetupError(f"Asset {role} has an invalid generated name.")
        if not isinstance(asset.get("description"), str) or not asset["description"].isprintable():
            raise SetupError(f"Asset {role} requires a nonempty single-line description.")
        if not isinstance(asset.get("body"), str) or not asset["body"].strip():
            raise SetupError(f"Asset {role} requires a body.")
        if "tools" in asset:
            tools = asset["tools"]
            if (not isinstance(tools, list) or not tools
                    or any(not isinstance(tool, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_.:*\-]*", tool)
                           for tool in tools) or len(tools) != len(set(tools))):
                raise SetupError(f"Asset {role} has an invalid tools list.")
        if role == "editor" and asset.get("tools") != EDITOR_TOOLS:
            raise SetupError("The editor asset must restrict tools to Read/Glob/Grep/Edit/Write.")
    return assets


def load_rule():
    data = read_bytes(SKILL_ROOT / "assets" / "delegation-rule.txt")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise SetupError("The delegation rule must be UTF-8.") from None
    if not text.endswith("\n") or len(text.splitlines()) != 1 or not text[:-1].isprintable():
        raise SetupError("The delegation rule asset must contain one nonempty line and a final newline.")
    return data


def render_agent(asset, binding):
    lines = ["---", "name: " + json.dumps(asset["name"], ensure_ascii=False),
             "description: " + json.dumps(asset["description"], ensure_ascii=False),
             "model: " + json.dumps(binding["model"], ensure_ascii=False), "effort: max"]
    if "tools" in asset:
        lines.append("tools: " + json.dumps(", ".join(asset["tools"])))
    body = asset["body"].rstrip() + "\n"
    if binding.get("notes"):
        body += "\nUser-confirmed assignment note: " + binding["notes"] + "\n"
    return ("\n".join(lines) + "\n---\n\n" + body).encode("utf-8")


def frontmatter_scalars(data):
    try:
        lines = data.decode("utf-8").splitlines()
    except UnicodeDecodeError:
        raise SetupError("Agent frontmatter is not valid UTF-8.") from None
    if not lines or lines[0] != "---":
        raise SetupError("Agent frontmatter is missing.")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise SetupError("Agent frontmatter is incomplete.") from None
    values = {}
    for line in lines[1:end]:
        match = re.fullmatch(r"([A-Za-z][A-Za-z0-9_-]*):\s*(.*)", line)
        if not match:
            continue
        key, raw = match.groups()
        if key not in ("name", "model", "effort", "description"):
            continue
        if key in values:
            raise SetupError("Agent frontmatter has a duplicate scalar field.")
        raw = raw.strip()
        if raw.startswith('"'):
            try:
                value, scalar_end = json.JSONDecoder().raw_decode(raw)
            except ValueError:
                raise SetupError("Unsupported quoted agent scalar.") from None
        elif raw.startswith("'"):
            scalar_end = 1
            while scalar_end < len(raw):
                if raw[scalar_end] != "'":
                    scalar_end += 1
                elif raw[scalar_end:scalar_end + 2] == "''":
                    scalar_end += 2
                else:
                    value = raw[1:scalar_end].replace("''", "'")
                    scalar_end += 1
                    break
            else:
                raise SetupError("Unsupported quoted agent scalar.")
        elif raw and not raw.startswith(("|", ">", "[", "{")):
            value = re.split(r"[ \t]+#", raw, maxsplit=1)[0].strip()
            scalar_end = len(raw)
        else:
            continue
        if raw[scalar_end:] and not re.fullmatch(r"[ \t]+(?:#.*)?", raw[scalar_end:]):
            raise SetupError("Unsupported text after quoted agent scalar.")
        if isinstance(value, str):
            values[key] = value
    return values


def extract_model_ids(value):
    if isinstance(value, list):
        return [item for item in value if valid_model(item)]
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        return [item["id"] for item in value["data"]
                if isinstance(item, dict) and valid_model(item.get("id"))]
    raise SetupError("Model list must be a string array or an object with a data array of model IDs.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def query_models(environ):
    if any(str(environ.get(key, "")).lower() not in ("", "0", "false") for key in PROVIDER_ENV):
        raise SetupError("Active provider switches have no supported model-list query; use manual IDs or inherit.")
    base = environ.get("ANTHROPIC_BASE_URL", "")
    if not base:
        raise SetupError("No process ANTHROPIC_BASE_URL is configured; use --models-json, manual IDs or inherit.")
    if not all(char.isprintable() and not char.isspace() for char in base) or "\\" in base:
        raise SetupError("Configured model-list URL is unsupported.")
    try:
        parts = urllib.parse.urlsplit(base)
        host, port = parts.hostname, parts.port
    except ValueError:
        raise SetupError("Configured model-list URL is invalid.") from None
    if (parts.scheme not in ("http", "https") or not host or parts.username is not None
            or parts.password is not None or parts.query or parts.fragment or "%" in host):
        raise SetupError("Model-list URL must use HTTP(S) without credentials, query or fragment.")
    if host.lower().rstrip(".") == "api.anthropic.com":
        raise SetupError("Native API model enumeration is not supported; use configured/manual IDs or inherit.")
    if environ.get("ANTHROPIC_CUSTOM_HEADERS"):
        raise SetupError("Custom-header authentication is unsupported; provide --models-json or manual IDs.")
    path = parts.path.rstrip("/")
    if not path.endswith("/v1/models"):
        path += "/models" if path.endswith("/v1") else "/v1/models"
    url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, path, "", ""))
    headers = {"Accept": "application/json"}
    for key, header, prefix in (("ANTHROPIC_AUTH_TOKEN", "Authorization", "Bearer "),
                                ("ANTHROPIC_API_KEY", "x-api-key", "")):
        token = environ.get(key)
        if token:
            if len(token) > 8192 or any(ord(char) < 32 or ord(char) >= 127 for char in token):
                raise SetupError("Configured authentication cannot be used safely for a model-list GET.")
            headers[header] = prefix + token
    request = urllib.request.Request(url, headers=headers, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=10) as response:
            data = response.read(MAX_MODELS_BYTES + 1)
        if len(data) > MAX_MODELS_BYTES:
            raise SetupError("Model-list response exceeds the supported size.")
        return extract_model_ids(parse_json(data, "model-list response"))
    except urllib.error.HTTPError as error:
        error.close()
        if 300 <= error.code < 400:
            raise SetupError("Model-list redirect refused; credentials were not forwarded.") from None
        raise SetupError(f"Model-list GET returned HTTP {error.code}; use manual IDs or inherit.") from None
    except (urllib.error.URLError, OSError, ValueError):
        raise SetupError("Model-list GET failed; use --models-json, manual IDs or inherit.") from None


def scan(config_dir, project_dir, models_json=None, query=False):
    candidates, gaps, context, provider_signals = {}, [], [], []

    def add(model, source, field, kind="configured"):
        if valid_model(model):
            entry = candidates.setdefault(model, {"id": model, "observations": []})
            observation = {"kind": kind, "source": source, "field": field}
            if observation not in entry["observations"]:
                entry["observations"].append(observation)

    def observe_env(environment, source):
        if not isinstance(environment, dict):
            gaps.append(f"Invalid env structure in {source}; skipped.")
            return
        for key in MODEL_ENV:
            add(environment.get(key), source, "env." + key)
        for key in CONTEXT_ENV:
            if key in environment:
                try:
                    value = context_env_value(key, environment[key])
                    context.append({"source": source, "field": "env." + key, "value": value})
                except SetupError:
                    gaps.append(f"Unsupported {key} value in {source}; value withheld.")
        for key in PROVIDER_ENV:
            if key in environment:
                provider_signals.append({"source": source, "field": key, "present": True})
        if environment.get("ANTHROPIC_BASE_URL"):
            provider_signals.append({"source": source, "field": "ANTHROPIC_BASE_URL", "present": True})

    sources = []
    seen = set()
    for directory in (config_dir, project_dir / ".claude"):
        for filename in ("settings.json", "settings.local.json"):
            path = directory / filename
            if path in seen:
                continue
            seen.add(path)
            if not os.path.lexists(path):
                continue
            sources.append(str(path))
            try:
                settings = load_json(path)
                if not isinstance(settings, dict):
                    raise SetupError("Settings root is not an object.")
            except SetupError:
                gaps.append(f"Could not read valid settings from {path}; values withheld.")
                continue
            add(settings.get("model"), str(path), "model")
            overrides = settings.get("modelOverrides")
            if isinstance(overrides, dict):
                for index, value in enumerate(overrides.values()):
                    add(value, str(path), f"modelOverrides.value[{index}]")
            if valid_window(settings.get("autoCompactWindow")):
                context.append({"source": str(path), "field": "autoCompactWindow",
                                "value": settings["autoCompactWindow"]})
            available = settings.get("availableModels")
            if isinstance(available, list):
                for value in available:
                    add(value, str(path), "availableModels")
            picker = settings.get("modelPicker")
            if isinstance(picker, dict) and isinstance(picker.get("options"), list):
                for option in picker["options"]:
                    if isinstance(option, dict):
                        add(option.get("model"), str(path), "modelPicker.options.model")
            per_model = settings.get("modelSettings")
            if isinstance(per_model, dict):
                for model, setting in per_model.items():
                    add(model, str(path), "modelSettings key")
                    if (valid_model(model) and isinstance(setting, dict)
                            and valid_window(setting.get("autoCompactWindow"))):
                        context.append({"source": str(path), "field": "modelSettings.autoCompactWindow",
                                        "model": model, "value": setting["autoCompactWindow"]})
            if "env" in settings:
                observe_env(settings["env"], str(path))
    observe_env(dict(os.environ), "process environment")
    agent_dirs = {config_dir / "agents", project_dir / ".claude" / "agents"}
    for directory in sorted(agent_dirs):
        if not directory.is_dir() or directory.is_symlink():
            continue
        for path in sorted(directory.glob("*.md")):
            try:
                values = frontmatter_scalars(read_bytes(path))
                add(values.get("model"), str(path), "agent frontmatter.model")
            except SetupError:
                gaps.append(f"Could not read scalar model evidence from {path}; content withheld.")
    if models_json is not None:
        supplied = extract_model_ids(load_json(models_json))
        if not supplied:
            gaps.append("Provided model list contains no usable IDs; use manual IDs or inherit.")
        for model in supplied:
            add(model, str(models_json), "provided model list", "advertised/manual")
    if query:
        try:
            advertised = query_models(dict(os.environ))
            if not advertised:
                gaps.append("Model-list endpoint returned no usable IDs; use manual IDs or inherit.")
            for model in advertised:
                add(model, "process ANTHROPIC_BASE_URL", "GET /v1/models", "advertised")
        except SetupError as error:
            gaps.append(str(error))
    if not query and models_json is None:
        gaps.append("No advertised model list requested; use configured evidence, manual IDs or inherit.")
    if not candidates:
        gaps.append("No model IDs found in local configuration; current-model inheritance remains available.")
    add("inherit", "explicit current-model delegation", "fallback, not a discovered route", "fallback")
    return {"ok": True, "command": "scan", "config_dir": str(config_dir),
            "project_dir": str(project_dir), "settings_sources": sources,
            "candidates": list(candidates.values()), "context_observations": context,
            "provider_signals": provider_signals, "gaps": gaps, "notes": RUNTIME_NOTES}


def safe_parents(path):
    for parent in reversed(path.parents):
        try:
            info = parent.lstat()
        except FileNotFoundError:
            continue
        except OSError:
            raise SetupError(f"Cannot inspect parent directory: {parent}") from None
        if not stat.S_ISDIR(info.st_mode):
            raise SetupError(f"Target parent must be a non-symlink directory: {parent}")


def signature(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_mode)


@dataclass
class Target:
    path: Path
    original: object
    content: bytes
    mode: int
    fingerprint: object

    @property
    def changed(self):
        return self.original != self.content


def snapshot(path):
    safe_parents(path)
    try:
        before = path.lstat()
    except FileNotFoundError:
        return None, None, None
    except OSError:
        raise SetupError(f"Cannot inspect target: {path}") from None
    if not stat.S_ISREG(before.st_mode):
        raise SetupError(f"Target must be a regular, non-symlink file: {path}")
    data = read_bytes(path)
    try:
        after = path.lstat()
    except OSError:
        raise SetupError(f"Target changed while being read: {path}") from None
    if signature(before) != signature(after):
        raise SetupError(f"Target changed while being read: {path}")
    return data, stat.S_IMODE(after.st_mode), signature(after)


def make_target(path, content, new_mode=0o644):
    original, mode, fingerprint = snapshot(path)
    return Target(path, original, content, new_mode if mode is None else mode, fingerprint)


def merge_settings(original, context):
    settings = {} if original is None else parse_json(original, "existing settings.json")
    if not isinstance(settings, dict):
        raise SetupError("Existing settings.json must be an object; it will not be replaced.")
    merged = copy.deepcopy(settings)
    for section in ("modelSettings", "env"):
        patch = context.get(section, {})
        if not patch:
            continue
        if section in merged and not isinstance(merged[section], dict):
            raise SetupError(f"Existing settings.{section} must be an object; no files were changed.")
        destination = merged.setdefault(section, {})
        if section == "env":
            destination.update(patch)
        else:
            for model, fields in patch.items():
                if model in destination and not isinstance(destination[model], dict):
                    raise SetupError("Existing selected modelSettings entry must be an object; no files were changed.")
                destination.setdefault(model, {}).update(fields)
    if original is not None and merged == settings:
        return original
    return (json.dumps(merged, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def prepare(plan, config_dir):
    validate_plan(plan)
    assets = load_assets()
    targets, agents = [], []
    for role in ROLE_NAMES:
        if role not in plan.get("roles", {}):
            continue
        asset, binding = assets[role], plan["roles"][role]
        path = config_dir / "agents" / (asset["name"] + ".md")
        targets.append(make_target(path, render_agent(asset, binding)))
        agents.append({"role": role, "name": asset["name"], "model": binding["model"],
                       "effort": "max", "description": asset["description"], "path": str(path)})
    context = {key: value for key, value in plan.get("context", {}).items() if value}
    if context:
        path = config_dir / "settings.json"
        original, mode, fingerprint = snapshot(path)
        targets.append(Target(path, original, merge_settings(original, context),
                              0o600 if mode is None else mode, fingerprint))
    rule = None
    if plan.get("always_delegate", False):
        rule_bytes = load_rule()
        path = config_dir / "CLAUDE.md"
        original, mode, fingerprint = snapshot(path)
        content = original or b""
        if rule_bytes[:-1] not in content.splitlines():
            content += (b"\n" if content and not content.endswith(b"\n") else b"") + rule_bytes
        targets.append(Target(path, original, content, 0o644 if mode is None else mode, fingerprint))
        rule = rule_bytes.decode("utf-8").rstrip("\n")
    notes = [
        "All generated roles declare effort:max; runtime CLAUDE_CODE_EFFORT_LEVEL or managed limits may constrain it.",
        "Model bindings preserve confirmed IDs exactly; access, capability and tool compatibility remain unverified.",
    ]
    if context:
        notes.append("Settings scope, managed policy, process environment and CLI flags can affect actual context behavior.")
    if context.get("env"):
        notes.append("These context env settings affect every role/session launched under them; the auto-compact env overrides per-model windows.")
    summary = {"config_dir": str(config_dir), "agents": agents, "context_patch": context,
               "delegation_rule": rule,
               "targets": [{"path": str(target.path), "action": "unchanged" if not target.changed
                            else "create" if target.original is None else "replace"} for target in targets],
               "notes": notes}
    return targets, summary


def assert_unchanged(target):
    original, mode, fingerprint = snapshot(target.path)
    if original != target.original or fingerprint != target.fingerprint:
        raise SetupError(f"Target changed after preflight; refusing overwrite: {target.path}")


def atomic_replace(target):
    safe_parents(target.path)
    target.path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".workflow-tmp-", dir=str(target.path.parent))
    try:
        with os.fdopen(descriptor, "wb") as stream:
            os.fchmod(stream.fileno(), target.mode)
            stream.write(target.content)
            stream.flush()
            os.fsync(stream.fileno())
        assert_unchanged(target)
        os.replace(temporary, target.path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply_plan(plan, config_dir):
    targets, summary = prepare(plan, config_dir)
    changed = [target for target in targets if target.changed]
    existing = [target for target in changed if target.original is not None]
    backup_root = config_dir / ".workflow-backups"
    if existing:
        safe_parents(backup_root / "preflight")
    backup, written = None, []
    try:
        for target in targets:
            assert_unchanged(target)
        if existing:
            backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
            prefix = "setup-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-"
            backup = Path(tempfile.mkdtemp(prefix=prefix, dir=str(backup_root)))
            os.chmod(backup, 0o700)
            for target in existing:
                assert_unchanged(target)
                destination = backup / target.path.relative_to(config_dir)
                destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with destination.open("xb") as stream:
                    os.fchmod(stream.fileno(), target.mode)
                    stream.write(target.original)
        for target in changed:
            atomic_replace(target)
            written.append(str(target.path))
    except (SetupError, OSError) as error:
        message = str(error) if isinstance(error, SetupError) else "Filesystem operation failed during apply."
        raise ApplyError(message, str(backup) if backup is not None else None, written) from None
    return {"ok": True, "command": "apply", **summary,
            "written": written, "backup": str(backup) if backup is not None else None,
            "atomicity": "Atomic per file; no multi-file transaction or rollback is claimed."}


def verify(config_dir):
    required = ["SKILL.md", "references/installation.md", "references/agents-and-installation.md",
                "references/third-party-context.md", "assets/roles.json", "assets/delegation-rule.txt", "scripts/setup.py"]
    for relative in required:
        read_bytes(SKILL_ROOT / relative)
    assets = load_assets()
    load_rule()
    reference_dir = SKILL_ROOT / "references"
    if reference_dir.is_symlink():
        raise SetupError("Installed references must be a real skill-local directory.")
    documents = [SKILL_ROOT / "SKILL.md"] + sorted(reference_dir.rglob("*.md"))
    checked_links = set()
    for document in documents:
        try:
            text = read_bytes(document).decode("utf-8")
        except UnicodeDecodeError:
            raise SetupError(f"Installed document is not UTF-8: {document}") from None
        for link in re.findall(r"\[[^\]\n]*\]\(([^)\n]+)\)", text):
            target = link.strip().strip("<>").split(' "', 1)[0]
            parts = urllib.parse.urlsplit(target)
            if parts.scheme or parts.netloc or not parts.path:
                continue
            path = (document.parent / urllib.parse.unquote(parts.path)).resolve()
            try:
                path.relative_to(SKILL_ROOT.resolve())
            except ValueError:
                raise SetupError(f"Resource link escapes the installed skill: {document}") from None
            if not path.exists():
                raise SetupError(f"Missing installed skill resource referenced by {document}: {path}")
            checked_links.add(str(path))
    agents = []
    for role in ROLE_NAMES:
        path = config_dir / "agents" / (assets[role]["name"] + ".md")
        if not os.path.lexists(path):
            continue
        values = frontmatter_scalars(read_bytes(path))
        if (values.get("name") != assets[role]["name"] or not valid_model(values.get("model"))
                or values.get("effort") != "max" or not values.get("description")):
            raise SetupError(f"Invalid generated role frontmatter/model/effort:max: {path}")
        agents.append({"name": values["name"], "model": values["model"], "effort": "max", "path": str(path)})
    return {"ok": True, "command": "verify", "skill_root": str(SKILL_ROOT),
            "required_resources": required, "checked_local_links": sorted(checked_links), "agents": agents,
            "notes": ["Skill-only and partial role installations are supported.",
                      "Local file checks do not verify route access, model performance or context limits."]}


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    scanning = commands.add_parser("scan", help="Read local model candidates; no network by default.")
    scanning.add_argument("--config-dir", type=absolute_path, default=default_config_dir(),
                          help="CLAUDE_HOME, then CLAUDE_CONFIG_DIR, then HOME/.claude by default.")
    scanning.add_argument("--project-dir", type=absolute_path, default=absolute_path(Path.cwd()),
                          help="Project whose .claude settings/agents are observed (default: cwd).")
    scanning.add_argument("--models-json", type=absolute_path,
                          help="User-supplied string list or Anthropic-style {data:[{id:...}]} list.")
    scanning.add_argument("--query-models", action="store_true",
                          help="Explicit GET from process ANTHROPIC_BASE_URL only; no redirects, native/provider enumeration or generation.")
    explanation = ("All plan sections are optional; unknown fields are rejected. No context is written by default.\n"
                   "Canonical modelSettings keys: " + ", ".join(sorted(CANONICAL_MODELS)) + ".\n"
                   "Per-model autoCompactWindow: integer 100000..1000000 or string auto.\n"
                   "env: only the four keys shown; positive integer strings, AUTO 100000..1000000,\n"
                   "OUTPUT <=128000, DISABLE_1M only 1. Global env affects all roles/sessions.\n"
                   "Exact confirmed model IDs are preserved; no :max or [1m] suffix is added.\n\nPlan schema/example (these values are not defaults):\n" + PLAN_EXAMPLE)
    for name, help_text in (("preview", "Validate and show concrete targets without writing."),
                            ("apply", "Apply a previewed, user-authorized plan with unique backups.")):
        command = commands.add_parser(name, help=help_text, description=help_text,
                                      epilog=explanation, formatter_class=argparse.RawDescriptionHelpFormatter)
        command.add_argument("--plan", type=absolute_path, required=True, help="JSON plan; see schema below.")
        command.add_argument("--config-dir", type=absolute_path, default=default_config_dir(),
                             help="CLAUDE_HOME, then CLAUDE_CONFIG_DIR, then HOME/.claude by default.")
    checking = commands.add_parser("verify", help="Check this installed skill and any chosen generated roles locally.")
    checking.add_argument("--config-dir", type=absolute_path, default=default_config_dir(),
                          help="Role location: CLAUDE_HOME, then CLAUDE_CONFIG_DIR, then HOME/.claude.")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.command == "scan":
            result = scan(args.config_dir, args.project_dir, args.models_json, args.query_models)
        elif args.command == "preview":
            _targets, summary = prepare(load_json(args.plan), args.config_dir)
            result = {"ok": True, "command": "preview", **summary}
        elif args.command == "apply":
            result = apply_plan(load_json(args.plan), args.config_dir)
        else:
            result = verify(args.config_dir)
    except (SetupError, OSError) as error:
        message = str(error) if isinstance(error, SetupError) else "Local filesystem operation failed."
        details = error.details if isinstance(error, ApplyError) else {}
        print(json.dumps({"ok": False, "command": args.command, "error": message, **details},
                         ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
