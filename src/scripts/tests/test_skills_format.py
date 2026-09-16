"""Validate the YAML frontmatter of every skill in the library.

Repo-only: ``install.sh`` excludes ``src/scripts/tests/`` from the installed
overlay, so this test does not ship to target projects.
"""

import glob
import os
import unittest

_REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
_SKILLS_DIR = os.path.join(_REPO_ROOT, "src", "skills")


def _skill_paths():
    """Return the SKILL.md path of every skill directory, sorted."""
    return sorted(glob.glob(os.path.join(_SKILLS_DIR, "*", "SKILL.md")))


def _frontmatter_lines(path):
    """Return the lines inside the leading ``---`` block, or raise ValueError."""
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError(f"{path}: does not start with a '---' frontmatter block")
    for index, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return lines[1:index]
    raise ValueError(f"{path}: frontmatter block is not closed by a '---' line")


def _fields(path):
    """Return the frontmatter ``key: value`` fields as a dict."""
    fields = {}
    for line in _frontmatter_lines(path):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip().strip('"').strip("'")
    return fields


class SkillFormatTest(unittest.TestCase):
    def test_skill_directories_found(self):
        paths = _skill_paths()
        self.assertTrue(
            paths, f"no SKILL.md found under {_SKILLS_DIR}; the path is wrong"
        )

    def test_frontmatter_block_is_delimited(self):
        for path in _skill_paths():
            with self.subTest(skill=path):
                try:
                    _frontmatter_lines(path)
                except ValueError as exc:
                    self.fail(str(exc))

    def test_name_matches_directory(self):
        for path in _skill_paths():
            with self.subTest(skill=path):
                dirname = os.path.basename(os.path.dirname(path))
                try:
                    name = _fields(path).get("name")
                except ValueError as exc:
                    self.fail(str(exc))
                self.assertEqual(
                    name,
                    dirname,
                    f"{path}: frontmatter 'name' must match its directory "
                    f"name {dirname!r}, got {name!r}",
                )

    def test_description_is_non_empty(self):
        for path in _skill_paths():
            with self.subTest(skill=path):
                try:
                    description = _fields(path).get("description")
                except ValueError as exc:
                    self.fail(str(exc))
                self.assertTrue(
                    description,
                    f"{path}: frontmatter 'description' must be non-empty",
                )


if __name__ == "__main__":
    unittest.main()
