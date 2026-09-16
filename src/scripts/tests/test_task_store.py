"""Tests for the file-backed task store."""

import json
import os
import tempfile
import time
import unittest

import task_store


class TaskStoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def make(self, **overrides):
        fields = {
            "project": "acme",
            "title": "Add subtract",
            "goal": "Add subtract(a, b).",
            "acceptance": ["subtract(5, 3) == 2"],
        }
        fields.update(overrides)
        return task_store.create(self.state, **fields)

    def test_create_sets_defaults_and_persists(self):
        task = self.make()

        self.assertTrue(task["id"].startswith("tsk_"))
        self.assertEqual(task["status"], "planned")
        self.assertEqual(task["iteration"], 0)
        self.assertEqual(task["acceptance"], ["subtract(5, 3) == 2"])
        path = os.path.join(self.state, "tasks", f"{task['id']}.json")
        self.assertTrue(os.path.isfile(path))

    def test_create_defaults_to_a_build_task(self):
        self.assertEqual(self.make()["kind"], "build")

    def test_create_stores_the_review_kind(self):
        self.assertEqual(self.make(kind="review")["kind"], "review")

    def test_create_rejects_an_unknown_kind(self):
        with self.assertRaises(ValueError):
            self.make(kind="spot-check")

    def test_create_appends_a_timeline_event(self):
        task = self.make()

        with open(os.path.join(self.state, "timeline.jsonl")) as fh:
            events = [json.loads(line) for line in fh]
        self.assertEqual(events[-1]["kind"], "task.created")
        self.assertEqual(events[-1]["task"], task["id"])

    def test_load_missing_task_raises(self):
        with self.assertRaises(ValueError):
            task_store.load(self.state, "tsk_missing")

    def test_update_rejects_an_unknown_status(self):
        task = self.make()

        with self.assertRaises(ValueError):
            task_store.update(self.state, task["id"], status="bogus")

    def test_update_persists_changes(self):
        task = self.make()

        updated = task_store.update(
            self.state, task["id"], status="working", worker="acme-1"
        )

        self.assertEqual(updated["status"], "working")
        self.assertEqual(task_store.load(self.state, task["id"])["worker"], "acme-1")

    def test_list_filters_by_status(self):
        first = self.make(title="first")
        second = self.make(title="second")
        task_store.update(self.state, second["id"], status="working")

        ids = {task["id"] for task in task_store.list_tasks(self.state)}
        working = task_store.list_tasks(self.state, "working")

        self.assertEqual(ids, {first["id"], second["id"]})
        self.assertEqual([task["id"] for task in working], [second["id"]])

    def test_find_by_worker(self):
        task = self.make(worker="acme-1")

        self.assertEqual(
            task_store.find_by_worker(self.state, "acme-1")["id"], task["id"]
        )
        self.assertIsNone(task_store.find_by_worker(self.state, "nobody"))

    def test_find_by_worker_prefers_an_active_task_over_a_closed_one(self):
        closed = self.make(worker="acme-1")
        task_store.update(self.state, closed["id"], status="approved")
        live = self.make(worker="acme-1")

        self.assertEqual(
            task_store.find_by_worker(self.state, "acme-1")["id"], live["id"]
        )

    def test_find_by_worker_falls_back_to_the_newest_closed_task(self):
        older = self.make(worker="acme-1")
        task_store.update(self.state, older["id"], status="approved")
        time.sleep(0.002)
        newer = self.make(worker="acme-1")
        task_store.update(self.state, newer["id"], status="rejected")

        self.assertEqual(
            task_store.find_by_worker(self.state, "acme-1")["id"], newer["id"]
        )

    def test_append_event_writes_jsonl(self):
        task_store.append_event(self.state, "tsk_x", "worker.spawned", "acme-1")

        with open(os.path.join(self.state, "timeline.jsonl")) as fh:
            event = json.loads(fh.readline())
        self.assertEqual(event["kind"], "worker.spawned")
        self.assertEqual(event["task"], "tsk_x")
        self.assertEqual(event["summary"], "acme-1")


class SessionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_new_session_is_open_until_ended(self):
        session = task_store.new_session(self.state)

        self.assertTrue(session.startswith("sess_"))
        self.assertEqual(task_store.current_session(self.state), session)
        self.assertEqual(task_store.end_session(self.state), session)
        self.assertIsNone(task_store.current_session(self.state))

    def test_created_tasks_are_tagged_with_the_open_session(self):
        session = task_store.new_session(self.state)

        task = task_store.create(self.state, "acme", "t", "g", ["c"])

        self.assertEqual(task["session"], session)

    def test_list_filters_by_session(self):
        first = task_store.new_session(self.state)
        a = task_store.create(self.state, "acme", "a", "g", ["c"])
        task_store.end_session(self.state)
        second = task_store.new_session(self.state)
        b = task_store.create(self.state, "acme", "b", "g", ["c"])

        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state, session=first)],
            [a["id"]],
        )
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state, session=second)],
            [b["id"]],
        )

    def test_briefs_and_reports_dirs_are_under_state_dir(self):
        self.assertEqual(
            task_store.briefs_dir(self.state), os.path.join(self.state, "briefs")
        )
        self.assertEqual(
            task_store.reports_dir(self.state), os.path.join(self.state, "reports")
        )


class PruneTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_prune_archives_closed_tasks_only(self):
        open_task = task_store.create(self.state, "acme", "open", "g", ["c"])
        done = task_store.create(self.state, "acme", "done", "g", ["c"])
        task_store.update(self.state, done["id"], status="approved")

        moved = task_store.prune(self.state)

        self.assertEqual(moved, [done["id"]])
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state)], [open_task["id"]]
        )
        self.assertTrue(
            os.path.isfile(
                os.path.join(task_store.archive_dir(self.state), f"{done['id']}.json")
            )
        )

    def test_prune_can_scope_to_a_session(self):
        first = task_store.new_session(self.state)
        a = task_store.create(self.state, "acme", "a", "g", ["c"])
        task_store.update(self.state, a["id"], status="approved")
        task_store.end_session(self.state)
        task_store.new_session(self.state)
        b = task_store.create(self.state, "acme", "b", "g", ["c"])
        task_store.update(self.state, b["id"], status="approved")

        moved = task_store.prune(self.state, session=first)

        self.assertEqual(moved, [a["id"]])
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state)], [b["id"]]
        )


class FindingsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name
        self.task = task_store.create(self.state, "acme", "t", "g", ["criterion holds"])

    def add(self, **finding):
        return task_store.record_findings(self.state, self.task["id"], [finding])

    def test_validate_applies_defaults(self):
        finding = task_store.validate_finding({"title": "something"})

        self.assertEqual(finding["severity"], "major")
        self.assertEqual(finding["category"], "bug")
        self.assertEqual(finding["status"], "open")

    def test_rejects_bad_severity_category_and_status(self):
        for bad in (
            {"title": "t", "severity": "huge"},
            {"title": "t", "category": "vibes"},
            {"title": "t", "status": "maybe"},
            {"severity": "major"},
        ):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                task_store.validate_finding(bad)

    def test_record_findings_accumulates(self):
        self.add(title="one")
        task = self.add(title="two", severity="nit", category="quality")

        self.assertEqual(len(task["findings"]), 2)

    def test_verdict_fails_on_open_blocking_finding(self):
        task = self.add(title="broken", severity="major", category="bug")

        self.assertEqual(task_store.verdict(task), "fail")

    def test_verdict_passes_when_only_minor_findings_remain(self):
        task = self.add(title="style", severity="minor", category="quality")

        self.assertEqual(task_store.verdict(task), "pass")

    def test_resolved_finding_does_not_block(self):
        task = self.add(title="broken", severity="blocker", status="resolved")

        self.assertEqual(task_store.verdict(task), "pass")

    def test_verdict_honours_an_inconclusive_override(self):
        task = task_store.update(self.state, self.task["id"], verdict="inconclusive")

        self.assertEqual(task_store.verdict(task), "inconclusive")

    def test_verdict_clears_the_override_back_to_pass(self):
        task_store.update(self.state, self.task["id"], verdict="inconclusive")

        task = task_store.update(self.state, self.task["id"], verdict=None)

        self.assertEqual(task_store.verdict(task), "pass")

    def test_an_open_blocking_finding_beats_the_override(self):
        self.add(title="broken", severity="major")
        task = task_store.update(self.state, self.task["id"], verdict="inconclusive")

        self.assertEqual(task_store.verdict(task), "fail")

    def test_update_rejects_an_unknown_verdict(self):
        with self.assertRaises(ValueError):
            task_store.update(self.state, self.task["id"], verdict="maybe")

    def test_resolve_findings_closes_all_or_selected(self):
        self.add(title="one", severity="major")
        self.add(title="two", severity="major")

        task = task_store.resolve_findings(self.state, self.task["id"], indexes=[0])

        self.assertEqual(task["findings"][0]["status"], "resolved")
        self.assertEqual(task["findings"][1]["status"], "open")
        self.assertEqual(task_store.verdict(task), "fail")

        task = task_store.resolve_findings(self.state, self.task["id"])
        self.assertEqual(task_store.verdict(task), "pass")


if __name__ == "__main__":
    unittest.main()
