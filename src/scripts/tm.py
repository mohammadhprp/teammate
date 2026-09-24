#!/usr/bin/env python3
"""Team Mate CLI: a thin, low-noise harness-aware ledger.

Team Mate workers are native subagents of the host coding harness, so this CLI
does not spawn or manage processes. It records the task ledger and renders the
adapter-specific pieces (skills, agent definitions, briefs, reports) for the
resolved harness. The developer sees one concise line per action.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time

import harnesses
import task_store
from harnesses import TmError

REPORT_FILE = ".teammate-report.md"


def load_config(path):
    try:
        import tomllib
    except ModuleNotFoundError:
        return {}
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as fh:
        return tomllib.load(fh)


# Decision handling, from docs/implementation/07-review-and-approval.md.
DECISIONS = {
    "approve": "approved",
    "finalize": "approved",
    "reject": "rejected",
    "request-changes": "rework",
}

# Fallback skills directory, used only when no harness resolves (for example a
# direct ``sync_skills`` call in a test). The CLI always passes the harness.
SKILLS_SUBDIR = os.path.join(".agents", "skills")
AGENTS_SUBDIR = "agents"
MANAGED_MARKER = ".teammate-managed.json"
REPORT_PREVIEW_LINES = 5
EXCLUDE_BEGIN = "# Team Mate distributed skills (managed)"
EXCLUDE_END = "# end Team Mate distributed skills"

PRIMARY_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPENCODE_CONFIG = "opencode.json"
OPENCODE_SCHEMA = "https://opencode.ai/config.json"


def opencode_rules(root):
    """V2 permission rules that let the primary touch a directory boundary.

    A target project and the primary's own ``state_dir`` both sit outside the
    primary's working directory, so OpenCode asks before the primary reads or
    writes them. These rules allow that boundary; V1 uses ``permission`` with
    action names ``bash``/``task`` instead.
    """
    boundary = os.path.abspath(os.path.expanduser(root))
    return [
        {
            "action": "external_directory",
            "resource": f"{boundary}/*",
            "effect": "allow",
        },
        {"action": "read", "resource": f"{boundary}/*", "effect": "allow"},
        {"action": "edit", "resource": f"{boundary}/*", "effect": "allow"},
    ]


def merge_opencode_permissions(path, rules):
    """Add permission rules to ``opencode.json`` without removing existing ones."""
    if os.path.exists(path):
        with open(path) as fh:
            data = json.load(fh)
    else:
        data = {"$schema": OPENCODE_SCHEMA}
    existing = data.get("permissions")
    if existing is None:
        existing = []
        data["permissions"] = existing
    if not isinstance(existing, list):
        raise ValueError(f"{path}: 'permissions' must be a list")
    added = 0
    for rule in rules:
        if rule not in existing:
            existing.append(rule)
            added += 1
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
    return added, os.path.abspath(path)


def cmd_permissions_init(args):
    added, path = merge_opencode_permissions(args.file, opencode_rules(args.state_dir))
    print(f"permissions\t{added}\t{path}")


def cmd_permissions_allow(args):
    added, path = merge_opencode_permissions(args.file, opencode_rules(args.cwd))
    print(f"permissions\t{added}\t{path}")


def _skills_subdir(harness):
    """The skills directory for a harness, or the fallback when none is known."""
    if harness:
        return harnesses.HARNESS_DESCRIPTORS[harness].skills_dir
    return SKILLS_SUBDIR


def skills_source(config, harness=None):
    """Directory the shared skills are copied from.

    Defaults to the resolved harness's skills directory under the primary root,
    unless the ``skills_source`` config key overrides it.
    """
    override = config.get("skills_source")
    if override:
        return os.path.abspath(os.path.expanduser(override))
    return os.path.join(PRIMARY_ROOT, _skills_subdir(harness))


def _read_manifest(target):
    try:
        with open(os.path.join(target, MANAGED_MARKER)) as fh:
            return set(json.load(fh).get("skills", []))
    except (OSError, ValueError):
        return set()


def _write_manifest(target, names):
    with open(os.path.join(target, MANAGED_MARKER), "w") as fh:
        json.dump({"skills": sorted(names)}, fh, indent=2)
        fh.write("\n")


def _exclude_from_git(root, names, subdir):
    """Keep managed skills and the worker report file out of ``git status``.

    Only ``.git/info/exclude`` is touched, which is never committed, so a
    project's own files are untouched.
    """
    proc = subprocess.run(
        ["git", "-C", root, "rev-parse", "--git-dir"],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return
    gitdir = proc.stdout.strip()
    if not os.path.isabs(gitdir):
        gitdir = os.path.join(root, gitdir)
    path = os.path.join(gitdir, "info", "exclude")
    slash = subdir.replace(os.sep, "/")
    kept, inside = [], False
    if os.path.exists(path):
        with open(path) as fh:
            for line in fh.read().splitlines():
                if line == EXCLUDE_BEGIN:
                    inside = True
                elif line == EXCLUDE_END:
                    inside = False
                elif not inside:
                    kept.append(line)
    if names:
        kept += [EXCLUDE_BEGIN]
        kept += [f"/{slash}/{name}/" for name in sorted(names)]
        kept += [f"/{slash}/{MANAGED_MARKER}"]
        kept += [f"/{REPORT_FILE}"]
        kept += [EXCLUDE_END]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write("\n".join(kept) + "\n")


def sync_skills(config, root, names=None, harness=None):
    """Copy the shared skills into a project so its workers can load them.

    Idempotent, and it never overwrites a skill the project owns: a name is
    copied only when it is absent or was installed by a previous sync.
    """
    if names is None:
        names = config.get("worker_skills") or []
    source = skills_source(config, harness)
    subdir = _skills_subdir(harness)
    target = os.path.join(os.path.abspath(root), subdir)
    managed = _read_manifest(target)
    installed, skipped = [], []
    for name in names:
        src = os.path.join(source, name)
        if not os.path.isdir(src):
            skipped.append(name)
            continue
        dst = os.path.join(target, name)
        if os.path.exists(dst) and name not in managed:
            skipped.append(name)
            continue
        os.makedirs(target, exist_ok=True)
        shutil.copytree(
            src,
            dst,
            dirs_exist_ok=True,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
        )
        installed.append(name)
    current = managed | set(installed)
    if installed:
        _write_manifest(target, current)
    if config.get("distribute_git_exclude", True) and current:
        _exclude_from_git(os.path.abspath(root), current, subdir)
    return installed, skipped, target


def agents_source():
    """Directory the canonical agent definitions are read from."""
    return os.path.join(PRIMARY_ROOT, AGENTS_SUBDIR)


def sync_agents(harness, root, source=None):
    """Render the canonical agent definitions into ``root`` for ``harness``.

    Returns ``(installed_filenames, target_dir)``.
    """
    descriptor = harnesses.HARNESS_DESCRIPTORS[harness]
    source = source or agents_source()
    target = os.path.join(os.path.abspath(root), descriptor.agent_defs_dir)
    installed = []
    for path in sorted(glob.glob(os.path.join(source, "*.md"))):
        filename, content = harnesses.render_agent(harness, path)
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, filename), "w") as fh:
            fh.write(content)
        installed.append(filename)
    return installed, target


def cmd_harness(args):
    config = load_config(args.config)
    name = harnesses.resolve_harness(config, flag=getattr(args, "harness", None))
    for key, value in harnesses.describe(name).items():
        print(f"{key}\t{value}")


def cmd_agents_sync(args):
    config = load_config(args.config)
    harness = harnesses.resolve_harness(config, flag=getattr(args, "harness", None))
    installed, target = sync_agents(harness, args.cwd)
    print(f"agents\t{len(installed)}\t{target}")


def _project_root(state_dir, task):
    """A task's root, falling back to the registered root for its project."""
    return task.get("root") or task_store.list_projects(state_dir).get(task["project"])


