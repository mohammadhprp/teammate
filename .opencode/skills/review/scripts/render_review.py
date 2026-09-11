#!/usr/bin/env python3
"""Render a review.json file as a self-contained dark HTML report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


PAGE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code review</title>
<style>
:root { color-scheme: dark; --bg:#121212; --panel:#1b1b1b; --ink:#f4f4f0; --muted:#a9aaa5; --line:#3b3b3b; --blue:#8cc8ff; --red:#ff7d7d; --orange:#ffbf69; --green:#78dba9; --purple:#c7a6ff; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 ui-rounded, "Comic Sans MS", system-ui, sans-serif; }
body:before { content:""; position:fixed; inset:0; pointer-events:none; opacity:.08; background-image:radial-gradient(#fff 0.7px,transparent .7px); background-size:13px 13px; }
main { width:min(1060px, calc(100% - 32px)); margin:48px auto; }
.eyebrow { color:var(--blue); font:700 12px/1 monospace; letter-spacing:.16em; text-transform:uppercase; }
h1 { font-size:clamp(32px,6vw,62px); line-height:1; margin:10px 0 28px; letter-spacing:-.06em; }
.hero, .panel { background:var(--panel); border:2px solid var(--line); border-radius:13px 10px 15px 9px; box-shadow:5px 5px 0 #080808; }
.hero { padding:24px; display:flex; align-items:center; justify-content:space-between; gap:20px; }
.copy-prompt { cursor:pointer; color:#121212; background:var(--blue); border:2px solid var(--blue); border-radius:8px 6px 9px 5px; padding:7px 10px; font:800 11px monospace; text-transform:uppercase; box-shadow:2px 2px 0 #080808; }
.copy-prompt:hover { transform:translate(-1px,-1px); box-shadow:4px 4px 0 #080808; } .copy-status { color:var(--muted); font-size:12px; }
.verdict { border:2px solid currentColor; border-radius:10px 8px 11px 7px; padding:11px 16px; font-weight:800; letter-spacing:.08em; }
.approve { color:var(--green); } .reject { color:var(--red); }
.stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:22px 0; }
.stat { padding:16px; border:2px solid var(--line); border-radius:8px 11px 7px 10px; background:#171717; }
.stat b { display:block; font-size:30px; line-height:1; } .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
.panel { padding:22px; margin:22px 0; } h2 { margin:0 0 14px; font-size:22px; }
.body { white-space:pre-wrap; color:#e4e4df; }
.filters { display:flex; flex-wrap:wrap; gap:8px; margin:-2px 0 16px; }
.filters button { cursor:pointer; color:var(--muted); background:#121212; border:1px solid var(--line); border-radius:7px 5px 8px 6px; padding:7px 11px; font:700 12px monospace; text-transform:uppercase; }
.filters button.active, .filters button:hover { color:var(--ink); border-color:var(--blue); box-shadow:2px 2px 0 #080808; }
.finding.hidden { display:none; }
.finding { border-left:5px solid var(--line); padding:14px 16px 16px; margin:12px 0; background:#151515; border-radius:4px 10px 8px 5px; }
.finding.critical { border-color:var(--red); } .finding.important { border-color:var(--orange); } .finding.suggestion { border-color:var(--blue); } .finding.nit { border-color:var(--purple); }
.finding-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:9px; }
.location { color:var(--blue); font:700 13px monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .comment { white-space:pre-wrap; }
.severity { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font:700 11px monospace; letter-spacing:.08em; text-transform:uppercase; margin-bottom:7px; }
.severity.critical { color:var(--red); } .severity.important { color:var(--orange); } .severity.suggestion { color:var(--blue); } .severity.nit { color:var(--purple); }
.codeblock { overflow:auto; margin:10px 0 0; padding:13px; background:#0c0c0c; border:1px solid var(--line); border-radius:7px; color:#d7d7d0; font:13px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; white-space:pre; }
.tok-keyword { color:#c7a6ff; } .tok-string { color:#a8d8a8; } .tok-number { color:#ffbf69; } .tok-comment { color:#777b78; font-style:italic; }
@media (max-width:650px) { main{margin:24px auto}.hero{align-items:flex-start;flex-direction:column}.stats{grid-template-columns:repeat(2,1fr)} }
</style>
</head>
<body><main>
<div class="eyebrow">review artifact // visualized</div><h1>Code review</h1>
<section class="hero"><div><div class="eyebrow">verdict</div><div id="verdict"></div></div><div id="summary"></div></section>
<section class="stats" id="stats"></section>
<section class="panel"><h2>Review notes</h2><div class="body" id="body"></div></section>
<section class="panel"><h2>Inline findings</h2><div class="filters" id="filters"><button class="active" data-filter="all">All</button><button data-filter="critical">Critical</button><button data-filter="important">Important</button><button data-filter="suggestion">Suggestions</button><button data-filter="nit">Nits</button></div><div id="comments"></div></section>
</main><script>
const review = __REVIEW_DATA__;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const comments = Array.isArray(review.comments) ? review.comments : [];
const counts = { critical:0, important:0, suggestion:0, nit:0 };
const kind = body => { const text=String(body||'').toLowerCase(); return text.includes('critical')?'critical':text.includes('important')?'important':text.includes('suggestion')?'suggestion':text.includes('nit')?'nit':'suggestion'; };
const severity = { critical:['🚨','Critical'], important:['⚠️','Important'], suggestion:['💡','Suggestion'], nit:['🧹','Nit'] };
const cleanBody = body => String(body || '').replace(/^[^\w\n]*\[(?:CRITICAL|IMPORTANT|SUGGESTION|NIT)\]\s*/i, '');
const highlighted = code => { const pattern=/(\/\/.*|#.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|new|throw|async|await|import|from|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g; return String(code).split(pattern).map((part, i) => { if (i % 2 === 0) return esc(part); const cls=/^(\/\/|#|\/\*)/.test(part)?'tok-comment':/^["'`]/.test(part)?'tok-string':/^\d/.test(part)?'tok-number':'tok-keyword'; return `<span class="${cls}">${esc(part)}</span>`; }).join(''); };
const formatBody = body => { const source=String(body||''), pattern=/```(?:[\w+-]+)?\n([\s\S]*?)```/g; let result='', last=0, match; while ((match=pattern.exec(source))) { result += esc(source.slice(last, match.index)); result += `<pre class="codeblock"><code>${highlighted(match[1])}</code></pre>`; last=pattern.lastIndex; } return result + esc(source.slice(last)); };
comments.forEach(c => counts[kind(c.body)]++);
const verdict = review.verdict === 'REJECT' ? 'REJECT' : 'APPROVE';
document.title = `${verdict} · Code review`;
document.querySelector('#verdict').innerHTML = `<div class="verdict ${verdict === 'REJECT' ? 'reject':'approve'}">${verdict}</div>`;
document.querySelector('#summary').textContent = `${comments.length} inline ${comments.length === 1 ? 'finding':'findings'}`;
document.querySelector('#body').textContent = review.body || 'No review body provided.';
document.querySelector('#stats').innerHTML = Object.entries(counts).map(([name,count]) => `<div class="stat"><b>${count}</b><span>${name}</span></div>`).join('');
document.querySelector('#comments').innerHTML = comments.length ? comments.map((c, i) => { const type=kind(c.body), [icon,label]=severity[type]; const location = `${esc(c.path || 'unknown file')}:${esc(c.line ?? '?')} · ${esc(c.side || '')}`; return `<article class="finding ${type}" data-kind="${type}"><div class="finding-head"><div><div class="location">${location}</div><div class="severity ${type}">${icon} ${label}</div></div><button class="copy-prompt" type="button" data-finding="${i}">Copy fix prompt</button></div><div class="comment">${formatBody(cleanBody(c.body))}</div><span class="copy-status" aria-live="polite"></span></article>`; }).join('') : '<div class="body">No inline findings.</div>';
document.querySelector('#filters').addEventListener('click', event => { const button=event.target.closest('button'); if (!button) return; const filter=button.dataset.filter; document.querySelectorAll('#filters button').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('.finding').forEach(item => item.classList.toggle('hidden', filter !== 'all' && item.dataset.kind !== filter)); });
const fixPrompt = finding => `You are fixing one code review finding. Apply the smallest necessary change in the repository; do not weaken behavior or remove coverage.\n\nReview verdict: ${verdict}\n\nReview context:\n${review.body || 'No review body provided.'}\n\nTarget finding:\n[${String(finding.body || '').split(' ')[1] || 'FINDING'}] ${finding.path || 'unknown file'}:${finding.line ?? '?'} (${finding.side || 'RIGHT'})\n${finding.body || ''}\n\nAfter fixing this finding, run the relevant tests and summarize the change and test result.`;
const copyText = async (text, status) => { try { await navigator.clipboard.writeText(text); } catch (_) { const area=document.createElement('textarea'); area.value=text; area.style.position='fixed'; area.style.opacity='0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); } status.textContent='Copied'; setTimeout(() => { status.textContent=''; }, 2200); };
document.querySelector('#comments').addEventListener('click', event => { const button=event.target.closest('[data-finding]'); if (!button) return; const finding=comments[Number(button.dataset.finding)]; copyText(fixPrompt(finding), button.parentElement.parentElement.querySelector('.copy-status')); });
</script></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review-json", default="review.json")
    parser.add_argument("--output", default="review.html")
    args = parser.parse_args()
    review = json.loads(Path(args.review_json).read_text(encoding="utf-8"))
    data = json.dumps(review, ensure_ascii=False, separators=(",", ":"))
    data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    html = PAGE.replace("__REVIEW_DATA__", data)
    Path(args.output).write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
