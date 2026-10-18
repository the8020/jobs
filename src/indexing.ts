import { newId } from "@the8020/kernel";
import { db } from "/p/the8020/db/mod.ts";
import { z } from "/p/the8020/db/fields.ts";
import { parse } from "/p/the8020/packages/toml.ts";
import Packages from "/p/the8020/packages/tables/packages.ts";
import { lockIndexRevision } from "/p/the8020/system/src/indexes.ts";
import Schedules from "../tables/schedules.ts";
import { nextOccurrence } from "./calendar.ts";
import { definition, json, validateJobInput } from "./store.ts";
import type { JobInput } from "./types.ts";

export interface IndexScope {
  packages: { package_id: string; package_commit: string; active: boolean }[];
}

export interface IndexState {
  packages: Record<string, { error?: string }>;
}

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const declaration = z.object({
  name: z.string().optional(),
  program: z.string(),
  inputs: z.array(z.json()).default([]),
  username: z.string().default("system"),
  sandbox_group: z.string().default(""),
  node: z.string().default("any"),
  schedule: z.object({
    datetimes: z.array(z.string()).default([]),
    recurrence: z.object({
      start_date: z.string().default("1970-01-01"),
      months: z.array(z.number()).default([
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
      ]),
      day_mode: z.enum(["dates", "weekdays"]).default("weekdays"),
      dates: z.array(z.number()).default([]),
      weekdays: z.array(z.number()).optional(),
      times: z.array(z.string()),
    }).strict().optional(),
  }).strict(),
}).strict();

export async function parseJob(
  source: string,
  name: string,
): Promise<JobInput> {
  const parsed = declaration.parse(parse(source));
  const r = parsed.schedule.recurrence;
  return await validateJobInput({
    name: parsed.name ?? name,
    programId: parsed.program,
    arguments: parsed.inputs,
    username: parsed.username,
    sandboxGroup: parsed.sandbox_group,
    node: parsed.node,
    schedule: {
      datetimes: parsed.schedule.datetimes,
      recurrence: r
        ? {
          startDate: r.start_date,
          months: r.months,
          dayMode: r.day_mode,
          dates: r.dates,
          weekdays: r.weekdays ??
            (r.day_mode === "weekdays" ? [0, 1, 2, 3, 4, 5, 6] : []),
          times: r.times,
        }
        : null,
    },
  }, true);
}

async function readJobs(packageRoot: URL): Promise<Map<string, JobInput>> {
  const result = new Map<string, JobInput>();
  const folder = new URL("jobs/", packageRoot);
  try {
    const info = await Deno.lstat(folder);
    if (!info.isDirectory || info.isSymlink) {
      throw new Error("jobs must be a real directory");
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return result;
    throw error;
  }
  const root = await Deno.realPath(packageRoot);
  if (!(await Deno.realPath(folder)).startsWith(`${root}/`)) {
    throw new Error("jobs must stay within its package");
  }
  for await (const entry of Deno.readDir(folder)) {
    if (!entry.isFile || entry.isSymlink) {
      throw new Error("jobs must contain only regular files");
    }
    if (!entry.name.endsWith(".toml")) continue;
    const name = entry.name.slice(0, -5);
    if (!namePattern.test(name)) {
      throw new Error(`Invalid static job name: ${name}`);
    }
    if (result.size >= 2048) throw new Error("jobs exceeds 2048 declarations");
    const file = new URL(entry.name, folder);
    if ((await Deno.stat(file)).size > 64 * 1024) {
      throw new Error("Job declaration exceeds 64 KiB");
    }
    result.set(name, await parseJob(await Deno.readTextFile(file), name));
  }
  return result;
}

/** Runs in the ordinary package indexing pass, never in the minute scanner. */
export async function buildIndex(
  state: IndexState,
  scope: Readonly<IndexScope>,
  root = new URL("file:///workspace/packages/"),
): Promise<void> {
  for (const selected of scope.packages) {
    try {
      await indexPackage(selected, root);
    } catch (error) {
      state.packages[selected.package_id]!.error = error instanceof Error
        ? error.message
        : String(error);
    }
  }
}

async function indexPackage(
  scope: IndexScope["packages"][number],
  root: URL,
): Promise<void> {
  const parts = scope.package_id.split("/");
  if (parts.length !== 2 || !parts.every((part) => namePattern.test(part))) {
    throw new Error("Invalid package scope");
  }
  const sources = scope.active
    ? await readJobs(new URL(`${scope.package_id}/`, root))
    : new Map<string, JobInput>();
  await db.transaction().execute(async (tx) => {
    await lockIndexRevision(tx);
    const current = await tx.selectFrom(Packages.table).select([
      "state",
      "activeCommit",
    ])
      .where("packageId", "=", scope.package_id).executeTakeFirst();
    if (
      scope.active
        ? current?.state !== "ready" ||
          current.activeCommit !== scope.package_commit
        : current?.state === "ready"
    ) {
      throw new Error(`Package ${scope.package_id} changed while indexing`);
    }
    const existing = await tx.selectFrom(Schedules.table).selectAll()
      .where("sourcePackage", "=", scope.package_id).execute();
    const now = new Date();
    for (const [name, input] of sources) {
      const ownerKey = `${scope.package_id}/${name}`;
      const previous = existing.find((row) => row.ownerKey === ownerKey);
      if (
        previous?.enabled &&
        JSON.stringify(definition(previous).input) === JSON.stringify(input)
      ) continue;
      const values = {
        ...input,
        arguments: json(input.arguments),
        schedule: json(input.schedule),
        enabled: true,
        firstRunAt: nextOccurrence(input.schedule, now),
        updatedAt: now,
      };
      if (previous) {
        await tx.updateTable(Schedules.table).set({
          ...values,
          revision: previous.revision + 1,
        })
          .where("id", "=", previous.id).execute();
      } else {
        await tx.insertInto(Schedules.table).values({
          ...values,
          id: newId("sch"),
          ownerKey,
          sourcePackage: scope.package_id,
          revision: 1,
          createdAt: now,
        }).execute();
      }
    }
    for (const row of existing) {
      if (
        row.enabled &&
        !sources.has(row.ownerKey!.slice(scope.package_id.length + 1))
      ) {
        await tx.updateTable(Schedules.table).set({
          enabled: false,
          firstRunAt: null,
          updatedAt: now,
        })
          .where("id", "=", row.id).execute();
      }
    }
  });
}
