import { context } from "@the8020/context";
import {
  formatLogRecord,
  kernel,
  type LogPage,
  type LogQuery,
} from "@the8020/kernel";
import type { JobDefinition, JobRunSummary } from "./types.ts";
import { jobStore } from "./store.ts";
import {
  BACK_EVENT,
  callScreen,
  field,
  invokeProgram,
  type LayoutDocument,
  Model,
  presentPage,
  ProgramExecutionError,
  sendMessage,
  z,
} from "/p/the8020/uui/mod.ts";
import Users from "/p/the8020/users/tables/users.ts";
import {
  argumentsFromText,
  dateText,
  type EditorModel,
  editorModel,
  inputFromModel,
  months,
  nodeOptions,
  nodeText,
  weekdays,
} from "./form.ts";

const ScheduleRow = z.object({
  id: z.string(),
  name: z.string(),
  program: z.string(),
  user: z.string(),
  node: z.string(),
  enabled: z.boolean(),
  nextRun: z.string(),
});
const RunRow = z.object({
  id: z.string(),
  name: z.string(),
  program: z.string(),
  state: z.string(),
  node: z.string(),
  scheduled: z.string(),
  finished: z.string(),
});

function listLayout(
  id: string,
  bind: string,
  display: string[],
): LayoutDocument {
  return {
    schema: 1,
    id,
    root: { id, type: "list", bind, key: "id", display },
  };
}

export async function jobs(): Promise<void> {
  let offset = 0;
  let screenModel: Model<z.infer<typeof screenModelSchema>> | undefined;
  const screenModelSchema = z.object({ schedules: z.array(ScheduleRow) });
  while (true) {
    const page = await jobStore.list(offset);
    const screenModelData = {
      schedules: page.items.map((item) => ({
        id: item.id,
        name: item.name,
        program: item.programId,
        user: item.username,
        node: nodeText(item.node),
        enabled: item.enabled,
        nextRun: dateText(item.nextRunAt),
      })),
    };
    screenModel ??= new Model(screenModelData);
    screenModel.data = screenModelData;
    const event = await callScreen({
      id: "jobs-list",
      title: "Jobs",
      schema: screenModelSchema,
      model: screenModel,
      layout: listLayout("jobs-list", "schedules", [
        "name",
        "program",
        "user",
        "node",
        "enabled",
        "nextRun",
      ]),
      header: {
        actions: [
          { id: "run", label: "Run program", kind: "primary" },
          { id: "add", label: "New schedule" },
          { id: "history", label: "Run history" },
          { id: "refresh", label: "[[icon=refresh]] Refresh" },
          ...(offset > 0 ? [{ id: "previous", label: "Previous" }] : []),
          ...(page.hasMore ? [{ id: "next", label: "Next" }] : []),
        ],
      },
    });
    if (event.action === BACK_EVENT) return;
    try {
      if (event.action === "run") await runProgram();
      if (event.action === "add") await editJob(true);
      if (event.action === "history") await runHistory();
      if (event.action === "select" && typeof event.value === "string") {
        await editJob(true, event.value);
      }
      if (event.action === "next" && page.hasMore) offset += 50;
      if (event.action === "previous") offset = Math.max(0, offset - 50);
    } catch (error) {
      reportError(error);
    }
  }
}

async function choices() {
  const [programs, users, topology] = await Promise.all([
    kernel.programs.list(),
    Users.select([Users.username, Users.enabled]).orderBy(Users.username).limit(
      2000,
    ).execute(),
    kernel.nodes.list(),
  ]);
  const nodes = topology as {
    nodes: { node: { id: string; enabled: boolean } }[];
    local_node_id: string;
  };
  const enabled = users.filter((user) => user.enabled).map((user) =>
    user.username
  );
  if (!users.some((user) => user.username === "system")) enabled.push("system");
  return {
    definitions: programs,
    programs: [
      { value: "", label: "Select a program" },
      ...programs.map((item) => ({
        value: item.program_id,
        label: `${item.program_id}${
          item.description ? ` — ${item.description}` : ""
        }`,
      })),
    ],
    users: enabled.map((username) => ({ value: username, label: username })),
    nodes: nodeOptions(
      nodes.nodes.filter((item) => item.node.enabled).map((item) =>
        item.node.id
      ),
    ),
  };
}

type Choices = Awaited<ReturnType<typeof choices>>;

