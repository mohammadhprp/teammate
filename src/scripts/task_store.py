"""File-backed Team Mate task store.

State is **per project**. Each project gets a directory named after its slug
under ``<state_dir>/``::

    <state_dir>/projects.json          # shared: project name -> absolute root
    <state_dir>/<slug>/tasks/<id>.json # one file per task (the ledger)
    <state_dir>/<slug>/archive/        # pruned tasks (moved, never deleted)
    <state_dir>/<slug>/briefs/         # the briefs the primary sends workers
    <state_dir>/<slug>/reports/        # captured worker output
    <state_dir>/<slug>/timeline.jsonl  # append-only events
    <state_dir>/<slug>/session.json    # the open session marker

State is local to the primary repository and survives the primary agent's
session ending. Legacy state that lived directly under ``<state_dir>`` is moved
into the per-project directories by :func:`migrate`, called once per run.

This is a plain file store used by the ``tm`` CLI. It is not a daemon and not a
database.
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid

STATUSES = (
    "planned",
    "working",
    "awaiting_review",
    "rework",
    "ready_for_approval",
    "approved",
    "rejected",
    "failed",
    "cancelled",
)

ACTIVE_STATUSES = {
    "planned",
    "working",
    "awaiting_review",
    "rework",
    "ready_for_approval",
}

CLOSED_STATUSES = {
    "approved",
    "rejected",
    "failed",
    "cancelled",
}

# Task kinds, from docs/implementation/12-parallel-run-review.md (E4). A review
# task records evidence against a build task; it never awaits approval.
KINDS = ("build", "review")

TASKS_DIR = "tasks"
ARCHIVE_DIR = "archive"
BRIEFS_DIR = "briefs"
REPORTS_DIR = "reports"
SESSION_FILE = "session.json"
TIMELINE_FILE = "timeline.jsonl"
PROJECTS_FILE = "projects.json"

# Findings, from docs/implementation/07-review-and-approval.md.
SEVERITIES = ("blocker", "major", "minor", "nit")
FINDING_CATEGORIES = (
    "bug",
    "missing-requirement",
    "incorrect-behavior",
    "regression",
    "edge-case",
    "scope",
    "test-gap",
    "quality",
)
FINDING_STATUSES = ("open", "resolved", "accepted")
BLOCKING_SEVERITIES = ("blocker", "major")

# Verdicts, from docs/implementation/07-review-and-approval.md. pass/fail are
# derived from findings; inconclusive is an explicit reviewer override.
VERDICTS = ("inconclusive",)


def slug(name):
    """A filesystem-safe directory name for a project.

    Lowercases, collapses every run of characters outside ``[a-z0-9._-]`` to a
    single ``-``, and trims leading/trailing separators. A name that slugs to
    nothing (all punctuation, or empty) falls back to ``project``.
    """
    text = re.sub(r"[^a-z0-9._-]+", "-", str(name).strip().lower())
    return text.strip("-._") or "project"


def project_dir(state_dir, project):
    """The per-project state directory, ``<state_dir>/<slug(project)>/``."""
    return os.path.join(os.path.expanduser(state_dir), slug(project))


def tasks_dir(state_dir, project):
    """Where a project's live task records live."""
    return os.path.join(project_dir(state_dir, project), TASKS_DIR)


def archive_dir(state_dir, project):
    """Where pruned (archived) tasks for a project are moved."""
    return os.path.join(project_dir(state_dir, project), ARCHIVE_DIR)


def briefs_dir(state_dir, project):
    """Canonical location for a project's worker briefs. The sandbox allows it."""
    return os.path.join(project_dir(state_dir, project), BRIEFS_DIR)


def reports_dir(state_dir, project):
    """Canonical location for a project's captured worker reports."""
    return os.path.join(project_dir(state_dir, project), REPORTS_DIR)


def session_path(state_dir, project):
    """A project's open-session marker."""
    return os.path.join(project_dir(state_dir, project), SESSION_FILE)


