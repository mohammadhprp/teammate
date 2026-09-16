"""Tests for the visual-report HTML renderer."""

import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest

_REPO_ROOT = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)
_RENDERER = os.path.join(
    _REPO_ROOT, "src", "skills", "visual-report", "scripts", "render_report.py"
)


def _load_renderer():
    spec = importlib.util.spec_from_file_location("render_report", _RENDERER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


render_report = _load_renderer()


class RenderReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def render(self, manifest):
        manifest_path = os.path.join(self.tmp.name, "report.json")
        with open(manifest_path, "w") as fh:
            json.dump(manifest, fh)
        out = os.path.join(self.tmp.name, "report.html")
        with contextlib.redirect_stdout(io.StringIO()):
            render_report.main([manifest_path, "--out", out])
        with open(out) as fh:
            return fh.read()

    def test_renders_title_and_summary(self):
        html = self.render({"title": "Dark mode", "summary": "It works."})

        self.assertIn("Dark mode", html)
        self.assertIn("It works.", html)
        self.assertIn("<!doctype html>", html)

    def test_renders_the_handoff_sections_and_decision(self):
        html = self.render(
            {
                "title": "t",
                "sections": {
                    "requested": "Add subtract.",
                    "verified": "`pytest` 3 passed.",
                    "decision": "Approve or reject.",
                },
            }
        )

        self.assertIn("Requested", html)
        self.assertIn("Add subtract.", html)
        self.assertIn("<code>pytest</code>", html)
        self.assertIn("Approve or reject.", html)

    def test_embeds_an_image_as_a_data_uri(self):
        with open(os.path.join(self.tmp.name, "after.svg"), "w") as fh:
            fh.write('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

        html = self.render(
            {
                "title": "t",
                "blocks": [{"type": "image", "src": "after.svg", "caption": "After"}],
            }
        )

        self.assertIn("data:image/svg+xml;base64,", html)
        self.assertIn("After", html)

    def test_a_missing_image_becomes_an_honest_placeholder(self):
        html = self.render(
            {"title": "t", "blocks": [{"type": "image", "src": "missing.png"}]}
        )

        self.assertIn("Artifact not captured", html)
        self.assertNotIn("data:image", html)

    def test_unknown_block_does_not_crash(self):
        html = self.render({"title": "t", "blocks": [{"type": "hologram"}]})

        self.assertIn("Unknown block type: hologram", html)

    def test_findings_and_checks_render(self):
        html = self.render(
            {
                "title": "t",
                "checks": [
                    {"name": "unit tests", "command": "pytest", "result": "pass"}
                ],
                "findings": [
                    {
                        "severity": "major",
                        "title": "Crash on empty input",
                        "status": "resolved",
                    }
                ],
            }
        )

        self.assertIn("unit tests", html)
        self.assertIn("Crash on empty input", html)
        self.assertIn("resolved", html)


if __name__ == "__main__":
    unittest.main()
