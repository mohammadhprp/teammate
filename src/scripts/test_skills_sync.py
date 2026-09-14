"""Tests for distributing common and worker skills into a target project."""

import os
import tempfile
import unittest

import tm


def _make_skill(root, name):
    path = os.path.join(root, name)
    os.makedirs(path)
    with open(os.path.join(path, "SKILL.md"), "w") as fh:
        fh.write(f"---\nname: {name}\n---\n")


class SyncSkillsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.source = os.path.join(self.tmp.name, "source")
        self.project = os.path.join(self.tmp.name, "project")
        os.makedirs(self.project)
        for name in ("verify-evidence", "worker-role"):
            _make_skill(self.source, name)
        self.config = {
            "skills_source": self.source,
            "worker_skills": ["verify-evidence", "worker-role"],
        }

    def test_syncs_configured_skills(self):
        installed, skipped, target = tm.sync_skills(self.config, self.project)

        self.assertEqual(sorted(installed), ["verify-evidence", "worker-role"])
        self.assertEqual(skipped, [])
        self.assertTrue(os.path.isfile(os.path.join(target, "worker-role", "SKILL.md")))

    def test_is_idempotent(self):
        tm.sync_skills(self.config, self.project)
        installed, skipped, _ = tm.sync_skills(self.config, self.project)

        self.assertEqual(sorted(installed), ["verify-evidence", "worker-role"])
        self.assertEqual(skipped, [])

    def test_does_not_clobber_a_project_owned_skill(self):
        owned = os.path.join(self.project, tm.SKILLS_SUBDIR, "verify-evidence")
        os.makedirs(owned)
        with open(os.path.join(owned, "SKILL.md"), "w") as fh:
            fh.write("the project owns this\n")

        installed, skipped, _ = tm.sync_skills(self.config, self.project)

        self.assertEqual(installed, ["worker-role"])
        self.assertEqual(skipped, ["verify-evidence"])
        with open(os.path.join(owned, "SKILL.md")) as fh:
            self.assertEqual(fh.read(), "the project owns this\n")

    def test_missing_source_is_reported_not_fatal(self):
        self.config["worker_skills"] = ["does-not-exist"]
        installed, skipped, _ = tm.sync_skills(self.config, self.project)

        self.assertEqual(installed, [])
        self.assertEqual(skipped, ["does-not-exist"])

    def test_updates_a_previously_managed_skill(self):
        tm.sync_skills(self.config, self.project)
        with open(os.path.join(self.source, "worker-role", "SKILL.md"), "w") as fh:
            fh.write("---\nname: worker-role\nversion: 2\n---\n")

        tm.sync_skills(self.config, self.project)

        with open(
            os.path.join(self.project, tm.SKILLS_SUBDIR, "worker-role", "SKILL.md")
        ) as fh:
            self.assertIn("version: 2", fh.read())


if __name__ == "__main__":
    unittest.main()
