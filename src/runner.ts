import { context } from "@the8020/context";
import { kernel } from "@the8020/kernel";
import { db, transaction } from "/p/the8020/db/mod.ts";
import Schedules, { type ScheduleRow } from "../tables/schedules.ts";
import Cursors from "../tables/cursors.ts";
import Runs, { type RunRow } from "../tables/runs.ts";
import { advance } from "./calendar.ts";
import { definition, enabledNodes, json, queuedRun } from "./store.ts";
import type { JobInput, JobRun } from "./types.ts";

const shortTransaction = { lockTimeoutMs: 25, timeoutMs: 2000 };
const executionTimeoutMs = 5 * 60 * 1000;
const batchSize = 32;

/** Invoked by minute and jobs-ready events. Each node owns its own cursor. */
export async function scan(now = new Date()): Promise<void> {
  const nodeId = context.nodeId;
  if (!(await enabledNodes()).includes(nodeId)) return;
  await db.updateTable(Runs.table).set({
    state: "interrupted",
    finishedAt: now,
    failure:
      "Execution stopped before reporting completion; its outcome is unknown.",
  })
    .where(
      "id",
      "in",
      db.selectFrom(Runs.table).select("id").where("state", "=", "running")
        .where("deadlineAt", "<=", now).orderBy("deadlineAt").limit(batchSize),
    )
    .where("state", "=", "running").execute();

  // Filter by this node before reading calendars. Cursor rows belong to one
  // node and revision, so All nodes never compete to advance a shared schedule.
  for (const target of ["any", "all", "node:" + nodeId]) {
    const due = await db.selectFrom(`${Schedules.table} as s`)
      .leftJoin(
        `${Cursors.table} as c`,
        (join) =>
          join.onRef("c.scheduleId", "=", "s.id").on("c.nodeId", "=", nodeId)
            .onRef("c.revision", "=", "s.revision"),
      )
      .selectAll("s").select(["c.id as cursorId", "c.nextRunAt as cursorNext"])
      .where("s.enabled", "=", true).where("s.node", "=", target)
      .where((eb) =>
        eb.or([
          eb.and([eb("c.id", "is", null), eb("s.firstRunAt", "<=", now)]),
          eb("c.nextRunAt", "<=", now),
        ])
      )
      .orderBy((eb) => eb.fn.coalesce("c.nextRunAt", "s.firstRunAt")).orderBy(
        "s.id",
      ).limit(batchSize).execute();
    for (const row of due) {
      const at = row.cursorId === null ? row.firstRunAt : row.cursorNext;
      if (!at) continue;
      try {
        await materialize(row, nodeId, at, now);
      } catch (error) {
        console.error("Schedule attempt failed", row.id, error);
      }
    }
  }

  const candidates: Pick<RunRow, "id" | "targetNode" | "createdAt">[] = [];
  for (const target of ["any", "node:" + nodeId]) {
    candidates.push(
      ...await db.selectFrom(Runs.table).select([
        "id",
        "targetNode",
        "createdAt",
      ])
        .where("state", "=", "queued").where("targetNode", "=", target)
        .orderBy("createdAt").orderBy("id").limit(batchSize).execute(),
    );
  }
  candidates.sort((a, b) =>
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  // Keep this listener alive to capture results, while all selected programs
  // run asynchronously in parallel. Event emission never waits for this work.
  const running: Promise<void>[] = [];
  for (const candidate of candidates.slice(0, batchSize)) {
    try {
      const run = await claim(candidate.id, candidate.targetNode, nodeId, now);
      if (run) {
        running.push(
          execute(run, nodeId).catch((error) => {
            console.error("Save job result failed", run.id, error);
          }),
        );
      }
    } catch (error) {
      console.error("Job claim attempt failed", candidate.id, error);
    }
  }
  await Promise.all(running);
}

async function materialize(
  row: ScheduleRow,
  nodeId: string,
  at: Date,
  now: Date,
): Promise<void> {
  const input = definition(row, now).input;
  const nextRunAt = advance(input.schedule, at, now);
  const target = input.node === "all" ? "node:" + nodeId : input.node;
  const occurrence = `${row.id}:${row.revision}:${at.toISOString()}`;
  const cursorId = `${row.id}:${encodeURIComponent(nodeId)}`;
  await transaction(shortTransaction, async (tx) => {
    const active = await tx.selectFrom(Schedules.table).select("id").where(
      "id",
      "=",
      row.id,
    ).where("revision", "=", row.revision).where("enabled", "=", true)
      .executeTakeFirst();
    if (!active) return;
    const current = await tx.selectFrom(Cursors.table).select([
      "revision",
      "nextRunAt",
    ]).where("id", "=", cursorId).executeTakeFirst();
    if (current && current.revision === row.revision) {
      const changed = await tx.updateTable(Cursors.table).set({ nextRunAt })
        .where("id", "=", cursorId).where("revision", "=", row.revision).where(
          "nextRunAt",
          "=",
          at,
        ).executeTakeFirst();
      if (changed.numUpdatedRows !== 1n) return;
    } else {
      const inserted = await tx.insertInto(Cursors.table).values({
        id: cursorId,
        scheduleId: row.id,
        nodeId,
        revision: row.revision,
        nextRunAt,
      })
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({ revision: row.revision, nextRunAt })
            .where(`${Cursors.table}.revision`, "<", row.revision)
        ).returning("id").executeTakeFirst();
      if (!inserted) return;
    }
    await tx.insertInto(Runs.table).values(
      queuedRun(input, row.id, occurrence, target, at),
    )
      .onConflict((oc) =>
        oc.columns(["occurrenceId", "targetNode"]).doNothing()
      ).execute();
  });
}

