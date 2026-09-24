"""Tests for the coding-harness adapters.

The banned-surface guard assembles its needles from parts at runtime so this
module never trips its own check.
"""

import os
import tempfile
import unittest

import harnesses

_REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)


def _token(*parts):
    """Join token fragments at runtime so no banned literal lands in the source.

    A plain ``"a" + "b"`` would be folded by the bytecode optimizer into the
    joined constant, which the wide guard (and a plain ``grep``) would then
    find. A call is not folded.
    """
    return "".join(parts)


# The removed runtime surface: the runtime itself, its selection flag and env
# var, its config keys, and its module name.
_BANNED_TOKENS = (
    _token("her", "dr"),
    _token("--", "runtime"),
    _token("TM_", "RUNTIME"),
    _token("worker_", "kind"),
    _token("primary_", "work", "space"),
    _token("run", "times"),
)
# The installer migrates a legacy install, so it must name the legacy runtime's
# artifacts to detect and remove them. Those names are allowed only in
# install.sh; the removed CLI flag/env var and the removed task field stay
# banned there too.
_LEGACY_ARTIFACT_ALLOWED = {
    "install.sh": {
        _token("her", "dr"),
        _token("worker_", "kind"),
        _token("primary_", "work", "space"),
        _token("run", "times"),
    },
}
# The removed task field, matched as the quoted key in code files only. Bare
# workspace/tab wording is legitimate elsewhere.
_WORKSPACE_FIELD = _token('"', "work", "space", '"')
# Every scanned text file: source, config, scripts, docs-in-src, and the
# installer. Binary files and caches are skipped.
_TEXT_SUFFIXES = (".py", ".md", ".toml", ".sh", ".json")
# Final historical overviews may mention the removed runtime once, the same way
# the excluded docs/ pages do. Executable and configurable files must never.
_HISTORICAL = {os.path.join("src", "README.md")}


def _workspace_checked(rel):
    """Whether the removed task-field key is banned in this file."""
    scripts_dir = os.path.join("src", "scripts") + os.sep
    return rel == "install.sh" or (rel.endswith(".py") and rel.startswith(scripts_dir))


def _offending(rel, text):
    """The banned tokens present in ``text`` for the file at ``rel``.

    Legacy artifact names are tolerated only in the files that must name them
    to migrate them; every other token stays banned everywhere.
    """
    lowered = text.lower()
    allowed = _LEGACY_ARTIFACT_ALLOWED.get(rel, frozenset())
    hits = [
        token
        for token in _BANNED_TOKENS
        if token.lower() in lowered and token not in allowed
    ]
    if _workspace_checked(rel) and _WORKSPACE_FIELD.lower() in lowered:
        hits.append(_WORKSPACE_FIELD)
    return hits


def _text_files():
    """Every scanned text file under src/, plus the installer, sorted."""
    paths = []
    for dirpath, dirnames, filenames in os.walk(os.path.join(_REPO_ROOT, "src")):
        dirnames[:] = sorted(name for name in dirnames if name != "__pycache__")
        for name in sorted(filenames):
            if name != ".DS_Store" and name.endswith(_TEXT_SUFFIXES):
                paths.append(os.path.join(dirpath, name))
    paths.append(os.path.join(_REPO_ROOT, "install.sh"))
    return paths


class ResolveHarnessTest(unittest.TestCase):
    def test_the_flag_wins_over_env_and_config(self):
        chosen = harnesses.resolve_harness(
            {"harness": "claude"}, flag="omp", env={"TM_HARNESS": "codex"}
        )

        self.assertEqual(chosen, "omp")

    def test_env_wins_over_config(self):
        chosen = harnesses.resolve_harness(
            {"harness": "claude"}, env={"TM_HARNESS": "codex"}
        )

        self.assertEqual(chosen, "codex")

    def test_config_is_used_without_a_flag_or_env(self):
        chosen = harnesses.resolve_harness({"harness": "claude"}, env={})

        self.assertEqual(chosen, "claude")

    def test_detection_is_the_last_resort(self):
        chosen = harnesses.resolve_harness({}, env={"OMP_PROFILE": "work"})

        self.assertEqual(chosen, "omp")

    def test_an_unknown_harness_is_rejected(self):
        with self.assertRaises(ValueError):
            harnesses.resolve_harness({}, flag="bogus", env={})

    def test_nothing_resolvable_names_the_flag_and_choices(self):
        with self.assertRaises(ValueError) as ctx:
            harnesses.resolve_harness({}, env={})

        message = str(ctx.exception)
        self.assertIn("--harness", message)
        for name in harnesses.HARNESSES:
            self.assertIn(name, message)


class DetectTest(unittest.TestCase):
    def test_a_known_marker_selects_its_harness(self):
        self.assertEqual(harnesses.detect({"CLAUDECODE": "1"}), "claude")
        self.assertEqual(harnesses.detect({"PI_SMOL_MODEL": "x"}), "pi")

    def test_omp_wins_over_pi_markers(self):
        env = {"OMP_PROFILE": "work", "PI_SMOL_MODEL": "x"}

        self.assertEqual(harnesses.detect(env), "omp")

    def test_no_marker_returns_none(self):
        self.assertIsNone(harnesses.detect({}))


