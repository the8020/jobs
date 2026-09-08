Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Implement UTC scheduling, durable claims and history, and Jobs administration
  models.

# Ownership

- Own calendar calculation, store/types, runner, forms, admin screens, and
  colocated tests. `fields.ts` owns reusable job, calendar, run, and node-target
  field metadata.

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
- Selected run Logs pages use one 100-record page from the owning node's unified
  logger; page replacement and opaque cursors keep view memory bounded. Readable
  record formatting belongs to the shared SDK. Expiry/storage/node failures
  affect the log field without hiding execution metadata or results.
- Filter selected runs by their execution identity and saved position, with
  creation time as a conservative lower bound. Execution completion is not a
  log-capture deadline; it must not exclude the terminal event or later
  diagnostics. Reads still return a bounded page and cursor.
- Keep placement/month restrictions in Advanced, result output in the overview,
  and logs/diagnostics in their own pages. Runtime references reuse admin-core
  fields; program/account references reuse their owning package fields.
- Retain UUI editor models and positional inputs across roundtrips and program
  selection. Reuse semantic fields for labels/help; keep visibility, reactive
  controls, and placement in the screens. Month/day controls customize their
  label while inheriting the shared recurrence help.
- Node field help uses ordinary typed value/name columns and full list queries
  before paging the supplied enabled-node snapshot, preserving `any`, `all`, and
  `node:<id>` values even for nodes named any/all. Field imports do not query or
  open screens. Runtime grouping and logs reuse admin-core fields; source
  commits reuse package fields.
- Program and user references reuse package-owned fields in forms and lists.
  Their help providers search on demand; editor initialization does not fetch or
  truncate account options. The store owns eligibility checks.

# Work Guidance

- Keep durable claims and run outcomes owned here while ordinary program
  execution stays in the shared runtime. Retry only under the occurrence
  contract; an unknown execution outcome is not evidence that work can safely be
  repeated.

- Label UTC explicitly and repair shared database codec or transaction defects
  in their shared owner.

# Verification

- From the repository root, run `deno task check` and `deno task test`.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
