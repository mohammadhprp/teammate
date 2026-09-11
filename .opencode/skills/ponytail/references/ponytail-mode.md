# Ponytail mode

Use this operation for `/ponytail`, `/ponytail lite`, `/ponytail full`,
`/ponytail ultra`, or `/ponytail off`.

Ponytail is active every response until the user says `stop ponytail`, `normal
mode`, or `/ponytail off`. The default is **full**.

## Levels

| Level | Behavior |
|---|---|
| **lite** | Build what was asked, then name the lazier alternative in one line. |
| **full** | Enforce the YAGNI → existing code → stdlib → native → installed dependency → one line → minimum ladder. Default. |
| **ultra** | Delete before adding, challenge the requirement, and ship the smallest viable result. |

Use the main skill's ladder and rules for the actual coding task. A mode switch
does not itself change files or create configuration.

## Configuration

Default resolution is environment variable, then config file, then `full`:

```bash
export PONYTAIL_DEFAULT_MODE=ultra
```

Config file: `~/.config/ponytail/config.json` (Windows:
`%APPDATA%\ponytail\config.json`).

```json
{ "defaultMode": "lite" }
```
