Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Expose Jobs administration, interactive execution, scheduling, and the echo
  fixture.

# Ownership

- Own manifests and thin entrypoints for `jobs`, `run-program`,
  `scan-schedules`, and `echo`; `../src/` owns implementation.

# Local Contracts

- Jobs and hidden run-program declare `uui = true`; the latter accepts an
  optional selected program ID. Jobs accepts an optional schedule ID.
- Interactive UUI execution uses the current session through ordinary
  invocation; scheduled submissions use generic kernel jobs.

# Work Guidance

# Verification

- From the repository root, run `deno task check` and `deno task test`.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