def _report_target(args):
    """The project, root, and task a report command acts on."""
    if args.task:
        task = task_store.load(args.state_dir, args.task)
        return task["project"], _project_root(args.state_dir, task), task
    if args.project:
        root = task_store.list_projects(args.state_dir).get(args.project)
        return args.project, root, None
    task = task_store.find_by_worker(args.state_dir, args.name)
    if task:
        return task["project"], _project_root(args.state_dir, task), task
    raise TmError(f"no task for worker {args.name}; pass --task or --project")


def _task_report_text(task):
    """The report a task stores: its path's contents, else its inline text."""
    path = task.get("report_path")
    if path:
        try:
            with open(path) as fh:
                return fh.read()
        except OSError:
            pass
    return task.get("report")


def cmd_report(args):
    project, root, task = _report_target(args)
    text = None
    if root:
        path = os.path.join(root, REPORT_FILE)
        if os.path.isfile(path):
            with open(path) as fh:
                text = fh.read()
    if text is None and task is not None:
        text = _task_report_text(task)
    if text is None:
        if root:
            raise TmError(
                f"no report for {args.name}: {os.path.join(root, REPORT_FILE)} "
                "is missing and the task has no stored report"
            )
        raise TmError(
            f"no report for {args.name}: no project root is known and the task "
            "has no stored report"
        )
    if not args.save:
        sys.stdout.write(text)
        return
    directory = task_store.reports_dir(args.state_dir, project)
    os.makedirs(directory, exist_ok=True)
    stem = f"{args.task}-{args.name}" if args.task else args.name
    path = os.path.join(directory, f"{stem}-{int(time.time() * 1000)}.md")
    with open(path, "w") as fh:
        fh.write(text)
    print(path)


