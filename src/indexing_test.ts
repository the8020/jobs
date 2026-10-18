import { assertEquals, assertRejects } from "@std/assert";
import { DatabaseFixture } from "./test_support.ts";
import {
  buildIndex,
  type IndexScope,
  type IndexState,
  parseJob,
} from "./indexing.ts";
import { jobStore } from "./store.ts";
import { scan } from "./runner.ts";

const manifest = (
  node = "any",
  at = new Date(Date.now() + 5000).toISOString(),
) => `
name = "Maintenance"
program = "the8020/jobs/echo"
inputs = [{message = "hello"}, 42]
node = "${node}"
[schedule]
datetimes = ["${at}"]
`;

async function fixture() {
  const db = new DatabaseFixture();
  const root = new URL(`file://${db.directory}/packages/`);
  await Deno.mkdir(new URL("acme/app/jobs/", root), { recursive: true });
  db.database.exec(
    "INSERT INTO the8020__packages__packages (packageId,state,activeCommit) VALUES ('acme/app','ready','first')",
  );
  const selected = {
    package_id: "acme/app",
    package_commit: "first",
    active: true,
  };
  const scope: IndexScope = { packages: [selected] };
  return {
    db,
    root,
    selected,
    async write(name: string, source: string) {
      await Deno.writeTextFile(
        new URL(`acme/app/jobs/${name}.toml`, root),
        source,
      );
    },
    async index() {
      const state: IndexState = { packages: { "acme/app": {} } };
      await buildIndex(state, scope, root);
      return state.packages["acme/app"]!.error;
    },
  };
}

Deno.test("static declarations reuse calendar/input validation and require full program IDs", async () => {
  const db = new DatabaseFixture();
  try {
    const job = await parseJob(
      `program = "the8020/jobs/echo"
[schedule.recurrence]
times = ["00:00", "12:00"]`,
      "daily",
    );
    assertEquals(job.name, "daily");
    assertEquals(job.arguments, []);
    assertEquals(job.node, "any");
    assertEquals(job.username, "system");
    assertEquals(job.schedule.recurrence?.weekdays, [0, 1, 2, 3, 4, 5, 6]);
    assertEquals(job.schedule.recurrence?.months.length, 12);
    await assertRejects(() =>
      parseJob(manifest().replace("the8020/jobs/echo", "echo"), "bad")
    );
    await assertRejects(() =>
      parseJob(
        manifest().replace("the8020/jobs/echo", "the8020.jobs.echo"),
        "bad",
      )
    );
    await assertRejects(() =>
      parseJob(manifest().replace('node = "any"', 'node = "missing"'), "bad")
    );
    await assertRejects(() =>
      parseJob(manifest() + "unexpected = true", "bad")
    );
    await assertRejects(() =>
      parseJob(
        'program = "the8020/jobs/echo"\n[schedule.recurrence]\ntimes = ["25:00"]',
        "bad",
      )
    );
  } finally {
    db.close();
  }
});

Deno.test("indexed static Any and All jobs share claims, cursors, input snapshots and history", async () => {
  const f = await fixture();
  try {
    const at = new Date(Date.now() + 5000).toISOString();
    await f.write("single", manifest("any", at));
    await f.write("every-node", manifest("all", at));
    assertEquals(await f.index(), undefined);
    assertEquals((await jobStore.list()).items.length, 0);
    const jobs = (await jobStore.list(0, true)).items;
    assertEquals(jobs.length, 2);
    const single = jobs.find((job) => job.node === "any")!;
    const all = jobs.find((job) => job.node === "all")!;
    const now = new Date(Date.parse(at) + 1000);
    await Promise.all([
      f.db.as("node-a", () => scan(now)),
      f.db.as("node-b", () => scan(now)),
    ]);
    await f.db.as("node-a", () => scan(now));
    await f.db.as("node-b", () => scan(now));
    assertEquals((await jobStore.runs.list(single.id)).items.length, 1);
    assertEquals((await jobStore.runs.list(all.id)).items.length, 2);
    assertEquals(f.db.calls.length, 3);
    assertEquals(
      f.db.calls.every((call) => call.input.username === "system"),
      true,
    );
    const run = await jobStore.runs.inspect(
      (await jobStore.runs.list(single.id)).items[0]!.id,
    );
    assertEquals(run.state, "succeeded");
    assertEquals(run.input.arguments, [{ message: "hello" }, 42]);
    assertEquals(run.logPosition, "saved-position");
    const job = await jobStore.inspect(single.id);
    assertEquals(job.staticKey, "acme/app/single");
    await assertRejects(() => jobStore.save(job), Error, "read-only");
    await assertRejects(() => jobStore.runNow(job.id), Error, "read-only");
    await assertRejects(
      () => jobStore.ensure(job.staticKey!, job.input),
      Error,
      "read-only",
    );
  } finally {
    f.db.close();
  }
});

Deno.test("static indexing converges, preserves unchanged cursors, and retires removed definitions", async () => {
  const f = await fixture();
  try {
    const source = manifest();
    await f.write("maintenance", source);
    await Deno.writeTextFile(
      new URL("acme/app/jobs/AGENTS.md", f.root),
      "Documentation",
    );
    assertEquals(await f.index(), undefined);
    const first = await jobStore.inspect(
      (await jobStore.list(0, true)).items[0]!.id,
    );
    assertEquals(await f.index(), undefined);
    assertEquals(await jobStore.inspect(first.id), first);
    await f.write("maintenance", source.replace('"hello"', '"changed"'));
    assertEquals(await f.index(), undefined);
    assertEquals((await jobStore.inspect(first.id)).revision, 2);
    assertEquals((await jobStore.inspect(first.id)).input.arguments, [{
      message: "changed",
    }, 42]);
    await Deno.remove(new URL("acme/app/jobs/maintenance.toml", f.root));
    assertEquals(await f.index(), undefined);
    assertEquals((await jobStore.list(0, true)).items, []);
    assertEquals((await jobStore.inspect(first.id)).enabled, false);
    await f.write("maintenance", source);
    assertEquals(await f.index(), undefined);
    assertEquals((await jobStore.list(0, true)).items[0]!.id, first.id);
    assertEquals((await jobStore.inspect(first.id)).revision, 3);
    f.db.database.exec(
      "UPDATE the8020__packages__packages SET state = 'retired'",
    );
    f.selected.active = false;
    assertEquals(await f.index(), undefined);
    assertEquals((await jobStore.list(0, true)).items, []);
  } finally {
    f.db.close();
  }
});

Deno.test("invalid declarations and changed publication preserve accepted static definitions", async () => {
  const f = await fixture();
  try {
    await f.write("maintenance", manifest());
    assertEquals(await f.index(), undefined);
    const original = (await jobStore.list(0, true)).items;
    await f.write("invalid", 'program = "short"');
    assertEquals(typeof await f.index(), "string");
    assertEquals((await jobStore.list(0, true)).items, original);
    await Deno.remove(new URL("acme/app/jobs/invalid.toml", f.root));
    f.selected.package_commit = "outdated";
    assertEquals(typeof await f.index(), "string");
    assertEquals((await jobStore.list(0, true)).items, original);
    f.selected.package_commit = "first";
    await Deno.symlink(
      new URL("acme/app/jobs/maintenance.toml", f.root),
      new URL("acme/app/jobs/link.toml", f.root),
    );
    assertEquals(typeof await f.index(), "string");
    assertEquals((await jobStore.list(0, true)).items, original);
  } finally {
    f.db.close();
  }
});
