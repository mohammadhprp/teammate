#!/usr/bin/env python3
"""Render a Team Mate report manifest to one self-contained HTML file.

The manifest is JSON (see ``references/report-schema.md``). Images are embedded
as data URIs, so the output opens offline with no network and no side files.

This script only formats: it never invents content. A missing artifact is
rendered as an explicit "missing" placeholder rather than dropped, so the
report stays honest about what was not captured.
"""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import os
import re
import sys

IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}

SECTION_ORDER = (
    ("requested", "Requested"),
    ("implemented", "Implemented"),
    ("changed", "Changed"),
    ("verified", "Verified"),
    ("assessment", "Assessment"),
)


def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def inline(value):
    """Escape then apply the two inline forms a report needs: code and bold."""
    text = esc(value)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return text


def markdown(value):
    """A deliberately small block renderer: paragraphs and ``- `` bullets."""
    paragraphs, bullets = [], []

    def flush():
        if bullets:
            paragraphs.append(
                "<ul>" + "".join(f"<li>{item}</li>" for item in bullets) + "</ul>"
            )
            bullets.clear()

    for raw in str(value).splitlines():
        line = raw.rstrip()
        if line.startswith("- "):
            bullets.append(inline(line[2:]))
        elif not line.strip():
            flush()
        else:
            flush()
            paragraphs.append(f"<p>{inline(line)}</p>")
    flush()
    return "\n".join(paragraphs)


