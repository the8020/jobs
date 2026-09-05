import { kernel } from "@the8020/kernel";
import { db, type JSONValue } from "/p/the8020/db/mod.ts";
import { z } from "@the8020/http";
import Users from "/p/the8020/users/tables/users.ts";
import Schedules, { type ScheduleRow } from "../tables/schedules.ts";
import Runs, { type RunRow } from "../tables/runs.ts";
import { nextOccurrence, validateCalendar } from "./calendar.ts";
import type {
  JobDefinition,
  JobInput,
  JobPage,
  JobRun,
  JobRunSummary,
  JobSummary,
  SaveJobInput,
} from "./types.ts";

const recurrence = z.object({
  startDate: z.string(),
  months: z.array(z.number()),
  dayMode: z.enum(["dates", "weekdays"]),
  dates: z.array(z.number()),
  weekdays: z.array(z.number()),
  times: z.array(z.string()),
}).strict();
const inputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  programId: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
  ),
  arguments: z.array(z.json()),
  username: z.string().min(1),
  sandboxGroup: z.string().max(256).refine((s) => !s.includes("\0")),
  node: z.string(),
  schedule: z.object({
    datetimes: z.array(z.string()),
    recurrence: recurrence.nullable(),
  }).strict(),
}).strict();

export const summaryColumns = [
  "id",
  "scheduleId",
  "occurrenceId",
  "name",
  "programId",
  "username",
  "targetNode",
  "nodeId",
  "state",
  "scheduledAt",
  "createdAt",
  "startedAt",
  "finishedAt",
] as const;
export const json = (value: unknown): JSONValue =>
  JSON.parse(JSON.stringify(value));
export const iso = (date: Date | null) => date?.toISOString() ?? null;

export async function enabledNodes(): Promise<string[]> {
  const topology = await kernel.nodes.list() as {
    nodes: { node: { id: string; enabled: boolean } }[];
    local_node_id: string;
  };
  const nodes = topology.nodes.map((item) => item.node);
  const enabled = nodes.filter((node) => node.enabled).map((node) => node.id);
  if (!nodes.some((node) => node.id === topology.local_node_id)) {
    enabled.push(topology.local_node_id);
  }
  return [...new Set(enabled)].sort();
}

async function validate(
  input: JobInput,
  scheduled: boolean,
): Promise<JobInput> {
  if (new TextEncoder().encode(JSON.stringify(input)).length > 64 * 1024) {
    throw new Error("Job inputs must be JSON no larger than 64 KiB.");
  }
  const parsed = inputSchema.parse(json(input));
  parsed.node ||= "any";
  if (scheduled) validateCalendar(parsed.schedule);
  else parsed.schedule = { datetimes: [], recurrence: null };
  parsed.schedule.datetimes = [
    ...new Set(
      parsed.schedule.datetimes.map((value) => new Date(value).toISOString()),
    ),
  ].sort();
  const [programs, nodes, user] = await Promise.all([
    kernel.programs.list(),
    enabledNodes(),
    Users.select([Users.username, Users.enabled]).where(
      Users.username,
      "=",
      parsed.username,
    ).executeTakeFirst(),
  ]);
  if (!programs.some((program) => program.program_id === parsed.programId)) {
    throw new Error("Select a ready program.");
  }
  if (user?.enabled === false || (!user && parsed.username !== "system")) {
    throw new Error("Select an enabled execution user.");
  }
  if (
    parsed.node !== "any" && parsed.node !== "all" &&
    (!parsed.node.startsWith("node:") || !nodes.includes(parsed.node.slice(5)))
  ) throw new Error("Select an enabled node, Any, or All.");
  return parsed;
}

