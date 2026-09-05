# Jobs

Open **Jobs** from Home. Use **Run program** for a manual run or **New
schedule** for a calendar. Choose a program, enter its positional arguments as a
JSON array (for example `[{"message":"hello"},42]`), then select its execution
user, sandbox group, and node. `the8020/jobs/echo` returns its inputs and
identity and logs an example.

You can also open **Programs**, select a program, and choose **Execute** to open
this form with its ID preselected. Programs marked `uui = true` open
interactively with the current UUI user and session; only job submissions show
execution-user, sandbox-group, and node controls. Inputs remain a positional
JSON array in both cases. UUI programs return to their caller without a
completion notification. The hidden `the8020/jobs/run-program` entrypoint
accepts an optional program ID for this shared form.

**Any** is first and default: one node claims the run. **All** runs
independently on each enabled node. Exact targets run only on that node. Each
copy has its own status, result, and logs and uses the ordinary sandboxed job
execution policy.

Calendars use UTC and combine explicit datetimes with optional recurrence:

- Daily: all months and weekdays, with one or more times.
- Weekly: select weekdays and times.
- Monthly: all months, with dates such as `1,15,31` and times.
- Yearly: select months, month dates, and times.

All months start selected. Dates missing from a month are skipped. Save edits
the schedule; Run now uses saved inputs; clearing Enabled pauses future
occurrences. Queued runs retain their input snapshots. Run history shows inputs,
outputs, logs, failures, and current status; Refresh loads changes.

The kernel emits a local `minute` event on every UTC minute boundary. The Deno
declaration in `events/scan-schedules.toml` selects the ordinary program
`the8020/jobs/scan-schedules`, which reads applicable schedules, advances this
node's cursor, and launches programs through `kernel.programs.run`. Any uses a
short conditional database claim; All uses independent per-node records.
Calendar logic and history writes live entirely in this package.

Manual submission emits `jobs-ready` locally for prompt execution. Other nodes
pick up their queued work on the next minute event. Specific datetimes between
minute boundaries become eligible on the next tick. Host clocks must be kept
synchronized. Schedules/cursors/runs live in the system database; multi-node
installations use shared PostgreSQL and the same activated packages.

After downtime, recurring work coalesces into one overdue occurrence per cursor,
while explicit appointments drain through bounded batches. Interrupted runs are
recorded without automatic replay. Each run allows five minutes including Worker
admission. Results and logs each retain up to 256 KiB; logs also retain at most
512 entries. Generic events are memory-only; the package database owns
durability.

Other Deno programs can use:

```ts
import { jobs } from "/p/the8020/jobs/mod.ts";
const history = await jobs.runs.list();
```

Run `deno task check` and `deno task test` here. A disposable instance with an
enabled `robot` test account can run the browser smoke:

```sh
deno run --allow-all browser_e2e.ts --url=http://127.0.0.1:18880 --browser=/path/to/chromium
```

Its test password defaults to `jobs-prototype-password`; override with
`THE8020_JOBS_TEST_PASSWORD`. It creates runs/schedules and disables its
recurring schedule afterward. Screenshots go to `/tmp/8020-jobs-browser`,
overridable with `--artifacts`.