function editorSchema(
  model: EditorModel,
  scheduled: boolean,
  options: Choices,
  interactive: boolean,
) {
  return z.object({
    name: field(z.string(), {
      label: "Name",
      length: "long",
      hidden: interactive,
    }),
    programId: field(z.string(), {
      label: "Program",
      control: "select",
      length: "long",
      options: options.programs,
      reactive: !scheduled,
    }),
    arguments: field(z.string(), {
      label: "Inputs (JSON)",
      control: "textarea",
      length: "long",
      rowSpan: 3,
      description:
        'A JSON array of arguments, for example [{"message":"Hello"}].',
    }),
    username: field(z.string(), {
      label: "Run as",
      control: "select",
      options: options.users,
      hidden: interactive,
    }),
    sandboxGroup: field(z.string(), {
      label: "Sandbox group",
      placeholder: "Default",
      hidden: interactive,
    }),
    node: field(z.string(), {
      label: "Node",
      control: "select",
      options: options.nodes,
      hidden: interactive,
    }),
    enabled: field(z.boolean(), { label: "Enabled", hidden: !scheduled }),
    datetimes: field(z.string(), {
      label: "Specific datetimes (UTC)",
      control: "textarea",
      rowSpan: 3,
      length: "long",
      hidden: !scheduled,
      placeholder: "2026-09-15 09:00\n2026-09-16 14:30",
      description: "One YYYY-MM-DD HH:MM datetime per line.",
    }),
    recurring: field(z.boolean(), {
      label: "Repeat",
      reactive: true,
      hidden: !scheduled,
    }),
    startDate: field(z.string(), {
      label: "Start date (UTC)",
      control: "date",
      hidden: !scheduled || !model.recurring,
    }),
    months: z.object(
      Object.fromEntries(
        months.map((
          label,
          i,
        ) => [
          `m${i + 1}`,
          field(z.boolean(), {
            label,
            length: "short",
            hidden: !scheduled || !model.recurring,
          }),
        ]),
      ),
    ),
    dayMode: field(z.enum(["weekdays", "dates"]), {
      label: "Choose days by",
      reactive: true,
      hidden: !scheduled || !model.recurring,
      options: [{ value: "weekdays", label: "Days of week" }, {
        value: "dates",
        label: "Dates of month",
      }],
    }),
    weekdays: z.object(
      Object.fromEntries(
        weekdays.map((
          label,
          i,
        ) => [
          `d${i}`,
          field(z.boolean(), {
            label,
            length: "short",
            hidden: !scheduled || !model.recurring ||
              model.dayMode !== "weekdays",
          }),
        ]),
      ),
    ),
    dates: field(z.string(), {
      label: "Dates of month",
      hidden: !scheduled || !model.recurring || model.dayMode !== "dates",
      placeholder: "1, 15, 31",
      description: "Dates missing from a month are skipped.",
    }),
    times: field(z.string(), {
      label: "Times (UTC)",
      length: "long",
      hidden: !scheduled || !model.recurring,
      placeholder: "09:00, 14:30",
      description: "Separate HH:MM times with commas.",
    }),
  });
}

function editorLayout(
  model: EditorModel,
  scheduled: boolean,
  interactive: boolean,
): LayoutDocument {
  const groups: LayoutDocument["root"][] = [
    {
      id: "program",
      type: "field-group",
      title: "Program",
      controls: [...(interactive ? [] : ["name"]), "programId", "arguments"],
    },
    ...(interactive ? [] : [{
      id: "execution",
      type: "field-group" as const,
      title: "Execution",
      controls: ["username", "sandboxGroup", "node"],
    }]),
  ];
  if (scheduled) {
    groups.push({
      id: "schedule",
      type: "field-group",
      title: "Schedule",
      controls: ["enabled", "datetimes", "recurring", "startDate"],
    });
    if (model.recurring) {
      groups.push(
        {
          id: "months",
          type: "field-group",
          title: "Months",
          controls: months.map((_, i) => `months.m${i + 1}`),
        },
        {
          id: "days",
          type: "field-group",
          title: "Days and times",
          controls: [
            "dayMode",
            ...(model.dayMode === "weekdays"
              ? weekdays.map((_, i) => `weekdays.d${i}`)
              : ["dates"]),
            "times",
          ],
        },
      );
    }
  }
  return {
    schema: 1,
    id: "job-editor",
    root: {
      id: "job",
      type: "section",
      title: scheduled ? "Schedule" : "Run program",
      children: groups,
    },
  };
}

export function runProgram(
  programId = "",
  packagesRoot = "/workspace/packages",
): Promise<void> {
  return editJob(false, undefined, programId, packagesRoot);
}