def data_uri(path, base_dir):
    """Embed an image as a data URI, or return ``None`` when it is missing."""
    full = path if os.path.isabs(path) else os.path.join(base_dir, path)
    if not os.path.isfile(full):
        return None
    mime = IMAGE_MIME.get(os.path.splitext(full)[1].lower())
    if mime is None:
        mime = mimetypes.guess_type(full)[0] or "application/octet-stream"
    with open(full, "rb") as fh:
        encoded = base64.b64encode(fh.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def figure(src, caption, base_dir):
    uri = data_uri(src, base_dir)
    label = f"<figcaption>{inline(caption)}</figcaption>" if caption else ""
    if uri is None:
        return (
            '<figure class="figure figure--missing">'
            f'<div class="missing">Artifact not captured<br><code>{esc(src)}</code></div>'
            f"{label}</figure>"
        )
    return (
        '<figure class="figure">'
        f'<img src="{uri}" alt="{esc(caption or "report artifact")}">{label}</figure>'
    )


def block_image(block, base_dir):
    return figure(block.get("src", ""), block.get("caption"), base_dir)


def block_images(block, base_dir):
    items = block.get("items") or []
    figures = "".join(
        figure(item.get("src", ""), item.get("caption"), base_dir) for item in items
    )
    return f'<div class="gallery">{figures}</div>'


def block_code(block, base_dir):
    before, after = block.get("before"), block.get("after")
    language = esc(block.get("language", ""))
    if before is not None and after is not None:
        return (
            '<div class="split">'
            f'<div><div class="tag tag--before">before</div><pre class="code">'
            f'<code data-lang="{language}">{esc(before)}</code></pre></div>'
            f'<div><div class="tag tag--after">after</div><pre class="code">'
            f'<code data-lang="{language}">{esc(after)}</code></pre></div>'
            "</div>"
        )
    text = after if after is not None else before
    return f'<pre class="code"><code data-lang="{language}">{esc(text)}</code></pre>'


def block_diff(block, base_dir):
    rows = []
    for line in str(block.get("text", "")).splitlines():
        if line.startswith("+++") or line.startswith("---"):
            css = "diff--head"
        elif line.startswith("+"):
            css = "diff--add"
        elif line.startswith("-"):
            css = "diff--del"
        elif line.startswith("@@"):
            css = "diff--hunk"
        else:
            css = "diff--ctx"
        rows.append(f'<span class="diff-line {css}">{esc(line) or "&nbsp;"}</span>')
    return f'<pre class="diff">{"".join(rows)}</pre>'


def block_example(block, base_dir):
    input_label = block.get("input_label", "input")
    output_label = block.get("output_label", "output")
    note = block.get("note")
    return (
        '<div class="split">'
        f'<div><div class="tag">{esc(input_label)}</div><pre class="code">'
        f"<code>{esc(block.get('input', ''))}</code></pre></div>"
        f'<div><div class="tag">{esc(output_label)}</div><pre class="code">'
        f"<code>{esc(block.get('output', ''))}</code></pre></div>"
        "</div>" + (f'<p class="note">{inline(note)}</p>' if note else "")
    )


def result_badge(result):
    value = (result or "").lower()
    css = {"pass": "ok", "fail": "bad", "warn": "warn", "skip": "muted"}.get(
        value, "muted"
    )
    return f'<span class="badge badge--{css}">{esc(value or "—")}</span>'


def block_checks(block, base_dir):
    rows = []
    for item in block.get("items") or []:
        output = item.get("output")
        detail = (
            f'<pre class="code code--tight"><code>{esc(output)}</code></pre>'
            if output
            else ""
        )
        rows.append(
            "<tr>"
            f"<td><strong>{inline(item.get('name', ''))}</strong></td>"
            f"<td><code>{esc(item.get('command', ''))}</code></td>"
            f"<td>{result_badge(item.get('result'))}</td>"
            f"<td>{detail}</td>"
            "</tr>"
        )
    return (
        '<table class="table"><thead><tr><th>Check</th><th>Command</th>'
        "<th>Result</th><th>Output</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def severity_class(severity):
    return {
        "blocker": "bad",
        "major": "bad",
        "minor": "warn",
        "nit": "muted",
    }.get((severity or "").lower(), "muted")


def status_class(status):
    return {
        "open": "warn",
        "resolved": "ok",
        "accepted": "muted",
    }.get((status or "").lower(), "muted")


def findings_table(items):
    rows = []
    for item in items:
        where = item.get("file") or ""
        if item.get("line"):
            where = f"{where}:{item['line']}" if where else str(item["line"])
        suggestion = item.get("suggestion")
        detail = item.get("detail")
        body = ""
        if detail:
            body += f'<div class="finding-detail">{inline(detail)}</div>'
        if suggestion:
            body += f'<div class="finding-fix">fix: {inline(suggestion)}</div>'
        rows.append(
            "<tr>"
            f'<td><span class="badge badge--{severity_class(item.get("severity"))}">'
            f"{esc(item.get('severity', ''))}</span></td>"
            f"<td>{esc(item.get('category', ''))}</td>"
            f"<td><strong>{inline(item.get('title', ''))}</strong>"
            f"{f"<div class='where'>{esc(where)}</div>" if where else ''}{body}</td>"
            f'<td><span class="badge badge--{status_class(item.get("status"))}">'
            f"{esc(item.get('status', 'open'))}</span></td>"
            "</tr>"
        )
    return (
        '<table class="table"><thead><tr><th>Severity</th><th>Category</th>'
        "<th>Finding</th><th>Status</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )


def render_block(block, base_dir):
    kind = block.get("type")
    if kind == "image":
        return block_image(block, base_dir)
    if kind == "images":
        return block_images(block, base_dir)
    if kind == "code":
        return block_code(block, base_dir)
    if kind == "diff":
        return block_diff(block, base_dir)
    if kind == "example":
        return block_example(block, base_dir)
    if kind == "checks":
        return block_checks(block, base_dir)
    if kind == "findings":
        return findings_table(block.get("items") or [])
    if kind == "markdown":
        return f'<div class="prose">{markdown(block.get("text", ""))}</div>'
    return (
        '<div class="prose unknown">'
        f"<p><em>Unknown block type: {esc(kind)}</em></p></div>"
    )


def block_section(block, base_dir):
    rendered = render_block(block, base_dir)
    label = block.get("label")
    heading = f"<h2>{inline(label)}</h2>" if label else ""
    return f'<section class="block">{heading}{rendered}</section>'


def sections_html(sections):
    cards = []
    for key, title in SECTION_ORDER:
        value = sections.get(key)
        if not value:
            continue
        cards.append(
            f'<section class="card"><h2>{title}</h2>{markdown(value)}</section>'
        )
    return "".join(cards)


def decision_html(sections):
    value = sections.get("decision")
    if not value:
        return ""
    return (
        '<section class="decision"><div class="decision-label">Decision</div>'
        f'<div class="decision-body">{markdown(value)}</div></section>'
    )


def verdict_class(verdict):
    return {
        "pass": "ok",
        "fail": "bad",
        "inconclusive": "warn",
    }.get((verdict or "").lower(), "muted")


def chip(text):
    return f'<span class="chip">{esc(text)}</span>' if text else ""


def build_html(manifest, base_dir):
    title = manifest.get("title", "Team Mate report")
    sections = manifest.get("sections") or {}
    blocks = manifest.get("blocks") or []
    findings = manifest.get("findings") or []
    checks = manifest.get("checks") or []

    meta = "".join(
        [
            chip(f"task {manifest['task']}") if manifest.get("task") else "",
            chip(f"project {manifest['project']}") if manifest.get("project") else "",
            chip(f"iteration {manifest['iteration']}")
            if manifest.get("iteration")
            else "",
            (
                f'<span class="badge badge--muted">{esc(manifest["status"])}</span>'
                if manifest.get("status")
                else ""
            ),
            (
                f'<span class="badge badge--{verdict_class(manifest.get("verdict"))}">'
                f"verdict: {esc(manifest['verdict'])}</span>"
                if manifest.get("verdict")
                else ""
            ),
        ]
    )
    summary = (
        f'<p class="summary">{inline(manifest["summary"])}</p>'
        if manifest.get("summary")
        else ""
    )
    blocks_html = "".join(block_section(block, base_dir) for block in blocks)
    findings_html = (
        f'<section class="card"><h2>Findings</h2>{findings_table(findings)}</section>'
        if findings
        else ""
    )
    checks_html = (
        f'<section class="card"><h2>Checks</h2>{block_checks({"items": checks}, base_dir)}</section>'
        if checks
        else ""
    )
    generated = (
        f'<span class="generated">generated {esc(manifest["generated_at"])}</span>'
        if manifest.get("generated_at")
        else ""
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} — Team Mate report</title>
<style>{CSS}</style>
</head>
<body>
<main class="page">
  <header class="hero">
    <div class="kicker">Team Mate report</div>
    <h1>{esc(title)}</h1>
    {summary}
    <div class="meta">{meta}</div>
    {generated}
  </header>
  {blocks_html}
  <div class="sections">{sections_html(sections)}</div>
  {checks_html}
  {findings_html}
  {decision_html(sections)}
  <footer class="footer">Rendered by the <code>visual-report</code> skill.</footer>
</main>
</body>
</html>
"""


CSS = """
:root {
  --bg: #f5f6f8; --card: #ffffff; --ink: #16181d; --muted: #5b6270;
  --line: #e3e6ea; --accent: #2f6fed; --ok: #1a7f4b; --ok-bg: #e6f4ec;
  --bad: #c0392b; --bad-bg: #fbecea; --warn: #9a6b00; --warn-bg: #fdf3da;
  --muted-bg: #eef0f3; --code-bg: #1b1e24; --code-ink: #e7e9ee;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
.page { max-width: 1040px; margin: 0 auto; padding: 32px 24px 64px; }
.hero { background: var(--card); border: 1px solid var(--line); border-radius: 14px;
  padding: 28px 28px 22px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 11px;
  font-weight: 700; color: var(--accent); }
h1 { font-size: 26px; line-height: 1.25; margin: 8px 0 10px; }
.summary { font-size: 16px; color: #2b2f38; margin: 0 0 16px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chip { font-size: 12px; color: var(--muted); background: var(--muted-bg);
  border-radius: 999px; padding: 3px 10px; }
.badge { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }
.badge--ok { color: var(--ok); background: var(--ok-bg); }
.badge--bad { color: var(--bad); background: var(--bad-bg); }
.badge--warn { color: var(--warn); background: var(--warn-bg); }
.badge--muted { color: var(--muted); background: var(--muted-bg); }
.generated { display: block; margin-top: 10px; font-size: 12px; color: var(--muted); }
.block, .card { background: var(--card); border: 1px solid var(--line);
  border-radius: 14px; padding: 20px 24px; margin-top: 18px;
  box-shadow: 0 1px 2px rgba(0,0,0,.04); }
h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em;
  color: var(--muted); margin: 0 0 12px; }
.prose p { margin: 0 0 10px; }
.prose ul { margin: 0 0 10px; padding-left: 20px; }
.prose code, .where, .finding-detail code { background: var(--muted-bg);
  border-radius: 4px; padding: 1px 5px; font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.gallery, .split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.gallery .figure:only-child { grid-column: 1 / -1; }
@media (max-width: 760px) { .gallery, .split { grid-template-columns: 1fr; } }
.figure { margin: 0; }
.figure img { width: 100%; height: auto; display: block; border: 1px solid var(--line);
  border-radius: 10px; background: #fff; }
.figure figcaption { margin-top: 6px; font-size: 12px; color: var(--muted); }
.figure--missing .missing { border: 1px dashed #c9ccd2; border-radius: 10px;
  padding: 28px 12px; text-align: center; color: var(--muted); font-size: 13px; }
.tag { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
.tag--before { color: var(--bad); }
.tag--after { color: var(--ok); }
.code { background: var(--code-bg); color: var(--code-ink); border-radius: 10px;
  padding: 14px 16px; overflow: auto; font-size: 12.5px; line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; }
.code--tight { padding: 8px 10px; font-size: 12px; }
.diff { background: var(--code-bg); color: var(--code-ink); border-radius: 10px;
  padding: 12px 0; overflow: auto; font-size: 12.5px; line-height: 1.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; margin: 0; }
.diff-line { display: block; padding: 0 16px; white-space: pre; }
.diff--add { background: rgba(26,127,75,.22); }
.diff--del { background: rgba(192,57,43,.22); }
.diff--hunk { color: #9db4ff; }
.diff--head { color: var(--muted); }
.note { font-size: 13px; color: var(--muted); margin: 8px 0 0; }
.table { width: 100%; border-collapse: collapse; font-size: 14px; }
.table th { text-align: left; font-size: 11px; text-transform: uppercase;
  letter-spacing: .06em; color: var(--muted); border-bottom: 1px solid var(--line);
  padding: 6px 10px 8px 0; }
.table td { border-bottom: 1px solid var(--line); padding: 10px 10px 10px 0;
  vertical-align: top; }
.table tr:last-child td { border-bottom: 0; }
.where { font-size: 12px; color: var(--muted); margin-top: 4px; }
.finding-detail { font-size: 13px; color: #3a3f49; margin-top: 4px; }
.finding-fix { font-size: 13px; color: var(--ok); margin-top: 4px; }
.decision { background: #10203f; color: #fff; border-radius: 14px;
  padding: 20px 24px; margin-top: 18px; }
.decision-label { text-transform: uppercase; letter-spacing: .1em; font-size: 11px;
  font-weight: 700; color: #8fb2ff; margin-bottom: 8px; }
.decision-body p { margin: 0; font-size: 16px; }
.footer { margin-top: 28px; font-size: 12px; color: var(--muted); text-align: center; }
.footer code { background: var(--muted-bg); border-radius: 4px; padding: 1px 5px; }
"""


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="render_report",
        description="Render a Team Mate report manifest to self-contained HTML.",
    )
    parser.add_argument("manifest", help="path to the report manifest JSON")
    parser.add_argument(
        "--out",
        help="output HTML path (default: the manifest path with .html)",
    )
    args = parser.parse_args(argv)

    with open(args.manifest, encoding="utf-8") as fh:
        manifest = json.load(fh)
    if not isinstance(manifest, dict):
        raise SystemExit("error: the manifest must be a JSON object")

    out = args.out or os.path.splitext(args.manifest)[0] + ".html"
    base_dir = os.path.dirname(os.path.abspath(args.manifest))
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(build_html(manifest, base_dir))
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
