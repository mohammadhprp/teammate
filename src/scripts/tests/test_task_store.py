"""Tests for the file-backed task store."""

import json
import os
import tempfile
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

    def test_append_event_writes_jsonl(self):
        task_store.append_event(self.state, "tsk_x", "worker.spawned", "acme-1")

        with open(os.path.join(self.state, "timeline.jsonl")) as fh:
            event = json.loads(fh.readline())
        self.assertEqual(event["kind"], "worker.spawned")
        self.assertEqual(event["task"], "tsk_x")
        self.assertEqual(event["summary"], "acme-1")


if __name__ == "__main__":
    unittest.main()
