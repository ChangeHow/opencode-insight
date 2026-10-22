---
"@changehow/oc-insight": patch
---

Avoid oversized Insight responses by aggregating complete token and timing summaries inside the OpenCode plugin, returning bounded speed windows, and loading tool and context-source details through scoped cursor pages. Update the OpenChamber panel and dashboard to use these purpose-specific queries while preserving the existing session and series RPC structures and values, response-size protection, and recoverable idle-session eviction.
