#!/usr/bin/env python3
"""Team Mate CLI: a thin, low-noise wrapper over Herdr.

Team Mate skills call this instead of raw ``herdr`` so the developer sees one
concise line per action instead of JSON. Every worker runs in its own tab.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time

import task_store

HERDR = os.environ.get("TM_HERDR", "herdr")
NAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


class HerdrError(RuntimeError):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def _error(stderr, args):
    text = stderr.strip()
    if not text:
        return HerdrError(f"herdr {' '.join(args)} failed")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return HerdrError(text)
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return HerdrError(error.get("message") or text, error.get("code"))
    return HerdrError(text)


def _run(args):
    proc = subprocess.run([HERDR, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise _error(proc.stderr, args)
    return proc.stdout


def herdr(*args):
    out = _run(args).strip()
    if not out:
        return {}
    try:
        return json.loads(out)
    except json.JSONDecodeError as exc:
        raise HerdrError(f"unexpected output from herdr: {out[:200]}") from exc


def herdr_text(*args):
    return _run(args)


def result(payload):
    return payload.get("result", payload) if isinstance(payload, dict) else {}


def get_agent(name):
    data = result(herdr("agent", "get", name)).get("agent")
    if not data:
        raise HerdrError(f"no agent named {name}")
    return data


def load_config(path):
    try:
        import tomllib
    except ModuleNotFoundError:
        return {}
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as fh:
        return tomllib.load(fh)


def next_name():
    used = {a.get("name") for a in result(herdr("agent", "list")).get("agents", [])}
    n = 1
    while f"w{n}" in used:
        n += 1
    return f"w{n}"


def find_workspace(label):
    workspaces = result(herdr("workspace", "list")).get("workspaces", [])
    for workspace in workspaces:
        if workspace.get("label") == label:
            return workspace["workspace_id"]
    return None


def cmd_spawn(args):
    config = load_config(args.config)
    kind = args.kind or config.get("worker_kind", "opencode")
    name = args.name or next_name()
    if not NAME_RE.match(name):
        raise HerdrError(f"invalid worker name: {name}")
    cwd = os.path.abspath(args.cwd)
    project = args.project or os.path.basename(cwd)

    workspace = find_workspace(project)
    if workspace:
        created = result(
            herdr(
                "tab",
                "create",
                "--workspace",
                workspace,
                "--cwd",
                cwd,
                "--label",
                args.label or name,
                "--no-focus",
            )
        )
    else:
        created = result(
            herdr(
                "workspace",
                "create",
                "--cwd",
                cwd,
                "--label",
                project,
                "--no-focus",
            )
        )
        workspace = created["workspace"]["workspace_id"]
    pane = created["root_pane"]["pane_id"]
    tab = created["tab"]["tab_id"]

    started = None
    for _ in range(3):
        try:
            started = result(
                herdr(
                    "agent",
                    "start",
                    name,
                    "--kind",
                    kind,
                    "--pane",
                    pane,
                    "--timeout",
                    "60000",
                )
            ).get("agent")
            break
        except HerdrError:
            time.sleep(1)
    if not started:
        try:
            herdr("tab", "close", tab)
        except HerdrError:
            pass
        raise HerdrError(f"could not start {name} in {cwd}")

    if args.task:
        task_store.update(
            args.state_dir,
            args.task,
            worker=name,
            status="working",
            root=cwd,
            workspace=workspace,
        )
        task_store.append_event(
            args.state_dir, args.task, "worker.spawned", f"{name} in {project}"
        )

    print(f"{name}\t{started.get('agent_status', '?')}\t{project}\t{workspace}\t{tab}")


def cmd_send(args):
    if args.brief == "-":
        text = sys.stdin.read()
    else:
        with open(args.brief) as fh:
            text = fh.read()
    call = ["agent", "prompt", args.name, text]
    if args.wait:
        call.append("--wait")
    if args.timeout:
        call += ["--timeout", str(args.timeout)]
    try:
        payload = result(herdr(*call))
    except HerdrError as exc:
        if args.wait and exc.code == "agent_prompt_stalled":
            print(
                "prompt delivered but the agent reported no working state; "
                "install its Herdr integration or poll with `tm status`",
                file=sys.stderr,
            )
            print(f"{args.name}\tunconfirmed")
            return
        raise
    state = payload.get("agent", {}).get("agent_status", "sent")
    print(f"{args.name}\t{state}")


def cmd_status(args):
    if args.name:
        rows = [get_agent(args.name)]
    else:
        rows = result(herdr("agent", "list")).get("agents", [])
    if not rows:
        print("no workers")
        return
    for a in rows:
        print(
            f"{a.get('name', '?')}\t{a.get('agent_status', '?')}\t"
            f"{a.get('workspace_id', '')}\t{a.get('cwd', '')}"
        )


def cmd_wait(args):
    call = ["agent", "wait", args.name]
    if args.timeout:
        call += ["--timeout", str(args.timeout)]
    payload = result(herdr(*call))
    state = payload.get("agent", {}).get("agent_status", "settled")
    print(f"{args.name}\t{state}")


def cmd_report(args):
    text = herdr_text(
        "agent",
        "read",
        args.name,
        "--source",
        args.source,
        "--lines",
        str(args.lines),
    )
    sys.stdout.write(text)


def cmd_stop(args):
    info = get_agent(args.name)
    herdr("agent", "send-keys", args.name, "ctrl+c")
    if not args.keep_tab and info.get("tab_id"):
        herdr("tab", "close", info["tab_id"])
    print(f"{args.name}\tstopped")


def cmd_diff(args):
    call = ["git", "-C", os.path.abspath(args.cwd), "diff"]
    if args.stat:
        call.append("--stat")
    proc = subprocess.run(call, capture_output=True, text=True)
    sys.stdout.write(proc.stdout)


def cmd_notify(args):
    call = ["notification", "show", args.title]
    if args.body:
        call += ["--body", args.body]
    if args.sound:
        call += ["--sound", args.sound]
    herdr(*call)
    print("notified")


def _render_task(task):
    lines = [
        f"Task: {task['id']}",
        f"Title: {task['title']}",
        f"Status: {task['status']}",
        f"Project: {task['project']} ({task.get('root') or '?'})",
        f"Worker: {task.get('worker') or '-'} ({task.get('workspace') or '-'})",
        f"Iteration: {task['iteration']} of {task['max_iterations']}",
        "Goal:",
        f"  {task['goal']}",
        "Acceptance:",
    ]
    lines += [f"  {i}. {c}" for i, c in enumerate(task["acceptance"], 1)]
    if task.get("constraints"):
        lines.append("Constraints:")
        lines += [f"  - {c}" for c in task["constraints"]]
    lines.append(f"Findings: {len(task.get('findings') or [])}")
    if task.get("report"):
        lines += ["Report:", task["report"]]
    return "\n".join(lines)


def cmd_task_new(args):
    task = task_store.create(
        args.state_dir,
        args.project,
        args.title,
        args.goal,
        args.acceptance,
        args.constraint,
        args.worker,
        args.max_iterations,
    )
    print(task["id"])


def cmd_task_list(args):
    tasks = task_store.list_tasks(args.state_dir, args.status)
    if not tasks:
        print("no tasks")
        return
    for task in tasks:
        print(
            f"{task['id']}\t{task['status']}\t{task['project']}\t"
            f"i{task['iteration']}/{task['max_iterations']}\t"
            f"{task.get('worker') or '-'}\t{task['title']}"
        )


def cmd_task_show(args):
    print(_render_task(task_store.load(args.state_dir, args.id)))


def cmd_task_find(args):
    task = task_store.find_by_worker(args.state_dir, args.worker)
    if not task:
        raise HerdrError(f"no task for worker {args.worker}")
    print(f"{task['id']}\t{task['status']}\t{task['title']}")


def cmd_task_update(args):
    fields = {}
    if args.status:
        fields["status"] = args.status
    if args.iteration is not None:
        fields["iteration"] = args.iteration
    if args.report_file:
        with open(args.report_file) as fh:
            fields["report"] = fh.read()
    if args.note:
        fields["note"] = args.note
    task = task_store.update(args.state_dir, args.id, **fields)
    task_store.append_event(
        args.state_dir, task["id"], "task.updated", f"status={task['status']}"
    )
    print(f"{task['id']}\t{task['status']}")


def build_parser():
    parser = argparse.ArgumentParser(
        prog="tm", description="Team Mate: low-noise Herdr wrapper"
    )
    parser.add_argument(
        "--config",
        default="team-mate.toml",
        help="config file (default: team-mate.toml)",
    )
    parser.add_argument(
        "--state-dir",
        default=None,
        help="task ledger directory (default: state_dir from config, else .teammate)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("spawn", help="start a worker in its project workspace")
    p.add_argument("--cwd", required=True, help="project root")
    p.add_argument("--project", help="project/workspace name (default: cwd basename)")
    p.add_argument("--kind", help="agent kind (default from config)")
    p.add_argument("--name", help="worker name")
    p.add_argument("--label", help="tab label (default: worker name)")
    p.add_argument("--task", help="link the worker to a task id")
    p.set_defaults(func=cmd_spawn)

    p = sub.add_parser("send", help="prompt a worker with a brief")
    p.add_argument("name")
    p.add_argument("--brief", default="-", help="brief file, or - for stdin")
    p.add_argument("--wait", action="store_true")
    p.add_argument("--timeout", type=int, help="milliseconds")
    p.set_defaults(func=cmd_send)

    p = sub.add_parser("status", help="show worker state")
    p.add_argument("name", nargs="?")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("wait", help="wait for a worker to settle")
    p.add_argument("name")
    p.add_argument("--timeout", type=int, help="milliseconds")
    p.set_defaults(func=cmd_wait)

    p = sub.add_parser("report", help="print a worker's latest output")
    p.add_argument("name")
    p.add_argument("--lines", type=int, default=300)
    p.add_argument(
        "--source",
        choices=["visible", "recent", "recent-unwrapped", "detection"],
        default="recent-unwrapped",
    )
    p.set_defaults(func=cmd_report)

    p = sub.add_parser("stop", help="interrupt a worker and close its tab")
    p.add_argument("name")
    p.add_argument("--keep-tab", action="store_true")
    p.set_defaults(func=cmd_stop)

    p = sub.add_parser("diff", help="show working-copy changes for a project")
    p.add_argument("--cwd", default=".")
    p.add_argument("--stat", action="store_true")
    p.set_defaults(func=cmd_diff)

    p = sub.add_parser("notify", help="raise a desktop notification")
    p.add_argument("title")
    p.add_argument("--body")
    p.add_argument("--sound", choices=["none", "done", "request"])
    p.set_defaults(func=cmd_notify)

    p = sub.add_parser("task", help="manage the persistent task ledger")
    actions = p.add_subparsers(dest="action", required=True)

    a = actions.add_parser("new", help="record a task before delegating")
    a.add_argument("--project", required=True)
    a.add_argument("--title", required=True)
    a.add_argument("--goal", required=True)
    a.add_argument("--acceptance", action="append", required=True)
    a.add_argument("--constraint", action="append")
    a.add_argument("--worker")
    a.add_argument("--max-iterations", type=int, default=3)
    a.set_defaults(func=cmd_task_new)

    a = actions.add_parser("list", help="list tasks")
    a.add_argument("--status", choices=list(task_store.STATUSES))
    a.set_defaults(func=cmd_task_list)

    a = actions.add_parser("show", help="show one task")
    a.add_argument("id")
    a.set_defaults(func=cmd_task_show)

    a = actions.add_parser("find", help="find the task for a worker")
    a.add_argument("--worker", required=True)
    a.set_defaults(func=cmd_task_find)

    a = actions.add_parser("update", help="record task progress")
    a.add_argument("id")
    a.add_argument("--status", choices=list(task_store.STATUSES))
    a.add_argument("--iteration", type=int)
    a.add_argument("--report-file")
    a.add_argument("--note")
    a.set_defaults(func=cmd_task_update)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    config = load_config(args.config)
    args.state_dir = os.path.expanduser(
        args.state_dir or config.get("state_dir", "~/.teammate")
    )
    try:
        args.func(args)
    except (HerdrError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
