# Changelog

All notable changes to Team Mate are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-24

The first release of Team Mate: a portable primary-agent overlay that
coordinates the native subagents of a coding harness across multiple projects.

### Added

- **Team Mate primary agent** — a primary engineering agent that plans,
  delegates to the harness's native subagents, reviews their work, and reports
  back, with the developer keeping the final say over consequential actions.
  Runs inside `opencode`, `codex`, `claude`, `pi`, and `omp`.
- **`tm` ledger CLI** — a deterministic, ledger-only command-line tool that
  records sessions, tasks, briefs, reports, findings, and decisions, and
  renders each harness's adapter files. It never spawns or manages processes;
  the harness owns the worker lifecycle.
- **Skill library** — shared Team Mate skills covering the coordination loop:
  planning, delegation, monitoring, independent review, rework, escalation,
  reporting, recovery, and multi-project context, alongside common and worker
  skills such as debugging, verification, and browser automation.
- **Worker agent definitions** — four canonical worker roles (`developer`,
  `reviewer`, `tester`, `investigator`) rendered per harness by
  `tm agents sync`.
- **Context compaction** — `tm session checkpoint` writes a compact resume
  packet to the ledger and `tm session resume` reloads it in one read after the
  harness compacts the session, so the primary's context window stays under
  control; the `compact-context` skill and the `team-mate` doctrine document
  when to checkpoint.
- **One-command installer** — a single `curl` install that detects the harness,
  copies the overlay into place, distributes skills, and provisions
  permissions.
- **Claude plugin packaging** — the same overlay ships as a Claude Code and
  Cowork plugin, so the model runs there without a separate build step.
- **Documentation** — an install guide, product vision, repository context, and
  a harness-adapter matrix.

[Unreleased]: https://github.com/mohammadhprp/teammate/commits/master
[0.1.0]: https://github.com/mohammadhprp/teammate/releases/tag/v0.1.0
