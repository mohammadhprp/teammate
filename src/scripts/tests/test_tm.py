"""Tests for the tm CLI: argument parsing and the git exclude it maintains."""

import os
import subprocess
import tempfile
import unittest

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


if __name__ == "__main__":
    unittest.main()
