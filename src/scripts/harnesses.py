"""Coding-harness adapters behind the ``tm`` CLI.

Team Mate workers are native subagents of the host coding harness, so ``tm`` no
longer spawns or manages processes. It only needs to know a harness's shape: the
name of its subagent tool, where agent definitions and skills live, its
instruction and config files, a resume command, and a best-effort detection
marker.

Selection order is ``--harness``, then ``TM_HARNESS``, then the ``harness`` key
in ``team-mate.toml``, then best-effort detection. Detection is a convenience
only and is never trusted over an explicit selection.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass

HARNESS_OPENCODE = "opencode"
HARNESS_CODEX = "codex"
HARNESS_CLAUDE = "claude"
HARNESS_PI = "pi"
HARNESS_OMP = "omp"

HARNESSES = (
    HARNESS_OPENCODE,
    HARNESS_CODEX,
    HARNESS_CLAUDE,
    HARNESS_PI,
    HARNESS_OMP,
)


class TmError(RuntimeError):
    """A Team Mate operation failed."""


@dataclass(frozen=True)
class Harness:
    """How one coding harness names its subagents, skills, and config files."""

    name: str
    subagent_tool: str
    agent_defs_dir: str
    agent_def_format: str
    skills_dir: str
    skills_format: str
    instructions_file: str
    config_file: str
    headless_cmd: str
    background: bool
    detect_env: tuple


HARNESS_DESCRIPTORS = {
    HARNESS_OPENCODE: Harness(
        name=HARNESS_OPENCODE,
        subagent_tool="subagent",
        agent_defs_dir=".opencode/agents",
        agent_def_format="md",
        skills_dir=".opencode/skills",
        skills_format="md",
        instructions_file="AGENTS.md",
        config_file="opencode.json",
        headless_cmd="opencode run",
        background=True,
        detect_env=("OPENCODE",),
    ),
    HARNESS_CODEX: Harness(
        name=HARNESS_CODEX,
        subagent_tool="spawn_agent",
        agent_defs_dir=".codex/agents",
        agent_def_format="toml",
        skills_dir=".agents/skills",
        skills_format="md",
        instructions_file="AGENTS.md",
        config_file=".codex/config.toml",
        headless_cmd="codex exec",
        background=True,
        detect_env=("CODEX_HOME", "CODEX_SANDBOX"),
    ),
    HARNESS_CLAUDE: Harness(
        name=HARNESS_CLAUDE,
        subagent_tool="Agent",
        agent_defs_dir=".claude/agents",
        agent_def_format="md",
        skills_dir=".claude/skills",
        skills_format="md",
        instructions_file="CLAUDE.md",
        config_file=".claude/settings.json",
        headless_cmd="claude -p",
        background=True,
        detect_env=("CLAUDECODE",),
    ),
    HARNESS_PI: Harness(
        name=HARNESS_PI,
        subagent_tool="subagent",
        agent_defs_dir=".pi/agents",
        agent_def_format="md",
        skills_dir=".pi/skills",
        skills_format="md",
        instructions_file="AGENTS.md",
        config_file=".pi/settings.json",
        headless_cmd="pi -p",
        background=False,
        detect_env=("PI_CODING_AGENT_DIR", "PI_SMOL_MODEL"),
    ),
    HARNESS_OMP: Harness(
        name=HARNESS_OMP,
        subagent_tool="task",
        agent_defs_dir=".omp/agents",
        agent_def_format="md",
        skills_dir=".omp/skills",
        skills_format="md",
        instructions_file=".omp/AGENTS.md",
        config_file=".omp/config.yml",
        headless_cmd="omp -p",
        background=True,
        detect_env=("OMP_PROFILE",),
    ),
}

# Detection order: omp before pi so an ``OMP_PROFILE`` marker wins over the
# ``PI_*`` markers omp may also carry.
_DETECT_ORDER = (HARNESS_OMP,) + tuple(
    name for name in HARNESSES if name != HARNESS_OMP
)


def detect(env=None):
    """The first harness whose marker is present, or ``None``.

    Best-effort only: it never raises, and its result must not override an
    explicit ``--harness`` or config value.
    """
    env = os.environ if env is None else env
    for name in _DETECT_ORDER:
        markers = HARNESS_DESCRIPTORS[name].detect_env
        if any(env.get(marker) for marker in markers):
            return name
    return None


def resolve_harness(config=None, flag=None, env=None):
    """The harness to use: flag, then env, then config, then detection."""
    env = os.environ if env is None else env
    chosen = flag or env.get("TM_HARNESS") or (config or {}).get("harness") or None
    if chosen is None:
        chosen = detect(env)
    choices = "{" + ",".join(HARNESSES) + "}"
    if chosen is None:
        raise ValueError(
            f"no harness selected: pass --harness {choices} or set TM_HARNESS"
        )
    if chosen not in HARNESSES:
        raise ValueError(f"unknown harness {chosen!r}: choose --harness {choices}")
    return chosen


def describe(name):
    """The ordered adapter fields for one harness, for ``tm harness``."""
    harness = HARNESS_DESCRIPTORS[name]
    return {
        "harness": harness.name,
        "subagent_tool": harness.subagent_tool,
        "agent_defs_dir": harness.agent_defs_dir,
        "agent_def_format": harness.agent_def_format,
        "skills_dir": harness.skills_dir,
        "instructions_file": harness.instructions_file,
        "config_file": harness.config_file,
        "headless": harness.headless_cmd,
        "background": harness.background,
    }


def _parse_agent(path):
    """Split a canonical ``.md`` agent definition into frontmatter and body."""
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise TmError(f"{path}: agent definition needs a '---' frontmatter block")
    end = None
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            end = index
            break
    if end is None:
        raise TmError(f"{path}: frontmatter block is not closed by a '---' line")
    fields = {}
    for line in lines[1:end]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip().strip('"').strip("'")
    if not fields.get("name"):
        raise TmError(f"{path}: agent definition needs a 'name'")
    body = "\n".join(lines[end + 1 :]).strip("\n")
    return fields, body


def _toml_string(value):
    """A TOML basic string; JSON escaping is a subset TOML accepts."""
    return json.dumps(value, ensure_ascii=False)


def _toml_agent(fields, body):
    return "\n".join(
        [
            f"name = {_toml_string(fields['name'])}",
            f"description = {_toml_string(fields.get('description', ''))}",
            f"developer_instructions = {_toml_string(body)}",
        ]
    )


def render_agent(harness, path):
    """Render a canonical agent definition for ``harness``.

    Returns ``(filename, content)``: markdown harnesses keep the original text,
    while codex gets a TOML file with ``name``, ``description``, and
    ``developer_instructions`` (the body).
    """
    fields, body = _parse_agent(path)
    name = fields["name"]
    if HARNESS_DESCRIPTORS[harness].agent_def_format == "toml":
        return f"{name}.toml", _toml_agent(fields, body) + "\n"
    with open(path, encoding="utf-8") as fh:
        return f"{name}.md", fh.read()
