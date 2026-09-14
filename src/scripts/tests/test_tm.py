"""Tests for the tm CLI: argument parsing, diff output, and git exclude."""

import contextlib
import io
import os
import subprocess
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

    def test_spawn_distributes_skills_by_default(self):
        args = tm.build_parser().parse_args(["spawn", "--cwd", "/tmp/x"])

        self.assertTrue(args.skills)

    def test_spawn_can_skip_distribution(self):
        args = tm.build_parser().parse_args(["spawn", "--cwd", "/tmp/x", "--no-skills"])

        self.assertFalse(args.skills)


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


class TaskCommandsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name
        self.task = task_store.create(self.state, "acme", "t", "g", ["criterion holds"])

    def events(self):
        with open(os.path.join(self.state, "timeline.jsonl")) as fh:
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

    def add_blocking(self):
        task_store.record_findings(
            self.state, self.task["id"], [{"title": "broken", "severity": "major"}]
        )

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


if __name__ == "__main__":
    unittest.main()
