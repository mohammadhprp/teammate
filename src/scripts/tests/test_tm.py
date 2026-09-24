"""Tests for the tm CLI: argument parsing, diff output, and git exclude."""

import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest

import task_store
import tm


class ParserTest(unittest.TestCase):
    def test_skills_sync_is_registered(self):
        args = tm.build_parser().parse_args(["skills", "sync", "--cwd", "/tmp/x"])

        self.assertIs(args.func, tm.cmd_skills_sync)
        self.assertEqual(args.cwd, "/tmp/x")

    def test_harness_is_registered(self):
        args = tm.build_parser().parse_args(["harness"])

        self.assertIs(args.func, tm.cmd_harness)

    def test_agents_sync_is_registered(self):
        args = tm.build_parser().parse_args(["agents", "sync", "--cwd", "/tmp/x"])

        self.assertIs(args.func, tm.cmd_agents_sync)
        self.assertEqual(args.cwd, "/tmp/x")

    def test_the_harness_flag_is_parsed(self):
        args = tm.build_parser().parse_args(["--harness", "codex", "harness"])

        self.assertEqual(args.harness, "codex")

    def test_task_update_accepts_a_worker(self):
        args = tm.build_parser().parse_args(
            ["task", "update", "tsk_1", "--worker", "developer-alpha"]
        )

        self.assertEqual(args.worker, "developer-alpha")

    def test_the_removed_process_commands_are_gone(self):
        parser = tm.build_parser()

        for name in ("spawn", "send", "status", "wait", "stop", "notify"):
            with self.subTest(command=name), self.assertRaises(SystemExit):
                parser.parse_args([name])

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

    def test_session_checkpoint_is_registered(self):
        args = tm.build_parser().parse_args(["session", "checkpoint"])

        self.assertIs(args.func, tm.cmd_session_checkpoint)
        self.assertIsNone(args.session)

    def test_session_resume_is_registered(self):
        args = tm.build_parser().parse_args(["session", "resume"])

        self.assertIs(args.func, tm.cmd_session_resume)
        self.assertIsNone(args.session)

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

        with self.assertRaises(tm.TmError):
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

        with self.assertRaises(tm.TmError):
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
            worker=None,
            report_file=None,
            note=None,
        )
        args.__dict__.update(overrides)
        with contextlib.redirect_stdout(io.StringIO()):
            tm.cmd_task_update(args)

    def test_update_links_a_worker_to_the_task(self):
        self.update(worker="developer-alpha")

        task = task_store.load(self.state, self.task["id"])
        self.assertEqual(task["worker"], "developer-alpha")

    def test_inconclusive_verdict_is_stored_and_recorded(self):
        self.update(verdict="inconclusive")

        task = task_store.load(self.state, self.task["id"])
        self.assertEqual(task_store.verdict(task), "inconclusive")
        self.assertIn("inconclusive", "".join(self.events()))

    def test_inconclusive_verdict_blocks_ready_for_approval(self):
        self.update(verdict="inconclusive")

        with self.assertRaises(tm.TmError):
            self.update(status="ready_for_approval")

        self.assertEqual(
            task_store.load(self.state, self.task["id"])["status"], "planned"
        )

    def test_inconclusive_verdict_blocks_an_approval_decision(self):
        self.update(verdict="inconclusive")

        with self.assertRaises(tm.TmError):
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

        with self.assertRaises(tm.TmError):
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

        with self.assertRaises(tm.TmError):
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


class BriefTest(unittest.TestCase):
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


class ReportCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = os.path.join(self.tmp.name, "state")
        self.project = os.path.join(self.tmp.name, "project")
        os.makedirs(self.project)

    def write_report(self, text="clean markdown\n"):
        path = os.path.join(self.project, tm.REPORT_FILE)
        with open(path, "w") as fh:
            fh.write(text)
        return path

    def tracked_task(self):
        task = task_store.create(
            self.state, "acme", "t", "g", ["c"], worker="developer-alpha"
        )
        task_store.update(self.state, task["id"], root=self.project)
        return task

    def report(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state,
            name="developer-alpha",
            task=None,
            project=None,
            save=False,
        )
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_report(args)
        return buf.getvalue()

    def test_reads_the_project_root_report_file(self):
        self.write_report("clean markdown\n")
        task = self.tracked_task()

        self.assertEqual(self.report(task=task["id"]), "clean markdown\n")

    def test_falls_back_to_the_stored_report_path(self):
        path = os.path.join(self.tmp.name, "stored.md")
        with open(path, "w") as fh:
            fh.write("stored text\n")
        task = self.tracked_task()
        task_store.update(self.state, task["id"], report_path=path)

        self.assertEqual(self.report(task=task["id"]), "stored text\n")

    def test_falls_back_to_the_inline_report(self):
        task = self.tracked_task()
        task_store.update(self.state, task["id"], report="inline text\n")

        self.assertEqual(self.report(task=task["id"]), "inline text\n")

    def test_resolves_the_project_from_the_worker(self):
        self.write_report("by worker\n")
        task_store.register_project(self.state, "acme", self.project)
        task_store.create(self.state, "acme", "t", "g", ["c"], worker="developer-alpha")

        self.assertEqual(self.report(), "by worker\n")

    def test_resolves_the_project_from_the_registry(self):
        self.write_report("by registry\n")
        task_store.register_project(self.state, "acme", self.project)

        self.assertEqual(self.report(project="acme"), "by registry\n")

    def test_a_missing_report_is_an_error(self):
        task = self.tracked_task()

        with self.assertRaises(tm.TmError):
            self.report(task=task["id"])

    def test_save_writes_under_the_project_reports_dir(self):
        self.write_report("clean markdown\n")
        task = self.tracked_task()

        path = self.report(task=task["id"], save=True).strip()

        self.assertTrue(path.startswith(os.path.join(self.state, "acme", "reports")))
        with open(path) as fh:
            self.assertEqual(fh.read(), "clean markdown\n")

    def test_main_prints_an_error_line_and_exits_non_zero(self):
        task = self.tracked_task()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            code = tm.main(
                [
                    "--state-dir",
                    self.state,
                    "--config",
                    os.path.join(self.tmp.name, "missing.toml"),
                    "report",
                    "developer-alpha",
                    "--task",
                    task["id"],
                ]
            )

        self.assertEqual(code, 1)
        self.assertIn("error:", stderr.getvalue())


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


class SessionCheckpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def checkpoint(self, **overrides):
        args = types.SimpleNamespace(
            state_dir=self.state,
            project="acme",
            session=None,
            goal=None,
            next=None,
            plan=None,
            decision=None,
            note=None,
        )
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_session_checkpoint(args)
        return buf.getvalue().strip()

    def resume(self, **overrides):
        args = types.SimpleNamespace(state_dir=self.state, project="acme", session=None)
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_session_resume(args)
        return buf.getvalue()

    def test_round_trip_writes_and_prints_the_packet(self):
        session = task_store.new_session(self.state, "acme")
        task = task_store.create(
            self.state, "acme", "Add subtract()", "g", ["c"], worker="developer-alpha"
        )

        path = self.checkpoint(
            goal="ship subtract",
            next="review the diff",
            plan=["record the task", "delegate"],
            decision=["use pytest"],
            note=["alpha is running"],
        )

        self.assertEqual(path, os.path.join(self.state, "acme", "checkpoint.json"))
        out = self.resume()
        self.assertIn(f"Session: {session}", out)
        self.assertIn("Goal: ship subtract", out)
        self.assertIn("Next: review the diff", out)
        self.assertIn("- record the task", out)
        self.assertIn("- use pytest", out)
        self.assertIn("- alpha is running", out)
        self.assertIn(task["id"], out)
        self.assertIn("developer-alpha", out)

    def test_defaults_to_the_open_session(self):
        session = task_store.new_session(self.state, "acme")
        self.checkpoint(goal="current run")

        out = self.resume()

        self.assertIn(session, out)
        self.assertIn("current run", out)

    def test_missing_checkpoint_names_the_command(self):
        with self.assertRaises(tm.TmError) as ctx:
            self.resume(project="beta")

        self.assertIn("tm session checkpoint", str(ctx.exception))

    def test_checkpoints_are_isolated_per_project(self):
        task_store.new_session(self.state, "acme")
        self.checkpoint(goal="acme goal")
        task_store.new_session(self.state, "beta")
        self.checkpoint(project="beta", goal="beta goal")

        acme = self.resume(project="acme")
        beta = self.resume(project="beta")

        self.assertIn("acme goal", acme)
        self.assertNotIn("beta goal", acme)
        self.assertIn("beta goal", beta)
        with self.assertRaises(tm.TmError):
            self.resume(project="gamma")

    def test_a_second_checkpoint_overwrites_the_first(self):
        task_store.new_session(self.state, "acme")
        self.checkpoint(goal="first")

        self.checkpoint(goal="second")

        out = self.resume()
        self.assertIn("second", out)
        self.assertNotIn("first", out)

    def test_an_explicit_session_must_match(self):
        session = task_store.new_session(self.state, "acme")
        self.checkpoint(goal="run")

        self.assertIn("run", self.resume(session=session))
        with self.assertRaises(tm.TmError):
            self.resume(session="sess_deadbeef")

    def test_the_default_session_is_the_open_one(self):
        old = task_store.new_session(self.state, "acme")
        self.checkpoint(goal="run one")
        task_store.end_session(self.state, "acme")
        task_store.new_session(self.state, "acme")

        with self.assertRaises(tm.TmError):
            self.resume()
        self.assertIn("run one", self.resume(session=old))

    def test_resume_still_works_after_the_session_ends(self):
        task_store.new_session(self.state, "acme")
        self.checkpoint(goal="closed run")
        task_store.end_session(self.state, "acme")

        self.assertIn("closed run", self.resume())

    def test_checkpoint_requires_an_open_session(self):
        with self.assertRaises(tm.TmError) as ctx:
            self.checkpoint(goal="orphan")

        self.assertIn("tm session start", str(ctx.exception))

    def test_only_open_tasks_are_listed(self):
        task_store.new_session(self.state, "acme")
        done = task_store.create(self.state, "acme", "done", "g", ["c"])
        task_store.update(self.state, done["id"], status="approved")
        live = task_store.create(self.state, "acme", "live", "g", ["c"])

        self.checkpoint()

        out = self.resume()
        self.assertIn(live["id"], out)
        self.assertNotIn(done["id"], out)


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


class HarnessCommandTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config_path = os.path.join(self.tmp.name, "team-mate.toml")
        with open(self.config_path, "w") as fh:
            fh.write('harness = "opencode"\n')

    def fields(self, **overrides):
        args = types.SimpleNamespace(config=self.config_path, harness=None)
        args.__dict__.update(overrides)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_harness(args)
        return dict(line.split("\t", 1) for line in buf.getvalue().splitlines())

    def test_the_flag_selects_the_harness(self):
        fields = self.fields(harness="omp")

        self.assertEqual(fields["harness"], "omp")
        self.assertEqual(fields["subagent_tool"], "task")
        self.assertEqual(fields["agent_defs_dir"], ".omp/agents")
        self.assertIn("background", fields)

    def test_the_config_is_used_without_a_flag(self):
        original = os.environ.pop("TM_HARNESS", None)
        self.addCleanup(self._restore, original)

        self.assertEqual(self.fields()["harness"], "opencode")

    def _restore(self, original):
        if original is not None:
            os.environ["TM_HARNESS"] = original

    def test_an_unknown_harness_is_rejected(self):
        with self.assertRaises(ValueError):
            tm.cmd_harness(
                types.SimpleNamespace(config=self.config_path, harness="bogus")
            )


class AgentsSyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = os.path.join(self.tmp.name, "agents")
        os.makedirs(self.source)
        with open(os.path.join(self.source, "developer.md"), "w") as fh:
            fh.write(
                "---\n"
                "name: developer\n"
                'description: "Build the change"\n'
                "tools: Read, Write, Edit, Bash\n"
                "model: sonnet\n"
                "---\n\n"
                "# Developer\n\nDo the work.\n"
            )
        self.target = os.path.join(self.tmp.name, "project")
        os.makedirs(self.target)

    def test_a_markdown_harness_installs_the_original_text(self):
        installed, target = tm.sync_agents("claude", self.target, source=self.source)

        self.assertEqual(installed, ["developer.md"])
        self.assertEqual(target, os.path.join(self.target, ".claude", "agents"))
        with open(os.path.join(target, "developer.md")) as fh:
            text = fh.read()
        self.assertIn("# Developer", text)
        self.assertIn("name: developer", text)

    def test_opencode_renders_a_subagent_definition(self):
        installed, target = tm.sync_agents("opencode", self.target, source=self.source)

        self.assertEqual(installed, ["developer.md"])
        with open(os.path.join(target, "developer.md")) as fh:
            text = fh.read()
        self.assertIn("mode: subagent", text)
        self.assertNotIn("tools:", text)

    def test_codex_renders_a_toml_definition(self):
        installed, target = tm.sync_agents("codex", self.target, source=self.source)

        self.assertEqual(installed, ["developer.toml"])
        with open(os.path.join(target, "developer.toml")) as fh:
            text = fh.read()
        self.assertIn('name = "developer"', text)
        self.assertIn('description = "Build the change"', text)
        self.assertIn("developer_instructions = ", text)
        self.assertIn("Do the work.", text)

    def test_the_cli_command_writes_under_the_harness_dir(self):
        original = tm.PRIMARY_ROOT
        tm.PRIMARY_ROOT = self.tmp.name
        self.addCleanup(setattr, tm, "PRIMARY_ROOT", original)
        args = types.SimpleNamespace(
            config=os.path.join(self.tmp.name, "missing.toml"),
            harness="pi",
            cwd=self.target,
        )

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            tm.cmd_agents_sync(args)

        target = os.path.join(self.target, ".pi", "agents")
        self.assertIn(target, buf.getvalue())
        self.assertTrue(os.path.isfile(os.path.join(target, "developer.md")))


if __name__ == "__main__":
    unittest.main()