export async function editJob(
  scheduled: boolean,
  id?: string,
  programId = "",
  packagesRoot = "/workspace/packages",
): Promise<void> {
  let definition: JobDefinition | undefined = id
    ? await jobStore.inspect(id)
    : undefined;
  let model = editorModel(context.username, definition);
  const screenModel = new Model(model);
  let options = await choices();
  if (programId) {
    const program = options.definitions.find((item) =>
      item.program_id === programId
    );
    if (!program) throw new TypeError("Select a ready program.");
    model.programId = program.program_id;
    model.name = program.description || program.name;
  }
  while (true) {
    const interactive = !scheduled &&
      options.definitions.some((program) =>
        program.program_id === model.programId && program.uui
      );
    const event = await callScreen({
      id: "job-editor",
      title: definition
        ? `Job ${definition.input.name}`
        : scheduled
        ? "New schedule"
        : "Run program",
      schema: editorSchema(model, scheduled, options, interactive),
      model: screenModel,
      layout: editorLayout(model, scheduled, interactive),
      header: {
        actions: [
          {
            id: scheduled ? "save" : "run",
            label: scheduled ? "Save" : "Run",
            kind: "primary",
          },
          ...(definition
            ? [{ id: "run-saved", label: "Run now" }, {
              id: "history",
              label: "Run history",
            }, { id: "refresh", label: "[[icon=refresh]] Refresh" }]
            : []),
        ],
      },
    });
    if (event.action === BACK_EVENT) return;
    let interactiveInputs: unknown[] | undefined;
    try {
      if (event.action === "save") {
        definition = await jobStore.save({
          id: definition?.id ?? "",
          revision: definition?.revision ?? 0,
          enabled: model.enabled,
          input: inputFromModel(model, true),
        });
        sendMessage("Schedule saved.", "success");
      }
      if (event.action === "run") {
        const selected = options.definitions.find((program) =>
          program.program_id === model.programId
        );
        if (!selected) throw new TypeError("Select a ready program.");
        if (selected.uui) {
          interactiveInputs = argumentsFromText(model.arguments);
        } else {
          const runs = await jobStore.submit(inputFromModel(model, false));
          await openSubmitted(runs);
          return;
        }
      }
      if (event.action === "run-saved" && definition) {
        await openSubmitted(
          await jobStore.runNow(definition.id),
          definition.id,
        );
      }
      if (event.action === "history" && definition) {
        await runHistory(definition.id);
      }
      if (event.action === "refresh" && definition) {
        definition = await jobStore.inspect(definition.id);
        model = editorModel(context.username, definition);
        screenModel.data = model;
        options = await choices();
      }
    } catch (error) {
      reportError(error);
    }
    if (interactiveInputs !== undefined) {
      await presentPage(() =>
        invokeProgram(model.programId, interactiveInputs, packagesRoot)
      );
      return;
    }
  }
}

async function openSubmitted(runs: JobRunSummary[], scheduleId = "") {
  sendMessage(
    `${runs.length} ${runs.length === 1 ? "run" : "runs"} queued.`,
    "success",
  );
  if (runs.length === 1) await runDetail(runs[0]!.id);
  else await runHistory(scheduleId);
}

export async function runHistory(scheduleId = ""): Promise<void> {
  let offset = 0;
  let screenModel1: Model<z.infer<typeof screenModel1Schema>> | undefined;
  const screenModel1Schema = z.object({ runs: z.array(RunRow) });
  while (true) {
    const page = await jobStore.runs.list(scheduleId, offset);
    const screenModel1Data = {
      runs: page.items.map((run) => ({
        id: run.id,
        name: run.name,
        program: run.programId,
        state: run.state,
        node: run.nodeId || nodeText(run.targetNode),
        scheduled: dateText(run.scheduledAt),
        finished: dateText(run.finishedAt),
      })),
    };
    screenModel1 ??= new Model(screenModel1Data);
    screenModel1.data = screenModel1Data;
    const event = await callScreen({
      id: "job-runs",
      title: "Run history",
      schema: screenModel1Schema,
      model: screenModel1,
      layout: listLayout("job-runs", "runs", [
        "name",
        "program",
        "state",
        "node",
        "scheduled",
        "finished",
      ]),
      header: {
        actions: [
          { id: "refresh", label: "[[icon=refresh]] Refresh" },
          ...(offset > 0 ? [{ id: "previous", label: "Previous" }] : []),
          ...(page.hasMore ? [{ id: "next", label: "Next" }] : []),
        ],
      },
    });
    if (event.action === BACK_EVENT) return;
    if (event.action === "select" && typeof event.value === "string") {
      try {
        await runDetail(event.value);
      } catch (error) {
        reportError(error);
      }
    }
    if (event.action === "next" && page.hasMore) offset += 50;
    if (event.action === "previous") offset = Math.max(0, offset - 50);
  }
}