def timeline_path(state_dir, project):
    """A project's append-only event log."""
    return os.path.join(project_dir(state_dir, project), TIMELINE_FILE)


def _project_task_dirs(state_dir):
    """Every ``<state_dir>/<project>/tasks`` directory, sorted by name."""
    base = os.path.expanduser(state_dir)
    directories = []
    if not os.path.isdir(base):
        return directories
    for name in sorted(os.listdir(base)):
        candidate = os.path.join(base, name, TASKS_DIR)
        if os.path.isdir(candidate):
            directories.append(candidate)
    return directories


def _read_session_id(path):
    try:
        with open(path) as fh:
            return json.load(fh).get("id")
    except (OSError, ValueError):
        return None


def open_sessions(state_dir):
    """The open session ids across every project (and any legacy root marker)."""
    base = os.path.expanduser(state_dir)
    paths = [os.path.join(base, SESSION_FILE)]
    if os.path.isdir(base):
        for name in sorted(os.listdir(base)):
            paths.append(os.path.join(base, name, SESSION_FILE))
    sessions = set()
    for path in paths:
        session = _read_session_id(path)
        if session:
            sessions.add(session)
    return sessions


def new_session(state_dir, project):
    """Start a primary session for a project and return its id.

    Tasks created while a session is open are tagged with it so a later run can
    tell this session's work from history.
    """
    session = "sess_" + uuid.uuid4().hex[:8]
    _write_json(session_path(state_dir, project), {"id": session, "started_at": _now()})
    append_event(
        state_dir, project, session, "session.started", "primary session started"
    )
    return session


def current_session(state_dir, project):
    """The project's open session id, or ``None`` when no marker exists."""
    return _read_session_id(session_path(state_dir, project))


def end_session(state_dir, project):
    """Close the project's open session, returning the id that was open."""
    session = current_session(state_dir, project)
    if session:
        append_event(
            state_dir, project, session, "session.ended", "primary session ended"
        )
    try:
        os.remove(session_path(state_dir, project))
    except OSError:
        pass
    return session


def _projects_path(state_dir):
    return os.path.join(os.path.expanduser(state_dir), PROJECTS_FILE)


def list_projects(state_dir):
    """The durable project registry (name -> absolute root).

    Returns an empty mapping when no registry exists, so callers can list
    safely before anything has been registered.
    """
    try:
        with open(_projects_path(state_dir)) as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def register_project(state_dir, name, root, force=False):
    """Bind a project name to an absolute root, durably.

    Re-registering the same name -> root is a no-op. Rebinding a name to a
    different root is refused unless ``force`` is set.
    """
    if not name:
        raise ValueError("a project needs a name")
    root = os.path.abspath(os.path.expanduser(root))
    projects = list_projects(state_dir)
    existing = projects.get(name)
    if existing is not None and existing != root and not force:
        raise ValueError(f"project {name} is already registered at {existing}")
    projects[name] = root
    _write_json(_projects_path(state_dir), projects)
    return root


def _task_path(state_dir, project, task_id):
    return os.path.join(tasks_dir(state_dir, project), f"{task_id}.json")


def _legacy_task_path(state_dir, task_id):
    return os.path.join(os.path.expanduser(state_dir), TASKS_DIR, f"{task_id}.json")


def _existing_task_path(state_dir, project, task_id):
    """The on-disk path of a live task, project dir first then legacy root."""
    path = _task_path(state_dir, project, task_id)
    if os.path.exists(path):
        return path
    legacy = _legacy_task_path(state_dir, task_id)
    if os.path.exists(legacy):
        return legacy
    raise ValueError(f"no task {task_id}")


def _now():
    return int(time.time() * 1000)


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp"
    with open(tmp, "w") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)


def new_id():
    return "tsk_" + uuid.uuid4().hex[:8]


