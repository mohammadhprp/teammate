---
name: merge-request
description: Create a GitLab merge request (MR) for the current branch using the glab CLI. Use this skill whenever the user asks to open, create, update, or prepare a GitLab MR or merge request.
---

# `merge-request` skill instructions

Create a merge request for the current branch.

## Process

1. **Collect information**
   - Get the current branch name: `git branch --show-current`
   - Read the MR template from `.gitlab/merge_request_templates/default.md` if it exists.

2. **Format MR title**
   - Take the branch name, replace all `-` with spaces, and capitalize the first character.

3. **Collect commits and build summary**
   - List commits on the branch that are not on `develop`: `git log develop..HEAD --oneline`
   - Read each commit message and convert it to a bullet list summarizing user-facing changes.
   - Merge/squash related commits (for example, multiple commits for the same change).
   - Keep the summary concise, with one bullet per logical change.

4. **Fill template**
   - Set Summary to the bullet list from step 3.
   - Keep the Checklist section as-is.

5. **Present plan and confirm** - Show the source branch, target branch (`develop`), title, and filled description. Ask: "Shall I create this MR?" Push the changes if the user says yes.

6. **Create upon confirmation** - Use `glab mr create` with:
   - `--source-branch`: Current branch
   - `--target-branch`: `develop`
   - `--title`: Prepend `Draft: ` to the formatted branch name
   - `--description`: Filled template content
   - `--assignee`: `1`
   - `--squash`
   - `--remove-source-branch`

7. **Show the resulting URL.**
