"""Tests for the tm CLI: argument parsing, diff output, and git exclude."""

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest

import runtimes
import task_store
import tm


class ParserTest(unittest.TestCase):
    def test_skills_sync_is_registered(self):
        args = tm.build_parser().parse_args(["skills", "sync", "--cwd", "/tmp/x"])

        self.assertIs(args.func, tm.cmd_skills_sync)
        self.assertEqual(args.cwd, "/tmp/x")

    def test_spawn_distributes_skills_by_default(self):
        args = tm.build_parser().parse_args(["spawn", "--cwd", "/tmp/x"])

        self.assertTrue(args.skills)

    def test_spawn_can_skip_distribution(self):
        args = tm.build_parser().parse_args(["spawn", "--cwd", "/tmp/x", "--no-skills"])

        self.assertFalse(args.skills)

    def test_task_new_max_iterations_defaults_to_config(self):
        args = tm.build_parser().parse_args(
            [
                "task",
                "new",
                "--project",
                "p",
                "--title",
                "t",
                "--goal",
                "g",
                "--acceptance",
                "c",
            ]
        )

        self.assertIsNone(args.max_iterations)

    def test_project_add_is_registered(self):
        args = tm.build_parser().parse_args(
            ["project", "add", "--name", "acme", "--root", "/tmp/acme"]
        )

        self.assertIs(args.func, tm.cmd_project_add)
        self.assertFalse(args.force)

    def test_session_summary_is_registered(self):
        args = tm.build_parser().parse_args(["session", "summary"])

        self.assertIs(args.func, tm.cmd_session_summary)
        self.assertFalse(args.all)

    def test_task_new_project_is_optional(self):
        args = tm.build_parser().parse_args(
            ["task", "new", "--title", "t", "--goal", "g", "--acceptance", "c"]
        )

        self.assertIsNone(args.project)

    def test_session_start_accepts_a_project(self):
        args = tm.build_parser().parse_args(["session", "start", "--project", "acme"])

        self.assertEqual(args.project, "acme")

    def test_brief_accepts_a_project(self):
        args = tm.build_parser().parse_args(
            ["brief", "developer-alpha", "--project", "acme"]
        )

        self.assertEqual(args.project, "acme")

    def test_report_accepts_a_project(self):
        args = tm.build_parser().parse_args(
            ["report", "developer-alpha", "--project", "acme"]
        )

        self.assertEqual(args.project, "acme")

    def test_task_list_has_a_project_filter(self):
        args = tm.build_parser().parse_args(["task", "list", "--project", "acme"])

        self.assertEqual(args.project, "acme")


class SpawnTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = os.path.join(self.tmp.name, "state")
        self.project = os.path.join(self.tmp.name, "project")
        os.makedirs(self.project)

    def test_a_skipped_skill_does_not_clobber_the_worker_name(self):
        source = os.path.join(self.tmp.name, "source")
        os.makedirs(os.path.join(source, "worker-role"))
        with open(os.path.join(source, "worker-role", "SKILL.md"), "w") as fh:
            fh.write("---\nname: worker-role\n---\n")
        config = {
            "skills_source": source,
            "worker_skills": ["worker-role", "commit-changes"],
            "worker_kind": "opencode",
        }

        calls = []

        def fake_herdr(*cmd):
            calls.append(cmd)
            if cmd[:2] == ("workspace", "list"):
                return {
                    "result": {
                        "workspaces": [{"label": "project", "workspace_id": "w1"}]
                    }
                }
            if cmd[:2] == ("tab", "create"):
                return {
                    "result": {
                        "root_pane": {"pane_id": "w1:p1"},
                        "tab": {"tab_id": "w1:t1"},
                    }
                }
            if cmd[:2] == ("agent", "start"):
                return {"result": {"agent": {"agent_status": "idle"}}}
            return {}

        task = task_store.create(self.state, "project", "t", "g", ["c"])
        original_config, original_herdr = tm.load_config, runtimes.herdr
        tm.load_config = lambda path: config
        runtimes.herdr = fake_herdr
        try:
            args = types.SimpleNamespace(
                config="ignored",
                runtime="herdr",
                kind=None,
                name="developer-alpha",
                cwd=self.project,
                project=None,
                skills=True,
                label=None,
                task=task["id"],
                state_dir=self.state,
            )
            buf = io.StringIO()
            with (
                contextlib.redirect_stdout(buf),
                contextlib.redirect_stderr(io.StringIO()),
            ):
                tm.cmd_spawn(args)
        finally:
            tm.load_config, runtimes.herdr = original_config, original_herdr

        saved = task_store.load(self.state, task["id"])
        self.assertEqual(saved["worker"], "developer-alpha")
        started = [c for c in calls if c[:2] == ("agent", "start")][0]
        self.assertEqual(started[2], "developer-alpha")
        self.assertIn("developer-alpha", buf.getvalue())
        with open(task_store.timeline_path(self.state, "project")) as fh:
            self.assertIn("developer-alpha in project", fh.read())


class GitExcludeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = os.path.join(self.tmp.name, "source")
        self.project = os.path.join(self.tmp.name, "project")
        os.makedirs(self.project)
        subprocess.run(["git", "-C", self.project, "init", "-q"], check=True)
        for name in ("verify-evidence", "worker-role"):
            os.makedirs(os.path.join(self.source, name))
            with open(os.path.join(self.source, name, "SKILL.md"), "w") as fh:
                fh.write(f"---\nname: {name}\n---\n")
        self.config = {
            "skills_source": self.source,
            "worker_skills": ["verify-evidence", "worker-role"],
        }

    def exclude_text(self):
        path = os.path.join(self.project, ".git", "info", "exclude")
        with open(path) as fh:
            return fh.read()

    def test_excludes_managed_skills_from_git_status(self):
        tm.sync_skills(self.config, self.project)

        text = self.exclude_text()
        self.assertIn(tm.EXCLUDE_BEGIN, text)
        self.assertIn("/.agents/skills/worker-role/", text)
        self.assertIn(f"/.agents/skills/{tm.MANAGED_MARKER}", text)
        status = subprocess.run(
            ["git", "-C", self.project, "status", "--short"],
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(status.strip(), "")

    def test_the_worker_report_file_is_excluded(self):
        tm.sync_skills(self.config, self.project)
        with open(os.path.join(self.project, tm.REPORT_FILE), "w") as fh:
            fh.write("### Requested\n")

        self.assertIn(f"/{tm.REPORT_FILE}", self.exclude_text())
        status = subprocess.run(
            ["git", "-C", self.project, "status", "--short"],
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(status.strip(), "")

    def test_the_managed_block_stays_unique_across_syncs(self):
        tm.sync_skills(self.config, self.project)
        tm.sync_skills(self.config, self.project)

        text = self.exclude_text()
        self.assertEqual(text.count(tm.EXCLUDE_BEGIN), 1)
        self.assertEqual(text.count(tm.EXCLUDE_END), 1)
        self.assertEqual(text.count("/.agents/skills/worker-role/"), 1)

    def test_exclude_can_be_disabled(self):
        self.config["distribute_git_exclude"] = False

        tm.sync_skills(self.config, self.project)

        self.assertNotIn(tm.EXCLUDE_BEGIN, self.exclude_text())

    def test_a_project_owned_skill_stays_visible(self):
        owned = os.path.join(self.project, tm.SKILLS_SUBDIR, "custom")
        os.makedirs(owned)
        with open(os.path.join(owned, "SKILL.md"), "w") as fh:
            fh.write("the project owns this\n")

        tm.sync_skills(self.config, self.project)

        self.assertNotIn("/.agents/skills/custom/", self.exclude_text())


class DiffTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = self.tmp.name
        subprocess.run(["git", "-C", self.repo, "init", "-q"], check=True)

    def diff(self, stat):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_diff(types.SimpleNamespace(cwd=self.repo, stat=stat))
        return buf.getvalue()

    def test_untracked_files_are_visible(self):
        with open(os.path.join(self.repo, "new-file.txt"), "w") as fh:
            fh.write("hello\n")

        output = self.diff(stat=True)

        self.assertIn("new-file.txt", output)

    def test_tracked_changes_are_visible(self):
        path = os.path.join(self.repo, "tracked.txt")
        with open(path, "w") as fh:
            fh.write("one\n")
        subprocess.run(["git", "-C", self.repo, "add", "tracked.txt"], check=True)
        subprocess.run(
            [
                "git",
                "-C",
                self.repo,
                "-c",
                "user.email=t@t",
                "-c",
                "user.name=t",
                "commit",
                "-qm",
                "init",
            ],
            check=True,
        )
        with open(path, "w") as fh:
            fh.write("two\n")

        output = self.diff(stat=False)

        self.assertIn("tracked.txt", output)


class RenderTaskTest(unittest.TestCase):
    def test_note_is_rendered(self):
        task = {
            "id": "tsk_1",
            "title": "t",
            "status": "ready_for_approval",
            "project": "acme",
            "root": "/tmp/acme",
            "worker": "acme-1",
            "workspace": "w1",
            "iteration": 1,
            "max_iterations": 3,
            "goal": "do it",
            "acceptance": ["it is done"],
            "constraints": [],
            "findings": [],
            "report": None,
            "note": "approved by the developer",
        }

        rendered = tm._render_task(task)

        self.assertIn("Note: approved by the developer", rendered)

    def make(self, **overrides):
        task = {
            "id": "tsk_1",
            "title": "t",
            "status": "ready_for_approval",
            "project": "acme",
            "root": "/tmp/acme",
            "worker": "acme-1",
            "workspace": "w1",
            "iteration": 1,
            "max_iterations": 3,
            "goal": "do it",
            "acceptance": ["it is done"],
            "constraints": [],
            "findings": [],
            "report": None,
        }
        task.update(overrides)
        return task

    def test_show_prints_the_report_path_not_its_content(self):
        task = self.make(report_path="/state/reports/r.md")

        rendered = tm._render_task(task)

        self.assertIn("Report: /state/reports/r.md", rendered)
        self.assertLess(len(rendered.splitlines()), 30)

    def test_show_truncates_a_legacy_inline_report(self):
        report = "\n".join(f"report line {i}" for i in range(200))
        task = self.make(report=report)

        rendered = tm._render_task(task)

        self.assertIn("truncated", rendered)
        self.assertIn("report line 0", rendered)
        self.assertNotIn("report line 199", rendered)
        self.assertLess(len(rendered.splitlines()), 30)

    def test_show_prints_elapsed_seconds(self):
        task = self.make(created_at=0, updated_at=42_000)

        self.assertIn("Elapsed: 42s", tm._render_task(task))

    def test_elapsed_formats_minutes_and_hours(self):
        minutes = self.make(created_at=0, updated_at=192_000)
        hours = self.make(created_at=0, updated_at=3_840_000)

        self.assertIn("Elapsed: 3m 12s", tm._render_task(minutes))
        self.assertIn("Elapsed: 1h 04m", tm._render_task(hours))

    def test_cost_and_tokens_render_only_when_set(self):
        rendered = tm._render_task(self.make(cost=0.42, tokens=1234))

        self.assertIn("Cost: 0.42", rendered)
        self.assertIn("Tokens: 1234", rendered)

    def test_cost_and_tokens_are_absent_when_unset(self):
        rendered = tm._render_task(self.make())

        self.assertNotIn("Cost:", rendered)
        self.assertNotIn("Tokens:", rendered)


class TaskCommandsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name
        self.task = task_store.create(self.state, "acme", "t", "g", ["criterion holds"])

    def events(self):
        with open(task_store.timeline_path(self.state, "acme")) as fh:
            return [line for line in fh]

    def test_findings_command_records_and_reports_verdict(self):
        path = os.path.join(self.state, "findings.json")
        with open(path, "w") as fh:
            fh.write('[{"title": "broken", "severity": "major"}]')

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_findings(
                types.SimpleNamespace(
                    state_dir=self.state, id=self.task["id"], file=path
                )
            )

        self.assertIn("fail", buf.getvalue())
        saved = task_store.load(self.state, self.task["id"])
        self.assertEqual(saved["findings"][0]["title"], "broken")

    def test_decide_maps_each_decision(self):
        for decision, status in (
            ("approve", "approved"),
            ("finalize", "approved"),
            ("reject", "rejected"),
            ("request-changes", "rework"),
        ):
            task = task_store.create(self.state, "acme", decision, "g", ["c"])
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_task_decide(
                    types.SimpleNamespace(
                        state_dir=self.state,
                        id=task["id"],
                        decision=decision,
                        note=None,
                    )
                )
            self.assertEqual(task_store.load(self.state, task["id"])["status"], status)

    def test_decide_rejects_an_unknown_decision(self):
        with self.assertRaises(ValueError):
            tm.cmd_task_decide(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    decision="maybe",
                    note=None,
                )
            )

    def make_review(self):
        return task_store.create(
            self.state, "acme", "review", "g", ["c"], kind="review"
        )

    def test_a_review_task_cannot_await_approval(self):
        review = self.make_review()

        with self.assertRaises(tm.HerdrError):
            tm.cmd_task_update(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=review["id"],
                    status="ready_for_approval",
                    iteration=None,
                    report_file=None,
                    note=None,
                )
            )

        self.assertEqual(task_store.load(self.state, review["id"])["status"], "planned")

    def test_a_build_task_can_await_approval(self):
        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_update(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    status="ready_for_approval",
                    iteration=None,
                    report_file=None,
                    note=None,
                )
            )

        self.assertEqual(
            task_store.load(self.state, self.task["id"])["status"],
            "ready_for_approval",
        )

    def test_decide_is_refused_for_a_review_task(self):
        review = self.make_review()

        with self.assertRaises(tm.HerdrError):
            tm.cmd_task_decide(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=review["id"],
                    decision="request-changes",
                    note=None,
                )
            )

        self.assertEqual(task_store.load(self.state, review["id"])["status"], "planned")

    def test_update_stores_the_report_path(self):
        report = os.path.join(self.state, "worker.md")
        with open(report, "w") as fh:
            fh.write("line 0\nline 1\n")

        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_update(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    status="awaiting_review",
                    iteration=None,
                    report_file=report,
                    note=None,
                )
            )

        self.assertEqual(
            task_store.load(self.state, self.task["id"])["report_path"], report
        )

    def add_blocking(self):
        task_store.record_findings(
            self.state, self.task["id"], [{"title": "broken", "severity": "major"}]
        )

    def update(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state,
            id=self.task["id"],
            status=None,
            iteration=None,
            report_file=None,
            note=None,
        )
        args.__dict__.update(overrides)
        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_update(args)

    def test_inconclusive_verdict_is_stored_and_recorded(self):
        self.update(verdict="inconclusive")

        task = task_store.load(self.state, self.task["id"])
        self.assertEqual(task_store.verdict(task), "inconclusive")
        self.assertIn("inconclusive", "".join(self.events()))

    def test_inconclusive_verdict_blocks_ready_for_approval(self):
        self.update(verdict="inconclusive")

        with self.assertRaises(tm.HerdrError):
            self.update(status="ready_for_approval")

        self.assertEqual(
            task_store.load(self.state, self.task["id"])["status"], "planned"
        )

    def test_inconclusive_verdict_blocks_an_approval_decision(self):
        self.update(verdict="inconclusive")

        with self.assertRaises(tm.HerdrError):
            tm.cmd_task_decide(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    decision="approve",
                    note=None,
                )
            )

    def test_verdict_auto_clears_the_override(self):
        self.update(verdict="inconclusive")
        self.update(verdict="auto")

        task = task_store.load(self.state, self.task["id"])
        self.assertEqual(task_store.verdict(task), "pass")

    def test_show_prints_the_elapsed_time(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_show(
                types.SimpleNamespace(state_dir=self.state, id=self.task["id"])
            )

        self.assertIn("Elapsed:", buf.getvalue())

    def test_update_records_cost_and_tokens_when_given(self):
        self.update(cost=0.42, tokens=1234)

        task = task_store.load(self.state, self.task["id"])
        self.assertEqual(task["cost"], 0.42)
        self.assertEqual(task["tokens"], 1234)

    def test_pass_is_refused_while_blocking_findings_are_open(self):
        self.add_blocking()

        with self.assertRaises(tm.HerdrError):
            tm.cmd_task_update(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    status="ready_for_approval",
                    iteration=None,
                    report_file=None,
                    note=None,
                )
            )

    def test_resolve_then_pass_is_allowed(self):
        self.add_blocking()

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_resolve(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    all=True,
                    finding=None,
                    status=None,
                )
            )
        self.assertIn("pass", buf.getvalue())

        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_update(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    status="ready_for_approval",
                    iteration=None,
                    report_file=None,
                    note=None,
                )
            )
        self.assertEqual(
            task_store.load(self.state, self.task["id"])["status"],
            "ready_for_approval",
        )

    def test_finalize_is_refused_while_blocking_findings_are_open(self):
        self.add_blocking()

        with self.assertRaises(tm.HerdrError):
            tm.cmd_task_decide(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    decision="finalize",
                    note=None,
                )
            )

    def test_review_events_are_appended(self):
        path = os.path.join(self.state, "findings.json")
        with open(path, "w") as fh:
            fh.write('[{"title": "broken", "severity": "major"}]')
        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_findings(
                types.SimpleNamespace(
                    state_dir=self.state, id=self.task["id"], file=path
                )
            )
            tm.cmd_task_decide(
                types.SimpleNamespace(
                    state_dir=self.state,
                    id=self.task["id"],
                    decision="request-changes",
                    note=None,
                )
            )

        text = "".join(self.events())

        self.assertIn("review.findings", text)
        self.assertIn("task.decision", text)


class TaskNewTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def new_task(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state,
            project="acme",
            title="t",
            goal="g",
            acceptance=["c"],
            constraint=None,
            worker=None,
            max_iterations=None,
            kind="build",
            config_data={},
        )
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_new(args)
        return task_store.load(self.state, buf.getvalue().strip())

    def test_config_max_iterations_is_the_default(self):
        task = self.new_task(config_data={"max_iterations": 5})

        self.assertEqual(task["max_iterations"], 5)

    def test_the_flag_overrides_config(self):
        task = self.new_task(max_iterations=2, config_data={"max_iterations": 5})

        self.assertEqual(task["max_iterations"], 2)

    def test_without_config_the_builtin_default_is_three(self):
        task = self.new_task()

        self.assertEqual(task["max_iterations"], 3)

    def test_kind_defaults_to_build(self):
        task = self.new_task()

        self.assertEqual(task["kind"], "build")

    def test_review_kind_is_stored(self):
        task = self.new_task(kind="review")

        self.assertEqual(task["kind"], "review")


class BriefAndReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_brief_writes_under_the_project_and_prints_the_path(self):
        args = types.SimpleNamespace(
            state_dir=self.state, name="developer-alpha", task="tsk_1", project="acme"
        )
        original = sys.stdin
        sys.stdin = io.StringIO("Goal: add subtract\n")
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_brief(args)
        finally:
            sys.stdin = original

        path = buf.getvalue().strip()
        self.assertEqual(
            path,
            os.path.join(self.state, "acme", "briefs", "tsk_1-developer-alpha.md"),
        )
        with open(path) as fh:
            self.assertIn("add subtract", fh.read())

    def test_brief_resolves_the_project_from_the_task(self):
        task = task_store.create(self.state, "acme", "t", "g", ["c"])
        args = types.SimpleNamespace(
            state_dir=self.state, name="developer-alpha", task=task["id"], project=None
        )
        original = sys.stdin
        sys.stdin = io.StringIO("Goal: add subtract\n")
        try:
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_brief(args)
        finally:
            sys.stdin = original

        self.assertTrue(
            buf.getvalue()
            .strip()
            .startswith(os.path.join(self.state, "acme", "briefs"))
        )

    def test_report_save_writes_under_state_dir_and_prints_the_path(self):
        calls = {}

        def fake_read(*cmd):
            calls["cmd"] = cmd
            return "worker output\n"

        original_text, original_agent = runtimes.herdr_text, runtimes.get_agent
        runtimes.herdr_text = fake_read
        runtimes.get_agent = lambda name: {"cwd": self.tmp.name}
        try:
            args = types.SimpleNamespace(
                state_dir=self.state,
                name="developer-alpha",
                runtime="herdr",
                source="recent-unwrapped",
                lines=300,
                save=True,
                task="tsk_1",
                project="acme",
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_report(args)
        finally:
            runtimes.herdr_text, runtimes.get_agent = original_text, original_agent

        path = buf.getvalue().strip()
        self.assertTrue(
            path.startswith(
                os.path.join(self.state, "acme", "reports", "tsk_1-developer-alpha-")
            )
        )
        with open(path) as fh:
            self.assertEqual(fh.read(), "worker output\n")
        self.assertEqual(calls["cmd"][0], "agent")

    def test_report_without_save_prints_the_output(self):
        original_text, original_agent = runtimes.herdr_text, runtimes.get_agent
        runtimes.herdr_text = lambda *cmd: "shown\n"
        runtimes.get_agent = lambda name: {"cwd": self.tmp.name}
        try:
            args = types.SimpleNamespace(
                state_dir=self.state,
                name="developer-alpha",
                runtime="herdr",
                source="recent-unwrapped",
                lines=300,
                save=False,
                task=None,
                project=None,
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_report(args)
        finally:
            runtimes.herdr_text, runtimes.get_agent = original_text, original_agent

        self.assertEqual(buf.getvalue(), "shown\n")

    def test_two_saves_in_the_same_second_do_not_collide(self):
        original_text, original_agent = runtimes.herdr_text, runtimes.get_agent
        runtimes.herdr_text = lambda *cmd: "worker output\n"
        runtimes.get_agent = lambda name: {"cwd": self.tmp.name}
        paths = []
        try:
            for _ in range(2):
                args = types.SimpleNamespace(
                    state_dir=self.state,
                    name="developer-alpha",
                    runtime="herdr",
                    source="recent-unwrapped",
                    lines=300,
                    save=True,
                    task=None,
                    project="acme",
                )
                buf = io.StringIO()
                with contextlib.redirect_stdout(buf):
                    tm.cmd_report(args)
                paths.append(buf.getvalue().strip())
                time.sleep(0.002)
        finally:
            runtimes.herdr_text, runtimes.get_agent = original_text, original_agent

        self.assertNotEqual(paths[0], paths[1])

    def test_report_save_prefers_the_workers_clean_report_file(self):
        project = os.path.join(self.tmp.name, "project")
        os.makedirs(project)
        with open(os.path.join(project, tm.REPORT_FILE), "w") as fh:
            fh.write("### Requested\n\nclean markdown, no TUI chrome\n")

        def fail_pane(*cmd):
            raise AssertionError("the terminal pane should not be captured")

        original_text, original_agent = runtimes.herdr_text, runtimes.get_agent
        runtimes.herdr_text = fail_pane
        runtimes.get_agent = lambda name: {"cwd": project}
        try:
            args = types.SimpleNamespace(
                state_dir=self.state,
                name="developer-alpha",
                runtime="herdr",
                source="recent-unwrapped",
                lines=300,
                save=True,
                task="tsk_1",
                project="acme",
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_report(args)
        finally:
            runtimes.herdr_text, runtimes.get_agent = original_text, original_agent

        path = buf.getvalue().strip()
        with open(path) as fh:
            self.assertEqual(
                fh.read(), "### Requested\n\nclean markdown, no TUI chrome\n"
            )

    def test_report_visible_source_reads_the_pane_not_the_report_file(self):
        project = os.path.join(self.tmp.name, "project")
        os.makedirs(project)
        with open(os.path.join(project, tm.REPORT_FILE), "w") as fh:
            fh.write("stale report\n")

        original_text, original_agent = runtimes.herdr_text, runtimes.get_agent
        runtimes.herdr_text = lambda *cmd: "blocked dialog\n"
        runtimes.get_agent = lambda name: {"cwd": project}
        try:
            args = types.SimpleNamespace(
                state_dir=self.state,
                name="developer-alpha",
                runtime="herdr",
                source="visible",
                lines=80,
                save=False,
                task=None,
            )
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                tm.cmd_report(args)
        finally:
            runtimes.herdr_text, runtimes.get_agent = original_text, original_agent

        self.assertEqual(buf.getvalue(), "blocked dialog\n")


class SessionCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_start_status_end_round_trip(self):
        args = types.SimpleNamespace(state_dir=self.state, project="acme")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            tm.cmd_session_start(args)
        session = out.getvalue().strip()
        self.assertTrue(session.startswith("sess_"))

        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            tm.cmd_session_status(
                types.SimpleNamespace(state_dir=self.state, project="acme")
            )
        self.assertEqual(out.getvalue().strip(), session)

        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            tm.cmd_session_end(
                types.SimpleNamespace(state_dir=self.state, project="acme")
            )
        self.assertEqual(out.getvalue().strip(), session)
        self.assertIsNone(task_store.current_session(self.state, "acme"))


class TaskListAndPruneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def list_ids(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state, project=None, status=None, session=None, all=False
        )
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_list(args)
        return buf.getvalue()

    def test_list_defaults_to_the_open_session(self):
        old = task_store.new_session(self.state, "acme")
        old_task = task_store.create(self.state, "acme", "old", "g", ["c"])
        task_store.end_session(self.state, "acme")
        task_store.new_session(self.state, "acme")
        new_task = task_store.create(self.state, "acme", "new", "g", ["c"])

        default = self.list_ids()
        every = self.list_ids(all=True)

        self.assertIn(new_task["id"], default)
        self.assertNotIn(old_task["id"], default)
        self.assertIn(old_task["id"], every)

    def test_list_can_filter_to_one_project(self):
        acme = task_store.create(self.state, "acme", "a", "g", ["c"])
        beta = task_store.create(self.state, "beta", "b", "g", ["c"])

        only_acme = self.list_ids(project="acme", all=True)

        self.assertIn(acme["id"], only_acme)
        self.assertNotIn(beta["id"], only_acme)

    def test_prune_archives_closed_tasks_in_the_open_session(self):
        task_store.new_session(self.state, "acme")
        done = task_store.create(self.state, "acme", "done", "g", ["c"])
        task_store.update(self.state, done["id"], status="approved")

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_task_prune(
                types.SimpleNamespace(
                    state_dir=self.state, project=None, session=None, all=False
                )
            )

        self.assertIn("archived\t1", buf.getvalue())
        self.assertEqual(task_store.list_tasks(self.state), [])

    def test_prune_without_a_session_requires_a_scope(self):
        with self.assertRaises(ValueError):
            tm.cmd_task_prune(
                types.SimpleNamespace(
                    state_dir=self.state, project=None, session=None, all=False
                )
            )


class ProjectCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name
        self.root = os.path.join(self.tmp.name, "acme")

    def add(self, name="acme", root=None, force=False):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_project_add(
                types.SimpleNamespace(
                    state_dir=self.state,
                    name=name,
                    root=self.root if root is None else root,
                    force=force,
                )
            )
        return buf.getvalue()

    def list_projects(self):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_project_list(types.SimpleNamespace(state_dir=self.state))
        return buf.getvalue()

    def test_add_prints_the_registered_project(self):
        out = self.add()

        self.assertEqual(out, f"project\tacme\t{self.root}\n")
        self.assertEqual(task_store.list_projects(self.state), {"acme": self.root})

    def test_list_prints_sorted_entries(self):
        self.add(name="zeta")
        self.add(name="alpha", root=os.path.join(self.tmp.name, "alpha"))

        self.assertEqual(
            self.list_projects(),
            f"alpha\t{os.path.join(self.tmp.name, 'alpha')}\nzeta\t{self.root}\n",
        )

    def test_list_without_a_registry_prints_no_projects(self):
        self.assertEqual(self.list_projects(), "no projects\n")


class SessionSummaryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def summary(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state, project="acme", session=None, all=False
        )
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_session_summary(args)
        return buf.getvalue()

    def test_counts_tasks_by_status_and_distinct_workers(self):
        task_store.new_session(self.state, "acme")
        first = task_store.create(self.state, "acme", "a", "g", ["c"], worker="w1")
        task_store.create(self.state, "acme", "b", "g", ["c"], worker="w1")
        task_store.create(self.state, "acme", "c", "g", ["c"], worker="w2")
        task_store.update(self.state, first["id"], status="working")

        out = self.summary()

        self.assertIn("tasks\t3\tplanned=2 working=1", out)
        self.assertIn("workers\t2", out)

    def test_cost_and_tokens_are_included_only_when_recorded(self):
        task = task_store.create(self.state, "acme", "a", "g", ["c"])
        task_store.update(self.state, task["id"], cost=0.42, tokens=1234)

        out = self.summary()

        self.assertIn("cost\t0.42", out)
        self.assertIn("tokens\t1234", out)

    def test_cost_and_tokens_are_omitted_when_unrecorded(self):
        task_store.create(self.state, "acme", "a", "g", ["c"])

        out = self.summary()

        self.assertNotIn("cost\t", out)
        self.assertNotIn("tokens\t", out)

    def test_span_covers_earliest_created_to_latest_updated(self):
        task = task_store.create(self.state, "acme", "a", "g", ["c"])
        path = os.path.join(
            task_store.tasks_dir(self.state, "acme"), f"{task['id']}.json"
        )
        with open(path) as fh:
            stored = json.load(fh)
        stored["created_at"] = 0
        stored["updated_at"] = 192_000
        with open(path, "w") as fh:
            json.dump(stored, fh)

        self.assertIn("span\t3m 12s", self.summary())

    def test_defaults_to_the_open_session(self):
        task_store.new_session(self.state, "acme")
        task_store.create(self.state, "acme", "old", "g", ["c"])
        task_store.end_session(self.state, "acme")
        task_store.new_session(self.state, "acme")
        task_store.create(self.state, "acme", "new", "g", ["c"])

        self.assertIn("tasks\t1\t", self.summary())

    def test_no_tasks(self):
        self.assertEqual(self.summary(), "no tasks\n")


class PermissionsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, "opencode.json")

    def test_init_adds_state_dir_rules_once(self):
        state = os.path.join(self.tmp.name, "state")
        args = types.SimpleNamespace(state_dir=state, file=self.path)

        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_permissions_init(args)
            tm.cmd_permissions_init(args)

        with open(self.path) as fh:
            data = json.load(fh)
        rules = [r for r in data["permissions"] if r["action"] == "external_directory"]
        self.assertEqual(len(rules), 1)
        self.assertEqual(rules[0]["resource"], f"{state}/*")

    def test_allow_preserves_existing_permissions(self):
        with open(self.path, "w") as fh:
            json.dump(
                {
                    "permissions": [
                        {"action": "shell", "resource": "*", "effect": "ask"}
                    ]
                },
                fh,
            )

        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_permissions_allow(
                types.SimpleNamespace(
                    cwd=os.path.join(self.tmp.name, "acme"), file=self.path
                )
            )

        with open(self.path) as fh:
            data = json.load(fh)
        actions = {r["action"] for r in data["permissions"]}
        self.assertIn("shell", actions)
        self.assertIn("external_directory", actions)


class ProjectResolutionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = os.path.join(self.tmp.name, "state")
        self.root = os.path.join(self.tmp.name, "acme")
        os.makedirs(self.root)

    def with_cwd(self, cwd, func):
        original = os.getcwd
        os.getcwd = lambda: cwd
        try:
            return func()
        finally:
            os.getcwd = original

    def test_explicit_project_wins_over_task_and_cwd(self):
        task = task_store.create(self.state, "beta", "t", "g", ["c"])
        task_store.register_project(self.state, "acme", self.root)
        args = types.SimpleNamespace(
            state_dir=self.state, project="acme", task=task["id"]
        )

        self.assertEqual(tm._resolve_project(args), "acme")

    def test_the_tasks_project_is_used(self):
        task = task_store.create(self.state, "acme", "t", "g", ["c"])
        args = types.SimpleNamespace(
            state_dir=self.state, project=None, task=task["id"]
        )

        self.assertEqual(tm._resolve_project(args), "acme")

    def test_the_cwd_project_is_inferred(self):
        task_store.register_project(self.state, "acme", self.root)
        args = types.SimpleNamespace(state_dir=self.state, project=None, task=None)

        resolved = self.with_cwd(
            os.path.join(self.root, "src"), lambda: tm._resolve_project(args)
        )

        self.assertEqual(resolved, "acme")

    def test_a_missing_project_names_the_flag(self):
        args = types.SimpleNamespace(state_dir=self.state, project=None, task=None)

        def resolve():
            with self.assertRaises(ValueError) as ctx:
                tm._resolve_project(args)
            return str(ctx.exception)

        message = self.with_cwd(self.tmp.name, resolve)

        self.assertIn("--project", message)


if __name__ == "__main__":
    unittest.main()
