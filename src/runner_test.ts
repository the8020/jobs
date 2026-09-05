import { assert, assertEquals, assertRejects } from "@std/assert";
import { DatabaseFixture } from "./test_support.ts";
import type { JobInput } from "./types.ts";
const { jobStore } = await import("./store.ts");
const { scan, capture } = await import("./runner.ts");
const input = (node = "any"): JobInput => ({
  name: "Example",
  programId: "the8020/jobs/echo",
  arguments: [{ value: 42 }],
  username: "robot",
  sandboxGroup: "batch",
  node,
  schedule: { datetimes: [], recurrence: null },
});
const later = (ms = 5000) => new Date(Date.now() + ms).toISOString();

Deno.test("manual Any races once and captures selected user, group, input and logs", async () => {
  const fixture = new DatabaseFixture();
  try {
    const [queued] = await jobStore.submit(input());
    assertEquals(fixture.events, ["jobs-ready"]);
    await Promise.all([
      fixture.as("node-a", () => scan()),
      fixture.as("node-b", () => scan()),
    ]);
    assertEquals(fixture.calls.length, 1);
    const run = await jobStore.runs.inspect(queued!.id);
    assertEquals(run.state, "succeeded");
    assertEquals(run.nodeId, fixture.calls[0]!.node);
    assertEquals(run.input.arguments, [{ value: 42 }]);
    assertEquals(run.logs[0]!.message, "Example log");
    assertEquals(fixture.calls[0]!.input.username, "robot");
    assertEquals(fixture.calls[0]!.input.sandboxGroup, "batch");
    await fixture.as("node-a", () => scan());
    await fixture.as("node-b", () => scan());
    assertEquals(fixture.calls.length, 1);
  } finally {
    fixture.close();
  }
});
Deno.test("All calendars advance independently and duplicate minutes do not rerun", async () => {
  const fixture = new DatabaseFixture();
  try {
    const at = later(), now = new Date(Date.now() + 10000);
    const definition = await jobStore.save({
      id: "",
      revision: 0,
      enabled: true,
      input: {
        ...input("all"),
        schedule: { datetimes: [at], recurrence: null },
      },
    });
    await fixture.as("node-a", () => scan(now));
    let history = await jobStore.runs.list(definition.id);
    assertEquals(history.items.map((run) => run.nodeId), ["node-a"]);
    await fixture.as("node-b", () => scan(now));
    await fixture.as("node-a", () => scan(now));
    await fixture.as("node-b", () => scan(now));
    history = await jobStore.runs.list(definition.id);
    assertEquals(history.items.length, 2);
    assertEquals(
      new Set(history.items.map((run) => run.nodeId)),
      new Set(["node-a", "node-b"]),
    );
    assertEquals(new Set(history.items.map((run) => run.occurrenceId)).size, 1);
    assertEquals(fixture.calls.length, 2);
    assertEquals(
      fixture.database.prepare(
        "select count(*) as n from the8020__jobs__cursors",
      ).get()!.n,
      2,
    );
  } finally {
    fixture.close();
  }
});
Deno.test("exact node schedules and manual runs are ignored by other nodes", async () => {
  const fixture = new DatabaseFixture();
  try {
    const [manual] = await jobStore.submit(input("node:node-b"));
    const saved = await jobStore.save({
      id: "",
      revision: 0,
      enabled: true,
      input: {
        ...input("node:node-b"),
        schedule: { datetimes: [later()], recurrence: null },
      },
    });
    const now = new Date(Date.now() + 10000);
    await fixture.as("node-a", () => scan(now));
    assertEquals(fixture.calls.length, 0);
    assertEquals((await jobStore.runs.inspect(manual!.id)).state, "queued");
    assertEquals((await jobStore.runs.list(saved.id)).items.length, 0);
    await fixture.as("node-b", () => scan(now));
    assertEquals(fixture.calls.length, 2);
    assert(fixture.calls.every((run) => run.node === "node-b"));
    const definitionReads = fixture.statements.filter((s) =>
      s.startsWith('select "s".')
    );
    assert(
      definitionReads.every((s) =>
        s.includes('"s"."node" =') && s.includes("limit")
      ),
    );
  } finally {
    fixture.close();
  }
});
Deno.test("Any calendar occurrence is shared despite independent node cursors", async () => {
  const fixture = new DatabaseFixture();
  try {
    const saved = await jobStore.save({
      id: "",
      revision: 0,
      enabled: true,
      input: {
        ...input(),
        schedule: { datetimes: [later()], recurrence: null },
      },
    });
    const now = new Date(Date.now() + 10000);
    await fixture.as("node-a", () => scan(now));
    await fixture.as("node-b", () => scan(now));
    assertEquals(fixture.calls.length, 1);
    assertEquals((await jobStore.runs.list(saved.id)).items.length, 1);
  } finally {
    fixture.close();
  }
});
Deno.test("job calls are parallel and failures retain logs", async () => {
  const fixture = new DatabaseFixture();
  try {
    await jobStore.submit(input());
    await jobStore.submit(input());
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => release = resolve);
    fixture.onRun = async () => {
      if (++started === 2) release();
      await gate;
    };
    fixture.fail = true;
    await scan();
    assertEquals(started, 2);
    for (const row of (await jobStore.runs.list()).items) {
      const run = await jobStore.runs.inspect(row.id);
      assertEquals(run.state, "failed");
      assertEquals(run.failure, "Example failure");
      assertEquals(run.logs.length, 1);
    }
  } finally {
    fixture.close();
  }
});
Deno.test("edits are optimistic, queued inputs immutable, and deadlines never replay", async () => {
  const fixture = new DatabaseFixture();
  try {
    const original = input("node:node-b");
    original.schedule = { datetimes: [later()], recurrence: null };
    const saved = await jobStore.save({
      id: "",
      revision: 0,
      enabled: true,
      input: original,
    });
    const [queued] = await jobStore.runNow(saved.id);
    await jobStore.save({
      id: saved.id,
      revision: saved.revision,
      enabled: false,
      input: { ...original, arguments: ["changed"] },
    });
    await assertRejects(() =>
      jobStore.save({
        id: saved.id,
        revision: saved.revision,
        enabled: true,
        input: original,
      })
    );
    assertEquals((await jobStore.runs.inspect(queued!.id)).input.arguments, [{
      value: 42,
    }]);
    fixture.database.prepare(
      "update the8020__jobs__runs set state='running',nodeId='node-b',deadlineAt=? where id=?",
    ).run(new Date(Date.now() - 1000).toISOString(), queued!.id);
    await scan();
    assertEquals(
      (await jobStore.runs.inspect(queued!.id)).state,
      "interrupted",
    );
    assertEquals(fixture.calls.length, 0);
  } finally {
    fixture.close();
  }
});
Deno.test("every explicit appointment survives catch-up and saved revisions restart cursors", async () => {
  const fixture = new DatabaseFixture();
  try {
    const saved = await jobStore.save({
      id: "",
      revision: 0,
      enabled: true,
      input: {
        ...input("all"),
        schedule: { datetimes: [later(), later(6000)], recurrence: null },
      },
    });
    const now = new Date(Date.now() + 10000);
    for (let tick = 0; tick < 3; tick++) {
      for (const node of ["node-a", "node-b"]) {
        await fixture.as(node, () => scan(now));
      }
    }
    assertEquals((await jobStore.runs.list(saved.id)).items.length, 4);
    await jobStore.save({
      id: saved.id,
      revision: saved.revision,
      enabled: true,
      input: {
        ...saved.input,
        schedule: { datetimes: [later(7000)], recurrence: null },
      },
    });
    for (const node of ["node-a", "node-b"]) {
      await fixture.as(node, () => scan(now));
    }
    assertEquals((await jobStore.runs.list(saved.id)).items.length, 6);
  } finally {
    fixture.close();
  }
});
Deno.test("execution selections are validated and captured output is bounded", async () => {
  const fixture = new DatabaseFixture();
  try {
    await assertRejects(() =>
      jobStore.submit({ ...input(), username: "disabled" })
    );
    await assertRejects(() =>
      jobStore.submit({ ...input(), username: "missing" })
    );
    await assertRejects(() => jobStore.submit(input("node:node-off")));
    await assertRejects(() =>
      jobStore.submit({ ...input(), programId: "missing/package/program" })
    );
    const result = capture(
      "x".repeat(300000),
      Array.from(
        { length: 600 },
        (_, i) => ({ level: "info", message: String(i) }),
      ),
    );
    assertEquals(result.truncated, true);
    assertEquals(result.logs.length, 512);
    assertEquals(result.logs.at(-1)!.message, "599");
  } finally {
    fixture.close();
  }
});
