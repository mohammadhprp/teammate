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

HERDR = os.environ.get("TM_HERDR", "herdr")
NAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")


class HerdrError(RuntimeError):
    pass


def _run(args):
    proc = subprocess.run([HERDR, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise HerdrError(proc.stderr.strip() or f"herdr {' '.join(args)} failed")
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
        raise HerdrError(f"could not start {name} in {cwd}")

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
    state = result(herdr(*call)).get("agent", {}).get("agent_status", "sent")
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


def build_parser():
    parser = argparse.ArgumentParser(
        prog="tm", description="Team Mate: low-noise Herdr wrapper"
    )
    parser.add_argument(
        "--config",
        default="team-mate.toml",
        help="config file (default: team-mate.toml)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("spawn", help="start a worker in its project workspace")
    p.add_argument("--cwd", required=True, help="project root")
    p.add_argument("--project", help="project/workspace name (default: cwd basename)")
    p.add_argument("--kind", help="agent kind (default from config)")
    p.add_argument("--name", help="worker name")
    p.add_argument("--label", help="tab label (default: worker name)")
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

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except HerdrError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