def create(
    state_dir,
    project,
    title,
    goal,
    acceptance,
    constraints=None,
    worker=None,
    max_iterations=3,
    session=None,
    kind="build",
):
    if kind not in KINDS:
        raise ValueError(f"invalid kind: {kind}")
    task = {
        "id": new_id(),
        "title": title,
        "goal": goal,
        "acceptance": list(acceptance),
        "constraints": list(constraints or []),
        "project": project,
        "root": None,
        "workspace": None,
        "worker": worker,
        "session": session or current_session(state_dir, project),
        "kind": kind,
        "status": "planned",
        "iteration": 0,
        "max_iterations": max_iterations,
        "report": None,
        "findings": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    save(state_dir, task)
    append_event(state_dir, project, task["id"], "task.created", f"{project}: {title}")
    return task


def _read_tasks(directory):
    tasks = []
    if not os.path.isdir(directory):
        return tasks
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(directory, name)) as fh:
            tasks.append(json.load(fh))
    return tasks


def _collect_tasks(state_dir, project=None):
    """Every live task for one project, or across every project (legacy included)."""
    base = os.path.expanduser(state_dir)
    if project is not None:
        directories = [tasks_dir(state_dir, project)]
    else:
        directories = list(_project_task_dirs(state_dir))
    legacy = os.path.join(base, TASKS_DIR)
    seen = {}
    for directory in directories + [legacy]:
        for task in _read_tasks(directory):
            task_id = task.get("id")
            if task_id in seen:
                continue
            if (
                project is not None
                and directory == legacy
                and task.get("project") != project
            ):
                continue
            seen[task_id] = task
    return list(seen.values())


def load(state_dir, task_id):
    """Find a task by id in any project directory (or the legacy root)."""
    for directory in _project_task_dirs(state_dir):
        path = os.path.join(directory, f"{task_id}.json")
        if os.path.exists(path):
            with open(path) as fh:
                return json.load(fh)
    legacy = _legacy_task_path(state_dir, task_id)
    if os.path.exists(legacy):
        with open(legacy) as fh:
            return json.load(fh)
    raise ValueError(f"no task {task_id}")


def save(state_dir, task):
    task["updated_at"] = _now()
    _write_json(_task_path(state_dir, task["project"], task["id"]), task)
    return task


def list_tasks(state_dir, project=None, status=None, session=None):
    """List live tasks, scoped to one project when ``project`` is given.

    With no project it lists every project's tasks, preserving the old
    cross-project view. ``session`` may be one id or a collection of ids.
    """
    tasks = _collect_tasks(state_dir, project)
    if status:
        tasks = [task for task in tasks if task.get("status") == status]
    if session is not None:
        if isinstance(session, (set, frozenset, list, tuple)):
            tasks = [task for task in tasks if task.get("session") in session]
        else:
            tasks = [task for task in tasks if task.get("session") == session]
    tasks.sort(key=lambda task: task.get("created_at", 0))
    return tasks


def prune(state_dir, project=None, session=None, statuses=None):
    """Archive closed tasks out of the live ledger.

    Tasks are moved to ``<state_dir>/<slug>/archive/`` rather than deleted, so
    history stays readable while ``task list`` and recovery stop seeing stale
    work. With no project it archives across every project.
    """
    statuses = set(statuses or CLOSED_STATUSES)
    moved = []
    for task in list_tasks(state_dir, project=project, session=session):
        if task.get("status") not in statuses:
            continue
        name = task.get("project")
        destination = archive_dir(state_dir, name)
        os.makedirs(destination, exist_ok=True)
        os.replace(
            _existing_task_path(state_dir, name, task["id"]),
            os.path.join(destination, f"{task['id']}.json"),
        )
        moved.append(task["id"])
    return moved


def find_by_worker(state_dir, worker):
    """The task to act on for a worker, searched across every project.

    An active task wins; a closed task from an earlier session must not shadow
    the live one. Among equals, the most recently created task wins.
    """
    matches = [task for task in list_tasks(state_dir) if task.get("worker") == worker]
    if not matches:
        return None
    matches.sort(key=lambda task: task.get("created_at", 0), reverse=True)
    for task in matches:
        if task.get("status") in ACTIVE_STATUSES:
            return task
    return matches[0]


