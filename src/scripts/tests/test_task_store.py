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
        path = os.path.join(
            task_store.tasks_dir(self.state, "acme"), f"{task['id']}.json"
        )
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

        with open(task_store.timeline_path(self.state, "acme")) as fh:
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
        working = task_store.list_tasks(self.state, status="working")

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
        task_store.append_event(self.state, "acme", "tsk_x", "worker.spawned", "acme-1")

        with open(task_store.timeline_path(self.state, "acme")) as fh:
            event = json.loads(fh.readline())
        self.assertEqual(event["kind"], "worker.spawned")
        self.assertEqual(event["task"], "tsk_x")
        self.assertEqual(event["summary"], "acme-1")


class SlugTest(unittest.TestCase):
    def test_lowercases_and_collapses_disallowed_runs(self):
        self.assertEqual(task_store.slug("My  Project!!"), "my-project")

    def test_keeps_the_allowed_punctuation(self):
        self.assertEqual(task_store.slug("a_b.c-d"), "a_b.c-d")

    def test_trims_leading_and_trailing_separators(self):
        self.assertEqual(task_store.slug("  Acme!!  "), "acme")

    def test_a_name_with_no_slug_characters_falls_back(self):
        self.assertEqual(task_store.slug("!!!"), "project")
        self.assertEqual(task_store.slug(""), "project")


class ProjectPathsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_every_path_is_scoped_to_the_slug(self):
        base = os.path.join(self.state, "my-project")

        self.assertEqual(task_store.project_dir(self.state, "My Project"), base)
        self.assertEqual(
            task_store.tasks_dir(self.state, "My Project"),
            os.path.join(base, "tasks"),
        )
        self.assertEqual(
            task_store.archive_dir(self.state, "My Project"),
            os.path.join(base, "archive"),
        )
        self.assertEqual(
            task_store.briefs_dir(self.state, "My Project"),
            os.path.join(base, "briefs"),
        )
        self.assertEqual(
            task_store.reports_dir(self.state, "My Project"),
            os.path.join(base, "reports"),
        )
        self.assertEqual(
            task_store.session_path(self.state, "My Project"),
            os.path.join(base, "session.json"),
        )
        self.assertEqual(
            task_store.checkpoint_path(self.state, "My Project"),
            os.path.join(base, "checkpoint.json"),
        )
        self.assertEqual(
            task_store.timeline_path(self.state, "My Project"),
            os.path.join(base, "timeline.jsonl"),
        )


class CrossProjectTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_list_tasks_spans_projects_and_can_filter_to_one(self):
        acme = task_store.create(self.state, "acme", "a", "g", ["c"])
        beta = task_store.create(self.state, "Beta Project", "b", "g", ["c"])

        everywhere = {task["id"] for task in task_store.list_tasks(self.state)}

        self.assertEqual(everywhere, {acme["id"], beta["id"]})
        self.assertEqual(
            [task["id"] for task in task_store.list_tasks(self.state, "acme")],
            [acme["id"]],
        )
        self.assertEqual(
            [task["id"] for task in task_store.list_tasks(self.state, "Beta Project")],
            [beta["id"]],
        )

    def test_load_finds_a_task_in_any_project(self):
        acme = task_store.create(self.state, "acme", "a", "g", ["c"])
        beta = task_store.create(self.state, "beta", "b", "g", ["c"])

        self.assertEqual(task_store.load(self.state, acme["id"])["project"], "acme")
        self.assertEqual(task_store.load(self.state, beta["id"])["project"], "beta")

    def test_load_falls_back_to_a_legacy_root_task(self):
        legacy = os.path.join(self.state, "tasks")
        os.makedirs(legacy)
        task = {"id": "tsk_legacy", "project": "acme", "status": "planned"}
        with open(os.path.join(legacy, "tsk_legacy.json"), "w") as fh:
            json.dump(task, fh)

        self.assertEqual(task_store.load(self.state, "tsk_legacy")["project"], "acme")
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state, "acme")],
            ["tsk_legacy"],
        )

    def test_open_sessions_spans_projects(self):
        first = task_store.new_session(self.state, "acme")
        second = task_store.new_session(self.state, "beta")

        self.assertEqual(task_store.open_sessions(self.state), {first, second})


class SessionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_new_session_is_open_until_ended(self):
        session = task_store.new_session(self.state, "acme")

        self.assertTrue(session.startswith("sess_"))
        self.assertEqual(task_store.current_session(self.state, "acme"), session)
        self.assertEqual(task_store.end_session(self.state, "acme"), session)
        self.assertIsNone(task_store.current_session(self.state, "acme"))

    def test_sessions_are_isolated_per_project(self):
        acme = task_store.new_session(self.state, "acme")
        beta = task_store.new_session(self.state, "beta")

        self.assertEqual(task_store.current_session(self.state, "acme"), acme)
        self.assertEqual(task_store.current_session(self.state, "beta"), beta)

    def test_created_tasks_are_tagged_with_the_open_session(self):
        session = task_store.new_session(self.state, "acme")

        task = task_store.create(self.state, "acme", "t", "g", ["c"])

        self.assertEqual(task["session"], session)

    def test_list_filters_by_session(self):
        first = task_store.new_session(self.state, "acme")
        a = task_store.create(self.state, "acme", "a", "g", ["c"])
        task_store.end_session(self.state, "acme")
        second = task_store.new_session(self.state, "acme")
        b = task_store.create(self.state, "acme", "b", "g", ["c"])

        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state, session=first)],
            [a["id"]],
        )
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state, session=second)],
            [b["id"]],
        )

    def test_briefs_and_reports_dirs_are_under_the_project(self):
        self.assertEqual(
            task_store.briefs_dir(self.state, "acme"),
            os.path.join(self.state, "acme", "briefs"),
        )
        self.assertEqual(
            task_store.reports_dir(self.state, "acme"),
            os.path.join(self.state, "acme", "reports"),
        )

    def test_checkpoint_round_trips_and_overwrites(self):
        self.assertIsNone(task_store.read_checkpoint(self.state, "acme"))

        path = task_store.write_checkpoint(self.state, "acme", {"goal": "one"})

        self.assertEqual(path, os.path.join(self.state, "acme", "checkpoint.json"))
        self.assertEqual(task_store.read_checkpoint(self.state, "acme")["goal"], "one")

        task_store.write_checkpoint(self.state, "acme", {"goal": "two"})

        self.assertEqual(task_store.read_checkpoint(self.state, "acme")["goal"], "two")

    def test_read_checkpoint_ignores_a_corrupt_file(self):
        path = task_store.checkpoint_path(self.state, "acme")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write("not json")

        self.assertIsNone(task_store.read_checkpoint(self.state, "acme"))


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
                os.path.join(
                    task_store.archive_dir(self.state, "acme"), f"{done['id']}.json"
                )
            )
        )

    def test_prune_can_scope_to_a_session(self):
        first = task_store.new_session(self.state, "acme")
        a = task_store.create(self.state, "acme", "a", "g", ["c"])
        task_store.update(self.state, a["id"], status="approved")
        task_store.end_session(self.state, "acme")
        task_store.new_session(self.state, "acme")
        b = task_store.create(self.state, "acme", "b", "g", ["c"])
        task_store.update(self.state, b["id"], status="approved")

        moved = task_store.prune(self.state, session=first)

        self.assertEqual(moved, [a["id"]])
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state)], [b["id"]]
        )

    def test_prune_can_scope_to_a_project(self):
        acme = task_store.create(self.state, "acme", "a", "g", ["c"])
        beta = task_store.create(self.state, "beta", "b", "g", ["c"])
        task_store.update(self.state, acme["id"], status="approved")
        task_store.update(self.state, beta["id"], status="approved")

        moved = task_store.prune(self.state, project="acme")

        self.assertEqual(moved, [acme["id"]])
        self.assertEqual(
            [t["id"] for t in task_store.list_tasks(self.state)], [beta["id"]]
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


class ProjectRegistryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name

    def test_register_then_list_round_trip(self):
        root = os.path.join(self.tmp.name, "acme")

        task_store.register_project(self.state, "acme", root)

        self.assertEqual(task_store.list_projects(self.state), {"acme": root})

    def test_root_is_stored_absolute(self):
        root = os.path.join(self.tmp.name, "acme", "..", "acme")

        stored = task_store.register_project(self.state, "acme", root)

        self.assertEqual(stored, os.path.abspath(root))
        self.assertTrue(os.path.isabs(stored))

    def test_rebinding_a_name_to_a_different_root_is_refused(self):
        first = os.path.join(self.tmp.name, "one")
        second = os.path.join(self.tmp.name, "two")
        task_store.register_project(self.state, "acme", first)

        with self.assertRaises(ValueError):
            task_store.register_project(self.state, "acme", second)

        self.assertEqual(task_store.list_projects(self.state)["acme"], first)

    def test_force_rebinds_a_name(self):
        task_store.register_project(
            self.state, "acme", os.path.join(self.tmp.name, "one")
        )
        second = os.path.join(self.tmp.name, "two")

        task_store.register_project(self.state, "acme", second, force=True)

        self.assertEqual(task_store.list_projects(self.state)["acme"], second)

    def test_reregistering_the_same_root_is_a_noop(self):
        root = os.path.join(self.tmp.name, "acme")
        task_store.register_project(self.state, "acme", root)

        task_store.register_project(self.state, "acme", root)

        self.assertEqual(task_store.list_projects(self.state), {"acme": root})

    def test_listing_without_a_registry_is_empty(self):
        self.assertEqual(task_store.list_projects(self.state), {})

    def test_an_empty_name_is_rejected(self):
        with self.assertRaises(ValueError):
            task_store.register_project(self.state, "", self.tmp.name)


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.state = self.tmp.name
        self.seed()

    def write(self, relative, data):
        path = os.path.join(self.state, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as fh:
            fh.write(data)

    def write_task(self, folder, task_id, project, session=None):
        task = {
            "id": task_id,
            "project": project,
            "session": session,
            "status": "planned",
            "created_at": 0,
            "updated_at": 0,
        }
        self.write(os.path.join(folder, f"{task_id}.json"), json.dumps(task) + "\n")

    def seed(self):
        self.write_task("tasks", "tsk_a", "acme", "sess_one")
        self.write_task("tasks", "tsk_b", "acme", "sess_one")
        self.write_task("archive", "tsk_c", "Beta Project")
        self.write("briefs/tsk_a-developer-alpha.md", "brief a\n")
        self.write("briefs/worker-only.md", "orphan\n")
        self.write("reports/tsk_b-developer-beta-123.md", "report b\n")
        self.write("session.json", json.dumps({"id": "sess_one"}) + "\n")
        events = [
            {"at": 1, "task": "tsk_a", "kind": "task.created", "summary": "a"},
            {"at": 2, "task": "sess_one", "kind": "session.started", "summary": "s"},
            {"at": 3, "task": "tsk_unknown", "kind": "task.created", "summary": "u"},
        ]
        self.write(
            "timeline.jsonl",
            "\n".join(json.dumps(e, sort_keys=True) for e in events) + "\n",
        )

    def snapshot(self):
        files = {}
        for dirpath, _, names in os.walk(self.state):
            for name in names:
                path = os.path.join(dirpath, name)
                with open(path) as fh:
                    files[os.path.relpath(path, self.state)] = fh.read()
        return files

    def test_migrates_into_project_directories(self):
        report = task_store.migrate(self.state)

        self.assertTrue(
            os.path.isfile(os.path.join(self.state, "acme", "tasks", "tsk_a.json"))
        )
        self.assertTrue(
            os.path.isfile(os.path.join(self.state, "acme", "tasks", "tsk_b.json"))
        )
        self.assertTrue(
            os.path.isfile(
                os.path.join(self.state, "beta-project", "archive", "tsk_c.json")
            )
        )
        self.assertTrue(
            os.path.isfile(
                os.path.join(self.state, "acme", "briefs", "tsk_a-developer-alpha.md")
            )
        )
        self.assertTrue(
            os.path.isfile(
                os.path.join(
                    self.state, "acme", "reports", "tsk_b-developer-beta-123.md"
                )
            )
        )
        self.assertTrue(
            os.path.isfile(os.path.join(self.state, "acme", "session.json"))
        )
        self.assertFalse(os.path.exists(os.path.join(self.state, "tasks")))
        self.assertFalse(os.path.exists(os.path.join(self.state, "session.json")))
        self.assertIn(
            os.path.join(self.state, "briefs", "worker-only.md"), report["left"]
        )

    def test_timeline_is_split_and_unattributable_events_stay(self):
        task_store.migrate(self.state)

        with open(os.path.join(self.state, "acme", "timeline.jsonl")) as fh:
            moved = [json.loads(line) for line in fh if line.strip()]
        with open(os.path.join(self.state, "timeline.jsonl")) as fh:
            left = [json.loads(line) for line in fh if line.strip()]

        self.assertEqual([event["task"] for event in moved], ["tsk_a", "sess_one"])
        self.assertEqual([event["task"] for event in left], ["tsk_unknown"])

    def test_second_run_is_a_noop(self):
        task_store.migrate(self.state)
        before = self.snapshot()

        report = task_store.migrate(self.state)

        self.assertEqual(report["moved"], [])
        self.assertEqual(self.snapshot(), before)

    def test_a_task_without_a_project_stays_at_the_root(self):
        self.write_task("tasks", "tsk_np", None)

        report = task_store.migrate(self.state)

        self.assertTrue(
            os.path.isfile(os.path.join(self.state, "tasks", "tsk_np.json"))
        )
        self.assertIn(os.path.join(self.state, "tasks", "tsk_np.json"), report["left"])

    def test_a_session_spanning_projects_stays_at_the_root(self):
        self.write_task("tasks", "tsk_x", "acme", "sess_two")
        self.write_task("tasks", "tsk_y", "Beta Project", "sess_two")
        self.write("session.json", json.dumps({"id": "sess_two"}) + "\n")

        report = task_store.migrate(self.state)

        self.assertTrue(os.path.isfile(os.path.join(self.state, "session.json")))
        self.assertIn(os.path.join(self.state, "session.json"), report["left"])

    def test_nothing_to_migrate_is_cheap_and_empty(self):
        clean = tempfile.TemporaryDirectory()
        self.addCleanup(clean.cleanup)

        report = task_store.migrate(clean.name)

        self.assertEqual(report, {"moved": [], "left": []})


if __name__ == "__main__":
    unittest.main()
