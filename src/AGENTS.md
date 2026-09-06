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
- Create `sch-*` schedule, `jhr-*` history, and manual `occ-*` occurrence IDs
  with the kernel SDK helper. Their database owners reject initial collisions;
  structured scheduled occurrence/cursor keys retain cross-node deduplication.
- Keep candidate reads and output bounded, preserve immutable queued inputs, and
  never hold transaction locks while a program runs.
- The runner stores bounded results plus execution IDs and the saved log
  position returned by the shared program API, including on failure. It never
  receives or stores a log array. Metadata lists do not query logs.
- Selected run details use one 100-record page from the owning node's unified
  logger; page replacement and opaque cursors keep view memory bounded. Readable
  record formatting belongs to the shared SDK. Expiry/storage/node failures
  affect the log field without hiding execution metadata or results.
- Filter selected runs by their execution identity and saved position, with
  creation time as a conservative lower bound. Execution completion is not a
  log-capture deadline; it must not exclude the terminal event or later
  diagnostics. Reads still return a bounded page and cursor.
- Retain UUI editor models and positional inputs across roundtrips and program
  selection.

# Work Guidance

- Label UTC explicitly and repair shared database codec or transaction defects
  in their shared owner.

# Verification

- From the repository root, run `deno task check` and `deno task test`.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