def cmd_brief(args):
    text = sys.stdin.read()
    if not text.strip():
        raise ValueError("empty brief")
    project = _resolve_project(args)
    directory = task_store.briefs_dir(args.state_dir, project)
    os.makedirs(directory, exist_ok=True)
    stem = f"{args.task}-{args.name}" if args.task else args.name
    path = os.path.join(directory, f"{stem}.md")
    with open(path, "w") as fh:
        fh.write(text if text.endswith("\n") else text + "\n")
    print(path)


def cmd_session_start(args):
    print(task_store.new_session(args.state_dir, _resolve_project(args)))


def cmd_session_status(args):
    project = _resolve_project(args)
    print(task_store.current_session(args.state_dir, project) or "none")


def cmd_session_end(args):
    print(task_store.end_session(args.state_dir, _resolve_project(args)) or "none")


def cmd_session_summary(args):
    project = _resolve_project(args)
    if args.all:
        session = None
    else:
        session = _resolve_session(args.state_dir, project, args.session)
        if session is None:
            session = task_store.current_session(args.state_dir, project)
    tasks = task_store.list_tasks(args.state_dir, project, session=session)
    if not tasks:
        print("no tasks")
        return
    counts = {}
    for task in tasks:
        status = task.get("status", "?")
        counts[status] = counts.get(status, 0) + 1
    breakdown = " ".join(f"{status}={counts[status]}" for status in sorted(counts))
    print(f"tasks\t{len(tasks)}\t{breakdown}")
    workers = {task.get("worker") for task in tasks if task.get("worker")}
    print(f"workers\t{len(workers)}")
    created = min(task.get("created_at", 0) for task in tasks)
    updated = max(task.get("updated_at", 0) for task in tasks)
    print(f"span\t{_format_duration(updated - created)}")
    if any(task.get("cost") is not None for task in tasks):
        print(
            f"cost\t{sum(task['cost'] for task in tasks if task.get('cost') is not None)}"
        )
    if any(task.get("tokens") is not None for task in tasks):
        print(
            f"tokens\t{sum(task['tokens'] for task in tasks if task.get('tokens') is not None)}"
        )


def cmd_diff(args):
    root = os.path.abspath(args.cwd)

    def git(*git_args):
        proc = subprocess.run(
            ["git", "-C", root, *git_args], capture_output=True, text=True
        )
        return proc.stdout

    # Untracked files are invisible to `git diff`; show them first so a reviewer
    # does not miss a brand-new file.
    status = git("status", "--short")
    if status.strip():
        sys.stdout.write(status)
    sys.stdout.write(git("diff", "--stat") if args.stat else git("diff"))


