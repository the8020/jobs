Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Declare asynchronous schedule scanning and ready-job dispatch triggers.

# Ownership

- Own `scan-schedules.toml` and `run-ready-jobs.toml`; both reference the
  ordinary scan-schedules program.

# Local Contracts

- Use explicit `minute` and `jobs-ready` event names and full program
  identities.
- Generic event dispatch remains kernel-owned; calendars, claims, and durable
  history remain package-owned.

# Work Guidance

# Verification

- Kernel package handler-index tests verify declaration contracts; run
  `go test ./kernel/packages/...` from the sibling kernel repository with its
  local Go environment.
- Run this package's `deno task check` for the referenced handler programs.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
