Parent DOX: [8020 workspace](../AGENTS.md).

Framework source:
[agent0ai/dox/AGENTS.md](https://github.com/agent0ai/dox/blob/765ae4ac02cc884eefcd41a3d0f71941721adb89/AGENTS.md).

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable
  docs must stay understandable from the nearest applicable AGENTS.md plus every
  parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path,
   read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide
   rules
7. If docs conflict, the closer doc controls local work details, but no child
   doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session
before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or
  quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child
index changes. Update child docs when parent changes alter local rules. Remove
stale or contradictory text immediately. Small edits that do not change behavior
or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences,
  durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX
  Index
- Each parent explains what its direct children cover and what stays owned by
  the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own
  purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user
  instructions; if there are no specific standards or instructions yet, leave it
  empty
- Verification must reflect an existing check; if no verification framework
  exists yet, leave it empty and update it when one exists

Default section order:

- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local
  version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for
  risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the
relevant child AGENTS.md

- Packages may declare static jobs in flat `jobs/*.toml` files. Index them
  through ordinary package publication, use the same scheduler/claims/history as
  authored schedules, default to one Any-node run, and offer a separate
  read-only Static jobs list without configuration or input overrides.

## Child DOX Index

This root retains repository-wide contracts and files outside the child scopes
below.

- [events/AGENTS.md](events/AGENTS.md): Declare asynchronous schedule scanning
  and ready-job dispatch triggers.
- [hooks/AGENTS.md](hooks/AGENTS.md): Index static jobs during package
  publication.
- [programs/AGENTS.md](programs/AGENTS.md): Expose Jobs administration,
  interactive execution, scheduling, and the echo fixture.
- [src/AGENTS.md](src/AGENTS.md): Implement UTC scheduling, durable claims and
  history, and reusable Jobs fields and administration models.
- [tables/AGENTS.md](tables/AGENTS.md): Describe authored schedules, per-node
  cursors, and durable run history.

# Purpose

- Own the Deno scheduler and administration package in its independent
  repository.

# Ownership

- `widgets/` declares this package's Home tiles and categories through the
  `the8020/packages/widgets.ts` format; the tile is visible with
  `the8020.jobs.job.view`.
- Own authored schedules, per-node cursors, and run-history tables, calendar
  calculation, validation, optimistic edits, node claims, and result capture.
- `events/scan-schedules.toml` and `events/run-ready-jobs.toml` declare
  `event = "minute"` and `event = "jobs-ready"`, respectively, and select
  `the8020/jobs/scan-schedules`, a non-discoverable ordinary program invoking
  the shared scheduler. The kernel owns generic event timing/dispatch and
  ordinary sandbox execution, execution-principal validation, and Worker
  lifecycle; existing hooks stay synchronous. This package validates selected
  accounts when authoring jobs; the kernel never evaluates account eligibility.

# Local Contracts

- The Jobs screens and `run-program` use `src/guard.ts`, which checks
  `the8020.jobs.job.view` (lists filtered through auth's unaudited `filter`,
  details and runs), `the8020.jobs.job.edit` (save) and `the8020.jobs.job.run`
  (submit and Run now); the value is the job's program ID. `mod.ts`'s `jobs`
  store stays the trusted API for packages that schedule their own work under
  their own permissions.
- `/p/the8020/jobs/mod.ts` exports `jobs` with list/inspect/save/ensure,
  submit/runNow, and runs.list/inspect. Package types describe UTC calendars and
  history.
- `ensure(ownerKey, input)` creates a package maintenance schedule once under a
  unique full `namespace/package/name` key. Concurrent nodes receive the same
  schedule; later calls preserve administrator edits and disabled state.
- `hooks/index-jobs.toml` registers `index-packages`. Its ordinary program
  indexes selected ready packages' flat `jobs/*.toml` definitions into the
  existing schedules table. TOML is authoritative; `sourcePackage` distinguishes
  static rows and `ownerKey` is the full declaring package/job filename
  identity. Unchanged definitions preserve revision, initial occurrence, and
  cursors. Changed or restored definitions advance revision; removed definitions
  become disabled while history and immutable queued work remain. Invalid job
  declarations or a changed package commit preserve accepted definitions.
- Static jobs require full `namespace/package/program` targets, optional
  positional JSON-compatible `inputs`, and the existing UTC calendar. Defaults
  are `system`, empty sandbox group, and `node = "any"`; `all` and exact nodes
  share existing targeting. The README defines the TOML fields and examples.
- `jobs.list(offset, true)` lists active static definitions separately from
  authored schedules. Inspection includes `staticKey`; save, ensure, and runNow
  reject static targets. Static details reuse read-only fields and retain next
  run, latest result, and normal history/log navigation.
- Jobs selects a ready program, positional JSON argument array, enabled user,
  sandbox group, and Any (first/default), All, or an exact enabled node. There
  are no scaling controls. Programs use kernel.programs.run and normal job
  policy.
- The kernel emits local minute events at seconds 00. Listeners use trusted
  context.nodeId and host UTC time; direct schedules are filtered by node before
  reading calendars. Explicit sub-minute instants run on a following minute
  tick.
- Schedules retain firstRunAt as the initial occurrence for their saved
  revision. Each node advances its own revision-qualified cursor. All nodes
  materialize independent run records without claiming or locking a shared All
  record.
- Any occurrence IDs are deterministic across nodes. A short conditional UPDATE
  assigns nodeId in a transaction with a 25 ms lock wait and 2 s total bound.
  Only the successful claimant executes. Attempts never hold locks while a
  program runs. Contention leaves durable pending work for another minute.
- Candidate reads and dispatch batches are bounded and exclude unrelated nodes.
  Claims are short sequential writes locally; selected programs run in parallel
  as promises. Listeners await their own results so capture survives normal
  completion, while event emitters never await listener completion.
- Calendars combine explicit UTC datetimes with optional start date, selected
  months (all initially on), month dates or weekdays, and multiple times.
  Invalid calendar dates are rejected; absent month dates are skipped.
- After downtime recurring work coalesces; every explicit appointment is
  retained. Saved revisions reset per-node cursors. Queued inputs remain
  immutable. Duplicate minute delivery does not repeat a claimed occurrence.
  Expired running records become interrupted without replay, because completion
  is unknown.
- Manual submission persists first and emits a local jobs-ready event. Remote
  targets are picked up on their own minute events. Result history is bounded
  and paginated; run timeout is five minutes including ordinary job admission.
- Run rows retain results and allocated node/sandbox/Worker/job/context IDs,
  times, and a saved log position. They contain no copied log messages. Global
  log retention never removes execution metadata. References returned with
  execution failures remain available for selected log queries.
- The Logs page of a run reads one bounded page through `kernel.logs.query` on
  the exact owning node. First, recent, and next actions replace that page
  without accumulating history. Expired/unavailable logs leave metadata and
  results visible. Runs without a returned execution identity never issue an
  unscoped log search; queued runs wait for an execution identity. Running runs
  already hold their caller-allocated execution ID, permitting exact logs and
  owning-node Worker heap/CPU inspection before completion.
- The UUI list prioritizes name, program, status, and next UTC run. Editors keep
  inputs, execution user, and timing visible. Advanced owns searchable node
  selection, sandbox sharing, and month restrictions, with the same draft.
  Results show outcome, timing, program/user links, and output; Logs and
  Advanced open separate pages. Advanced includes linked sandbox/Worker
  references. Opening the result overview does not query logs. Run history can
  open the owning schedule through the public Jobs entrypoint.
- The UUI list links editable details and run history; header actions use the
  shell-owned BACK_EVENT. Screens use the shared UUI Model contract, retaining
  the editor's model across reactive roundtrips. Local checks use the shared
  80|20 Deno workspace for platform imports.
- Jobs and the hidden `run-program` entrypoint declare `uui = true`. The latter
  accepts an optional program ID and opens the existing manual form with that
  program selected. Manual UUI selections collect positional JSON inputs and use
  `invokeProgram` inside `presentPage`, retaining the current user/session and
  standard uncaught-program recovery. They do not create queued jobs. Execution
  user, sandbox group, and node controls apply to job submissions; query inputs
  persist when the program selector changes. Schedules continue to use generic
  job execution.
- Job/calendar/run fields and bounded node help live in `src/fields.ts`, with
  labels and descriptions shared by forms, lists, and matching table columns.
  Screen-specific layout and editability remain in `src/admin.ts`.
- Program and user inputs reuse semantic fields from packages/users and open
  searchable field help instead of preloading select options. References in
  schedule/run tables and list columns use the same definitions. The store
  retains final program/account eligibility validation.

# Work Guidance

- Build only what the request and established contracts require. Before adding a
  mechanism, identify that need and why existing owners or standard tools cannot
  meet it. Do not invent stronger guarantees for hypothetical cases. Remove
  unsupported additions at closeout; agent-written tests and DOX do not
  authorize them. Preserve required correctness, security, and data integrity.

- Keep scheduling, claims, eligibility, and durable history in this standalone
  Deno package. Reuse ordinary programs and events; extend the kernel only for a
  necessary generic execution capability.
- Keep claims short, dispatch and history bounded, and the outcome of
  interrupted work explicit. Verify shared runtime or database repairs at their
  owner and through the scheduler path.

- Keep forms simple and label UTC explicitly. Keep implementation details here.
- Change shared database transport/codec/lock behavior in its owning layer.

## UI Rules

- Do not add explanatory helper copy that restates what the control already
  implies (e.g. "optional", "works without selection", "failure falls back to
  X"). Prefer clear labels and option text; surface status in results when
  needed, not as instructional paragraphs under every field.
- Keep UI copy concise. Avoid tutorial-style descriptions unless the user
  explicitly asks for onboarding help.

# Verification

- `deno task check` formats, lints, and checks package sources and handler
  programs. Kernel package validation checks the TOML declarations.
- `deno task test` covers calendar patterns, real SQLite queries, concurrent Any
  claims, independent All cursors, exact targeting, snapshots, failures,
  history, output bounds, table contracts, and UUI navigation.
  Interactive-launch tests cover preselection, dirty input validation,
  positional arguments, current-session screens, and standard failure escape.
- `browser_e2e.ts` exercises manual/calendar administration against a disposable
  instance. Kernel tests cover generic events, program execution, and lock
  bounds.
- `static_jobs_native_fixture.ts` uses the UUI native browser harness with
  `--fixture=../jobs/static_jobs_native_fixture.ts` to verify boot indexing,
  two-node singleton scheduling, obsolete-session cleanup, read-only details,
  and ordinary run history. Use a fresh numbered test instance and bound CPU,
  memory, and runtime as required by the workspace contract.