def cmd_skills_sync(args):
    config = load_config(args.config)
    harness = harnesses.resolve_harness(config, flag=getattr(args, "harness", None))
    installed, skipped, target = sync_skills(config, args.cwd, harness=harness)
    print(f"skills\t{len(installed)}\t{target}")
    if skipped:
        print(f"skipped\t{len(skipped)}\t{' '.join(sorted(skipped))}")


def cmd_project_add(args):
    root = task_store.register_project(args.state_dir, args.name, args.root, args.force)
    print(f"project\t{args.name}\t{root}")


def cmd_project_list(args):
    projects = task_store.list_projects(args.state_dir)
    if not projects:
        print("no projects")
        return
    for name in sorted(projects):
        print(f"{name}\t{projects[name]}")


def _report_lines(task):
    """A short report pointer, never the full capture (E5).

    New tasks store the report path; a legacy task keeps only the content, so
    show a few lines and say the rest was truncated.
    """
    path = task.get("report_path")
    if path:
        return [f"Report: {path}"]
    report = task.get("report")
    if not report:
        return []
    lines = report.splitlines()
    preview = lines[:REPORT_PREVIEW_LINES]
    out = ["Report: (legacy inline capture, truncated)"]
    out += [f"  {line}" for line in preview]
    if len(lines) > REPORT_PREVIEW_LINES:
        out.append(f"  ... {len(lines) - REPORT_PREVIEW_LINES} more line(s)")
    return out


