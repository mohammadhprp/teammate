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


def _tasks_dir(state_dir):
    return os.path.join(os.path.expanduser(state_dir), "tasks")


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


def list_tasks(state_dir, status=None):
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
        tasks.append(task)
    tasks.sort(key=lambda task: task.get("created_at", 0))
    return tasks


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
