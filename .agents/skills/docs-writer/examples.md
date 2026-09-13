# Docs Writer Examples

## Write a README from scratch

User: "Create a README for the CLI package."

Good agent behavior:

- Read the relevant code to ensure the README is backed by the actual implementation.
- Follow the project's style guide for structure and tone.
- Cover install, usage, and configuration with accurate command examples.
- Verify every link in the new content points at a real target.

## Review and improve existing docs

User: "Improve this markdown file, it reads awkwardly."

Good agent behavior:

- Read the latest version of the file before starting.
- Fix unclear phrasing, grammar, and passive voice while preserving the technical meaning.
- Check for consistent terminology across the edited document and related pages.
- Verify that links leading to the page still resolve after the edits.

## Update docs for a behavior change

User: "We renamed `build` to `compile`. Update the docs."

Good agent behavior:

- Search for every page referencing the command, not just the obvious one.
- Update the command docs and any tutorial, reference, or sidebar entries that mention it.
- Keep terminology consistent across all edited pages.
- Offer to run the project's formatting script to keep things consistent.
