Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Describe authored schedules, per-node cursors, and durable run history.

# Ownership

- Own `schedules.ts`, `cursors.ts`, and `runs.ts` and their descriptor tests;
  physical schema deployment remains kernel-owned.

# Local Contracts

- Default-export authored table descriptors through `/p/the8020/db/mod.ts`;
  table identity follows the package and file path.
- Preserve revision-qualified cursor identities, deterministic occurrence
  identities, immutable queued inputs, and bounded run-result storage.
- Schedule/run program and username columns reuse the semantic package/user
  fields through `t.from`; sandbox/Worker references reuse admin-core fields.
  SQL types and table-local keys remain unchanged.
- Runs store node/sandbox/Worker/job/context IDs, parent context, a saved log
  position, and scheduling/execution times. There is no log-message column;
  global log retention and execution metadata have independent ownership.
- Schedule IDs are `sch-*`; durable queued/history rows are `jhr-*`, distinct
  from the kernel's actual `job-*` execution instance. Manual submissions use
  `occ-*` for the occurrence shared by their target rows. All use the shared
  ten-character operational suffix; primary-key insertion rejects collisions.
- Scheduled occurrence and per-node cursor IDs are structured coordination keys
  containing schedule revision/time or node identity, not random opaque IDs.
  Preserve them across nodes. The unique occurrence/target index prevents
  duplicate execution when independent nodes materialize the same occurrence.

# Work Guidance

# Verification

- From the repository root, run `deno task check` and `deno task test`.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
