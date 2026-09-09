---
name: Imported artifact workflows
description: Environment behavior when an imported web artifact is later registered with a managed workflow.
---

Imported web artifacts can temporarily have both a manually configured legacy workflow and a managed artifact workflow targeting the same assigned port. Removing the legacy workflow may leave its dev-server process alive, so the managed service can still fail with “port is already in use.”

**Why:** The managed artifact workflow owns the injected `PORT`, `BASE_PATH`, and preview routing; a duplicate workflow is not an independent app instance and can block the official service.

**How to apply:** When a managed artifact workflow reports a port collision, inspect active listeners and matching Vite processes, remove the legacy workflow, terminate only its residual frontend process if necessary, then restart the exact managed workflow name once.