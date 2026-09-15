"""File-backed Team Mate task store.

Tasks are JSON files under ``<state_dir>/tasks/<id>.json`` and events append to
``<state_dir>/timeline.jsonl``. State is local to the primary repository and
survives the primary agent's session ending.

This is a plain file store used by the ``tm`` CLI. It is not a daemon and not a
database.
"""

from __future__ import annotations

import json
import os
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

ARCHIVE_DIR = "archive"
BRIEFS_DIR = "briefs"
REPORTS_DIR = "reports"

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


def _tasks_dir(state_dir):
    return os.path.join(os.path.expanduser(state_dir), "tasks")


def archive_dir(state_dir):
    """Where pruned (archived) tasks are moved."""
    return os.path.join(os.path.expanduser(state_dir), ARCHIVE_DIR)


def briefs_dir(state_dir):
    """Canonical location for worker briefs. The sandbox allows this path."""
    return os.path.join(os.path.expanduser(state_dir), BRIEFS_DIR)


def reports_dir(state_dir):
    """Canonical location for captured worker reports."""
    return os.path.join(os.path.expanduser(state_dir), REPORTS_DIR)


def _session_path(state_dir):
    return os.path.join(os.path.expanduser(state_dir), "session.json")


def new_session(state_dir):
    """Start a primary session and return its id.

    Tasks created while a session is open are tagged with it so a later run can
    tell this session's work from history.
    """
    session = "sess_" + uuid.uuid4().hex[:8]
    _write_json(_session_path(state_dir), {"id": session, "started_at": _now()})
    append_event(state_dir, session, "session.started", "primary session started")
    return session


def current_session(state_dir):
    """The open session id, or ``None`` when no session marker exists."""
    try:
        with open(_session_path(state_dir)) as fh:
            return json.load(fh).get("id")
    except (OSError, ValueError):
        return None


def end_session(state_dir):
    """Close the open session, returning the id that was open."""
    session = current_session(state_dir)
    if session:
        append_event(state_dir, session, "session.ended", "primary session ended")
    try:
        os.remove(_session_path(state_dir))
    except OSError:
        pass
    return session


def _task_path(state_dir, task_id):
    return os.path.join(_tasks_dir(state_dir), f"{task_id}.json")


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
):
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
        "session": session or current_session(state_dir),
        "status": "planned",
        "iteration": 0,
        "max_iterations": max_iterations,
        "report": None,
        "findings": [],
        "created_at": _now(),
        "updated_at": _now(),
    }
    save(state_dir, task)
    append_event(state_dir, task["id"], "task.created", f"{project}: {title}")
    return task


def load(state_dir, task_id):
    path = _task_path(state_dir, task_id)
    if not os.path.exists(path):
        raise ValueError(f"no task {task_id}")
    with open(path) as fh:
        return json.load(fh)


def save(state_dir, task):
    task["updated_at"] = _now()
    _write_json(_task_path(state_dir, task["id"]), task)
    return task


def list_tasks(state_dir, status=None, session=None):
    directory = _tasks_dir(state_dir)
    if not os.path.isdir(directory):
        return []
    tasks = []
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(directory, name)) as fh:
            task = json.load(fh)
        if status and task.get("status") != status:
            continue
        if session is not None and task.get("session") != session:
            continue
        tasks.append(task)
    tasks.sort(key=lambda task: task.get("created_at", 0))
    return tasks


def prune(state_dir, session=None, statuses=None):
    """Archive closed tasks out of the live ledger.

    Tasks are moved to ``<state_dir>/archive/`` rather than deleted, so history
    stays readable while ``task list`` and recovery stop seeing stale work.
    """
    statuses = set(statuses or CLOSED_STATUSES)
    destination = archive_dir(state_dir)
    moved = []
    for task in list_tasks(state_dir, session=session):
        if task.get("status") not in statuses:
            continue
        os.makedirs(destination, exist_ok=True)
        os.replace(
            _task_path(state_dir, task["id"]),
            os.path.join(destination, f"{task['id']}.json"),
        )
        moved.append(task["id"])
    return moved


def find_by_worker(state_dir, worker):
    for task in list_tasks(state_dir):
        if task.get("worker") == worker:
            return task
    return None


def append_event(state_dir, task_id, kind, summary):
    base = os.path.expanduser(state_dir)
    os.makedirs(base, exist_ok=True)
    event = {"at": _now(), "task": task_id, "kind": kind, "summary": summary}
    with open(os.path.join(base, "timeline.jsonl"), "a") as fh:
        fh.write(json.dumps(event, sort_keys=True) + "\n")
    return event


def update(state_dir, task_id, **fields):
    task = load(state_dir, task_id)
    status = fields.get("status")
    if status is not None and status not in STATUSES:
        raise ValueError(f"invalid status: {status}")
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
    """A pass has no open blocker or major finding; otherwise fail."""
    return "fail" if count_findings(task, "open", BLOCKING_SEVERITIES) else "pass"
