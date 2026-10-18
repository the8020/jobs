Parent DOX: [jobs DOX](../AGENTS.md).

# Purpose

- Index package-defined static jobs through normal publication.

# Ownership

- Own `index-jobs.toml`; `../src/indexing.ts` owns parsing and reconciliation.

# Local Contracts

- Register the `index-packages` hook with the full `the8020/jobs/index-jobs`
  program ID. The existing boot, activation, source change, and explicit reindex
  pass supplies the selected package/commit set.
- Do not schedule a second discovery loop or install jobs through activation
  initialization that would preserve later database overrides.

# Work Guidance

# Verification

- Run `deno task check` and `deno task test` from this repository.
- Kernel package/app tests cover hook discovery and shared indexing dispatch.

# Child DOX Index

No child DOX documents. This document owns the entire local scope.
