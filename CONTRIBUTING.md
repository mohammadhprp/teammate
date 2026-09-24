# Contributing to Team Mate

Thanks for taking the time to contribute. This guide covers how to set up the
repository, run the checks, and open a pull request.

## Before you start

- Read [docs/CONTEXT.md](docs/CONTEXT.md) for the repository layout,
  conventions, and the two skill sets it carries.
- Read [src/README.md](src/README.md) if you are changing the product overlay.
- By contributing you agree that your work is licensed under the
  [MIT License](LICENSE).

## What lives where

Team Mate is a repository plus a portable overlay:

- `src/` is the **product** — the role, skills, worker agent definitions,
  scripts, config, and templates that the installer copies into a primary
  repository.
- `.agents/skills/` is **tooling for working on this repository**; it is not
  part of the product and the installer does not install it.
- `docs/` holds the vision, install guide, repository context, and the
  long-term research pages under `docs/implementation/`.

Keep the two skill sets separate: a change to the product belongs under `src/`.

## Development setup

There are no third-party dependencies. All you need is Python 3.12 (the version
CI uses) and a POSIX shell for the installer.

```bash
git clone https://github.com/mohammadhprp/teammate.git
cd teammate
```

## Running the checks

Run the unit tests from the repository root before opening a pull request. This
is the same command CI runs:

```bash
python3 -m unittest discover -s src/scripts/tests -t src/scripts
```

To try the installer from a local checkout:

```bash
./install.sh --dir /tmp/teammate-dev --harness opencode
```

## Making a change

1. Keep each change focused on one logical unit. Match the style of the
   surrounding files; do not reformat unrelated code.
2. Update the documentation a change affects. `README.md` is the public landing
   page, `docs/INSTALL.md` the install guide, `docs/CONTEXT.md` the repository
   guide, and `src/README.md` the overlay guide.
3. Add a [CHANGELOG.md](CHANGELOG.md) entry under `## [Unreleased]` for a
   user-visible change.

## Commit and pull request conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/),
with scopes such as `tm`, `install`, `skills`, `harness`, and `docs`:

```text
feat(tm): add a quiet task show
fix(install): keep the overlay README out of the plugin
docs: document the harness-native model
```

In a pull request, describe what changed, why, and how you verified it. Note any
behavior change and any follow-up work you deliberately left out.

## Reporting bugs and security issues

Open a [GitHub issue](https://github.com/mohammadhprp/teammate/issues) for bugs
and feature requests. For a security vulnerability, do **not** open a public
issue — follow [SECURITY.md](SECURITY.md) instead.