def append_event(state_dir, project, task_id, kind, summary):
    base = project_dir(state_dir, project)
    os.makedirs(base, exist_ok=True)
    event = {"at": _now(), "task": task_id, "kind": kind, "summary": summary}
    with open(timeline_path(state_dir, project), "a") as fh:
        fh.write(json.dumps(event, sort_keys=True) + "\n")
    return event


def update(state_dir, task_id, **fields):
    task = load(state_dir, task_id)
    status = fields.get("status")
    if status is not None and status not in STATUSES:
        raise ValueError(f"invalid status: {status}")
    verdict = fields.get("verdict")
    if verdict is not None and verdict not in VERDICTS:
        raise ValueError(f"invalid verdict: {verdict}")
    task.update(fields)
    return save(state_dir, task)


def validate_finding(finding):
    """Return a normalised finding, or raise on an invalid one."""
    if not isinstance(finding, dict):
        raise ValueError("a finding must be a JSON object")
    if not finding.get("title"):
        raise ValueError("a finding needs a title")
    severity = finding.get("severity", "major")
    if severity not in SEVERITIES:
        raise ValueError(f"invalid severity: {severity}")
    category = finding.get("category", "bug")
    if category not in FINDING_CATEGORIES:
        raise ValueError(f"invalid category: {category}")
    status = finding.get("status", "open")
    if status not in FINDING_STATUSES:
        raise ValueError(f"invalid finding status: {status}")
    return {
        "severity": severity,
        "category": category,
        "title": finding["title"],
        "detail": finding.get("detail", ""),
        "file": finding.get("file"),
        "line": finding.get("line"),
        "suggestion": finding.get("suggestion", ""),
        "status": status,
    }


def record_findings(state_dir, task_id, findings):
    """Append validated findings to a task."""
    task = load(state_dir, task_id)
    task.setdefault("findings", [])
    task["findings"].extend(validate_finding(finding) for finding in findings)
    return save(state_dir, task)


def resolve_findings(state_dir, task_id, indexes=None, status="resolved"):
    """Close findings after they are fixed or accepted.

    ``indexes`` is 0-based; ``None`` closes every finding.
    """
    task = load(state_dir, task_id)
    findings = task.get("findings") or []
    chosen = range(len(findings)) if indexes is None else indexes
    for index in chosen:
        if 0 <= index < len(findings):
            findings[index]["status"] = status
    task["findings"] = findings
    return save(state_dir, task)


def count_findings(task, status=None, severities=None):
    count = 0
    for finding in task.get("findings") or []:
        if status and finding.get("status") != status:
            continue
        if severities and finding.get("severity") not in severities:
            continue
        count += 1
    return count


def verdict(task):
    """The effective verdict: an open blocker/major fails, otherwise the
    stored ``inconclusive`` override if set, else pass."""
    if count_findings(task, "open", BLOCKING_SEVERITIES):
        return "fail"
    if task.get("verdict") == "inconclusive":
        return "inconclusive"
    return "pass"


def _move(source, destination, report):
    """Move a legacy file into its project, unless the destination exists."""
    if os.path.exists(destination):
        report["left"].append(source)
        return False
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    os.replace(source, destination)
    report["moved"].append(destination)
    return True


def _project_of_task(state_dir, task_id):
    """The project recorded in a task already sitting in a project directory."""
    for directory in _project_task_dirs(state_dir):
        path = os.path.join(directory, f"{task_id}.json")
        if os.path.exists(path):
            try:
                with open(path) as fh:
                    return json.load(fh).get("project")
            except (OSError, ValueError):
                return None
    return None


def _session_task_projects(state_dir, session_id):
    """The distinct projects of the tasks tagged with ``session_id``."""
    projects = set()
    if not session_id:
        return projects
    for task in _collect_tasks(state_dir):
        if task.get("session") == session_id and task.get("project"):
            projects.add(task["project"])
    return projects