def _format_duration(ms):
    """A compact elapsed time: ``42s``, ``3m 12s``, ``1h 04m``."""
    seconds = max(0, ms // 1000)
    if seconds < 60:
        return f"{seconds}s"
    minutes, seconds = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {seconds:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def _render_task(task):
    lines = [
        f"Task: {task['id']}",
        f"Title: {task['title']}",
        f"Status: {task['status']}",
        f"Kind: {task.get('kind', 'build')}",
        f"Project: {task['project']} ({task.get('root') or '?'})",
        f"Worker: {task.get('worker') or '-'}",
        f"Iteration: {task['iteration']} of {task['max_iterations']}",
    ]
    if task.get("created_at") is not None and task.get("updated_at") is not None:
        lines.append(
            f"Elapsed: {_format_duration(task['updated_at'] - task['created_at'])}"
        )
    if task.get("cost") is not None:
        lines.append(f"Cost: {task['cost']}")
    if task.get("tokens") is not None:
        lines.append(f"Tokens: {task['tokens']}")
    lines += [
        "Goal:",
        f"  {task['goal']}",
        "Acceptance:",
    ]
    lines += [f"  {i}. {c}" for i, c in enumerate(task["acceptance"], 1)]
    if task.get("constraints"):
        lines.append("Constraints:")
        lines += [f"  - {c}" for c in task["constraints"]]
    findings = task.get("findings") or []
    blocking = task_store.count_findings(task, "open", task_store.BLOCKING_SEVERITIES)
    lines.append(f"Verdict: {task_store.verdict(task)}")
    lines.append(f"Findings: {len(findings)} ({blocking} open blocking)")
    for finding in findings:
        where = finding.get("file") or ""
        if finding.get("line"):
            where = f"{where}:{finding['line']}" if where else str(finding["line"])
        suffix = f" ({where})" if where else ""
        lines.append(
            f"  - [{finding.get('status', 'open')}] {finding.get('severity')} "
            f"{finding.get('category')}: {finding.get('title')}{suffix}"
        )
    if task.get("decision"):
        lines.append(f"Decision: {task['decision']}")
    if task.get("note"):
        lines.append(f"Note: {task['note']}")
    lines += _report_lines(task)
    return "\n".join(lines)


def cmd_task_new(args):
    max_iterations = args.max_iterations
    if max_iterations is None:
        config = getattr(args, "config_data", None) or {}
        max_iterations = config.get("max_iterations", 3)
    task = task_store.create(
        args.state_dir,
        _resolve_project(args),
        args.title,
        args.goal,
        args.acceptance,
        args.constraint,
        args.worker,
        max_iterations,
        kind=args.kind,
    )
    print(task["id"])


def _within(root, path):
    root = os.path.abspath(root)
    path = os.path.abspath(path)
    return path == root or path.startswith(root + os.sep)


def _resolve_project(args):
    """The project a command acts on.

    ``--project`` wins; otherwise the ``--task`` task's project; otherwise the
    registered project whose root contains the current directory. Raises a
    clear error naming ``--project`` when none applies.
    """
    if getattr(args, "project", None):
        return args.project
    task_id = getattr(args, "task", None)
    if task_id:
        return task_store.load(args.state_dir, task_id)["project"]
    cwd = os.getcwd()
    projects = task_store.list_projects(args.state_dir)
    matches = [name for name, root in projects.items() if _within(root, cwd)]
    if matches:
        return max(matches, key=lambda name: len(projects[name]))
    raise ValueError(
        "no project could be resolved: pass --project <name>, link --task, "
        "or register the current directory with `tm project add`"
    )


def _resolve_session(state_dir, project, session):
    if session == "current":
        if project:
            return task_store.current_session(state_dir, project)
        return task_store.open_sessions(state_dir)
    return session


def cmd_task_list(args):
    project = args.project
    if args.all:
        session = None
    elif args.session:
        session = _resolve_session(args.state_dir, project, args.session)
    elif project:
        session = task_store.current_session(args.state_dir, project)
    else:
        # Cross-project: show the tasks of every open session. With none open,
        # fall back to the whole ledger, as a single project used to.
        session = task_store.open_sessions(args.state_dir) or None
    tasks = task_store.list_tasks(args.state_dir, project, args.status, session)
    if not tasks:
        print("no tasks")
        return
    for task in tasks:
        print(
            f"{task['id']}\t{task['status']}\t{task['project']}\t"
            f"i{task['iteration']}/{task['max_iterations']}\t"
            f"{task.get('worker') or '-'}\t{task.get('kind', 'build')}\t"
            f"{task['title']}"
        )


def cmd_task_prune(args):
    project = args.project
    if args.all:
        session = None
    elif args.session:
        session = _resolve_session(args.state_dir, project, args.session)
    else:
        if project:
            session = task_store.current_session(args.state_dir, project)
        else:
            session = task_store.open_sessions(args.state_dir) or None
        if session is None:
            raise ValueError("no open session; pass --session <id> or --all")
    moved = task_store.prune(args.state_dir, project=project, session=session)
    location = (
        task_store.archive_dir(args.state_dir, project) if project else args.state_dir
    )
    print(f"archived\t{len(moved)}\t{location}")


def cmd_task_show(args):
    print(_render_task(task_store.load(args.state_dir, args.id)))


def cmd_task_find(args):
    task = task_store.find_by_worker(args.state_dir, args.worker)
    if not task:
        raise TmError(f"no task for worker {args.worker}")
    print(f"{task['id']}\t{task['status']}\t{task['title']}")


def _require_no_open_blocking(state_dir, task_id):
    task = task_store.load(state_dir, task_id)
    blocking = task_store.count_findings(task, "open", task_store.BLOCKING_SEVERITIES)
    if blocking:
        raise TmError(
            f"{blocking} open blocker/major finding(s); resolve them before a pass"
        )


def _require_build_task(state_dir, task_id):
    """Reviews record evidence; only build tasks await the developer (E4)."""
    task = task_store.load(state_dir, task_id)
    if task.get("kind", "build") == "review":
        raise TmError(
            f"{task_id} is a review task; reviews do not await approval "
            "or take a developer decision"
        )


def _require_pass_verdict(state_dir, task_id):
    """Only a pass may advance to approval; inconclusive escalates instead."""
    verdict = task_store.verdict(task_store.load(state_dir, task_id))
    if verdict != "pass":
        raise TmError(f"verdict is {verdict}; resolve it before approval")


def cmd_task_update(args):
    if args.status in ("ready_for_approval", "approved"):
        _require_no_open_blocking(args.state_dir, args.id)
    if args.status == "ready_for_approval":
        _require_build_task(args.state_dir, args.id)
        _require_pass_verdict(args.state_dir, args.id)
    fields = {}
    if args.status:
        fields["status"] = args.status
    if args.iteration is not None:
        fields["iteration"] = args.iteration
    if getattr(args, "worker", None):
        fields["worker"] = args.worker
    if args.report_file:
        with open(args.report_file) as fh:
            fields["report"] = fh.read()
        fields["report_path"] = args.report_file
    if args.note:
        fields["note"] = args.note
    verdict = getattr(args, "verdict", None)
    if verdict == "inconclusive":
        fields["verdict"] = "inconclusive"
    elif verdict == "auto":
        fields["verdict"] = None
    if getattr(args, "cost", None) is not None:
        fields["cost"] = args.cost
    if getattr(args, "tokens", None) is not None:
        fields["tokens"] = args.tokens
    task = task_store.update(args.state_dir, args.id, **fields)
    kind, summary = "task.updated", f"status={task['status']}"
    if task["status"] == "awaiting_review":
        kind, summary = "review.started", "worker settled; review started"
    elif task["status"] == "ready_for_approval":
        kind, summary = "review.verdict", "pass"
    elif task["status"] == "rework":
        kind, summary = "review.verdict", "fail"
    task_store.append_event(args.state_dir, task["project"], task["id"], kind, summary)
    if verdict == "inconclusive":
        task_store.append_event(
            args.state_dir,
            task["project"],
            task["id"],
            "review.verdict",
            "inconclusive",
        )
    print(f"{task['id']}\t{task['status']}")


def cmd_task_findings(args):
    if args.file == "-":
        payload = json.load(sys.stdin)
    else:
        with open(args.file) as fh:
            payload = json.load(fh)
    if isinstance(payload, dict):
        payload = [payload]
    task = task_store.record_findings(args.state_dir, args.id, payload)
    task_store.append_event(
        args.state_dir,
        task["project"],
        task["id"],
        "review.findings",
        f"{len(payload)} finding(s)",
    )
    print(f"{task['id']}\t{len(task['findings'])}\t{task_store.verdict(task)}")


def cmd_task_resolve(args):
    if not args.all and not args.finding:
        raise ValueError("pass --all or --finding N")
    status = args.status or "resolved"
    if status not in task_store.FINDING_STATUSES:
        raise ValueError(f"invalid finding status: {status}")
    indexes = None if args.all else [i - 1 for i in args.finding]
    task = task_store.resolve_findings(args.state_dir, args.id, indexes, status)
    task_store.append_event(
        args.state_dir,
        task["project"],
        task["id"],
        "review.findings",
        f"findings -> {status}",
    )
    print(f"{task['id']}\t{task_store.verdict(task)}")


def cmd_task_decide(args):
    if args.decision not in DECISIONS:
        raise ValueError(f"unknown decision: {args.decision}")
    _require_build_task(args.state_dir, args.id)
    if args.decision in ("approve", "finalize"):
        _require_no_open_blocking(args.state_dir, args.id)
        _require_pass_verdict(args.state_dir, args.id)
    status = DECISIONS[args.decision]
    fields = {"decision": args.decision, "status": status}
    if args.note:
        fields["note"] = args.note
    task = task_store.update(args.state_dir, args.id, **fields)
    task_store.append_event(
        args.state_dir,
        task["project"],
        task["id"],
        "task.decision",
        f"{args.decision} -> {status}",
    )
    print(f"{task['id']}\t{args.decision}\t{status}")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="tm", description="Team Mate: harness-aware ledger"
    )
    parser.add_argument(
        "--config",
        default="team-mate.toml",
        help="config file (default: team-mate.toml)",
    )
    parser.add_argument(
        "--state-dir",
        default=None,
        help="task ledger directory (default: state_dir from config, else ~/.teammate)",
    )
    parser.add_argument(
        "--harness",
        choices=list(harnesses.HARNESSES),
        default=None,
        help="coding harness (default: TM_HARNESS, the config's harness, else detect)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("harness", help="print the resolved harness adapter")
    p.set_defaults(func=cmd_harness)

    p = sub.add_parser(
        "agents", help="install the resolved harness's agent definitions"
    )
    actions = p.add_subparsers(dest="action", required=True)
    a = actions.add_parser("sync", help="render agent definitions into a project")
    a.add_argument("--cwd", required=True, help="project root")
    a.set_defaults(func=cmd_agents_sync)

    p = sub.add_parser("report", help="read a worker's report file")
    p.add_argument("name")
    p.add_argument(
        "--save",
        action="store_true",
        help="write the report under <state_dir>/<project>/reports and print the path",
    )
    p.add_argument("--task", help="task id, used to resolve the project")
    p.add_argument("--project", help="project name (default: resolved from the task)")
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("brief", help="write a brief under <state_dir>/<project>/briefs")
    p.add_argument("name")
    p.add_argument("--task", help="task id, used to name the brief")
    p.add_argument("--project", help="project name (default: the task's, else cwd)")
    p.set_defaults(func=cmd_brief)

    p = sub.add_parser("diff", help="show working-copy changes for a project")
    p.add_argument("--cwd", default=".")
    p.add_argument("--stat", action="store_true")
    p.set_defaults(func=cmd_diff)

    p = sub.add_parser("session", help="mark the primary's session in the ledger")
    actions = p.add_subparsers(dest="action", required=True)
    a = actions.add_parser("start", help="open a session and print its id")
    a.add_argument("--project", help="project name (default: the cwd's project)")
    a.set_defaults(func=cmd_session_start)
    a = actions.add_parser("status", help="print the open session id")
    a.add_argument("--project", help="project name (default: the cwd's project)")
    a.set_defaults(func=cmd_session_status)
    a = actions.add_parser("end", help="close the open session")
    a.add_argument("--project", help="project name (default: the cwd's project)")
    a.set_defaults(func=cmd_session_end)
    a = actions.add_parser("summary", help="roll up the open session's tasks")
    a.add_argument("--project", help="project name (default: the cwd's project)")
    a.add_argument("--session", help="session id, or 'current'")
    a.add_argument(
        "--all",
        action="store_true",
        help="summarize every session, not just the open one",
    )
    a.set_defaults(func=cmd_session_summary)

    p = sub.add_parser(
        "permissions", help="provision the primary's OpenCode permissions"
    )
    actions = p.add_subparsers(dest="action", required=True)
    default_opencode = os.path.join(PRIMARY_ROOT, OPENCODE_CONFIG)
    a = actions.add_parser("init", help="allow the primary's state_dir")
    a.add_argument("--file", default=default_opencode, help="opencode.json path")
    a.set_defaults(func=cmd_permissions_init)
    a = actions.add_parser("allow", help="allow a target project root")
    a.add_argument("--cwd", required=True, help="project root to allow")
    a.add_argument("--file", default=default_opencode, help="opencode.json path")
    a.set_defaults(func=cmd_permissions_allow)

    p = sub.add_parser("skills", help="distribute shared skills into a project")
    actions = p.add_subparsers(dest="action", required=True)
    a = actions.add_parser("sync", help="copy common and worker skills into a project")
    a.add_argument("--cwd", required=True, help="project root")
    a.set_defaults(func=cmd_skills_sync)

    p = sub.add_parser("project", help="manage the project registry")
    actions = p.add_subparsers(dest="action", required=True)
    a = actions.add_parser("add", help="register a project name to an absolute root")
    a.add_argument("--name", required=True)
    a.add_argument("--root", required=True, help="project root (stored absolute)")
    a.add_argument(
        "--force",
        action="store_true",
        help="rebind a name that is already registered at a different root",
    )
    a.set_defaults(func=cmd_project_add)
    a = actions.add_parser("list", help="list registered projects")
    a.set_defaults(func=cmd_project_list)

    p = sub.add_parser("task", help="manage the persistent task ledger")
    actions = p.add_subparsers(dest="action", required=True)

    a = actions.add_parser("new", help="record a task before delegating")
    a.add_argument(
        "--project",
        help="project name (default: the cwd's registered project)",
    )
    a.add_argument("--title", required=True)
    a.add_argument("--goal", required=True)
    a.add_argument("--acceptance", action="append", required=True)
    a.add_argument("--constraint", action="append")
    a.add_argument("--worker")
    a.add_argument(
        "--kind",
        choices=list(task_store.KINDS),
        default="build",
        help="task kind (default: build); review tasks never await approval",
    )
    a.add_argument(
        "--max-iterations",
        type=int,
        default=None,
        help="review/rework budget (default: max_iterations from config, else 3)",
    )
    a.set_defaults(func=cmd_task_new)

    a = actions.add_parser("list", help="list tasks")
    a.add_argument("--project", help="only this project (default: every project)")
    a.add_argument("--status", choices=list(task_store.STATUSES))
    a.add_argument(
        "--session",
        help="filter by session id, or 'current' for the open session",
    )
    a.add_argument(
        "--all",
        action="store_true",
        help="show every session, not just the open one",
    )
    a.set_defaults(func=cmd_task_list)

    a = actions.add_parser("show", help="show one task")
    a.add_argument("id")
    a.set_defaults(func=cmd_task_show)

    a = actions.add_parser("find", help="find the task for a worker")
    a.add_argument("--worker", required=True)
    a.set_defaults(func=cmd_task_find)

    a = actions.add_parser("findings", help="record review findings on a task")
    a.add_argument("id")
    a.add_argument(
        "--file",
        required=True,
        help="JSON findings file (array or object), or - for stdin",
    )
    a.set_defaults(func=cmd_task_findings)

    a = actions.add_parser("resolve", help="close fixed or accepted findings")
    a.add_argument("id")
    a.add_argument(
        "--finding", type=int, action="append", help="1-based finding number"
    )
    a.add_argument("--all", action="store_true", help="close every finding")
    a.add_argument("--status", choices=list(task_store.FINDING_STATUSES))
    a.set_defaults(func=cmd_task_resolve)

    a = actions.add_parser("decide", help="record the developer's decision")
    a.add_argument("id")
    a.add_argument("decision", choices=list(DECISIONS))
    a.add_argument("--note")
    a.set_defaults(func=cmd_task_decide)

    a = actions.add_parser("prune", help="archive closed tasks out of the live ledger")
    a.add_argument("--project", help="only this project (default: every project)")
    a.add_argument("--session", help="session id, or 'current'")
    a.add_argument(
        "--all", action="store_true", help="archive closed tasks from every session"
    )
    a.set_defaults(func=cmd_task_prune)

    a = actions.add_parser("update", help="record task progress")
    a.add_argument("id")
    a.add_argument("--status", choices=list(task_store.STATUSES))
    a.add_argument("--iteration", type=int)
    a.add_argument("--worker", help="link a worker to the task")
    a.add_argument("--report-file")
    a.add_argument("--note")
    a.add_argument(
        "--verdict",
        choices=["inconclusive", "auto"],
        help="record an inconclusive verdict, or auto to derive pass/fail",
    )
    a.add_argument("--cost", type=float, help="recorded cost in USD, when known")
    a.add_argument("--tokens", type=int, help="recorded token count, when known")
    a.set_defaults(func=cmd_task_update)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    config = load_config(args.config)
    args.config_data = config
    args.state_dir = os.path.expanduser(
        args.state_dir or config.get("state_dir", "~/.teammate")
    )
    try:
        report = task_store.migrate(args.state_dir)
        if report["moved"]:
            print(
                f"migration\t{len(report['moved'])} moved\t{len(report['left'])} left",
                file=sys.stderr,
            )
        args.func(args)
    except (TmError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
