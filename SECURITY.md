# Security Policy

## Supported versions

Team Mate is pre-1.0. Security fixes are applied to the latest released version
— currently `0.2.1` — on the `master` branch.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Report it
privately through either channel:

1. GitHub's private vulnerability reporting: open the repository's **Security**
   tab and choose **Report a vulnerability**.
2. Email **mohammadhprp@gmail.com** with `Team Mate security` in the subject.

Include what you can of:

- the affected component (installer, `tm` CLI, plugin, skills, or docs) and
  version;
- the harness and operating system;
- steps to reproduce, and a proof of concept if you have one;
- the impact you believe it has.

You will get an acknowledgement as soon as possible, and an update when the
issue is confirmed and fixed. Please give a reasonable window to release a fix
before disclosing publicly.

## Scope

Team Mate installs files and runs commands in your environment, so reports that
cross a trust boundary are especially useful: the installer writing outside its
target directory, the `tm` CLI escaping its state directory, a skill or worker
taking an action it was not authorized to take, or secrets being exposed in
logs, reports, or the ledger.