export async function runDetail(id: string): Promise<void> {
  let logView: Pick<LogQuery, "cursor" | "tail"> = {};
  const text = (label: string, long = false) =>
    field(z.string(), {
      label,
      readOnly: true,
      ...(long
        ? { control: "textarea" as const, length: "long" as const, rowSpan: 4 }
        : {}),
    });
  let screenModel2:
    | Model<
      Record<
        | "id"
        | "state"
        | "program"
        | "user"
        | "node"
        | "sandboxGroup"
        | "scheduled"
        | "started"
        | "finished"
        | "failure"
        | "inputs"
        | "output"
        | "logs"
        | "capture",
        string
      >
    >
    | undefined;
  while (true) {
    const run = await jobStore.runs.inspect(id);
    let logPage: LogPage | undefined;
    if (run.executionId && run.nodeId) {
      try {
        logPage = await kernel.logs.query({
          node_id: run.nodeId,
          job_id: run.executionId,
          context_id: run.contextId || undefined,
          from: run.createdAt,
          position: logView.cursor || logView.tail
            ? undefined
            : run.logPosition || undefined,
          ...logView,
          limit: 100,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        logPage = {
          state: "unavailable",
          records: [],
          more: false,
          scanned_bytes: 0,
        };
      }
    }
    const schema = z.object({
      id: field(z.string(), {
        label: "Run ID",
        readOnly: true,
        length: "long",
      }),
      state: text("State"),
      program: text("Program"),
      user: text("Run as"),
      node: field(z.string(), {
        label: "Node",
        readOnly: true,
        length: "long",
      }),
      sandboxGroup: text("Sandbox group"),
      scheduled: text("Scheduled"),
      started: text("Started"),
      finished: text("Finished"),
      failure: field(z.string(), {
        label: "Failure",
        readOnly: true,
        length: "long",
        control: "textarea",
        rowSpan: 2,
        hidden: run.failure === "",
      }),
      inputs: text("Inputs (JSON)", true),
      output: text("Output (JSON)", true),
      logs: text("Logs", true),
      capture: field(z.string(), {
        label: "Capture",
        readOnly: true,
        hidden: !run.truncated,
      }),
    });
    const screenModel2Data = {
      id: run.id,
      state: run.state,
      program: run.programId,
      user: run.username,
      node: run.nodeId || nodeText(run.targetNode),
      sandboxGroup: run.input.sandboxGroup || "Default",
      scheduled: dateText(run.scheduledAt),
      started: dateText(run.startedAt),
      finished: dateText(run.finishedAt),
      failure: run.failure || "—",
      inputs: JSON.stringify(run.input.arguments, null, 2),
      output: run.state === "queued" || run.state === "running"
        ? "Pending"
        : JSON.stringify(run.result, null, 2),
      logs: logPage?.state === "expired"
        ? "These logs have expired."
        : logPage?.state === "unavailable"
        ? "Logs are currently unavailable."
        : logPage
        ? logPage.records.map(formatLogRecord).join("\n") ||
          "No log messages in this page."
        : run.state === "queued" || run.state === "running"
        ? "Logs will be available after this run finishes."
        : "Logs for this run are unavailable.",
      capture: run.truncated
        ? "Output exceeded the capture limit."
        : "Complete",
    };
    screenModel2 ??= new Model(screenModel2Data);
    screenModel2.data = screenModel2Data;
    const event = await callScreen({
      id: "job-run",
      title: `Run ${run.name}`,
      schema,
      model: screenModel2,
      layout: {
        schema: 1,
        id: "job-run",
        root: {
          id: "run",
          type: "section",
          title: "Run",
          children: [
            {
              id: "status",
              type: "field-group",
              title: "Status",
              controls: [
                "id",
                "state",
                "program",
                "user",
                "node",
                "sandboxGroup",
                "scheduled",
                "started",
                "finished",
                "failure",
              ],
            },
            {
              id: "results",
              type: "field-group",
              title: "Inputs and output",
              controls: ["inputs", "output", "capture"],
            },
            {
              id: "logs",
              type: "field-group",
              title: "Logs",
              controls: ["logs"],
            },
          ],
        },
      },
      header: {
        actions: [
          { id: "refresh", label: "[[icon=refresh]] Refresh" },
          ...(run.executionId
            ? [
              { id: "first-logs", label: "First logs" },
              { id: "recent-logs", label: "Recent logs" },
            ]
            : []),
          ...(logPage?.more && logPage.cursor
            ? [{ id: "next-logs", label: "Next logs" }]
            : []),
        ],
      },
    });
    if (event.action === BACK_EVENT) {
      return;
    }
    if (event.action === "first-logs") logView = {};
    if (event.action === "recent-logs") logView = { tail: true };
    if (event.action === "next-logs" && logPage?.cursor) {
      logView = { cursor: logPage.cursor };
    }
  }
}

function reportError(error: unknown) {
  if (error instanceof ProgramExecutionError) throw error;
  sendMessage(error instanceof Error ? error.message : String(error), "error");
}
