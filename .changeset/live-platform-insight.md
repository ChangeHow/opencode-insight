---
"@changehow/oc-insight": minor
---

Add OpenCode V2 telemetry and an OpenChamber Insight panel to the existing package. Export platform entrypoints, provide installable extension paths through the CLI, and add rolling output charts, context attribution, persisted session queries, and foreground timing without requiring the dashboard daemon.

Expose the same context, speed, and timing insights in the web dashboard's session details, with a direct V2 session-ID lookup independent of the legacy usage ledger.

Attribute native skill attachments by their durable source identity and capture reported Code Mode child-call counts without inventing per-child timing or storing tool arguments.

Simplify both Insight surfaces with a following ten-minute speed chart, token composition donuts, and mutually exclusive timing phase bars with hover details.

Use OpenChamber SDK controls and host-derived chart colors, apply theme changes without remounting, and preserve panel focus, open pickers, and chart inspection across telemetry refreshes.
