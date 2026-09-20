"""Worker runtimes behind the ``tm`` CLI.

The CLI talks to a runtime instead of one specific tool. **Herdr** is the
default backend and keeps the live tab/agent behavior; a headless **Claude**
backend runs workers as detached ``claude -p`` processes without Herdr. The CLI
argument surface and its one-line output do not depend on which backend ran.

Selection order is ``--runtime``, then ``TM_RUNTIME``, then the ``runtime`` key
in ``team-mate.toml``, then autodetect. ``TM_HERDR`` and ``TM_CLAUDE`` override
the binary paths.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import time
import uuid

import task_store

RUNTIME_HERDR = "herdr"
RUNTIME_CLAUDE = "claude"
RUNTIMES = (RUNTIME_HERDR, RUNTIME_CLAUDE)

HERDR_BINARY = os.environ.get("TM_HERDR", "herdr")
CLAUDE_BINARY = os.environ.get("TM_CLAUDE", "claude")

REPORT_FILE = ".teammate-report.md"

# A stored PID that has finished but whose exit status cannot be read: it was
# reparented, reused, or is otherwise unverifiable. Never reported as success.
EXIT_UNKNOWN = object()

# A headless worker has no tab to wait in, so ``spawn`` opens the conversation
# with a short bootstrap turn; ``send`` then resumes that session with the brief.
BOOTSTRAP_PROMPT = (
    "You are a Team Mate worker. Your brief follows in a later message. "
    "Reply 'ready' and take no other action."
)

# Unattended approval for a headless worker. ``--bare`` is never used: it skips
# skills, plugins, and the configured credentials.
CLAUDE_FLAGS = ("--output-format", "json", "--permission-prompts", "none")


class HerdrError(RuntimeError):
    """A runtime operation failed; ``code`` carries a Herdr error code if any."""

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


class PromptStalled(HerdrError):
    """A Herdr prompt was delivered but no working state was reported."""


class Runtime:
    """The interface the ``tm`` CLI expects of a worker backend.

    ``HerdrRuntime`` and ``ClaudeRuntime`` implement all of these; the CLI
    routes spawn/send/status/wait/report/stop/notify through them so its
    argument surface and one-line output do not depend on the backend.
    """

    name = "runtime"

    def next_name(self):
        """A free worker name for this backend."""
        raise NotImplementedError

    def spawn(self, name, kind, cwd, project, label=None):
        """Start a worker and return ``{status, workspace, tab}``."""
        raise NotImplementedError

    def send(self, name, text, wait=False, timeout=None):
        """Deliver a brief to a worker and return its state."""
        raise NotImplementedError

    def status(self, name=None):
        """Worker rows as ``{name, status, workspace, cwd}``; all when no name."""
        raise NotImplementedError

    def wait(self, name, timeout=None):
        """Wait for a worker to settle and return its state."""
        raise NotImplementedError

    def report(self, name, source="recent-unwrapped", lines=300):
        """A worker's latest output as text."""
        raise NotImplementedError

    def report_file(self, name):
        """The clean ``.teammate-report.md`` a worker left, or ``None``."""
        raise NotImplementedError

    def stop(self, name, keep_tab=False):
        """Interrupt a worker (and, unless ``keep_tab``, close its tab)."""
        raise NotImplementedError

    def notify(self, title, body=None, sound=None):
        """Raise a developer notification."""
        raise NotImplementedError


# --------------------------------------------------------------------------
# Runtime selection
# --------------------------------------------------------------------------


def _on_path(binary, env):
    return shutil.which(binary, path=env.get("PATH")) is not None


def autodetect(env=None):
    """Pick a runtime from the environment, or raise a clear error."""
    env = os.environ if env is None else env
    if env.get("HERDR_ENV") == "1" and _on_path(env.get("TM_HERDR", HERDR_BINARY), env):
        return RUNTIME_HERDR
    if _on_path(env.get("TM_CLAUDE", CLAUDE_BINARY), env):
        return RUNTIME_CLAUDE
    raise ValueError(
        f"no worker runtime available: start under Herdr (HERDR_ENV=1 with "
        f"{env.get('TM_HERDR', HERDR_BINARY)} on PATH) or install "
        f"{env.get('TM_CLAUDE', CLAUDE_BINARY)} on PATH"
    )


