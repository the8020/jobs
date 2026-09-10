import { runtimeInfo } from "/p/the8020/admin-core/types/runtime.ts";
import { username } from "/p/the8020/users/types/user.ts";
import {
  choiceHelp,
  field,
  type ValueHelpItem,
  z,
} from "/p/the8020/db/fields.ts";

export const scheduleId: z.ZodString = field(z.string(), {
  label: "Schedule",
  description:
    "The saved schedule that created this run. Open it to review its inputs and timing.",
  open: async (value) => {
    const { default: jobs } = await import("../programs/jobs/program.ts");
    await jobs(value);
  },
});
export const runId: z.ZodString = field(z.string(), {
  label: "Run ID",
  description:
    "The saved history record for one job run, distinct from its kernel execution ID.",
  open: async (value) => {
    const { runDetail } = await import("./admin.ts");
    await runDetail(value);
  },
});

export const jobInfo = z.object({
  runAs: field(username, {
    label: "Run as",
    description:
      "Choose an enabled account to run this job. Interactive programs use the currently signed-in user instead.",
  }),
  name: field(z.string(), {
    label: "Job",
    description:
      "A name that helps you recognize this job in schedules and run history.",
  }),
  scheduleStatus: field(z.string(), {
    label: "Status",
    description:
      "Scheduled jobs can run at their next matching time. Paused jobs do not start new scheduled runs.",
    valueHelp: choiceHelp(z.string(), ["Scheduled", "Paused"]),
  }),
  state: field(
    z.enum(["queued", "running", "succeeded", "failed", "interrupted"]),
    {
      label: "Status",
      description:
        "The outcome of this run. Interrupted means its completion is unknown; it is not automatically replayed.",
    },
  ),
  node: field(z.string(), {
    label: "Node",
    description:
      "**Any** runs once on an available node. **All** runs once on each enabled node. Select an exact node when work must run there.",
  }),
  nextRun: field(z.string(), {
    label: "Next run (UTC)",
    description:
      "The next matching schedule time in UTC. A dash means there is no upcoming occurrence.",
  }),
  scheduled: field(z.string(), {
    label: "Scheduled (UTC)",
    description:
      "The UTC occurrence time for this run. Dispatch may follow on the next scheduler tick.",
  }),
  started: field(z.string(), {
    label: "Started (UTC)",
    description:
      "When this run started executing in UTC. A dash means it has not started.",
  }),
  finished: field(z.string(), {
    label: "Finished (UTC)",
    description:
      "When this run completed in UTC. A dash means completion has not been recorded.",
  }),
  arguments: field(z.string(), {
    label: "Inputs (JSON)",
    description:
      'Values passed to the program, in order. Use a JSON array such as `[{"message":"Hello"}]`, or `[]` for no inputs.',
  }),
  sandboxGroup: runtimeInfo.shape.sandboxGroup,
  enabled: field(z.boolean(), {
    label: "Enabled",
    description:
      "Allow this schedule to create new runs. Pausing does not cancel runs already queued or running.",
  }),
  datetimes: field(z.string(), {
    label: "Specific datetimes (UTC)",
    description:
      "Specific UTC appointments, one `YYYY-MM-DD HH:MM` datetime per line. These can be combined with a recurring pattern.",
  }),
  recurring: field(z.boolean(), {
    label: "Repeat",
    description:
      "Add a recurring pattern alongside any specific UTC appointments.",
  }),
  startDate: field(z.string(), {
    label: "Start date (UTC)",
    description: "The first UTC date on which the recurring pattern may run.",
  }),
  monthIncluded: field(z.boolean(), {
    label: "Month included",
    description:
      "Include this month in the recurring pattern. Only checked months can produce recurring runs.",
  }),
  weekdayIncluded: field(z.boolean(), {
    label: "Weekday included",
    description:
      "Run on this weekday at each listed UTC time, within the selected months.",
  }),
  dayMode: field(z.enum(["weekdays", "dates"]), {
    label: "Choose days by",
    description:
      "Choose weekdays such as Monday, or numbered dates such as the 1st and 15th of each month.",
  }),
  dates: field(z.string(), {
    label: "Dates of month",
    description:
      "Comma-separated dates from **1** through **31**. Dates missing from a month are skipped.",
  }),
  times: field(z.string(), {
    label: "Times (UTC)",
    description:
      "Separate 24-hour `HH:MM` times with commas, for example `09:00, 14:30`.",
  }),
  executionId: field(z.string(), {
    label: "Execution ID",
    description:
      "The kernel job execution associated with this run, available after execution returns its identity.",
  }),
  contextId: field(z.string(), {
    label: "Context ID",
    description:
      "The execution context used to correlate this run with its logs and child work.",
  }),
  failure: field(z.string(), {
    label: "Failure",
    description: "The reported reason this run failed or was interrupted.",
  }),
  output: field(z.string(), {
    label: "Output (JSON)",
    description:
      "The program result as JSON. Pending means this run has not yet returned a result.",
  }),
  capture: field(z.string(), {
    label: "Capture",
    description:
      "Whether the stored result is complete or was shortened because it exceeded the capture limit.",
    valueHelp: choiceHelp(z.string(), [
      "Complete",
      "Output exceeded the capture limit.",
    ]),
  }),
});

export function nodeField(choices: readonly ValueHelpItem<string>[]) {
  return field(jobInfo.shape.node, {
    valueHelp: choiceHelp(jobInfo.shape.node, choices),
  });
}
