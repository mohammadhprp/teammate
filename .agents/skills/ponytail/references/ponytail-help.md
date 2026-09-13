# Ponytail help

Use for `/ponytail-help`, “ponytail help”, or a request for the quick
reference. Display it once without changing mode, writing files, or persisting
anything.

| Operation | Trigger | Purpose |
|---|---|---|
| Mode | `/ponytail [lite\|full\|ultra\|off]` | Build the simplest solution that works. |
| Review | `/ponytail-review` | Find removable complexity in current changes. |
| Audit | `/ponytail-audit` | Find removable complexity across the repository. |
| Debt | `/ponytail-debt` | Harvest `ponytail:` comments into a ledger. |
| Gain | `/ponytail-gain` | Show benchmark medians, not repo savings. |
| Help | `/ponytail-help` | Show this card. |

Say `stop ponytail` or `normal mode` to deactivate. Resume with `/ponytail`.
The default is `full`; configure it with `PONYTAIL_DEFAULT_MODE` or
`~/.config/ponytail/config.json` as described in `references/ponytail-mode.md`.
