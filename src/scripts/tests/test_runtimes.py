"""Tests for runtime selection and the headless Claude backend.

The Claude backend is exercised against a fake ``claude`` script selected
through ``TM_CLAUDE``; the real CLI is never invoked.
"""

import json
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import types
import unittest
import warnings

import runtimes
import task_store
import tm


def setUpModule():
    # A headless worker is deliberately detached and is not waited on by the
    # parent that launched it, so the interpreter warns when the Popen handle is
    # collected. Applied here because the test runner resets warning filters.
    warnings.filterwarnings("ignore", category=ResourceWarning)


# A stand-in for ``claude -p``: it logs its argv, writes a JSON result to stdout,
# optionally leaves a report file, and can be made long-running so a stop can be
# observed.
FAKE_CLAUDE = """#!/usr/bin/env python3
import json
import os
import signal
import sys
import time

args = sys.argv[1:]
log = os.environ.get("FAKE_CLAUDE_LOG")
if log:
    with open(log, "a") as fh:
        fh.write(json.dumps(args) + "\\n")


def value(flag):
    if flag in args:
        return args[args.index(flag) + 1]
    return None


def stop(signum, frame):
    sys.exit(128 + signum)


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)

delay = float(os.environ.get("FAKE_CLAUDE_DELAY", "0"))
if delay:
    time.sleep(delay)

report = os.environ.get("FAKE_CLAUDE_REPORT")
if report:
    path = os.path.join(os.getcwd(), ".teammate-report.md")
    if not os.path.exists(path):
        with open(path, "w") as fh:
            fh.write(report)

session = value("--resume") or os.environ.get("FAKE_CLAUDE_SESSION", "sess-fake")
print(json.dumps({
    "result": "result for: " + (value("-p") or ""),
    "session_id": session,
    "total_cost_usd": 0.01,
}))
sys.exit(int(os.environ.get("FAKE_CLAUDE_EXIT", "0")))
"""


class RuntimeSelectionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def path_with(self, *binaries):
        directory = os.path.join(self.tmp.name, "bin-" + "-".join(binaries))
        os.makedirs(directory, exist_ok=True)
        for binary in binaries:
            path = os.path.join(directory, binary)
            with open(path, "w") as fh:
                fh.write("#!/bin/sh\n")
            os.chmod(path, 0o755)
        return directory

    def test_the_flag_wins_over_env_and_config(self):
        env = {"TM_RUNTIME": "claude"}

        chosen = runtimes.resolve_runtime({"runtime": "claude"}, flag="herdr", env=env)

        self.assertEqual(chosen, "herdr")

    def test_env_wins_over_config(self):
        chosen = runtimes.resolve_runtime(
            {"runtime": "herdr"}, env={"TM_RUNTIME": "claude"}
        )

        self.assertEqual(chosen, "claude")

    def test_config_is_used_without_a_flag_or_env(self):
        chosen = runtimes.resolve_runtime({"runtime": "claude"}, env={})

        self.assertEqual(chosen, "claude")

    def test_an_unknown_runtime_is_rejected(self):
        with self.assertRaises(ValueError):
            runtimes.resolve_runtime({}, flag="bogus", env={})

    def test_autodetect_prefers_herdr_under_a_herdr_environment(self):
        env = {"HERDR_ENV": "1", "PATH": self.path_with("herdr", "claude")}

        self.assertEqual(runtimes.autodetect(env), "herdr")

    def test_autodetect_falls_back_to_claude(self):
        env = {"PATH": self.path_with("claude")}

        self.assertEqual(runtimes.autodetect(env), "claude")

    def test_autodetect_ignores_herdr_without_the_environment(self):
        env = {"PATH": self.path_with("herdr")}

        with self.assertRaises(ValueError):
            runtimes.autodetect(env)

    def test_autodetect_names_both_when_nothing_is_available(self):
        empty = self.path_with()
        with self.assertRaises(ValueError) as ctx:
            runtimes.autodetect({"PATH": empty})

        message = str(ctx.exception)
        self.assertIn("herdr", message)
        self.assertIn("claude", message)


class ClaudeRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = os.path.join(self.tmp.name, "state")
        self.project = os.path.join(self.tmp.name, "project")
        os.makedirs(self.project)
        self.script = os.path.join(self.tmp.name, "claude")
        with open(self.script, "w") as fh:
            fh.write(FAKE_CLAUDE)
        os.chmod(self.script, 0o755)
        self.log = os.path.join(self.tmp.name, "calls.jsonl")

        original = os.environ.get("TM_CLAUDE")
        os.environ["TM_CLAUDE"] = self.script
        os.environ["FAKE_CLAUDE_LOG"] = self.log
        self.addCleanup(self._restore_env, original)
        self.runtime = runtimes.ClaudeRuntime(self.state)

    def _restore_env(self, original):
        if original is None:
            os.environ.pop("TM_CLAUDE", None)
        else:
            os.environ["TM_CLAUDE"] = original
        os.environ.pop("FAKE_CLAUDE_LOG", None)
        os.environ.pop("FAKE_CLAUDE_DELAY", None)
        os.environ.pop("FAKE_CLAUDE_EXIT", None)

    def tearDown(self):
        for worker in task_store.list_workers(self.state):
            if worker.get("pid"):
                self.runtime.stop(worker["name"])

    def calls(self):
        if not os.path.exists(self.log):
            return []
        with open(self.log) as fh:
            return [json.loads(line) for line in fh if line.strip()]

    def spawn(self, name="developer-alpha"):
        return self.runtime.spawn(name, "claude", self.project, "acme")

    def detached_sleep(self, seconds=10):
        """Start a sleeper that is not our child, and return its PID.

        The shell backgrounds the sleeper and exits, so it is reparented to
        init/launchd and ``os.waitpid`` on it raises ``ChildProcessError`` —
        exactly the situation a PID reused by another process presents. It
        installs a SIGINT handler and signals readiness, because a shell
        background job otherwise inherits SIGINT ignored.
        """
        ready = os.path.join(self.tmp.name, "sleeper-ready")
        code = (
            "import os, signal, time; "
            "signal.signal(signal.SIGINT, lambda *a: os._exit(0)); "
            f"open({ready!r}, 'w').close(); "
            f"time.sleep({seconds})"
        )
        proc = subprocess.run(
            f"{shlex.quote(sys.executable)} -c {shlex.quote(code)} "
            ">/dev/null 2>&1 & echo $!",
            shell=True,
            capture_output=True,
            text=True,
        )
        pid = int(proc.stdout.strip())
        deadline = time.monotonic() + 2
        while not os.path.exists(ready) and time.monotonic() < deadline:
            time.sleep(0.01)
        self.addCleanup(self.force_kill, pid)
        return pid

    def force_kill(self, pid):
        try:
            os.kill(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass

    def record_worker(self, pid, proc_start, name="developer-alpha"):
        return task_store.save_worker(
            self.state,
            "acme",
            name,
            runtime="claude",
            cwd=self.project,
            status="working",
            pid=pid,
            proc_start=proc_start,
            output=None,
            turns=0,
            cost=0.0,
        )

    def test_spawn_records_a_worker_and_starts_a_detached_turn(self):
        self.spawn()
        self.runtime.wait("developer-alpha")

        worker = task_store.find_worker(self.state, "developer-alpha")
        self.assertEqual(worker["runtime"], "claude")
        self.assertEqual(worker["cwd"], self.project)
        self.assertEqual(worker["status"], "idle")
        starts = self.calls()
        self.assertEqual(len(starts), 1)
        self.assertEqual(starts[0][0], "-p")
        self.assertIn("--output-format", starts[0])

    def test_send_resumes_the_session_and_records_cost(self):
        self.spawn()

        state = self.runtime.send("developer-alpha", "do the work", wait=True)

        self.assertEqual(state, "idle")
        turns = self.calls()
        self.assertEqual(len(turns), 2)
        self.assertIn("--resume", turns[1])
        self.assertEqual(turns[1][turns[1].index("--resume") + 1], "sess-fake")
        worker = task_store.find_worker(self.state, "developer-alpha")
        self.assertEqual(worker["session_id"], "sess-fake")
        self.assertEqual(worker["turns"], 2)
        self.assertEqual(worker["cost"], 0.02)

    def test_status_reports_the_worker_from_the_store(self):
        self.spawn()
        self.runtime.wait("developer-alpha")

        rows = self.runtime.status()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "developer-alpha")
        self.assertEqual(rows[0]["status"], "idle")
        self.assertEqual(rows[0]["cwd"], self.project)

    def test_report_falls_back_to_the_captured_result(self):
        self.spawn()
        self.runtime.send("developer-alpha", "do the work", wait=True)

        report = self.runtime.report("developer-alpha")

        self.assertIn("do the work", report)

    def test_report_file_prefers_the_workers_clean_report(self):
        self.spawn()
        path = os.path.join(self.project, runtimes.REPORT_FILE)
        with open(path, "w") as fh:
            fh.write("clean markdown\n")

        self.assertEqual(self.runtime.report_file("developer-alpha"), path)

    def test_a_nonzero_turn_marks_the_worker_failed(self):
        os.environ["FAKE_CLAUDE_EXIT"] = "1"
        self.spawn()

        self.runtime.wait("developer-alpha")

        worker = task_store.find_worker(self.state, "developer-alpha")
        self.assertEqual(worker["status"], "failed")

    def test_report_file_is_none_without_a_report(self):
        self.spawn()

        self.assertIsNone(self.runtime.report_file("developer-alpha"))
        self.assertIsNone(self.runtime.report_file("nobody"))

    def test_spawn_reports_the_recorded_status(self):
        spawned = self.spawn()

        worker = task_store.find_worker(self.state, "developer-alpha")

        self.assertEqual(spawned["status"], "working")
        self.assertEqual(spawned["status"], worker["status"])

    def test_captured_output_filenames_are_unique_within_a_millisecond(self):
        worker = {"name": "w1", "project": "acme", "cwd": self.project}
        original = runtimes.time.time
        runtimes.time.time = lambda: 1_700_000_000.123
        try:
            first = self.runtime._launch(worker, "first turn")
            second = self.runtime._launch(worker, "second turn")
        finally:
            runtimes.time.time = original

        self.assertNotEqual(first["output"], second["output"])

    def test_a_signal_killed_turn_harvests_as_failed(self):
        os.environ["FAKE_CLAUDE_DELAY"] = "30"
        self.spawn()
        pid = task_store.find_worker(self.state, "developer-alpha")["pid"]

        os.kill(pid, signal.SIGKILL)
        state = self.runtime.wait("developer-alpha")

        self.assertEqual(state, "failed")

    def test_a_recorded_pid_is_never_signalled_when_its_identity_mismatches(self):
        # An unrelated, still-running process stands in for a reused PID: it is
        # not our child and its identity does not match the recorded value.
        pid = self.detached_sleep()
        self.record_worker(pid, proc_start="proc:not-this-process")

        kills = []
        original = os.kill
        os.kill = lambda target, sig: kills.append((target, sig))
        try:
            started = time.monotonic()
            state = self.runtime.wait("developer-alpha")
            rows = self.runtime.status("developer-alpha")
            self.runtime.stop("developer-alpha")
            elapsed = time.monotonic() - started
        finally:
            os.kill = original

        self.assertEqual([call for call in kills if call[0] == pid], [])
        self.assertEqual(state, "unknown")
        self.assertEqual(rows[0]["status"], "unknown")
        self.assertEqual(
            task_store.find_worker(self.state, "developer-alpha")["status"],
            "stopped",
        )
        self.assertLess(elapsed, 2)

    def test_a_live_verified_reparented_worker_reports_working(self):
        pid = self.detached_sleep()
        identity = runtimes._process_start(pid)
        self.assertIsNotNone(identity)
        self.record_worker(pid, proc_start=identity)

        rows = self.runtime.status("developer-alpha")

        self.assertEqual(rows[0]["status"], "working")

    def test_spawn_does_not_signal_a_reused_pid(self):
        pid = self.detached_sleep()
        self.record_worker(pid, proc_start="proc:not-this-process")

        kills = []
        original = os.kill
        os.kill = lambda target, sig: kills.append((target, sig))
        try:
            self.spawn("developer-alpha")
        finally:
            os.kill = original

        self.assertEqual([call for call in kills if call[0] == pid], [])
        self.assertEqual(
            task_store.find_worker(self.state, "developer-alpha")["status"],
            "working",
        )

    def test_stop_signals_the_worker(self):
        os.environ["FAKE_CLAUDE_DELAY"] = "30"
        self.spawn()
        pid = task_store.find_worker(self.state, "developer-alpha")["pid"]
        self.assertIsNotNone(pid)

        self.runtime.stop("developer-alpha")

        stopped = task_store.find_worker(self.state, "developer-alpha")
        self.assertEqual(stopped["status"], "stopped")
        self.assertIsNone(stopped["pid"])
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)

    def test_next_name_skips_used_names(self):
        self.spawn("w1")
        self.spawn("w2")

        self.assertEqual(self.runtime.next_name(), "w3")

    def test_an_unknown_worker_is_rejected(self):
        with self.assertRaises(runtimes.HerdrError):
            self.runtime.send("nobody", "hello")