export function definition(row: ScheduleRow, now = new Date()): JobDefinition {
  const input: JobInput = {
    name: row.name,
    programId: row.programId,
    arguments: row.arguments as unknown[],
    username: row.username,
    sandboxGroup: row.sandboxGroup,
    node: row.node,
    schedule: row.schedule as unknown as JobInput["schedule"],
  };
  return {
    id: row.id,
    input,
    enabled: row.enabled,
    revision: row.revision,
    nextRunAt: row.enabled ? iso(nextOccurrence(input.schedule, now)) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function runSummary(
  row: Pick<RunRow, typeof summaryColumns[number]>,
): JobRunSummary {
  return {
    ...row,
    scheduledAt: row.scheduledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

export function queuedRun(
  input: JobInput,
  scheduleId: string,
  occurrenceId: string,
  target: string,
  at: Date,
) {
  return {
    id: `run:${occurrenceId}:${encodeURIComponent(target)}`,
    scheduleId,
    occurrenceId,
    name: input.name,
    programId: input.programId,
    username: input.username,
    targetNode: target,
    nodeId: "",
    state: "queued" as const,
    scheduledAt: at,
    createdAt: new Date(),
    startedAt: null,
    finishedAt: null,
    deadlineAt: null,
    input: json(input),
    executionId: "",
    packageCommit: "",
    result: null,
    logs: [],
    failure: "",
    truncated: false,
  };
}

async function wake(): Promise<void> {
  try {
    await kernel.events.emit("jobs-ready");
  } catch (error) {
    console.error("Jobs remain queued for the next minute event:", error);
  }
}

function offsetOf(offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    throw new Error("Invalid page offset.");
  }
  return offset;
}
function page<T>(items: T[]): JobPage<T> {
  return { items: items.slice(0, 50), hasMore: items.length > 50 };
}

async function inspect(id: string): Promise<JobDefinition> {
  const row = await db.selectFrom(Schedules.table).selectAll().where(
    Schedules.id,
    "=",
    id,
  ).executeTakeFirst();
  if (!row) throw new Error("Schedule was not found.");
  return definition(row);
}
async function submit(
  input: JobInput,
  scheduleId = "",
): Promise<JobRunSummary[]> {
  const selected = await validate(input, false);
  const targets = selected.node === "all"
    ? (await enabledNodes()).map((id) => "node:" + id)
    : [selected.node];
  if (!targets.length || targets.length > 256) {
    throw new Error("Select between 1 and 256 enabled nodes.");
  }
  const occurrenceId = crypto.randomUUID(), at = new Date();
  const rows = targets.map((target) =>
    queuedRun(selected, scheduleId, occurrenceId, target, at)
  );
  await db.insertInto(Runs.table).values(rows).execute();
  await wake();
  return rows.map(runSummary);
}

export const jobStore = {
  async save(request: SaveJobInput): Promise<JobDefinition> {
    if (
      !Number.isSafeInteger(request.revision) || request.revision < 0 ||
      typeof request.enabled !== "boolean"
    ) throw new Error("Invalid schedule revision or enabled state.");
    const input = await validate(request.input, true), now = new Date();
    const nextRunAt = request.enabled
      ? nextOccurrence(input.schedule, now)
      : null;
    if (request.enabled && !nextRunAt) {
      throw new Error("The schedule has no future occurrence.");
    }
    const values = {
      ...input,
      arguments: json(input.arguments),
      schedule: json(input.schedule),
      enabled: request.enabled,
      firstRunAt: nextRunAt,
      updatedAt: now,
    };
    const id = request.id || crypto.randomUUID();
    if (request.id) {
      const updated = await db.updateTable(Schedules.table).set({
        ...values,
        revision: request.revision + 1,
      }).where("id", "=", id).where("revision", "=", request.revision)
        .executeTakeFirst();
      if (updated.numUpdatedRows !== 1n) {
        throw new Error("Schedule changed; refresh before saving.");
      }
    } else {
      if (request.revision !== 0) {
        throw new Error("Invalid initial schedule revision.");
      }
      await db.insertInto(Schedules.table).values({
        ...values,
        id,
        revision: 1,
        createdAt: now,
      }).execute();
    }
    return inspect(id);
  },
  inspect,
  async list(offset = 0): Promise<JobPage<JobSummary>> {
    const rows = await db.selectFrom(Schedules.table).selectAll().orderBy(
      Schedules.createdAt,
      "desc",
    ).orderBy(Schedules.id, "desc").limit(51).offset(offsetOf(offset))
      .execute();
    return page(rows.map((row) => {
      const item = definition(row);
      return {
        id: item.id,
        name: row.name,
        programId: row.programId,
        username: row.username,
        node: row.node,
        enabled: row.enabled,
        nextRunAt: item.nextRunAt,
      };
    }));
  },
  submit: (input: JobInput) => submit(input),
  async runNow(id: string): Promise<JobRunSummary[]> {
    return submit((await inspect(id)).input, id);
  },
  runs: {
    async list(scheduleId = "", offset = 0): Promise<JobPage<JobRunSummary>> {
      let query = db.selectFrom(Runs.table).select(summaryColumns).orderBy(
        "createdAt",
        "desc",
      ).orderBy("id", "desc").limit(51).offset(offsetOf(offset));
      if (scheduleId) query = query.where("scheduleId", "=", scheduleId);
      return page((await query.execute()).map(runSummary));
    },
    async inspect(id: string): Promise<JobRun> {
      const row = await db.selectFrom(Runs.table).selectAll().where(
        Runs.id,
        "=",
        id,
      ).executeTakeFirst();
      if (!row) throw new Error("Run was not found.");
      return {
        ...runSummary(row),
        input: row.input as unknown as JobInput,
        executionId: row.executionId,
        packageCommit: row.packageCommit,
        result: row.result,
        logs: row.logs as unknown as JobRun["logs"],
        failure: row.failure,
        truncated: row.truncated,
      };
    },
  },
};
