Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Implement UTC scheduling, durable claims and history, and Jobs administration
  models.

# Ownership

- Own calendar calculation, store/types, runner, forms, admin screens, and
  colocated tests.

# Local Contracts

- Any schedules use deterministic occurrence IDs and short conditional claims;
  All schedules use independent node cursors.
- Keep candidate reads and output bounded, preserve immutable queued inputs, and
  never hold transaction locks while a program runs.
- Retain UUI editor models and positional inputs across roundtrips and program
  selection.

# Work Guidance

- Label UTC explicitly and repair shared database codec or transaction defects
  in their shared owner.

# Verification

- From the repository root, run `deno task check` and `deno task test`.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