def resolve_runtime(config=None, flag=None, env=None):
    """The runtime to use, from the flag, environment, config, or autodetect."""
    env = os.environ if env is None else env
    chosen = flag or env.get("TM_RUNTIME") or (config or {}).get("runtime") or None
    if chosen is None:
        return autodetect(env)
    if chosen not in RUNTIMES:
        raise ValueError(f"unknown runtime: {chosen}")
    return chosen


# --------------------------------------------------------------------------
# Herdr backend
# --------------------------------------------------------------------------


def _herdr_error(stderr, args):
    text = (stderr or "").strip()
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
    proc = subprocess.run([HERDR_BINARY, *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise _herdr_error(proc.stderr, args)
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


def _report_file(cwd):
    if not cwd:
        return None
    path = os.path.join(cwd, REPORT_FILE)
    return path if os.path.isfile(path) else None


class HerdrRuntime(Runtime):
    """The live Herdr backend: one tab per worker, operated through the CLI."""

    name = RUNTIME_HERDR

    def next_name(self):
        return next_name()

    def spawn(self, name, kind, cwd, project, label=None):
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
                    label or name,
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
        return {
            "status": started.get("agent_status", "?"),
            "workspace": workspace,
            "tab": tab,
        }

    def send(self, name, text, wait=False, timeout=None):
        call = ["agent", "prompt", name, text]
        if wait:
            call.append("--wait")
        if timeout:
            call += ["--timeout", str(timeout)]
        try:
            payload = result(herdr(*call))
        except HerdrError as exc:
            if wait and exc.code == "agent_prompt_stalled":
                raise PromptStalled(str(exc)) from exc
            raise
        return payload.get("agent", {}).get("agent_status", "sent")

    def status(self, name=None):
        if name:
            rows = [get_agent(name)]
        else:
            rows = result(herdr("agent", "list")).get("agents", [])
        return [
            {
                "name": agent.get("name", "?"),
                "status": agent.get("agent_status", "?"),
                "workspace": agent.get("workspace_id", ""),
                "cwd": agent.get("cwd", ""),
            }
            for agent in rows
        ]

    def wait(self, name, timeout=None):
        call = ["agent", "wait", name]
        if timeout:
            call += ["--timeout", str(timeout)]
        payload = result(herdr(*call))
        return payload.get("agent", {}).get("agent_status", "settled")

    def report(self, name, source="recent-unwrapped", lines=300):
        return herdr_text(
            "agent", "read", name, "--source", source, "--lines", str(lines)
        )

    def report_file(self, name):
        try:
            cwd = get_agent(name).get("cwd")
        except (HerdrError, OSError):
            return None
        return _report_file(cwd)

    def stop(self, name, keep_tab=False):
        info = get_agent(name)
        herdr("agent", "send-keys", name, "ctrl+c")
        if not keep_tab and info.get("tab_id"):
            herdr("tab", "close", info["tab_id"])

    def notify(self, title, body=None, sound=None):
        call = ["notification", "show", title]
        if body:
            call += ["--body", body]
        if sound:
            call += ["--sound", sound]
        herdr(*call)


# --------------------------------------------------------------------------
# Claude backend
# --------------------------------------------------------------------------


def _read_json(path):
    if not path or not os.path.isfile(path):
        return {}
    try:
        with open(path) as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _process_start(pid):
    """A stable identity for a live process, or ``None`` when unreadable.

    The identity is the process's start time: a reused PID has a different one,
    so a stale record can never be mistaken for the process it named. Linux
    exposes it in ``/proc/<pid>/stat``; macOS has no ``/proc``, so it falls back
    to ``ps -o lstart=``. Both are standard OS facilities, not dependencies.
    """
    if not pid:
        return None
    try:
        with open(f"/proc/{pid}/stat") as fh:
            # Field 22 of proc(5) is the start time; the comm field (2) may
            # contain spaces and parentheses, so split after its closing paren.
            fields = fh.read().rsplit(")", 1)[-1].split()
        return "proc:" + fields[19]
    except (OSError, IndexError):
        pass
    try:
        proc = subprocess.run(
            ["ps", "-o", "lstart=", "-p", str(pid)],
            capture_output=True,
            text=True,
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    text = proc.stdout.strip()
    return "ps:" + text if text else None


def _verified(pid, identity):
    """True only when ``pid`` is alive and its identity still matches.

    A missing or unreadable identity is never trusted, so a caller never probes
    or signals a PID whose ownership it cannot prove.
    """
    if not pid or not identity:
        return False
    return _process_start(pid) == identity


def _exit_code(pid, identity=None):
    """The state of a stored PID without acting on an unverified process.

    Returns:

    * ``None`` while the process is verified running (or is our own live child);
    * an ``int`` once our own child exits (negative for a signal, exactly as
      ``os.waitpid`` reports it);
    * :data:`EXIT_UNKNOWN` when it has finished but its exit status cannot be
      read — a reparented, reused, or otherwise unverifiable PID.

    An unverifiable identity is reported finished, never running, so a
    no-timeout wait settles instead of blocking on a PID this process no longer
    owns, and no signal is ever sent to it.
    """
    if not pid:
        return EXIT_UNKNOWN
    try:
        done, status = os.waitpid(pid, os.WNOHANG)
    except ChildProcessError:
        pass
    else:
        if done != pid:
            return None
        if os.WIFEXITED(status):
            return os.WEXITSTATUS(status)
        if os.WIFSIGNALED(status):
            return -os.WTERMSIG(status)
        return 0
    # Not our child: it may be reparented, gone, or a reused PID. Only a
    # process whose recorded identity still matches may be probed.
    if not _verified(pid, identity):
        return EXIT_UNKNOWN
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return EXIT_UNKNOWN
    except PermissionError:
        return None
    return None


def _signal(pid, sig, identity=None):
    """Signal ``pid`` only when its recorded identity still matches.

    Returns ``True`` when the signal was delivered, ``False`` when the process
    was unverified (reused or gone) and therefore left untouched.
    """
    if not _verified(pid, identity):
        return False
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        return False
    return True


class ClaudeRuntime(Runtime):
    """A headless Claude Code backend: a worker is a detached conversation.

    Worker metadata lives in the project's ``workers.json``; each turn is a
    detached ``claude -p`` process whose JSON output is captured under the
    project's ``workers/`` directory. Status comes from the store plus process
    liveness, and a stop signals the process with SIGINT then SIGTERM.
    """

    name = RUNTIME_CLAUDE

    def __init__(self, state_dir, binary=None):
        self.state_dir = state_dir
        self.binary = binary or os.environ.get("TM_CLAUDE", CLAUDE_BINARY)

    # -- worker lookup -----------------------------------------------------

    def _require(self, name):
        worker = task_store.find_worker(self.state_dir, name)
        if not worker:
            raise HerdrError(f"no worker named {name}")
        return worker

    # -- process lifecycle -------------------------------------------------

    def _launch(self, worker, prompt, resume=None):
        output_dir = task_store.worker_output_dir(self.state_dir, worker["project"])
        os.makedirs(output_dir, exist_ok=True)
        output = os.path.join(
            output_dir,
            f"{worker['name']}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}.json",
        )
        cmd = [self.binary, "-p", prompt, *CLAUDE_FLAGS]
        if resume:
            cmd += ["--resume", resume]
        with open(output, "wb") as handle:
            proc = subprocess.Popen(
                cmd,
                cwd=worker["cwd"],
                stdin=subprocess.DEVNULL,
                stdout=handle,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        return task_store.save_worker(
            self.state_dir,
            worker["project"],
            worker["name"],
            status="working",
            pid=proc.pid,
            proc_start=_process_start(proc.pid),
            output=output,
        )

    def _harvest(self, worker, code):
        payload = _read_json(worker.get("output"))
        if code is EXIT_UNKNOWN:
            status = "unknown"
        elif code == 0:
            status = "idle"
        else:
            status = "failed"
        fields = {
            "pid": None,
            "proc_start": None,
            "turns": (worker.get("turns") or 0) + 1,
            "status": status,
        }
        if payload.get("session_id"):
            fields["session_id"] = payload["session_id"]
        cost = payload.get("total_cost_usd")
        if cost is not None:
            fields["cost"] = round((worker.get("cost") or 0.0) + float(cost), 6)
        return task_store.save_worker(
            self.state_dir, worker["project"], worker["name"], **fields
        )

    def _drain(self, worker, timeout=None):
        """Wait for the current turn, harvesting it once it exits.

        A zero timeout only polls, so ``status`` never blocks on a live worker.
        With no timeout it waits for a *verified* running process; a reparented
        or unverifiable PID settles immediately as finished, so a wait can never
        block on a PID this process no longer owns.
        """
        pid = worker.get("pid")
        if not pid:
            return worker
        identity = worker.get("proc_start")
        deadline = (
            None if timeout is None else time.monotonic() + max(0, timeout) / 1000
        )
        code = _exit_code(pid, identity)
        while code is None:
            if deadline is not None and time.monotonic() >= deadline:
                return worker
            time.sleep(0.05)
            code = _exit_code(pid, identity)
        return self._harvest(worker, code)

    # -- runtime interface -------------------------------------------------

    def next_name(self):
        used = {w.get("name") for w in task_store.list_workers(self.state_dir)}
        n = 1
        while f"w{n}" in used:
            n += 1
        return f"w{n}"

    def spawn(self, name, kind, cwd, project, label=None):
        cwd = os.path.abspath(cwd)
        existing = task_store.find_worker(self.state_dir, name)
        if existing and existing.get("pid"):
            _signal(existing["pid"], signal.SIGINT, existing.get("proc_start"))
        task_store.save_worker(
            self.state_dir,
            project,
            name,
            runtime=self.name,
            cwd=cwd,
            kind=kind,
            status="idle",
            pid=None,
            proc_start=None,
            session_id=None,
            output=None,
            turns=0,
            cost=0.0,
        )
        worker = self._launch(
            {"name": name, "project": project, "cwd": cwd}, BOOTSTRAP_PROMPT
        )
        return {
            "status": worker.get("status", "working"),
            "workspace": project,
            "tab": "-",
        }

    def send(self, name, text, wait=False, timeout=None):
        worker = self._drain(self._require(name))
        worker = self._launch(worker, text, resume=worker.get("session_id"))
        if wait:
            worker = self._drain(worker, timeout=timeout)
        return worker.get("status", "working")

    def status(self, name=None):
        workers = (
            [self._require(name)] if name else task_store.list_workers(self.state_dir)
        )
        rows = []
        for worker in workers:
            worker = self._drain(worker, timeout=0)
            rows.append(
                {
                    "name": worker.get("name", "?"),
                    "status": worker.get("status", "?"),
                    "workspace": "",
                    "cwd": worker.get("cwd", ""),
                }
            )
        return rows

    def wait(self, name, timeout=None):
        worker = self._drain(self._require(name), timeout=timeout)
        return worker.get("status", "idle")

    def report(self, name, source="recent-unwrapped", lines=300):
        worker = self._require(name)
        return _read_json(worker.get("output")).get("result") or ""

    def report_file(self, name):
        worker = task_store.find_worker(self.state_dir, name)
        if not worker:
            return None
        return _report_file(worker.get("cwd"))

    def stop(self, name, keep_tab=False):
        worker = self._require(name)
        pid = worker.get("pid")
        identity = worker.get("proc_start")
        if pid:
            _signal(pid, signal.SIGINT, identity)
            deadline = time.monotonic() + 5
            while _exit_code(pid, identity) is None and time.monotonic() < deadline:
                time.sleep(0.05)
            if _exit_code(pid, identity) is None:
                _signal(pid, signal.SIGTERM, identity)
        task_store.save_worker(
            self.state_dir,
            worker["project"],
            name,
            status="stopped",
            pid=None,
            proc_start=None,
        )

    def notify(self, title, body=None, sound=None):
        """A headless runtime has no desktop channel; the CLI line still prints."""
        return None