async function claim(
  id: string,
  target: string,
  nodeId: string,
  now: Date,
): Promise<RunRow | undefined> {
  if (target !== "any" && target !== "node:" + nodeId) return;
  const take = (connection: typeof db) =>
    connection.updateTable(Runs.table)
      .set({
        state: "running",
        nodeId,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + executionTimeoutMs + 30000),
      })
      .where("id", "=", id).where("state", "=", "queued").where(
        "nodeId",
        "=",
        "",
      ).where("targetNode", "=", target)
      .returningAll().executeTakeFirst();
  // A short conditional write assigns Any to exactly one node. All/exact rows
  // already target this node and need no distributed transaction or row lock.
  return target === "any"
    ? await transaction(shortTransaction, take)
    : await take(db);
}

async function execute(run: RunRow, nodeId: string): Promise<void> {
  const input = run.input as unknown as JobInput;
  let state: "succeeded" | "failed" = "failed",
    failure = "",
    executionId = "",
    packageCommit = "";
  let result: unknown = null, logs: JobRun["logs"] = [];
  try {
    const completed = await kernel.programs.run({
      programId: input.programId,
      arguments: input.arguments,
      username: input.username,
      sandboxGroup: input.sandboxGroup,
      timeoutMs: executionTimeoutMs,
    });
    ({ state, failure, executionId, packageCommit } = completed);
    result = completed.result;
    logs = completed.logs ?? [];
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const captured = capture(result, logs);
  await db.updateTable(Runs.table).set({
    state,
    failure: failure.slice(0, 8192),
    executionId,
    packageCommit,
    result: json(captured.result),
    logs: json(captured.logs),
    truncated: captured.truncated,
    finishedAt: new Date(),
  })
    .where("id", "=", run.id).where("nodeId", "=", nodeId).where(
      "state",
      "=",
      "running",
    ).execute();
}

export function capture(
  result: unknown,
  logs: JobRun["logs"],
): { result: unknown; logs: JobRun["logs"]; truncated: boolean } {
  const bytes = (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)).length;
  let truncated = false;
  if (result === undefined) result = null;
  if (bytes(result) > 256 * 1024) {
    result = "Output exceeded the 256 KiB limit.";
    truncated = true;
  }
  const tail: JobRun["logs"] = [];
  let size = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = { ...logs[i]! };
    if (log.message.length > 8192) {
      log.message = log.message.slice(0, 8192);
      truncated = true;
    }
    const length = bytes(log);
    if (size + length > 256 * 1024 || tail.length === 512) {
      truncated = true;
      break;
    }
    tail.push(log);
    size += length;
  }
  return { result, logs: tail.reverse(), truncated };
}