class DescribeTest(unittest.TestCase):
    def test_every_adapter_field_is_present(self):
        fields = harnesses.describe("codex")

        self.assertEqual(
            list(fields),
            [
                "harness",
                "subagent_tool",
                "agent_defs_dir",
                "agent_def_format",
                "skills_dir",
                "instructions_file",
                "config_file",
                "headless",
                "background",
            ],
        )
        self.assertEqual(fields["harness"], "codex")
        self.assertEqual(fields["subagent_tool"], "spawn_agent")
        self.assertEqual(fields["agent_defs_dir"], ".codex/agents")
        self.assertTrue(fields["background"])

    def test_background_support_is_per_harness(self):
        self.assertTrue(harnesses.describe("opencode")["background"])
        self.assertFalse(harnesses.describe("pi")["background"])

    def test_the_subagent_tool_matches_the_harness(self):
        # opencode V2 exposes a `subagent` tool (V1 called it `task`); the
        # others are verified in docs/implementation/16-harness-adapters.md.
        self.assertEqual(harnesses.describe("opencode")["subagent_tool"], "subagent")
        self.assertEqual(harnesses.describe("codex")["subagent_tool"], "spawn_agent")
        self.assertEqual(harnesses.describe("claude")["subagent_tool"], "Agent")
        self.assertEqual(harnesses.describe("pi")["subagent_tool"], "subagent")
        self.assertEqual(harnesses.describe("omp")["subagent_tool"], "task")

    def test_agent_definitions_dir_and_format_per_harness(self):
        expected = {
            "opencode": (".opencode/agents", "md"),
            "codex": (".codex/agents", "toml"),
            "claude": (".claude/agents", "md"),
            "pi": (".pi/agents", "md"),
            "omp": (".omp/agents", "md"),
        }
        for name, (directory, fmt) in expected.items():
            with self.subTest(harness=name):
                fields = harnesses.describe(name)
                self.assertEqual(fields["agent_defs_dir"], directory)
                self.assertEqual(fields["agent_def_format"], fmt)


class RenderAgentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "developer.md")
        with open(self.path, "w") as fh:
            fh.write(
                "---\n"
                "name: developer\n"
                'description: "Build the change"\n'
                "tools: Read, Write\n"
                "model: sonnet\n"
                "---\n\n"
                "# Developer\n\nDo the work.\n"
            )

    def test_a_markdown_harness_keeps_the_original_text(self):
        filename, content = harnesses.render_agent("opencode", self.path)

        self.assertEqual(filename, "developer.md")
        with open(self.path) as fh:
            self.assertEqual(content, fh.read())

    def test_codex_renders_toml_with_the_body_as_instructions(self):
        filename, content = harnesses.render_agent("codex", self.path)

        self.assertEqual(filename, "developer.toml")
        self.assertIn('name = "developer"', content)
        self.assertIn('description = "Build the change"', content)
        self.assertIn('developer_instructions = "# Developer', content)

    def test_a_definition_without_a_name_is_rejected(self):
        path = os.path.join(self.tmp.name, "bad.md")
        with open(path, "w") as fh:
            fh.write("---\ndescription: nope\n---\nbody\n")

        with self.assertRaises(harnesses.TmError):
            harnesses.render_agent("opencode", path)


class NoBannedSurfaceTest(unittest.TestCase):
    def test_the_scan_covers_src_text_files_and_the_installer(self):
        files = _text_files()

        self.assertGreater(len(files), 10)
        self.assertIn(os.path.join(_REPO_ROOT, "install.sh"), files)
        self.assertTrue(any(path.endswith(".md") for path in files))

    def test_only_historical_overviews_mention_a_banned_token(self):
        offending = []
        for path in _text_files():
            try:
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
            except (OSError, UnicodeDecodeError):
                continue
            rel = os.path.relpath(path, _REPO_ROOT)
            if rel in _HISTORICAL:
                continue
            hits = _offending(rel, text)
            if hits:
                offending.append((rel, hits))

        self.assertEqual(offending, [], f"banned surface found in {offending}")

        # The installer may name the legacy artifacts it must remove, but the
        # removed CLI flag/env var and the removed task field stay banned.
        installer = "install.sh"
        legacy_names = " ".join(sorted(_LEGACY_ARTIFACT_ALLOWED[installer]))
        self.assertEqual(_offending(installer, legacy_names), [])
        for token in (
            _token("--", "runtime"),
            _token("TM_", "RUNTIME"),
            _WORKSPACE_FIELD,
        ):
            with self.subTest(token=token):
                self.assertIn(token, _offending(installer, "x " + token + " y"))


if __name__ == "__main__":
    unittest.main()