def _project_for_name(filename, migrated):
    """The project a brief/report file belongs to, from its task-id prefix."""
    for task_id, project in migrated.items():
        if filename.startswith(f"{task_id}-") or filename == f"{task_id}.md":
            return project
    return None


def _split_timeline(state_dir, path, migrated, session_id, session_project, report):
    """Move each root timeline event into the timeline of its task's project."""
    with open(path) as fh:
        lines = fh.read().splitlines()
    kept = []
    for line in lines:
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except ValueError:
            kept.append(line)
            report["left"].append(path)
            continue
        task_id = event.get("task")
        project = migrated.get(task_id)
        if project is None and session_project and task_id == session_id:
            project = session_project
        if project is None:
            project = _project_of_task(state_dir, task_id)
        if project is None:
            kept.append(line)
            report["left"].append(path)
            continue
        destination = timeline_path(state_dir, project)
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        with open(destination, "a") as fh:
            fh.write(json.dumps(event, sort_keys=True) + "\n")
        report["moved"].append(destination)
    if kept:
        with open(path, "w") as fh:
            fh.write("\n".join(kept) + "\n")
    else:
        os.remove(path)


def migrate(state_dir):
    """Move legacy root-level state into per-project directories.

    Idempotent and safe to call on every run: it returns immediately when
    ``state_dir`` holds no legacy root files, and a second call after a
    complete migration moves nothing. Returns ``{"moved": [...],
    "left": [...]}`` so the caller can report anything that could not be
    attributed to a project; unattributable files stay at the root untouched.
    """
    base = os.path.expanduser(state_dir)
    report = {"moved": [], "left": []}
    if not os.path.isdir(base):
        return report

    migrated = {}  # task id -> project name
    for folder, destination_dir in (
        (TASKS_DIR, tasks_dir),
        (ARCHIVE_DIR, archive_dir),
    ):
        legacy = os.path.join(base, folder)
        if not os.path.isdir(legacy):
            continue
        for filename in sorted(os.listdir(legacy)):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(legacy, filename)
            try:
                with open(path) as fh:
                    task = json.load(fh)
            except (OSError, ValueError):
                report["left"].append(path)
                continue
            project = task.get("project")
            if not project:
                report["left"].append(path)
                continue
            _move(path, os.path.join(destination_dir(base, project), filename), report)
            migrated[task.get("id") or filename[:-5]] = project

    session_id = None
    session_project = None
    legacy_session = os.path.join(base, SESSION_FILE)
    if os.path.isfile(legacy_session):
        session_id = _read_session_id(legacy_session)
        projects = _session_task_projects(base, session_id)
        if session_id and len(projects) == 1:
            session_project = projects.pop()
            _move(
                legacy_session,
                session_path(base, session_project),
                report,
            )
        else:
            report["left"].append(legacy_session)

    for folder in (BRIEFS_DIR, REPORTS_DIR):
        legacy = os.path.join(base, folder)
        if not os.path.isdir(legacy):
            continue
        for filename in sorted(os.listdir(legacy)):
            path = os.path.join(legacy, filename)
            if not os.path.isfile(path):
                continue
            project = _project_for_name(filename, migrated)
            if project is None:
                report["left"].append(path)
                continue
            destination = os.path.join(project_dir(base, project), folder, filename)
            _move(path, destination, report)

    legacy_timeline = os.path.join(base, TIMELINE_FILE)
    if os.path.isfile(legacy_timeline):
        _split_timeline(
            base, legacy_timeline, migrated, session_id, session_project, report
        )

    # Drop legacy folders once they are empty, so the root keeps only
    # projects.json and project directories.
    for folder in (TASKS_DIR, ARCHIVE_DIR, BRIEFS_DIR, REPORTS_DIR):
        try:
            os.rmdir(os.path.join(base, folder))
        except OSError:
            pass

    return report