class RuntimeRoutingTest(unittest.TestCase):
    def test_the_claude_flag_selects_the_claude_backend(self):
        args = types.SimpleNamespace(
            runtime="claude", state_dir="/tmp/state", config_data={}
        )

        self.assertIsInstance(tm._get_runtime(args), runtimes.ClaudeRuntime)

    def test_the_herdr_flag_selects_the_herdr_backend(self):
        args = types.SimpleNamespace(
            runtime="herdr", state_dir="/tmp/state", config_data={}
        )

        self.assertIsInstance(tm._get_runtime(args), runtimes.HerdrRuntime)

    def test_the_config_runtime_is_used(self):
        original = os.environ.pop("TM_RUNTIME", None)
        self.addCleanup(self._restore, original)
        args = types.SimpleNamespace(
            runtime=None, state_dir="/tmp/state", config_data={"runtime": "claude"}
        )

        self.assertIsInstance(tm._get_runtime(args), runtimes.ClaudeRuntime)

    def _restore(self, original):
        if original is not None:
            os.environ["TM_RUNTIME"] = original


class HerdrRuntimeTest(unittest.TestCase):
    """The Herdr backend still issues the same CLI calls, unchanged."""

    def setUp(self):
        self.runtime = runtimes.HerdrRuntime()
        self.calls = []
        self.text_calls = []
        original = (runtimes.herdr, runtimes.herdr_text, runtimes.get_agent)

        def fake_herdr(*args):
            self.calls.append(args)
            if args[:2] == ("agent", "get"):
                return {
                    "result": {
                        "agent": {
                            "name": args[2],
                            "agent_status": "idle",
                            "workspace_id": "w1",
                            "cwd": "/p",
                            "tab_id": "t1",
                        }
                    }
                }
            return {}

        def fake_text(*args):
            self.text_calls.append(args)
            return "pane\n"

        runtimes.herdr = fake_herdr
        runtimes.herdr_text = fake_text
        runtimes.get_agent = lambda name: fake_herdr("agent", "get", name)["result"][
            "agent"
        ]
        self.addCleanup(self._restore, original)

    def _restore(self, original):
        runtimes.herdr, runtimes.herdr_text, runtimes.get_agent = original

    def test_send_forwards_wait_and_timeout(self):
        self.runtime.send("w1", "hi", wait=True, timeout=100)

        self.assertIn(
            ("agent", "prompt", "w1", "hi", "--wait", "--timeout", "100"),
            self.calls,
        )

    def test_status_maps_the_agent_fields(self):
        rows = self.runtime.status("w1")

        self.assertEqual(
            rows[0],
            {"name": "w1", "status": "idle", "workspace": "w1", "cwd": "/p"},
        )

    def test_wait_forwards_the_timeout(self):
        self.runtime.wait("w1", timeout=5)

        self.assertIn(("agent", "wait", "w1", "--timeout", "5"), self.calls)

    def test_report_reads_the_pane(self):
        text = self.runtime.report("w1", "visible", 80)

        self.assertEqual(text, "pane\n")
        self.assertIn(
            ("agent", "read", "w1", "--source", "visible", "--lines", "80"),
            self.text_calls,
        )

    def test_stop_interrupts_and_closes_the_tab(self):
        self.runtime.stop("w1")

        self.assertIn(("agent", "send-keys", "w1", "ctrl+c"), self.calls)
        self.assertIn(("tab", "close", "t1"), self.calls)

    def test_stop_can_keep_the_tab(self):
        self.runtime.stop("w1", keep_tab=True)

        self.assertNotIn(("tab", "close", "t1"), self.calls)

    def test_notify_forwards_body_and_sound(self):
        self.runtime.notify("hi", body="b", sound="done")

        self.assertIn(
            ("notification", "show", "hi", "--body", "b", "--sound", "done"),
            self.calls,
        )

    def test_a_stalled_wait_raises_prompt_stalled(self):
        def stalled(*args):
            raise runtimes.HerdrError("stalled", code="agent_prompt_stalled")

        runtimes.herdr = stalled

        with self.assertRaises(runtimes.PromptStalled):
            self.runtime.send("w1", "hi", wait=True)


if __name__ == "__main__":
    unittest.main()
